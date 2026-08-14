'use strict';

/* Sfondi WebGL i hero-s.
   Një fushë organike që rrjedh, e ndërtuar nga fbm-noise në ngjyrat e markës.
   Shkruar me WebGL të pastër — pa librari të jashtme, që të mbetet brenda
   `script-src 'self'` të CSP-së. Nëse konteksti nuk merret, kanavaca hiqet
   dhe gradientët CSS të hero-s mbeten ashtu siç janë. */

(() => {
  const canvas = document.getElementById('lvCanvas');
  const hero = document.querySelector('.lv-hero');
  if (!canvas || !hero) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    canvas.remove();
    return;
  }

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
    const width = Math.round(hero.clientWidth * dpr);
    const height = Math.round(hero.clientHeight * dpr);
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
      scroll = Math.min(window.scrollY / Math.max(hero.offsetHeight, 1), 1);
    });
  }, { passive: true });

  // Mos e mbaj ciklin gjallë kur hero-ja nuk është në pamje.
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(entries => {
      entries[0].isIntersecting ? start() : stop();
    }, { threshold: 0 }).observe(hero);
  } else {
    start();
  }

  document.addEventListener('visibilitychange', () => {
    document.hidden ? stop() : start();
  });

  // Konteksti mund të humbasë (p.sh. kur GPU-ja ringarkohet); mos u rrëzo.
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stop(); });
  canvas.addEventListener('webglcontextrestored', () => { resize(); start(); });

  canvas.dataset.lvCanvasReady = '1';
})();
