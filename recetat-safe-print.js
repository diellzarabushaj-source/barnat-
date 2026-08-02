(() => {
  'use strict';

  const DOCUMENT_VERSION = 'prescription-diagnosis-document-v1';

  function ensureDocumentAssets() {
    if (!document.querySelector('link[data-mi-prescription-document]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `/prescription-diagnosis-document.css?v=${DOCUMENT_VERSION}`;
      link.dataset.miPrescriptionDocument = '1';
      document.head.appendChild(link);
    }
    if (window.MedIndexPrescriptionDocument) {
      window.MedIndexPrescriptionDocument.init?.(window);
      return;
    }
    if (document.querySelector('script[data-mi-prescription-document]')) return;
    const script = document.createElement('script');
    script.src = `/prescription-diagnosis-document.js?v=${DOCUMENT_VERSION}`;
    script.async = false;
    script.dataset.miPrescriptionDocument = '1';
    script.addEventListener('load', () => window.MedIndexPrescriptionDocument?.init?.(window), { once:true });
    document.head.appendChild(script);
  }

  function showBlockedMessage() {
    const toast = document.getElementById('rxToast');
    if (!toast) return;
    toast.textContent = 'Shfletuesi e bllokoi dritaren e printimit.';
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function appendDiagnosisSection(targetDocument, model) {
    if (!model?.primary && !model?.secondary?.length) return;
    const section = targetDocument.createElement('section');
    section.className = 'diagnoses';

    if (model.primary) {
      const group = targetDocument.createElement('div');
      group.className = 'diagnosis-group primary';
      const label = targetDocument.createElement('span');
      label.textContent = 'Diagnoza kryesore';
      const value = targetDocument.createElement('strong');
      value.textContent = model.primary.display || model.primary.titleSq || model.primary.titleEn || '';
      group.append(label, value);
      section.appendChild(group);
    }

    if (Array.isArray(model.secondary) && model.secondary.length) {
      const group = targetDocument.createElement('div');
      group.className = 'diagnosis-group secondary';
      const label = targetDocument.createElement('span');
      label.textContent = 'Diagnozat shoqëruese';
      const list = targetDocument.createElement('ul');
      model.secondary.forEach(item => {
        const row = targetDocument.createElement('li');
        const code = targetDocument.createElement('strong');
        code.textContent = item.code || '';
        const title = targetDocument.createElement('span');
        title.textContent = item.titleSq || item.titleEn || '';
        row.append(code, title);
        list.appendChild(row);
      });
      group.append(label, list);
      section.appendChild(group);
    }
    targetDocument.body.appendChild(section);
  }

  function buildPrintDocument(popup, prescriptionText, model) {
    const targetDocument = popup.document;
    targetDocument.open();
    targetDocument.write('<!doctype html><html lang="sq"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recetë</title></head><body></body></html>');
    targetDocument.close();

    const style = targetDocument.createElement('style');
    style.textContent = '@page{size:A4;margin:18mm}*{box-sizing:border-box}body{max-width:820px;margin:0 auto;color:#111;font-family:Arial,sans-serif}.document-head{display:flex;justify-content:space-between;align-items:end;padding-bottom:14px;border-bottom:2px solid #173f42}.document-head h1{margin:0;font-size:25px}.document-head span{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b6264}.diagnoses{display:grid;gap:12px;margin:18px 0;padding:15px 17px;border:1px solid #cbd8d9;border-radius:10px;background:#f7faf9}.diagnosis-group{display:grid;gap:5px}.diagnosis-group+.diagnosis-group{padding-top:12px;border-top:1px solid #d7e1e2}.diagnosis-group>span{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#536b6d}.diagnosis-group>strong{font-size:15px;line-height:1.45}.diagnosis-group ul{display:grid;gap:6px;margin:0;padding:0;list-style:none}.diagnosis-group li{display:grid;grid-template-columns:58px 1fr;gap:8px;font-size:14px;line-height:1.4}.diagnosis-group li>strong{color:#174f53}pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.55 Arial,sans-serif}@media print{body{margin:0}.diagnoses{break-inside:avoid;background:#fff}}';
    targetDocument.head.appendChild(style);

    const header = targetDocument.createElement('header');
    header.className = 'document-head';
    const title = targetDocument.createElement('h1');
    title.textContent = 'Recetë';
    const brand = targetDocument.createElement('span');
    brand.textContent = 'MedIndex';
    header.append(title, brand);
    targetDocument.body.appendChild(header);

    appendDiagnosisSection(targetDocument, model);

    const preview = targetDocument.createElement('pre');
    preview.textContent = prescriptionText;
    targetDocument.body.appendChild(preview);
  }

  function printPreview(event) {
    const button = event.currentTarget;
    if (button.disabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const preview = document.querySelector('#rxPreview .rx-canonical-preview');
    const prescriptionText = String(preview?.textContent || '').trim();
    if (!prescriptionText) return;
    const model = window.MedIndexPrescriptionDocument?.currentModel?.() || null;

    const popup = window.open('', '_blank', 'width=920,height=780');
    if (!popup) return showBlockedMessage();
    try { popup.opener = null; } catch {}

    try {
      buildPrintDocument(popup, prescriptionText, model);
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
    ensureDocumentAssets();
    const original = document.getElementById('rxPrint');
    if (!original || original.dataset.safePrint === '1') return;
    const button = original.cloneNode(true);
    button.dataset.safePrint = '1';
    original.replaceWith(button);
    button.addEventListener('click', printPreview, { capture:true });
  }

  ensureDocumentAssets();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
