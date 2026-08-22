'use strict';

/* MedIndex — faqja kryesore v2.
   Vetëm përmirësime pamore mbi HTML-in që funksionon edhe pa JavaScript:
   gjendja e navigimit, shfaqja graduale, parallax-i i hero-s, prekja 3D e
   kartave dhe numërimi i shifrave. Hyrja mbetet plotësisht te login.js. */

(() => {
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ── Navigimi merr vijë dhe hije sapo faqja lëviz nga maja ───────────── */
  const nav = document.getElementById('lvNav');
  if (nav) {
    let stuck = false;
    const syncNav = () => {
      const next = window.scrollY > 8;
      if (next === stuck) return;
      stuck = next;
      nav.classList.toggle('is-stuck', stuck);
    };
    window.addEventListener('scroll', () => requestAnimationFrame(syncNav), { passive: true });
    syncNav();
  }

  /* ── Shfaqja graduale e blloqeve ─────────────────────────────────────── */
  const revealTargets = document.querySelectorAll('.lv-reveal');
  const revealAll = () => revealTargets.forEach(node => node.classList.add('is-visible'));

  if (reduced || typeof IntersectionObserver !== 'function') {
    revealAll();
  } else if (revealTargets.length) {
    const observer = new IntersectionObserver((entries, self) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        self.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    revealTargets.forEach(node => observer.observe(node));
  }

  /* ── Numërimi i shifrave kur shiriti hyn në pamje ────────────────────── */
  /* Pika si ndarëse mijëshesh, e shkruar me dorë. Intl me "sq-AL" bie te
     anglishtja kur ICU-ja e shfletuesit s'e ka atë lokale, dhe atëherë numri
     do të kthehej nga 4.014 në 4,014 pikërisht kur nis animimi. */
  const formatter = { format: value => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.') };

  const stats = [...document.querySelectorAll('.lv-stat strong')]
    .map(node => ({ node, value: Number(String(node.textContent).replace(/\D/g, '')) }))
    .filter(item => Number.isFinite(item.value) && item.value > 0);

  if (stats.length && !reduced && typeof IntersectionObserver === 'function') {
    stats.forEach(item => { item.node.textContent = formatter.format(0); });

    const countUp = ({ node, value }) => {
      const duration = 1100;
      const started = performance.now();
      const step = now => {
        const progress = Math.min((now - started) / duration, 1);
        // easeOutExpo — shpejt në fillim, ndalje e butë
        const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        node.textContent = formatter.format(Math.round(value * eased));
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const statObserver = new IntersectionObserver((entries, self) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const item = stats.find(candidate => candidate.node === entry.target);
        if (item) countUp(item);
        self.unobserve(entry.target);
      }
    }, { threshold: 0.6 });
    stats.forEach(item => statObserver.observe(item.node));
  }

  /* ── Progresi i seksionit sipas skrollimit ────────────────────────────
     Progresi është 0 kur maja e seksionit arrin fundin e ekranit dhe 1 kur
     fundi i tij kalon majën, pra kalimi ndodh pikërisht sa ai është në
     pamje. Vlera shkon te CSS-ja si --lv-sect.

     Çdo seksion me `data-lv-progress` e merr: modulet e përdorin për ngjyrën
     e sfondit, rrjedha për thellësinë e kartave. Një cikël i vetëm i ushqen
     të gjitha, sepse llogaritja është e njëjtë. */
  const morphs = [...document.querySelectorAll('[data-lv-progress]')];
  if (morphs.length && !reduced) {
    let morphQueued = false;

    const syncMorphs = () => {
      morphQueued = false;
      for (const section of morphs) {
        const box = section.getBoundingClientRect();
        const span = box.height + window.innerHeight;
        const raw = (window.innerHeight - box.top) / span;
        const progress = Math.min(Math.max(raw, 0), 1);
        // Ndalet para skajeve, që seksioni të mos nisë e mbarojë krejt i errët.
        const eased = Math.min(Math.max((progress - 0.12) / 0.5, 0), 1);
        section.style.setProperty('--lv-sect', eased.toFixed(3));
        section.classList.toggle('is-deep', eased > 0.55);
      }
    };

    window.addEventListener('scroll', () => {
      if (morphQueued) return;
      morphQueued = true;
      requestAnimationFrame(syncMorphs);
    }, { passive: true });
    window.addEventListener('resize', () => requestAnimationFrame(syncMorphs), { passive: true });
    syncMorphs();
  }

  if (reduced) return;

  /* ── Parallax i hero-s ────────────────────────────────────────────────
     Një cikël i vetëm rAF ushqen tri variabla CSS. Pozicioni i ndjekur
     zbutet drejt objektivit, që lëvizja të mos jetë e ashpër. */
  const hero = document.querySelector('.lv-hero');
  if (hero) {
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let scrollValue = 0;
    let running = false;

    const frame = () => {
      current.x += (target.x - current.x) * 0.08;
      current.y += (target.y - current.y) * 0.08;

      root.style.setProperty('--lv-px', current.x.toFixed(4));
      root.style.setProperty('--lv-py', current.y.toFixed(4));
      root.style.setProperty('--lv-scroll', scrollValue.toFixed(2));

      const settled = Math.abs(target.x - current.x) < 0.0005 && Math.abs(target.y - current.y) < 0.0005;
      if (settled) { running = false; return; }
      requestAnimationFrame(frame);
    };

    const start = () => {
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    };

    if (finePointer) {
      window.addEventListener('pointermove', event => {
        target.x = (event.clientX / window.innerWidth - 0.5) * 2;
        target.y = (event.clientY / window.innerHeight - 0.5) * 2;
        start();
      }, { passive: true });

      window.addEventListener('pointerleave', () => { target.x = 0; target.y = 0; start(); }, { passive: true });
    }

    let scrollQueued = false;
    window.addEventListener('scroll', () => {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        // Vetëm brenda lartësisë së hero-s; më poshtë nuk ka çka të lëvizë.
        scrollValue = Math.min(window.scrollY, hero.offsetHeight);
        root.style.setProperty('--lv-scroll', scrollValue.toFixed(2));
      });
    }, { passive: true });
  }

  /* ── Prekja 3D e kartave ─────────────────────────────────────────────
     Vetëm me maus. Në prekje me gisht rrotullimi pengon më shumë sesa
     ndihmon, prandaj kartat mbeten të sheshta atje. Të njëjtat variabla
     ushqejnë edhe hapat e rrjedhës. */
  if (finePointer) {
    const MAX_TILT = 7;

    document.querySelectorAll('.lv-card, .lv-flow-step').forEach(card => {
      let queued = false;

      card.addEventListener('pointerenter', () => card.classList.add('is-tilting'));

      card.addEventListener('pointermove', event => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          const box = card.getBoundingClientRect();
          const px = (event.clientX - box.left) / box.width;
          const py = (event.clientY - box.top) / box.height;
          card.style.setProperty('--lv-ry', `${((px - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`);
          card.style.setProperty('--lv-rx', `${((0.5 - py) * 2 * MAX_TILT).toFixed(2)}deg`);
          card.style.setProperty('--lv-mx', `${(px * 100).toFixed(1)}%`);
          card.style.setProperty('--lv-my', `${(py * 100).toFixed(1)}%`);
        });
      }, { passive: true });

      card.addEventListener('pointerleave', () => {
        card.classList.remove('is-tilting');
        card.style.setProperty('--lv-rx', '0deg');
        card.style.setProperty('--lv-ry', '0deg');
      });
    });
  }
})();

/* Load the single continuous ShapeGrid after the landing DOM is ready. */
(() => {
  const script = document.createElement('script');
  script.src = '/login-v2-shape-grid.js?v=shape-grid-v1';
  script.defer = true;
  document.head.appendChild(script);
})();
