(() => {
  'use strict';

  function showBlockedMessage() {
    const toast = document.getElementById('rxToast');
    if (!toast) return;
    toast.textContent = 'Shfletuesi e bllokoi dritaren e printimit.';
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function buildPrintDocument(popup, value) {
    const document = popup.document;
    document.open();
    document.write('<!doctype html><html lang="sq"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recetë</title></head><body></body></html>');
    document.close();

    const style = document.createElement('style');
    style.textContent = 'body{max-width:820px;margin:32px auto;padding:0 24px;color:#111}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:16px/1.55 Arial,sans-serif}@media print{body{margin:0;padding:0}}';
    document.head.appendChild(style);

    const preview = document.createElement('pre');
    preview.textContent = value;
    document.body.appendChild(preview);
  }

  function printPreview(event) {
    const button = event.currentTarget;
    if (button.disabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const preview = document.querySelector('#rxPreview .rx-canonical-preview');
    const value = String(preview?.textContent || '').trim();
    if (!value) return;

    const popup = window.open('', '_blank', 'width=920,height=780');
    if (!popup) return showBlockedMessage();
    try { popup.opener = null; } catch {}

    try {
      buildPrintDocument(popup, value);
      const runPrint = () => {
        try { popup.focus(); popup.print(); } catch {}
      };
      if (popup.document.readyState === 'complete') window.setTimeout(runPrint, 80);
      else popup.addEventListener('load', runPrint, { once:true });
    } catch {
      try { popup.close(); } catch {}
      showBlockedMessage();
    }
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
