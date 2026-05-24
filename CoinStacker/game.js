(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const hudHeight = document.getElementById('height');
  const hudCount = document.getElementById('count');
  const hudBest = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const gameover = document.getElementById('gameover');
  const finalHeight = document.getElementById('finalHeight');
  const finalCount = document.getElementById('finalCount');
  const newRecord = document.getElementById('newRecord');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const leftBtn = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');
  const dropBtn = document.getElementById('dropBtn');

  const COIN_RADIUS = 32;
  const COIN_THICKNESS = 14;
  const FACE_RY = 9; // vertical radius of top-face ellipse (perspective squash)
  const PLATFORM_Y = H - 60;
  const PLATFORM_W = 200;
  const PLATFORM_X = (W - PLATFORM_W) / 2;
  const GRAVITY = 0.55;
  const SWING_SPEED = 0.018;
  const KEY_SPEED = 6;
  const MIN_OVERLAP_FRAC = 0.30; // need at least 30% horizontal overlap to stay
  const PX_PER_CM = 4;
  const SPAWN_SCREEN_Y = 70;     // where a new coin appears (screen space)
  const SCREEN_ANCHOR = 250;     // screen Y the stack top settles at once tall

  const BEST_KEY = 'coinstacker.best';

  /** @type {{x:number,y:number,r:number,vy:number,vx:number,settled:boolean,fallingOff:boolean,rot:number,vrot:number,color:string,shineSeed:number}[]} */
  let coins = [];
  let activeCoin = null; // currently swinging coin at top
  let swingT = 0;
  let cameraY = 0; // visual offset upward as stack grows
  let stackTopY = PLATFORM_Y; // current top of the stack (world Y)
  let running = false;
  let endingTimer = 0;
  let endedFlag = false;
  let coinIndex = 0;
  let keyLeft = false, keyRight = false;
  let dragX = null;

  function loadBest() {
    const v = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
    return Number.isFinite(v) ? v : 0;
  }
  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch {}
  }
  let bestCm = loadBest();
  hudBest.textContent = bestCm;

  const COIN_PALETTES = [
    { face: '#ffd966', rim: '#e8a51b', dark: '#8a5a0a', shine: '#fff4c2' }, // gold
    { face: '#e6e8ec', rim: '#9aa1ad', dark: '#525864', shine: '#ffffff' }, // silver
    { face: '#e09a5a', rim: '#9a5a23', dark: '#5a3010', shine: '#ffd7a3' }, // copper
  ];

  function spawnCoin() {
    const palette = COIN_PALETTES[coinIndex % COIN_PALETTES.length];
    coinIndex++;
    activeCoin = {
      x: W / 2,
      y: cameraY + SPAWN_SCREEN_Y,
      r: COIN_RADIUS,
      vy: 0,
      vx: 0,
      settled: false,
      fallingOff: false,
      rot: 0,
      vrot: 0,
      color: palette,
      shineSeed: Math.random() * Math.PI * 2,
    };
    swingT = Math.random() * Math.PI * 2;
  }

  function drop() {
    if (!running || !activeCoin) return;
    if (activeCoin.vy > 0 || activeCoin.fallingOff) return;
    // Convert current swing into vertical drop
    activeCoin.vy = 2;
    activeCoin.vx = 0;
  }

  function findTopCoin() {
    let top = null;
    for (const c of coins) {
      if (!c.settled) continue;
      if (!top || c.y < top.y) top = c;
    }
    return top;
  }

  function checkLanding(coin) {
    // Land on the platform if no coins settled yet
    const top = findTopCoin();

    if (!top) {
      const landY = PLATFORM_Y - COIN_THICKNESS;
      if (coin.y >= landY) {
        // Must overlap with platform
        const overlap = Math.min(coin.x + coin.r, PLATFORM_X + PLATFORM_W)
                      - Math.max(coin.x - coin.r, PLATFORM_X);
        if (overlap >= coin.r * 2 * MIN_OVERLAP_FRAC) {
          coin.y = landY;
          coin.settled = true;
          coin.vy = 0;
          coin.vx = 0;
          // Slight nudge if off-center on platform
          const platCenter = PLATFORM_X + PLATFORM_W / 2;
          const dx = coin.x - platCenter;
          const maxOff = PLATFORM_W / 2 - coin.r;
          if (Math.abs(dx) > maxOff) {
            coin.x = platCenter + Math.sign(dx) * maxOff;
          }
          return 'settled';
        } else {
          coin.fallingOff = true;
          return 'falling';
        }
      }
      return null;
    }

    // Land on top of the highest coin
    const landY = top.y - COIN_THICKNESS;
    if (coin.y >= landY && coin.vy > 0) {
      const overlap = Math.min(coin.x + coin.r, top.x + top.r)
                    - Math.max(coin.x - coin.r, top.x - top.r);
      const need = coin.r * 2 * MIN_OVERLAP_FRAC;
      if (overlap >= need) {
        coin.y = landY;
        coin.settled = true;
        coin.vy = 0;
        // Slight slide toward center for off-center landing (visual feedback)
        const slide = (top.x - coin.x) * 0.08;
        coin.x += slide;
        return 'settled';
      } else {
        coin.fallingOff = true;
        // Choose direction to fall off
        coin.vx = (coin.x < top.x) ? -3.5 : 3.5;
        coin.vrot = coin.vx * 0.02;
        return 'falling';
      }
    }
    return null;
  }

  function updateStackTop() {
    let top = PLATFORM_Y;
    for (const c of coins) {
      if (c.settled && c.y < top) top = c.y;
    }
    stackTopY = top;
    // Camera scrolls up (negative offset shifts the world down on screen) so the
    // top of the stack stays anchored once it climbs past SCREEN_ANCHOR.
    cameraY = Math.min(0, stackTopY - SCREEN_ANCHOR);
  }

  function update(dt) {
    if (!running) return;

    // Update settled coins might tip (we keep stable for simplicity)
    // Active coin behavior
    if (activeCoin) {
      if (activeCoin.vy === 0 && !activeCoin.fallingOff) {
        // swinging at top
        swingT += SWING_SPEED * (60 * dt);
        const swingRange = Math.min(W * 0.42, 160);
        const baseX = W / 2 + Math.sin(swingT) * swingRange;
        // Keyboard / drag override
        if (dragX !== null) {
          activeCoin.x = dragX;
        } else if (keyLeft || keyRight) {
          activeCoin.x += (keyRight ? KEY_SPEED : 0) - (keyLeft ? KEY_SPEED : 0);
        } else {
          activeCoin.x = baseX;
        }
        // Clamp
        activeCoin.x = Math.max(activeCoin.r, Math.min(W - activeCoin.r, activeCoin.x));
        // Shine animation
        activeCoin.shineSeed += 0.04;
      } else {
        // falling
        activeCoin.vy += GRAVITY;
        activeCoin.y += activeCoin.vy;
        activeCoin.x += activeCoin.vx;
        activeCoin.rot += activeCoin.vrot;

        if (!activeCoin.fallingOff) {
          const result = checkLanding(activeCoin);
          if (result === 'settled') {
            coins.push(activeCoin);
            updateStackTop();
            updateHUD();
            activeCoin = null;
            setTimeout(() => { if (running) spawnCoin(); }, 280);
          } else if (result === 'falling') {
            coins.push(activeCoin);
            activeCoin = null;
            scheduleEnd();
          }
        }
      }
    }

    // Update falling-off coins
    for (const c of coins) {
      if (c.fallingOff) {
        c.vy += GRAVITY;
        c.y += c.vy;
        c.x += c.vx;
        c.rot += c.vrot;
      }
    }

    // Remove only knocked-off coins once they leave the view; settled coins are
    // kept so the height/count stay accurate.
    coins = coins.filter(c => !c.fallingOff || c.y - cameraY < H + 300);

    if (endingTimer > 0) {
      endingTimer -= dt;
      if (endingTimer <= 0 && !endedFlag) {
        endGame();
      }
    }
  }

  function scheduleEnd() {
    if (!endedFlag) endingTimer = 1.0;
  }

  function updateHUD() {
    const cm = Math.max(0, Math.round((PLATFORM_Y - stackTopY) / PX_PER_CM));
    hudHeight.textContent = cm;
    hudCount.textContent = coins.filter(c => c.settled).length;
  }

  function endGame() {
    if (endedFlag) return;
    endedFlag = true;
    running = false;
    const cm = Math.max(0, Math.round((PLATFORM_Y - stackTopY) / PX_PER_CM));
    const count = coins.filter(c => c.settled).length;
    finalHeight.textContent = cm;
    finalCount.textContent = count;
    if (cm > bestCm) {
      bestCm = cm;
      saveBest(bestCm);
      hudBest.textContent = bestCm;
      newRecord.classList.remove('hidden');
    } else {
      newRecord.classList.add('hidden');
    }
    gameover.classList.remove('hidden');
  }

  // ---------- Rendering ----------
  function drawBackground() {
    // Sky gradient already in CSS, but draw extra stars
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1530');
    g.addColorStop(1, '#1b2a5e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Distant stars (parallax with camera)
    ctx.save();
    const starSeed = 11;
    for (let i = 0; i < 40; i++) {
      const sx = (i * 53 + 17) % W;
      const sy = ((i * 97 + 31) % (H * 2) - cameraY * 0.3) % H;
      const ny = sy < 0 ? sy + H : sy;
      ctx.fillStyle = i % 7 === 0 ? '#ffd766' : 'rgba(255,255,255,0.6)';
      ctx.fillRect(sx, ny, 2, 2);
    }
    ctx.restore();
  }

  function drawPlatform() {
    const y = PLATFORM_Y - cameraY;
    // Platform shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(PLATFORM_X + PLATFORM_W / 2, y + 30, PLATFORM_W / 2 + 10, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Platform top
    const grad = ctx.createLinearGradient(0, y, 0, y + 40);
    grad.addColorStop(0, '#3b4ea0');
    grad.addColorStop(1, '#1b2553');
    ctx.fillStyle = grad;
    roundRect(ctx, PLATFORM_X, y, PLATFORM_W, 40, 8);
    ctx.fill();

    // Platform border
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    roundRect(ctx, PLATFORM_X, y, PLATFORM_W, 40, 8);
    ctx.stroke();

    // Center mark
    ctx.fillStyle = 'rgba(255,204,77,0.6)';
    const cx = PLATFORM_X + PLATFORM_W / 2;
    ctx.fillRect(cx - 1, y + 4, 2, 6);
  }

  function drawCoin(c, isGhost) {
    const screenY = c.y - cameraY;
    if (screenY < -100 || screenY > H + 100) return;
    const r = c.r;
    const t = COIN_THICKNESS;
    const ry = FACE_RY;
    const x = c.x;
    const palette = c.color;

    ctx.save();
    if (c.fallingOff || c.rot) {
      ctx.translate(x, screenY);
      ctx.rotate(c.rot || 0);
      ctx.translate(-x, -screenY);
    }

    // Bottom face peeking out below the side band
    ctx.fillStyle = palette.dark;
    ctx.beginPath();
    ctx.ellipse(x, screenY + t, r, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Side band (the visible cylinder wall) with a left-to-right shade
    const sideGrad = ctx.createLinearGradient(x - r, 0, x + r, 0);
    sideGrad.addColorStop(0, palette.dark);
    sideGrad.addColorStop(0.5, palette.rim);
    sideGrad.addColorStop(1, palette.dark);
    ctx.fillStyle = sideGrad;
    ctx.fillRect(x - r, screenY, r * 2, t);

    // Knurled edge ridges
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -r + 5; i < r; i += 5) {
      ctx.moveTo(x + i, screenY);
      ctx.lineTo(x + i, screenY + t);
    }
    ctx.stroke();

    // Top face
    const faceGrad = ctx.createRadialGradient(x - r * 0.3, screenY - ry * 0.5, r * 0.1, x, screenY, r);
    faceGrad.addColorStop(0, palette.shine);
    faceGrad.addColorStop(0.5, palette.face);
    faceGrad.addColorStop(1, palette.rim);
    ctx.fillStyle = faceGrad;
    ctx.beginPath();
    ctx.ellipse(x, screenY, r, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Top face rim
    ctx.strokeStyle = palette.dark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, screenY, r - 0.5, ry - 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Inner ring
    ctx.strokeStyle = palette.rim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, screenY, r * 0.74, ry * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Star icon in the middle
    drawStar(ctx, x, screenY, ry * 0.62, 5, palette.dark);

    // Shine highlight on the top face
    const shineAlpha = isGhost ? 0.45 + Math.sin(c.shineSeed) * 0.18 : 0.35;
    ctx.fillStyle = `rgba(255,255,255,${shineAlpha})`;
    ctx.beginPath();
    ctx.ellipse(x - r * 0.32, screenY - ry * 0.25, r * 0.26, ry * 0.32, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawStar(ctx, cx, cy, r, points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = (Math.PI / points) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const px = cx + Math.cos(angle) * rad;
      const py = cy + Math.sin(angle) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawGuide() {
    if (!activeCoin || activeCoin.vy > 0) return;
    const x = activeCoin.x;
    const startY = activeCoin.y + activeCoin.r + 6 - cameraY;
    const endY = (stackTopY - cameraY) - 4;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,204,77,0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function drawHeightMarker() {
    const cm = Math.max(0, Math.round((PLATFORM_Y - stackTopY) / PX_PER_CM));
    if (cm === 0) return;
    const y = stackTopY - cameraY - 24;
    ctx.save();
    ctx.fillStyle = 'rgba(255,204,77,0.9)';
    ctx.font = 'bold 16px -apple-system, "Noto Sans KR", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${cm} cm`, W - 14, y);
    // marker line
    ctx.strokeStyle = 'rgba(255,204,77,0.45)';
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(0, y + 6);
    ctx.lineTo(W, y + 6);
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    drawBackground();
    drawPlatform();

    // Sort coins so falling ones render on top
    const ordered = [...coins].sort((a, b) => (a.settled === b.settled ? 0 : a.settled ? -1 : 1));
    for (const c of ordered) drawCoin(c, false);
    drawHeightMarker();

    if (activeCoin) {
      drawGuide();
      drawCoin(activeCoin, activeCoin.vy === 0);
    }
  }

  // ---------- Main loop ----------
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------- Controls ----------
  function startGame() {
    coins = [];
    activeCoin = null;
    cameraY = 0;
    stackTopY = PLATFORM_Y;
    endingTimer = 0;
    endedFlag = false;
    coinIndex = 0;
    running = true;
    updateHUD();
    overlay.classList.add('hidden');
    gameover.classList.add('hidden');
    newRecord.classList.add('hidden');
    spawnCoin();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  document.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft') { keyLeft = true; e.preventDefault(); }
    else if (e.code === 'ArrowRight') { keyRight = true; e.preventDefault(); }
    else if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'Enter') {
      if (!running && !endedFlag && overlay.classList.contains('hidden') === false) {
        startGame();
      } else if (running) {
        drop();
      } else if (endedFlag) {
        startGame();
      }
      e.preventDefault();
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') keyLeft = false;
    else if (e.code === 'ArrowRight') keyRight = false;
  });

  // Touch / mouse on canvas
  function eventX(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    return cx * (W / rect.width);
  }
  let pressed = false;
  let pressStart = 0;
  let pressStartX = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (!running) return;
    pressed = true;
    pressStart = performance.now();
    pressStartX = eventX(e);
    dragX = pressStartX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pressed) return;
    dragX = eventX(e);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!pressed) return;
    pressed = false;
    const dt = performance.now() - pressStart;
    const moved = Math.abs(eventX(e) - pressStartX);
    dragX = null;
    if (dt < 220 && moved < 8) drop();
  });
  canvas.addEventListener('pointercancel', () => {
    pressed = false;
    dragX = null;
  });

  // Button controls
  function bindHold(btn, onDown, onUp) {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown(); });
    btn.addEventListener('pointerup', (e) => { e.preventDefault(); onUp && onUp(); });
    btn.addEventListener('pointerleave', () => { onUp && onUp(); });
    btn.addEventListener('pointercancel', () => { onUp && onUp(); });
  }
  bindHold(leftBtn, () => keyLeft = true, () => keyLeft = false);
  bindHold(rightBtn, () => keyRight = true, () => keyRight = false);
  dropBtn.addEventListener('click', drop);

})();
