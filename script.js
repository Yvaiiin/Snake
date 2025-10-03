// ===== OPTIONS RAPIDES =====
const GOD_MODE = false;          // true = invincible
const SND_ENABLED = true;        // sons on/off
const ENEMY_ENABLED = true;      // permet de couper l'ennemi si besoin
const TICK_RATE = 9;            // vitesse de base (ticks/s)

// ===== AUDIO (Web Audio, sans fichiers) =====
const Sound = (() => {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const master = ctx.createGain();
  master.gain.value = 0.15;
  master.connect(ctx.destination);
  let muted = !SND_ENABLED;
  const resume = () => { if (ctx.state !== 'running') ctx.resume().catch(()=>{}); };

  function beep({freq=440, dur=0.12, type='sine', vol=1}) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  return {
    eat(){ if(muted) return; resume(); beep({freq:520, dur:0.08, type:'triangle', vol:0.9}); beep({freq:820, dur:0.08, type:'triangle', vol:0.7}); },
    turn(){ if(muted) return; resume(); beep({freq:300, dur:0.06, type:'square', vol:0.5}); },
    start(){ if(muted) return; resume(); beep({freq:600, dur:0.10, type:'triangle', vol:0.8}); beep({freq:900, dur:0.10, type:'triangle', vol:0.6}); },
    gameover(){ if(muted) return; resume(); beep({freq:240, dur:0.22, type:'sawtooth', vol:0.6}); setTimeout(()=>beep({freq:120, dur:0.30, type:'sawtooth', vol:0.6}), 140); },
    toggleMute(){ muted = !muted; },
    setVolume(v){ master.gain.value = Math.max(0, Math.min(1, v)); }
  };
})();

