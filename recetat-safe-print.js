(() => {
  'use strict';

  function printPreview(event) {
    const button = event.currentTarget;
    if (button.disabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const preview = document.querySelector('#rxPreview .rx-canonical-preview');
    const value = String(preview?.textContent || '').trim();
    if (!value) return;

    const popup = window.open('', '_blank', 'width=920,height=780,noopener');
    if (!popup) {
      const toast = document.getElementById('rxToast');
      if (toast) {
        toast.textContent = 'Shfletuesi e bllokoi dritaren e printimit.';
        toast.classList.add('show');
        window.setTimeout(() => toast.classList.remove('show'), 2400);
      }
      return;
    }

    const escapeHtml = text => text.replace(/[&<>]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[character]));
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="sq"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recetë</title><style>body{max-width:820px;margin:32px auto;padding:0 24px;color:#111}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:16px/1.55 Arial,sans-serif}@media print{body{margin:0;padding:0}}</style></head><body><pre>${escapeHtml(value)}</pre></body></html>`);
    popup.document.close();
    popup.addEventListener('load', () => popup.print(), { once:true });
    window.setTimeout(() => {
      try { if (!popup.closed && popup.document.readyState === 'complete') popup.print(); } catch {}
    }, 250);
  }

  function install() {
    const original = document.getElementById('rxPrint');
    if (!original || original.dataset.safePrint === '1') return;
    const button = original.cloneNode(true);
    button.dataset.safePrint = '1';
    original.replaceWith(button);
    button.addEventListener('click', printPreview, { capture:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
