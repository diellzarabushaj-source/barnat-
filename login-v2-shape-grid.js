'use strict';

/* Single continuous ShapeGrid surface for the lower landing page.
   Mirrors the requested React Bits settings without adding a React dependency:
   squareSize 40, diagonal drift, dark navy/purple borders, one-cell hover trail.
   The base is always white and one canvas spans rrjedha -> plani so there is
   no visual break between the three sections. */
(() => {
  const main = document.getElementById('lvMain');
  const startSection = document.getElementById('rrjedha');
  const endSection = document.getElementById('plani');
  if (!main || !startSection || !endSection) return;

  const config = {
    speed: 0.5,
    squareSize: 40,
    direction: 'diagonal',
    borderColor: '#160234',
    hoverFillColor: '#222222',
    hoverColor: '#020648',
    hoverTrailAmount: 1,
  };

  const style = document.createElement('style');
  style.id = 'lvSingleShapeGridStyles';
  style.textContent = `
    #lvMain{position:relative;isolation:isolate}
    html.medindex-landing-v2 #rrjedha,
    html.medindex-landing-v2 #themeluesja,
    html.medindex-landing-v2 #plani{
      position:relative;
      z-index:1;
      background:transparent!important;
      background-image:none!important;
      border-color:transparent!important;
    }
    html.medindex-landing-v2 #rrjedha .lv-cursor-grid__canvas,
    html.medindex-landing-v2 #themeluesja .lv-cursor-grid__canvas,
    html.medindex-landing-v2 #plani .lv-cursor-grid__canvas{
      display:none!important;
    }
    .lv-shape-grid-surface{
      position:absolute;
      left:0;
      width:100%;
      display:block;
      pointer-events:none;
      z-index:0;
      background:#fff;
    }
  `;
  document.head.appendChild(style);

  const canvas = document.createElement('canvas');
  canvas.className = 'lv-shape-grid-surface';
  canvas.setAttribute('aria-hidden', 'true');
  main.insertBefore(canvas, startSection);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const startedAt = performance.now();
  let width = 0;
  let height = 0;
  let top = 0;
  let raf = 0;
  let pointer = null;
  let previousCell = null;
  let previousChangedAt = 0;

  function sizeSurface() {
    top = startSection.offsetTop;
    height = Math.max(1, endSection.offsetTop + endSection.offsetHeight - top);
    width = Math.max(1, main.clientWidth);

    canvas.style.top = `${top}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function gridOffset(now) {
    if (reducedMotion || config.speed <= 0) return [0, 0];
    const seconds = (now - startedAt) / 1000;
    const travel = (seconds * config.speed * 14) % config.squareSize;
    switch (config.direction) {
      case 'up': return [0, -travel];
      case 'down': return [0, travel];
      case 'left': return [-travel, 0];
      case 'right': return [travel, 0];
      default: return [travel, travel];
    }
  }

  function cellAt(x, y, offsetX, offsetY) {
    const size = config.squareSize;
    return {
      col: Math.floor((x - offsetX) / size),
      row: Math.floor((y - offsetY) / size),
    };
  }

  function cellRect(cell, offsetX, offsetY) {
    const size = config.squareSize;
    return {
      x: cell.col * size + offsetX,
      y: cell.row * size + offsetY,
      size,
    };
  }

  function drawCell(cell, offsetX, offsetY, fill, stroke, alpha) {
    if (!cell) return;
    const rect = cellRect(cell, offsetX, offsetY);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.rect(rect.x + 0.7, rect.y + 0.7, rect.size - 1.4, rect.size - 1.4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function render(now) {
    const [offsetXRaw, offsetYRaw] = gridOffset(now);
    const size = config.squareSize;
    const offsetX = ((offsetXRaw % size) + size) % size - size;
    const offsetY = ((offsetYRaw % size) + size) % size - size;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.strokeStyle = config.borderColor;
    ctx.globalAlpha = 0.14;
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = offsetX; x <= width + size; x += size) {
      const px = Math.round(x) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
    }
    for (let y = offsetY; y <= height + size; y += size) {
      const py = Math.round(y) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
    }
    ctx.stroke();
    ctx.restore();

    let currentCell = null;
    if (pointer) {
      currentCell = cellAt(pointer.x, pointer.y, offsetX, offsetY);
      if (!pointer.cell || pointer.cell.col !== currentCell.col || pointer.cell.row !== currentCell.row) {
        if (pointer.cell) {
          previousCell = pointer.cell;
          previousChangedAt = now;
        }
        pointer.cell = currentCell;
      }

      if (config.hoverTrailAmount > 0 && previousCell) {
        const age = now - previousChangedAt;
        const trailAlpha = Math.max(0, 1 - age / 260) * 0.34;
        if (trailAlpha > 0) {
          drawCell(previousCell, offsetX, offsetY, config.hoverFillColor, config.hoverColor, trailAlpha);
        } else {
          previousCell = null;
        }
      }

      drawCell(currentCell, offsetX, offsetY, config.hoverFillColor, config.hoverColor, 0.92);
    }

    if (!reducedMotion || pointer || previousCell) {
      raf = requestAnimationFrame(render);
    }
  }

  function wake() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  }

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      if (pointer) {
        previousCell = pointer.cell || previousCell;
        previousChangedAt = performance.now();
      }
      pointer = null;
      if (reducedMotion) wake();
      return;
    }

    if (!pointer) pointer = { x, y, cell: null };
    pointer.x = x;
    pointer.y = y;
    if (reducedMotion) wake();
  }

  function onPointerLeaveWindow() {
    if (pointer) {
      previousCell = pointer.cell || previousCell;
      previousChangedAt = performance.now();
    }
    pointer = null;
    if (reducedMotion) wake();
  }

  sizeSurface();
  window.addEventListener('resize', () => { sizeSurface(); wake(); }, { passive: true });
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.documentElement.addEventListener('mouseleave', onPointerLeaveWindow, { passive: true });

  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => { sizeSurface(); wake(); });
    observer.observe(startSection);
    observer.observe(endSection);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      wake();
    }
  });

  wake();
})();
