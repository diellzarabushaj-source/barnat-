'use strict';

/* MedIndex — faqja kryesore v2.
   Vetëm përmirësime pamore mbi HTML‑in që funksionon edhe pa JavaScript:
   gjendja e navigimit gjatë skrollimit dhe shfaqja graduale e seksioneve.
   Hyrja vetë mbetet plotësisht në duart e login.js. */

(() => {
  /* Navigimi merr vijë dhe hije sapo faqja lëviz nga maja. */
  const nav = document.getElementById('lvNav');
  if (nav) {
    let stuck = false;
    let queued = false;

    const sync = () => {
      queued = false;
      const next = window.scrollY > 8;
      if (next === stuck) return;
      stuck = next;
      nav.classList.toggle('is-stuck', stuck);
    };

    window.addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(sync);
    }, { passive: true });

    sync();
  }

  /* Shfaqja graduale e blloqeve. Kur IntersectionObserver mungon ose kur
     përdoruesi ka kërkuar më pak animime, gjithçka shfaqet menjëherë. */
  const targets = document.querySelectorAll('.lv-reveal');
  if (!targets.length) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const showAll = () => targets.forEach(node => node.classList.add('is-visible'));

  if (reducedMotion || typeof IntersectionObserver !== 'function') {
    showAll();
    return;
  }

  const observer = new IntersectionObserver((entries, self) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      self.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

  targets.forEach(node => observer.observe(node));
})();
