'use strict';

(() => {
  const form = document.getElementById('medindexContactForm');
  const status = document.getElementById('contactFormStatus');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const email = String(data.get('email') || '').trim();
    const subject = String(data.get('subject') || '').trim();
    const message = String(data.get('message') || '').trim();
    const body = [`Emri: ${name}`, `Email: ${email}`, '', message].join('\n');
    const href = `mailto:diellzarabushaj@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    if (status) status.textContent = 'Po hapet aplikacioni i emailit…';
    window.location.href = href;
  });
})();