// ===== JEU =====
(function(){
  // DOM
  const board = document.getElementById('board');
  const ctx = board.getContext('2d');
  const scoreEl = document.getElementById('score');
  const intro = document.getElementById('intro');
  const startBtn = document.getElementById('startBtn');
  const over = document.getElementById('gameover');
  const restartBtn = document.getElementById('restart');
  const finalScoreEl = document.getElementById('finalScore');
  const reasonEl = document.getElementById('reason');
  const cvmodal = document.getElementById('cvmodal');

  // Compétences
  const skillsGrid = document.getElementById('skillsGrid');
  const skillBubbles = Array.from(skillsGrid.querySelectorAll('.skill-bubble'));

  // Grille
  const CELL_MIN = 12;
  let cols = 32, rows = 32, cell = 20;

  function sizeToContainer(){
    const rect = document.getElementById('gamewrap').getBoundingClientRect();
    board.width = Math.floor(rect.width);
    board.height = Math.floor(rect.height);
    cell = Math.max(CELL_MIN, Math.floor(Math.min(board.width/cols, board.height/rows)));
    cols = Math.max(20, Math.floor(board.width / cell));
    rows = Math.max(20, Math.floor(board.height / cell));
  }
  sizeToContainer();

  window.addEventListener('resize', ()=>{
    sizeToContainer();
    render(performance.now());
    fitSkillLabels();
  });

  const wrap = (v, max)=> (v + max) % max;

  let running=false, paused=false, score=0, cvShown=false;

  function makeSnake(color){
    return { color, dir:{x:1,y:0}, nextDir:{x:1,y:0}, body:[], grow:0 };
  }
  const player = makeSnake(getComputedStyle(document.documentElement).getPropertyValue('--player').trim() || '#7cf');
  const enemy  = makeSnake(getComputedStyle(document.documentElement).getPropertyValue('--enemy').trim() || '#ff8c1a');
  let food = {x:0,y:0};

  function rndCell(){ return {x:(Math.random()*cols|0), y:(Math.random()*rows|0)}; }
  function distWrap(a,b){
    const dx = Math.min(Math.abs(a.x-b.x), cols - Math.abs(a.x-b.x));
    const dy = Math.min(Math.abs(a.y-b.y), rows - Math.abs(a.y-b.y));
    return Math.hypot(dx,dy);
  }

  function placeFood(){
    const occ = new Set();
    for(const s of [player, enemy]) for(const p of s.body) occ.add(p.x+','+p.y);
    let c;
    do{ c = rndCell(); } while(occ.has(c.x+','+c.y));
    food = c;
  }

  // Déverrouille visuellement les compétences (et fit texte)
  function updateSkills(){
    skillBubbles.forEach((el, idx)=>{
      if (score >= idx+1){
        el.classList.add('active');
        el.setAttribute('aria-hidden','false');
      } else {
        el.classList.remove('active');
        el.setAttribute('aria-hidden','true');
      }
    });
    fitSkillLabels();
  }

  // === Réduction auto de police dans les bulles (sans changer leur taille)
  function fitSkillLabels(){
    skillBubbles.forEach(b=>{
      const label = b.querySelector('.label');
      if(!label) return;
      let fs = 14;
      label.style.fontSize = fs + 'px';
      const maxH = b.clientHeight - 8;
      while (label.scrollHeight > maxH && fs > 9) {
        fs -= 1;
        label.style.fontSize = fs + 'px';
      }
    });
  }

  function resetGame({ showIntro = true } = {}) {
    score = 0; scoreEl.textContent = String(score);
    cvShown = false;
    player.body = []; enemy.body = [];

    let a = rndCell(), b = rndCell();
    while (distWrap(a,b) < Math.min(cols,rows) * 0.35){ b = rndCell(); }
    const L = 4;

    for(let i=L-1;i>=0;i--) player.body.push({x: wrap(a.x - i, cols), y:a.y});
    player.dir = {x:1,y:0}; player.nextDir = {x:1,y:0}; player.grow = 0;

    if (ENEMY_ENABLED) {
      for(let i=L-1;i>=0;i--) enemy.body.push({x: wrap(b.x + i, cols), y:b.y});
      enemy.dir = {x:-1,y:0}; enemy.nextDir = {x:-1,y:0}; enemy.grow = 0;
    } else {
      enemy.body = [];
    }

    placeFood();

    over.classList.remove('show'); over.style.display='none';
    cvmodal.classList.remove('show'); cvmodal.style.display='none';
    if (showIntro) {
      intro.classList.add('show'); intro.style.display='flex';
    } else {
      intro.classList.remove('show'); intro.style.display='none';
    }

    bursts.length = 0;
    updateSkills();
  }

  function start(){
    running = true; paused=false;
    intro.classList.remove('show'); intro.style.display='none';
    Sound.start();
    last = performance.now(); acc=0;
    requestAnimationFrame(loop);
  }

  // Entrées
  function setDirFromKey(key){
    let nd=null;
    if (['ArrowUp','w','W','z','Z'].includes(key)) nd={x:0,y:-1};
    if (['ArrowDown','s','S'].includes(key))       nd={x:0,y:1};
    if (['ArrowLeft','a','A','q','Q'].includes(key)) nd={x:-1,y:0};
    if (['ArrowRight','d','D'].includes(key))      nd={x:1,y:0};
    if(!nd) return;
    if (player.dir.x + nd.x === 0 && player.dir.y + nd.y === 0) return;
    if (nd.x!==player.dir.x || nd.y!==player.dir.y){ spawnLineBurstAtHead(player); Sound.turn(); }
    player.nextDir = nd;
  }
  window.setDirFromKey = setDirFromKey; // si jamais tu ajoutes des boutons tactiles

  window.addEventListener('keydown',(e)=>{
    const k = e.key;
    if(k==='p'||k==='P'){ paused=!paused; return; }
    if(k==='m'||k==='M'){ Sound.toggleMute(); return; }
    if(k==='r' || k==='R'){ resetGame({ showIntro: false }); start(); return; }
    if((k==='Enter'||k===' ') && intro.classList.contains('show')){ start(); return; }
    if(!running) return;
    setDirFromKey(k);
  });

  document.getElementById('startBtn').addEventListener('click', ()=>{ if(intro.classList.contains('show')) start(); });
  document.getElementById('restart').addEventListener('click', ()=>{ resetGame({ showIntro: false }); start(); });

  // Effet "burst de lignes"
  const bursts = [];
  function easeOutQuart(t){ return 1 - Math.pow(1 - t, 4); }
  function headPx(snake){
    const h = snake.body[snake.body.length-1];
    return { x: h.x*cell + cell/2, y: h.y*cell + cell/2 };
  }
  function spawnLineBurst(x, y, count, hue){
    const now = performance.now();
    const lines = [];
    for(let i=0;i<count;i++){
      const ang = (i/count)*Math.PI*2 + Math.random()*0.15;
      lines.push({
        angle: ang,
        hue: hue + (Math.random()*24-12),
        len0: 0,
        len1: 12 + Math.random()*24,
        life: 420 + (Math.random()*120|0),
        width: 1 + Math.random()*2
      });
    }
    bursts.push({x,y,t0:now,lines});
  }
  function spawnLineBurstAtHead(snake){
    const {x,y} = headPx(snake);
    const hue = snake===player ? 200 : 35;
    spawnLineBurst(x,y,22,hue);
  }
  function updateBursts(now){
    for(let i=bursts.length-1;i>=0;i--){
      const b = bursts[i];
      const elapsed = now - b.t0;
      if (elapsed > Math.max(...b.lines.map(l=>l.life))) bursts.splice(i,1);
    }
  }
  function drawBursts(now){
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for(const b of bursts){
      for(const l of b.lines){
        const t = Math.min(1, (now - b.t0) / l.life);
        const k = easeOutQuart(t);
        const len = l.len0 + (l.len1 - l.len0) * k;
        const alpha = (1 - t) * 0.9;
        ctx.strokeStyle = `hsla(${l.hue},100%,60%,${alpha})`;
        ctx.lineWidth = l.width;
        const dx = Math.cos(l.angle)*len, dy = Math.sin(l.angle)*len;
        ctx.beginPath();
        ctx.moveTo(b.x - dx*0.2, b.y - dy*0.2);
        ctx.lineTo(b.x + dx, b.y + dy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // IA ennemi
  let enemyTurnCooldown=0;
  function shortestDelta(a,b,size){
    let d=b-a; if(Math.abs(d)>size/2){ d = -Math.sign(d)*(size-Math.abs(d)); } return d;
  }
  function updateEnemyAI(){
    if(!ENEMY_ENABLED) return;
    enemyTurnCooldown--;
    if(enemyTurnCooldown>0) return;

    let target = Math.random()<0.5 ? food : null;
    const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
    let chosen = enemy.dir;

    if(target){
      const h = enemy.body[enemy.body.length-1];
      const dx = shortestDelta(h.x, target.x, cols);
      const dy = shortestDelta(h.y, target.y, rows);
      const tryDir = Math.abs(dx)>=Math.abs(dy) ? {x:Math.sign(dx),y:0} : {x:0,y:Math.sign(dy)};
      if(!(enemy.dir.x+tryDir.x===0 && enemy.dir.y+tryDir.y===0)) chosen = tryDir;
    }else{
      const cands = dirs.filter(d=>!(enemy.dir.x+d.x===0 && enemy.dir.y+d.y===0));
      chosen = cands[(Math.random()*cands.length)|0] || enemy.dir;
    }
    enemy.nextDir = chosen;
    spawnLineBurstAtHead(enemy);
    enemyTurnCooldown = 6 + (Math.random()*10|0);
  }

  // Boucle
  let acc=0, last=performance.now();
  function loop(now){
    if(!running) return;
    const dt = (now-last)/1000; last=now;
    if(!paused){
      acc += dt;
      const step = 1/TICK_RATE;
      while(acc>=step){ tick(); acc-=step; }
      render(now);
    }
    requestAnimationFrame(loop);
  }

  function tick(){
    player.dir = player.nextDir;
    updateEnemyAI();
    enemy.dir = enemy.nextDir;

    stepSnake(player, true);
    stepSnake(enemy, false);

    if (!GOD_MODE && ENEMY_ENABLED && (playerHitsEnemy() || enemyHeadHitsPlayer())){
      return gameOver('Tu as touché le serpent orange.');
    }
  }

  function stepSnake(snake, isPlayer){
    if(!snake.body.length) return; // si ennemi désactivé
    const head = snake.body[snake.body.length-1];
    const nx = wrap(head.x + snake.dir.x, cols);
    const ny = wrap(head.y + snake.dir.y, rows);
    const newHead = {x:nx, y:ny};

    if (isPlayer && !GOD_MODE && snake.body.some(p=>p.x===nx && p.y===ny)){
      gameOver('Tu t’es mordu 😬');
      return;
    }

    snake.body.push(newHead);

    if (isPlayer && newHead.x===food.x && newHead.y===food.y){
      Sound.eat();
      score++; scoreEl.textContent = String(score);
      snake.grow += 1 + (Math.random()*2|0);
      placeFood();
      spawnLineBurst(newHead.x*cell+cell/2, newHead.y*cell+cell/2, 18, 110);

      updateSkills();

      // Score 11 : confettis + pop-up CV
      if (score >= 11 && !cvShown){
        (function(){
          const wrapEl = document.getElementById('gamewrap');
          let cv = document.getElementById('confetti');
          if (!cv) {
            cv = document.createElement('canvas');
            cv.id = 'confetti';
            cv.style.position = 'absolute';
            cv.style.inset = '0';
            cv.style.zIndex = '999';
            cv.style.pointerEvents = 'none';
            wrapEl.appendChild(cv);
          }
          cv.width = board.width; 
          cv.height = board.height;
          const cctx = cv.getContext('2d');

          const N = 160;
          const parts = Array.from({length:N}, () => ({
            x: Math.random()*cv.width,
            y: -20 - Math.random()*100,
            vx: (Math.random()*2 - 1)*2,
            vy: 2 + Math.random()*3,
            size: 4 + Math.random()*4,
            rot: Math.random()*Math.PI*2,
            vr: (Math.random()*0.2 - 0.1),
            color: `hsl(${Math.random()*360}, 85%, 60%)`,
            life: 120 + Math.random()*120
          }));

          function tickC(){
            cctx.clearRect(0,0,cv.width,cv.height);
            for (let i = parts.length - 1; i >= 0; i--){
              const p = parts[i];
              p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
              cctx.save();
              cctx.translate(p.x, p.y);
              cctx.rotate(p.rot);
              cctx.fillStyle = p.color;
              cctx.fillRect(-p.size, -p.size*0.4, p.size*2, p.size*0.8);
              cctx.restore();
              if (p.y > cv.height + 40 || p.life <= 0) parts.splice(i,1);
            }
            if (parts.length) requestAnimationFrame(tickC);
            else { cctx.clearRect(0,0,cv.width,cv.height); setTimeout(()=>cv.remove(), 300); }
          }
          requestAnimationFrame(tickC);
        })();
        cvShown = true;
        cvmodal.classList.add('show');
        cvmodal.style.display = 'flex';
      }
    }

    if (snake.grow>0) snake.grow--;
    else snake.body.shift();
  }

  function playerHitsEnemy(){
    const h = player.body[player.body.length-1];
    for(const p of enemy.body){ if(p.x===h.x && p.y===h.y) return true; }
    return false;
  }
  function enemyHeadHitsPlayer(){
    const he = enemy.body[enemy.body.length-1];
    for(const p of player.body){ if(p.x===he.x && p.y===he.y) return true; }
    return false;
  }

  function gameOver(msg){
    running=false; paused=false;
    Sound.gameover();
    reasonEl.textContent = msg || 'Tu as touché le serpent orange.';
    finalScoreEl.textContent = String(score);
    over.classList.add('show');
    over.style.display='flex';

    // petit shake
    const w = document.getElementById('gamewrap');
    w.animate([{transform:'translate(0,0)'},{transform:'translate(4px,0)'},{transform:'translate(-4px,0)'},{transform:'translate(0,0)'}],
              {duration:180,iterations:2});
    render(performance.now());
  }

  // Rendu
  function render(now){
    ctx.clearRect(0,0,board.width,board.height);

    // fond + quadrillage fin
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--board-bg').trim() || '#0b1233';
    ctx.fillRect(0,0,board.width,board.height);

    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--board-grid').trim() || '#1c2754';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=1;i<cols;i++){ const x=i*cell+.5; ctx.moveTo(x,.5); ctx.lineTo(x, rows*cell+.5); }
    for(let j=1;j<rows;j++){ const y=j*cell+.5; ctx.moveTo(.5,y); ctx.lineTo(cols*cell+.5, y); }
    ctx.stroke();
    ctx.restore();

    // Pomme animée (pulsation vert ↔ rouge sans passer par jaune via mix RGB)
    const fx = food.x*cell + cell/2, fy = food.y*cell + cell/2;
    const pulse = 0.2 + 0.08 * Math.sin(now/200);
    const rad = Math.max(3, Math.floor(cell * (0.40 + pulse)));

    // mix rouge-vert
    const t = 0.5 + 0.5 * Math.sin(now/500);
    const R = Math.round(255 * (1 - t));
    const G = Math.round(255 * t);
    const color = `rgba(${R},${G},0,1)`;

    const g = ctx.createRadialGradient(fx, fy, rad*0.2, fx, fy, rad);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(fx, fy, rad, 0, Math.PI*2);
    ctx.fill();

    // ennemi
    if (ENEMY_ENABLED) drawSnake(enemy,true);
    // joueur
    drawSnake(player,false);

    // bursts
    updateBursts(now);
    drawBursts(now);
  }

  function drawSnake(snake,isEnemy){
    if(!snake.body.length) return;
    ctx.save();
    ctx.shadowColor = isEnemy ? 'rgba(255,140,26,.35)' : 'rgba(124,208,255,.35)';
    ctx.shadowBlur = 8;
    for(let i=0;i<snake.body.length;i++){
      const seg = snake.body[i];
      if(i===snake.body.length-1){
        const grad = ctx.createLinearGradient(seg.x*cell, seg.y*cell, (seg.x+1)*cell, (seg.y+1)*cell);
        const base = isEnemy ? (getComputedStyle(document.documentElement).getPropertyValue('--enemy').trim() || '#ff8c1a')
                             : (getComputedStyle(document.documentElement).getPropertyValue('--player').trim() || '#7cf');
        grad.addColorStop(0, lighten(base, isEnemy?0:12));
        grad.addColorStop(1, base);
        ctx.fillStyle = grad;
      }else{
        ctx.fillStyle = isEnemy ? (getComputedStyle(document.documentElement).getPropertyValue('--enemy').trim() || '#ff8c1a')
                                : (getComputedStyle(document.documentElement).getPropertyValue('--player').trim() || '#7cf');
      }
      ctx.fillRect(seg.x*cell+1.5, seg.y*cell+1.5, cell-3, cell-3);
    }
    // yeux
    const h = snake.body[snake.body.length-1];
    const eye = Math.max(2, Math.floor(cell*0.12));
    const ox = snake.dir.x, oy = snake.dir.y;
    const cx = h.x*cell + cell/2, cy = h.y*cell + cell/2;
    ctx.fillStyle = isEnemy ? '#e60026' : '#012';
    ctx.beginPath(); ctx.arc(cx + (ox*cell*0.18 - oy*cell*0.18), cy + (oy*cell*0.18 + ox*cell*0.18), eye, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + (ox*cell*0.18 + oy*cell*0.18), cy + (oy*cell*0.18 - ox*cell*0.18), eye, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function lighten(hex, amt){
    const c = parseInt(hex.slice(1),16);
    let r=(c>>16)&255,g=(c>>8)&255,b=c&255; r=Math.min(255,r+amt); g=Math.min(255,g+amt); b=Math.min(255,b+amt);
    return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
  }

  // Boot
  resetGame({ showIntro: true });
  render(performance.now());
  fitSkillLabels();
})();
