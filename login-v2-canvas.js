'use strict';

/* Sfondi WebGL.
   Një fushë organike që rrjedh, e ndërtuar nga fbm-noise në ngjyrat e markës.
   Shkruar me WebGL të pastër — pa librari të jashtme, që të mbetet brenda
   `script-src 'self'` të CSP-së. Nëse konteksti nuk merret, kanavaca hiqet
   dhe gradientët CSS mbeten ashtu siç janë.

   E njëjta fushë përdoret në hero dhe në seksionin që errësohet gjatë
   skrollimit, prandaj kodi vjen si fabrikë: çdo `[data-lv-canvas]` merr
   kontekstin e vet dhe matet sipas seksionit që e mban. */

(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('[data-lv-canvas]').forEach(node => node.remove());
    return;
  }

  document.querySelectorAll('[data-lv-canvas]').forEach(mount);

  function mount(canvas) {
    const host = canvas.closest('.lv-hero, .lv-morph');
    if (!host) { canvas.remove(); return; }

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      // Kur GPU-ja mungon dhe shfletuesi do ta vizatonte me CPU, kjo e refuzon
      // kontekstin qëllimisht: gradientët CSS duken mirë dhe nuk e ngarkojnë
      // procesorin. Shader-i u verifikua duke e hequr këtë përkohësisht.
      failIfMajorPerformanceCaveat: true,
    });

    if (!gl) { canvas.remove(); return; }

    const VERTEX_SRC = `
      attribute vec2 a_pos;
      void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
    `;

    const FRAGMENT_SRC = `
      precision highp float;

      uniform vec2  u_res;
      uniform float u_time;
      uniform vec2  u_pointer;
      uniform float u_scroll;

      float hash(vec2 p){
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p){
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i),                hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p){
        float value = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 5; i++){
          value += amp * noise(p);
          p *= 2.02;
          amp *= 0.5;
        }
        return value;
      }

      void main(){
        vec2 uv = gl_FragCoord.xy / u_res.xy;
        vec2 p = uv - 0.5;
        p.x *= u_res.x / u_res.y;

        float t = u_time * 0.05;
        vec2 drift = u_pointer * 0.12 + vec2(0.0, u_scroll * 0.25);

        float f1 = fbm(p * 1.8 + drift + vec2(t, t * 0.7));
        float f2 = fbm(p * 2.6 - drift * 0.6 + vec2(-t * 0.8, t * 0.5) + f1);
        float f3 = fbm(p * 1.1 + vec2(t * 0.4, -t * 0.3) + f2 * 0.5);

        vec3 base   = vec3(0.031, 0.055, 0.098);
        vec3 blue   = vec3(0.239, 0.435, 0.878);
        vec3 teal   = vec3(0.059, 0.467, 0.478);
        vec3 violet = vec3(0.416, 0.353, 0.878);

        vec3 col = base;
        col = mix(col, blue,   smoothstep(0.35, 0.95, f1) * 0.75);
        col = mix(col, teal,   smoothstep(0.45, 1.00, f2) * 0.45);
        col = mix(col, violet, smoothstep(0.55, 1.05, f3) * 0.35);

        // Vinjetë që e mban tekstin e lexueshëm në qendër.
        float vignette = smoothstep(1.15, 0.25, length(p));
        col *= mix(0.55, 1.0, vignette);

        // Kokrrizë e imët kundër brezave në gradient.
        col += (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.025;

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vertexShader = compile(gl.VERTEX_SHADER, VERTEX_SRC);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    if (!vertexShader || !fragmentShader) { canvas.remove(); return; }

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { canvas.remove(); return; }
    gl.useProgram(program);

    // Një trekëndësh i vetëm që mbulon tërë ekranin.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      res: gl.getUniformLocation(program, 'u_res'),
      time: gl.getUniformLocation(program, 'u_time'),
      pointer: gl.getUniformLocation(program, 'u_pointer'),
      scroll: gl.getUniformLocation(program, 'u_scroll'),
    };

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let scroll = 0;
    let running = false;
    let rafId = 0;
    const started = performance.now();

    function resize() {
      // Kapak 1.75 te DPR: mbi këtë, kostoja rritet pa fitim të dukshëm.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const width = Math.round(host.clientWidth * dpr);
      const height = Math.round(host.clientHeight * dpr);
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }

    function render(now) {
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;

      gl.uniform2f(uniforms.res, canvas.width, canvas.height);
      gl.uniform1f(uniforms.time, (now - started) / 1000);
      gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
      gl.uniform1f(uniforms.scroll, scroll);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      rafId = requestAnimationFrame(render);
    }

    function start() {
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(render);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(rafId);
    }

    resize();
    window.addEventListener('resize', () => { resize(); }, { passive: true });

    window.addEventListener('pointermove', event => {
      pointer.tx = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (event.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    let scrollQueued = false;
    window.addEventListener('scroll', () => {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        // Sa larg ka kaluar maja e seksionit, e normalizuar me lartësinë e tij.
        const box = host.getBoundingClientRect();
        scroll = Math.min(Math.max(-box.top / Math.max(box.height, 1), 0), 1);
      });
    }, { passive: true });

    // Mos e mbaj ciklin gjallë kur seksioni nuk është në pamje. Tash që ka dy
    // kanavaca, gjendja mbahet e shkruar: kthimi te skeda s'guxon ta nisë atë
    // që ndodhet jashtë ekranit.
    let onScreen = true;
    const sync = () => { (onScreen && !document.hidden) ? start() : stop(); };

    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver(entries => {
        onScreen = entries[0].isIntersecting;
        sync();
      }, { threshold: 0 }).observe(host);
    } else {
      start();
    }

    document.addEventListener('visibilitychange', sync);

    // Konteksti mund të humbasë (p.sh. kur GPU-ja ringarkohet); mos u rrëzo.
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stop(); });
    canvas.addEventListener('webglcontextrestored', () => { resize(); sync(); });

    canvas.dataset.lvCanvasReady = '1';
  }
})();

/* CursorGrid për dy seksionet e bardha: themeluesja + plani.
   Adaptim i të njëjtës logjikë të React Bits në Canvas 2D, pa React, që faqja
   statike e MedIndex të mos marrë dependency të ri. Sfondi mbetet i bardhë;
   rrjeta është transparente dhe ndizet vetëm rreth kursorit / klikimit. */
(() => {
  const FALLOFF_CURVES = {
    linear: t => t,
    smooth: t => t * t * (3 - 2 * t),
    sharp: t => t * t * t,
  };

  const config = {
    cellSize: 70,
    color: '#10dcff',
    radius: 100,
    falloff: 'smooth',
    holdTime: 400,
    fadeDuration: 400,
    lineWidth: 1.7,
    maxOpacity: 1,
    fillOpacity: 0.06,
    gridOpacity: 0.01,
    cellRadius: 2,
    clickPulse: true,
    pulseSpeed: 350,
  };

  const hosts = ['#themeluesja', '#plani']
    .map(selector => document.querySelector(selector))
    .filter(Boolean);

  if (!hosts.length) return;

  const style = document.createElement('style');
  style.textContent = `
    .lv-section[data-lv-cursor-grid-host]{
      position:relative;
      isolation:isolate;
      background:#fff;
    }
    .lv-section[data-lv-cursor-grid-host] > .lv-shell{
      position:relative;
      z-index:1;
    }
    .lv-cursor-grid__canvas{
      position:absolute;
      inset:0;
      z-index:0;
      display:block;
      width:100%;
      height:100%;
      pointer-events:none;
    }
  `;
  document.head.appendChild(style);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  hosts.forEach(host => mountCursorGrid(host, reducedMotion));

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const num = parseInt(v.slice(0, 6), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  function mountCursorGrid(host, staticOnly) {
    host.dataset.lvCursorGridHost = '1';

    const canvas = document.createElement('canvas');
    canvas.className = 'lv-cursor-grid__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.prepend(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.remove(); return; }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const [cr, cg, cb] = hexToRgb(config.color);

    let cols = 0;
    let rows = 0;
    let offX = 0;
    let offY = 0;
    let alphas = new Float32Array(0);
    let touched = new Float64Array(0);
    let width = 0;
    let height = 0;
    const pulses = [];
    let raf = 0;
    let running = false;
    let lastFrame = 0;

    function rebuild() {
      width = host.offsetWidth;
      height = host.offsetHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
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

    function energize(x, y, boost) {
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
          const dist = Math.hypot(cx - x, cy - y);
          if (dist > radius) continue;
          const level = ease(1 - dist / radius) * config.maxOpacity * (boost ?? 1);
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
      ctx.clearRect(0, 0, width, height);

      if (config.gridOpacity > 0) {
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${config.gridOpacity})`;
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

      for (let pi = pulses.length - 1; pi >= 0; pi--) {
        const pulse = pulses[pi];
        const age = (now - pulse.t0) / 1000;
        const ringR = age * config.pulseSpeed;
        if (ringR > Math.hypot(width, height)) {
          pulses.splice(pi, 1);
          continue;
        }

        const band = config.cellSize;
        const minCol = Math.max(0, Math.floor((pulse.x - ringR - band - offX) / config.cellSize));
        const maxCol = Math.min(cols - 1, Math.floor((pulse.x + ringR + band - offX) / config.cellSize));
        const minRow = Math.max(0, Math.floor((pulse.y - ringR - band - offY) / config.cellSize));
        const maxRow = Math.min(rows - 1, Math.floor((pulse.y + ringR + band - offY) / config.cellSize));

        for (let row = minRow; row <= maxRow; row++) {
          for (let col = minCol; col <= maxCol; col++) {
            const index = row * cols + col;
            const [cx, cy] = cellCenter(index);
            const dist = Math.hypot(cx - pulse.x, cy - pulse.y);
            if (Math.abs(dist - ringR) < band / 2 && config.maxOpacity > alphas[index]) {
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
        gradient.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${alpha})`);
        gradient.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);

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
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha * config.fillOpacity})`;
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
      }
    }

    function wake() {
      if (running) return;
      running = true;
      lastFrame = performance.now();
      raf = requestAnimationFrame(draw);
    }

    function toLocal(event) {
      const rect = host.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    }

    function onPointerMove(event) {
      const [x, y] = toLocal(event);
      energize(x, y);
      wake();
    }

    function onPointerDown(event) {
      if (!config.clickPulse) return;
      const [x, y] = toLocal(event);
      pulses.push({ x, y, t0: performance.now() });
      wake();
    }

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => { rebuild(); wake(); })
      : null;

    resizeObserver?.observe(host);
    if (!resizeObserver) window.addEventListener('resize', () => { rebuild(); wake(); }, { passive: true });

    rebuild();
    wake();

    if (!staticOnly) {
      host.addEventListener('pointermove', onPointerMove, { passive: true });
      host.addEventListener('pointerdown', onPointerDown, { passive: true });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        running = false;
      } else {
        wake();
      }
    });
  }
})();
