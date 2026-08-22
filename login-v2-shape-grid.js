'use strict';

/*
  MedIndex lower landing background.
  The filename is kept for compatibility with the existing loader, but this is
  now the requested CursorGrid implementation. One continuous canvas spans
  rrjedha -> themeluesja -> plani, so the three sections share one white base
  instead of looking like separate background blocks.

  Requested settings:
  cellSize=70, color=#160d5e, radius=140, falloff=smooth,
  holdTime=400, fadeDuration=800, lineWidth=1.2, maxOpacity=.95,
  fillOpacity=.22, gridOpacity=0, cellRadius=0, clickPulse=true,
  pulseSpeed=600.
*/
(() => {
  const main = document.getElementById('lvMain');
  const startSection = document.getElementById('rrjedha');
  const endSection = document.getElementById('plani');
  if (!main || !startSection || !endSection) return;

  const FALLOFF_CURVES = {
    linear: t => t,
    smooth: t => t * t * (3 - 2 * t),
    sharp: t => t * t * t,
  };

  const config = {
    cellSize: 70,
    color: '#160d5e',
    radius: 140,
    falloff: 'smooth',
    holdTime: 400,
    fadeDuration: 800,
    lineWidth: 1.2,
    maxOpacity: 0.95,
    fillOpacity: 0.22,
    gridOpacity: 0,
    cellRadius: 0,
    clickPulse: true,
    pulseSpeed: 600,
  };

  // Remove a previous runtime surface if hot navigation/re-execution occurs.
  document.querySelectorAll('.lv-shape-grid-surface,.lv-single-cursor-grid').forEach(node => node.remove());
  document.getElementById('lvSingleCursorGridStyles')?.remove();

  const style = document.createElement('style');
  style.id = 'lvSingleCursorGridStyles';
  style.textContent = `
    #lvMain{
      position:relative;
      isolation:isolate;
    }

    html.medindex-landing-v2 #rrjedha,
    html.medindex-landing-v2 #themeluesja,
    html.medindex-landing-v2 #plani{
      position:relative;
      z-index:1;
      background:transparent!important;
      background-image:none!important;
      border-color:transparent!important;
    }

    /* Disable the older per-section CursorGrid canvases. The single canvas
       below replaces all three so there is no seam between sections. */
    html.medindex-landing-v2 #rrjedha .lv-cursor-grid__canvas,
    html.medindex-landing-v2 #themeluesja .lv-cursor-grid__canvas,
    html.medindex-landing-v2 #plani .lv-cursor-grid__canvas{
      display:none!important;
    }

    .lv-single-cursor-grid{
      position:absolute;
      left:0;
      width:100%;
      display:block;
      z-index:0;
      pointer-events:none;
      background:#fff;
    }
  `;
  document.head.appendChild(style);

  const canvas = document.createElement('canvas');
  canvas.className = 'lv-single-cursor-grid';
  canvas.setAttribute('aria-hidden', 'true');
  main.insertBefore(canvas, startSection);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [cr, cg, cb] = hexToRgb(config.color);

  let width = 0;
  let height = 0;
  let top = 0;
  let cols = 0;
  let rows = 0;
  let offX = 0;
  let offY = 0;
  let alphas = new Float32Array(0);
  let touched = new Float64Array(0);
  const pulses = [];
  let raf = 0;
  let running = false;
  let lastFrame = 0;

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const value = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const num = parseInt(value.slice(0, 6), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  function sizeSurface() {
    top = startSection.offsetTop;
    height = Math.max(1, endSection.offsetTop + endSection.offsetHeight - top);
    width = Math.max(1, main.clientWidth);

    canvas.style.top = `${top}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cols = Math.ceil(width / config.cellSize) + 1;
    rows = Math.ceil(height / config.cellSize) + 1;
    offX = (width - cols * config.cellSize) / 2;
    offY = (height - rows * config.cellSize) / 2;
    alphas = new Float32Array(cols * rows);
    touched = new Float64Array(cols * rows);
  }

  function cellCenter(index) {
    const cx = offX + (index % cols) * config.cellSize + config.cellSize / 2;
    const cy = offY + Math.floor(index / cols) * config.cellSize + config.cellSize / 2;
    return [cx, cy];
  }

  function energize(x, y, boost = 1) {
    const radius = Math.max(config.radius, 1);
    const ease = FALLOFF_CURVES[config.falloff] || FALLOFF_CURVES.linear;
    const now = performance.now();

    const minCol = Math.max(0, Math.floor((x - radius - offX) / config.cellSize));
    const maxCol = Math.min(cols - 1, Math.floor((x + radius - offX) / config.cellSize));
    const minRow = Math.max(0, Math.floor((y - radius - offY) / config.cellSize));
    const maxRow = Math.min(rows - 1, Math.floor((y + radius - offY) / config.cellSize));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const index = row * cols + col;
        const [cx, cy] = cellCenter(index);
        const distance = Math.hypot(cx - x, cy - y);
        if (distance > radius) continue;

        const level = ease(1 - distance / radius) * config.maxOpacity * boost;
        if (level > alphas[index]) {
          alphas[index] = level;
          touched[index] = now;
        } else if (level > 0) {
          touched[index] = now;
        }
      }
    }
  }

  function draw(now) {
    const dt = Math.min(now - lastFrame, 50);
    lastFrame = now;

    // Exact requested base: pure white. gridOpacity=0 means no static lattice.
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    if (config.gridOpacity > 0) {
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${config.gridOpacity})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let col = 0; col <= cols; col++) {
        const x = Math.round(offX + col * config.cellSize) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let row = 0; row <= rows; row++) {
        const y = Math.round(offY + row * config.cellSize) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    }

    // Expanding click pulse transfers energy to cells as the ring crosses them.
    for (let pi = pulses.length - 1; pi >= 0; pi--) {
      const pulse = pulses[pi];
      const age = (now - pulse.t0) / 1000;
      const ringRadius = age * config.pulseSpeed;

      if (ringRadius > Math.hypot(width, height)) {
        pulses.splice(pi, 1);
        continue;
      }

      const band = config.cellSize;
      const minCol = Math.max(0, Math.floor((pulse.x - ringRadius - band - offX) / config.cellSize));
      const maxCol = Math.min(cols - 1, Math.floor((pulse.x + ringRadius + band - offX) / config.cellSize));
      const minRow = Math.max(0, Math.floor((pulse.y - ringRadius - band - offY) / config.cellSize));
      const maxRow = Math.min(rows - 1, Math.floor((pulse.y + ringRadius + band - offY) / config.cellSize));

      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const index = row * cols + col;
          const [cx, cy] = cellCenter(index);
          const distance = Math.hypot(cx - pulse.x, cy - pulse.y);
          if (Math.abs(distance - ringRadius) < band / 2 && config.maxOpacity > alphas[index]) {
            alphas[index] = config.maxOpacity;
            touched[index] = now;
          }
        }
      }
    }

    let anyVisible = pulses.length > 0;
    const fadeStep = dt / Math.max(config.fadeDuration, 16);
    const half = config.cellSize / 2;

    for (let index = 0; index < alphas.length; index++) {
      let alpha = alphas[index];
      if (alpha <= 0) continue;

      if (now - touched[index] > config.holdTime) {
        alpha = Math.max(0, alpha - fadeStep);
        alphas[index] = alpha;
        if (alpha <= 0) continue;
      }

      anyVisible = true;
      const [cx, cy] = cellCenter(index);
      const gradient = ctx.createRadialGradient(cx, cy, half * 0.1, cx, cy, config.cellSize);
      gradient.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
      gradient.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);

      const x = cx - half + 0.5;
      const y = cy - half + 0.5;
      const size = config.cellSize - 1;

      ctx.beginPath();
      if (config.cellRadius > 0 && typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, size, size, config.cellRadius);
      } else {
        ctx.rect(x, y, size, size);
      }

      if (config.fillOpacity > 0) {
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha * config.fillOpacity})`;
        ctx.fill();
      }

      ctx.strokeStyle = gradient;
      ctx.lineWidth = config.lineWidth;
      ctx.stroke();
    }

    if (anyVisible) {
      raf = requestAnimationFrame(draw);
    } else {
      running = false;
      // Keep the requested white background visible while idle.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
  }

  function wake() {
    if (running) return;
    running = true;
    lastFrame = performance.now();
    raf = requestAnimationFrame(draw);
  }

  function localPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    return [x, y];
  }

  function onPointerMove(event) {
    if (reducedMotion) return;
    const point = localPoint(event);
    if (!point) return;
    energize(point[0], point[1]);
    wake();
  }

  function onPointerDown(event) {
    if (reducedMotion || !config.clickPulse) return;
    const point = localPoint(event);
    if (!point) return;
    pulses.push({ x: point[0], y: point[1], t0: performance.now() });
    wake();
  }

  function rebuild() {
    cancelAnimationFrame(raf);
    running = false;
    sizeSurface();
    wake();
  }

  sizeSurface();
  wake();

  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('resize', () => requestAnimationFrame(rebuild), { passive: true });

  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => requestAnimationFrame(rebuild));
    observer.observe(startSection);
    observer.observe(endSection);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      running = false;
    } else {
      wake();
    }
  });
})();
