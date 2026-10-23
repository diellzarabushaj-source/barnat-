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

  // Only typography changes here: every non-empty canonical line stays in order.
  function appendPrescription(targetDocument, prescriptionText) {
    const content = targetDocument.createElement('main');
    content.className = 'prescription-content';
    content.setAttribute('aria-label', 'Përmbajtja e recetës');
    let item = null;
    for (const raw of prescriptionText.replace(/\r\n?/g, '\n').split('\n')) {
      if (!raw.trim()) continue;
      const line = raw.trim();
      const connector = /^(DHE|OSE|PLUS|AND|OR)$/i.test(line);
      const recipeMark = /^Rp\s*[:.]$/i.test(line);
      const numbered = /^\d+[A-Z]?[.)]\s+\S/i.test(line);
      if (connector || recipeMark) {
        const row = targetDocument.createElement('p');
        row.className = connector ? 'rx-connector' : 'rx-recipe-mark';
        row.textContent = raw;
        content.append(row, targetDocument.createTextNode('\n'));
        item = null;
        continue;
      }
      const first = !item;
      if (numbered || first) {
        item = targetDocument.createElement('section');
        item.className = 'rx-print-item';
        content.appendChild(item);
      }
      const heading = numbered || (first && /^(?:Tab\.|Cap\.|Amp\.|Supp\.|Syr\.|Susp\.|Sol\.)\s/i.test(line));
      const row = targetDocument.createElement(heading ? 'h2' : 'p');
      row.className = heading ? 'rx-print-title' : 'rx-print-line';
      const label = !heading && raw.match(/^(\s*(?:Doza|Rruga|Shpeshtësia|Kohëzgjatja|Sasia|S(?:\s*\(Signatura\))?)\s*[:.]\s*)/i);
      if (label) {
        const strong = targetDocument.createElement('strong');
        strong.textContent = label[1];
        row.append(strong, targetDocument.createTextNode(raw.slice(label[1].length)));
      } else row.textContent = raw;
      item.append(row, targetDocument.createTextNode('\n'));
    }
    targetDocument.body.appendChild(content);
  }

  function buildPrintDocument(popup, prescriptionText, model) {
    const targetDocument = popup.document;
    targetDocument.open();
    targetDocument.write('<!doctype html><html lang="sq"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recetë</title></head><body></body></html>');
    targetDocument.close();

    const style = targetDocument.createElement('style');
    style.textContent = `
      @page{size:A4;margin:15mm 17mm 16mm}
      *{box-sizing:border-box}
      html{background:#edf1f6;color:#182738;font-family:Arial,Helvetica,sans-serif}
      body{max-width:176mm;margin:28px auto;padding:28px 32px;background:#fff;box-shadow:0 8px 36px #172b4914;font-size:10pt;line-height:1.45}
      .print-tools{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 26px;padding:12px 14px;background:#f0f4fa;border-radius:8px;font-size:12px;color:#43536a}
      .print-tools p{margin:0}.print-tools button{flex:none;min-height:40px;border:0;border-radius:6px;background:#1d3d64;color:#fff;padding:10px 16px;font:600 13px Arial;cursor:pointer}.print-tools button:focus-visible{outline:3px solid #6289bd;outline-offset:3px}
      .document-head{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-bottom:15px;margin-bottom:18px;border-bottom:1.5pt solid #24466e}
      .document-head h1{margin:0;font-size:23pt;line-height:1.1;letter-spacing:-.7px;font-weight:600}
      .document-meta{text-align:right}.document-meta img{display:block;width:24mm;height:auto;margin:0 0 8px auto}.document-meta time{font-size:9pt;color:#536174;font-variant-numeric:tabular-nums}
      .diagnoses{margin:0 0 17px;padding:11px 14px;border-left:2pt solid #627b99;background:#f5f7fa}
      .diagnosis-group>span{display:block;margin-bottom:3px;font-size:8pt;letter-spacing:.06em;text-transform:uppercase;color:#536174;font-weight:700}
      .diagnosis-group>strong{font-size:11pt;line-height:1.4;font-weight:600;overflow-wrap:anywhere}
      .diagnosis-group+.diagnosis-group{margin-top:9px;padding-top:9px;border-top:1px solid #dce3eb}
      .diagnosis-group ul{display:grid;gap:3px;margin:0;padding:0;list-style:none}
      .diagnosis-group li{display:flex;gap:8px;font-size:9pt;overflow-wrap:anywhere}.diagnosis-group li>strong{min-width:36px;color:#314c6d}
      .prescription-content{overflow-wrap:anywhere}
      .rx-recipe-mark{margin:0 0 7px;font:600 15pt Georgia,serif;color:#24466e;break-after:avoid-page}
      .rx-print-item{padding:10px 0 11px;border-bottom:1px solid #e0e5ec;break-inside:avoid-page}
      .rx-print-title{margin:0 0 5px;font-size:11pt;line-height:1.4;font-weight:700;color:#162c46;break-after:avoid-page}
      .rx-print-line{margin:2px 0;white-space:pre-wrap;orphans:3;widows:3}.rx-print-line strong{font-weight:600;color:#334a65}
      .rx-connector{display:flex;align-items:center;gap:9px;margin:6px 0 0;font-size:8pt;font-weight:700;letter-spacing:.06em;color:#415c7c;break-after:avoid-page}
      .rx-connector:after{content:'';flex:1;border-top:1px solid #e0e5ec}
      .document-signature{width:48mm;margin:28px 0 0 auto;padding-top:6px;border-top:1px solid #748296;text-align:center;font-size:8pt;color:#536174;break-inside:avoid}
      @media(max-width:600px){html{background:#fff}body{margin:0;padding:20px 16px;box-shadow:none}.print-tools{align-items:start;flex-direction:column;gap:10px}.document-head{gap:12px}}
      @media print{html{background:#fff}body{max-width:none;margin:0;padding:0;box-shadow:none}.print-tools{display:none}.document-head{break-inside:avoid}.diagnoses{break-inside:avoid-page;background:#fff}.document-signature{margin-top:24px}}
    `;
    targetDocument.head.appendChild(style);

    const toolbar = targetDocument.createElement('aside');
    toolbar.className = 'print-tools';
    const hint = targetDocument.createElement('p');
    hint.textContent = 'Për ta ruajtur si PDF, zgjidh “Ruaj si PDF” në dritaren e printimit. Formati: A4.';
    const printButton = targetDocument.createElement('button');
    printButton.type = 'button';
    printButton.textContent = 'Ruaj PDF / Printo';
    printButton.addEventListener('click', () => popup.print());
    toolbar.append(hint, printButton);
    targetDocument.body.appendChild(toolbar);

    const header = targetDocument.createElement('header');
    header.className = 'document-head';
    const title = targetDocument.createElement('h1');
    title.textContent = 'Recetë';
    const meta = targetDocument.createElement('div');
    meta.className = 'document-meta';
    const brand = targetDocument.createElement('img');
    // Embedded official brand/drx-horizontal-on-light.svg: PDF works offline too.
    brand.src = "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4NCjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIwIDAgMTE1NCAzNDAiIHdpZHRoPSIxMTU0IiBoZWlnaHQ9IjM0MCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsbGVkYnk9InRpdGxlIiBzaGFwZS1yZW5kZXJpbmc9Imdlb21ldHJpY1ByZWNpc2lvbiI+DQogIDx0aXRsZSBpZD0idGl0bGUiPkRSeCBob3Jpem9udGFsIG9uIGxpZ2h0PC90aXRsZT4NCiAgPGRlZnM+DQogICAgPGxpbmVhckdyYWRpZW50IGlkPSJzaWx2ZXIiIHgxPSIwIiB5MT0iMCIgeDI9IjExNTQiIHkyPSIzNDAiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj4NCiAgICAgIDxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iIzlBOURBMiIvPg0KICAgICAgPHN0b3Agb2Zmc2V0PSIwLjUyIiBzdG9wLWNvbG9yPSIjOUM5RkE0Ii8+DQogICAgICA8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM5QTlEQTIiLz4NCiAgICA8L2xpbmVhckdyYWRpZW50Pg0KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iY2hhcmNvYWwiIHgxPSIwIiB5MT0iMCIgeDI9IjExNTQiIHkyPSIzNDAiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj4NCiAgICAgIDxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iIzMxMzEzMCIvPg0KICAgICAgPHN0b3Agb2Zmc2V0PSIwLjU1IiBzdG9wLWNvbG9yPSIjMzMzMzMyIi8+DQogICAgICA8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMzMTMxMzAiLz4NCiAgICA8L2xpbmVhckdyYWRpZW50Pg0KICA8L2RlZnM+DQogIDxwYXRoIGQ9Ik0zIDEzOCBMNCAxMzggTDQgMTM1IEw1IDEzNSBMNiAxMzEgTDkgMTI4IEwxMSAxMjggTDEzIDEyNiBMMTYgMTI2IEwxNiAxMjUgTDEwMCAxMjUgTDEwMCAxNCBMMTAxIDE0IEwxMDIgOSBMMTA2IDUgTDEwOCA1IEwxMTAgMyBMMjI1IDMgTDIyNSA0IEwyMzIgNCBMMjMyIDUgTDI0MiA2IEwyNDIgNyBMMjUwIDggTDI1MCA5IEwyNjUgMTMgTDI2NSAxNCBMMjcwIDE1IEwyNzAgMTYgTDI3MiAxNiBMMjcyIDE3IEwyODYgMjMgTDI4NyAyNSBMMjkxIDI2IEwyOTIgMjggTDI5NCAyOCBMMjk1IDMwIEwzMDAgMzIgTDMwMiAzNSBMMzA0IDM1IEwzMDcgMzkgTDMwOSAzOSBMMzI5IDU5IEwzMjkgNjEgTDMzMyA2NCBMMzMzIDY2IEwzMzYgNjggTDMzNiA3MCBMMzM4IDcxIEwzMzggNzMgTDM0MiA3NyBMMzQzIDgxIEwzNDUgODIgTDM0NSA4NCBMMzQ2IDg0IEwzNDYgODYgTDM0NyA4NiBMMzQ3IDg4IEwzNDggODggTDM0OCA5MCBMMzQ5IDkwIEwzNDkgOTIgTDM1MCA5MiBMMzUwIDk0IEwzNTEgOTQgTDM1MSA5NiBMMzU0IDEwMCBMMzU2IDEwOCBMMzU4IDExMCBMMzYwIDEyMCBMMzYxIDEyMCBMMzYxIDEyMyBMMzYyIDEyMyBMMzYyIDEyNyBMMzYzIDEyNyBMMzYzIDEzMSBMMzY0IDEzMSBMMzY1IDE0MSBMMzY2IDE0MSBMMzY3IDE1OSBMMzY4IDE1OSBMMzY4IDE4MCBMMzY3IDE4MCBMMzY3IDE5MiBMMzY2IDE5MiBMMzY1IDIwNSBMMzY0IDIwNSBMMzY0IDIwOSBMMzYzIDIwOSBMMzYyIDIxOCBMMzYxIDIxOCBMMzYxIDIyMSBMMzYwIDIyMSBMMzYwIDIyNCBMMzU5IDIyNCBMMzU5IDIyOCBMMzU3IDIzMCBMMzU3IDIzMyBMMzU2IDIzMyBMMzU2IDIzNiBMMzUzIDI0MCBMMzUzIDI0MyBMMzUyIDI0MyBMMzQ2IDI1NyBMMzQ0IDI1OCBMMzQzIDI2MiBMMzQxIDI2MyBMMzQxIDI2NSBMMzM5IDI2NiBMMzM5IDI2OCBMMzM1IDI3MiBMMzM1IDI3NCBMMzMxIDI3NyBMMzMxIDI3OSBMMzI2IDI4MyBMMzI2IDI4NSBMMzEzIDI5OCBMMzExIDI5OCBMMzAyIDMwNyBMMzAwIDMwNyBMMjk5IDMwOSBMMjk3IDMwOSBMMjk2IDMxMSBMMjk0IDMxMSBMMjkzIDMxMyBMMjkxIDMxMyBMMjg3IDMxNyBMMjg1IDMxNyBMMjg1IDMxOCBMMjgzIDMxOCBMMjgzIDMxOSBMMjgxIDMxOSBMMjgxIDMyMCBMMjc5IDMyMCBMMjc5IDMyMSBMMjc3IDMyMSBMMjc3IDMyMiBMMjc1IDMyMiBMMjcxIDMyNSBMMjY4IDMyNSBMMjY2IDMyNyBMMjYwIDMyOCBMMjYwIDMyOSBMMjUyIDMzMSBMMjUyIDMzMiBMMjM5IDMzNCBMMjM5IDMzNSBMMjMzIDMzNSBMMjMzIDMzNiBMMjI2IDMzNiBMMjI2IDMzNyBMMTEwIDMzNyBMMTEwIDMzNiBMMTA3IDMzNiBMMTAyIDMzMSBMMTAxIDMyNiBMMTAwIDMyNiBMMTAwIDIxNyBMMTYgMjE3IEwxNiAyMTYgTDEzIDIxNiBMMTMgMjE1IEw5IDIxNCBMNiAyMTEgTDYgMjA5IEw0IDIwOCBMNCAyMDQgTDMgMjA0IFogTTEwMSAxMzYgTDEwMSAyMDcgTDEwMiAyMDcgTDEwMiAyMTAgTDEwNCAyMTEgTDEwNSAyMTQgTDEwNyAyMTQgTDEwOCAyMTYgTDExMiAyMTYgTDExMiAyMTcgTDE2NiAyMTcgTDE2NiAyMTggTDE3MCAyMTkgTDE3MyAyMjIgTDE3NCAyMjcgTDE3NSAyMjcgTDE3NSAyNjcgTDE4MSAyNzMgTDIxNCAyNzMgTDIxNCAyNzIgTDIyMSAyNzIgTDIyMSAyNzEgTDIyNiAyNzEgTDIyNiAyNzAgTDIyOSAyNzAgTDIyOSAyNjkgTDIzMyAyNjkgTDIzNSAyNjcgTDIzOCAyNjcgTDIzOCAyNjYgTDI0MSAyNjYgTDI0MSAyNjUgTDI0NyAyNjMgTDI0OCAyNjEgTDI1MiAyNjAgTDI1MyAyNTggTDI1OCAyNTYgTDI2MCAyNTMgTDI2MiAyNTMgTDI3NiAyMzkgTDI3NiAyMzcgTDI3OSAyMzUgTDI3OSAyMzMgTDI4MyAyMjkgTDI4NCAyMjUgTDI4NiAyMjQgTDI4NiAyMjIgTDI4OCAyMjAgTDI4OCAyMTcgTDI5MSAyMTMgTDI5MSAyMTAgTDI5MyAyMDggTDI5NSAxOTggTDI5NiAxOTggTDI5NyAxODggTDI5OCAxODggTDI5OSAxNjIgTDI5OCAxNjIgTDI5NyAxNDcgTDI5NiAxNDcgTDI5NSAxMzkgTDI5NCAxMzkgTDI5MiAxMzAgTDI5MCAxMjggTDI5MCAxMjUgTDI4OSAxMjUgTDI4NSAxMTUgTDI4MyAxMTQgTDI4MiAxMTAgTDI4MCAxMDkgTDI4MCAxMDcgTDI3NyAxMDUgTDI3NyAxMDMgTDI3MiA5OSBMMjcyIDk3IEwyNjcgOTIgTDI2NSA5MiBMMjU2IDgzIEwyNTIgODIgTDI1MSA4MCBMMjQ5IDgwIEwyNDkgNzkgTDI0NyA3OSBMMjQ3IDc4IEwyNDUgNzggTDI0NSA3NyBMMjQzIDc3IEwyNDMgNzYgTDI0MSA3NiBMMjM3IDczIEwyMzQgNzMgTDIzNCA3MiBMMjMxIDcyIEwyMzEgNzEgTDIyOCA3MSBMMjI4IDcwIEwyMTggNjkgTDIxOCA2OCBMMTgwIDY4IEwxNzYgNzEgTDE3NiA3NCBMMTc1IDc0IEwxNzUgMTE1IEwxNzQgMTE1IEwxNzMgMTIwIEwxNzAgMTIzIEwxNjggMTIzIEwxNjcgMTI1IEwxNjMgMTI1IEwxNjMgMTI2IEwxMTEgMTI2IEwxMTEgMTI3IEwxMDggMTI3IEwxMDcgMTI5IEwxMDUgMTI5IEwxMDQgMTMyIEwxMDIgMTMzIEwxMDIgMTM2IFoiIGZpbGw9InVybCgjc2lsdmVyKSIgZmlsbC1ydWxlPSJldmVub2RkIi8+DQogIDxwYXRoIGQ9Ik00NjkgNjQgTDU5MiA2NCBMNTkyIDY1IEw2MDAgNjUgTDYwMCA2NiBMNjE5IDY5IEw2MTkgNzAgTDYzMSA3MyBMNjM1IDc2IEw2MzggNzYgTDYzOCA3NyBMNjQ2IDgwIEw2NDcgODIgTDY1MyA4NCBMNjU4IDg5IEw2NjAgODkgTDY2MyA5MyBMNjY1IDkzIEw2NzcgMTA1IEw2NzcgMTA3IEw2ODEgMTEwIEw2ODEgMTEyIEw2ODMgMTEzIEw2ODMgMTE1IEw2ODcgMTE5IEw2ODggMTIzIEw2OTAgMTI0IEw2OTEgMTI5IEw2OTIgMTI5IEw2OTIgMTMxIEw2OTUgMTM1IEw2OTggMTQ3IEw2OTkgMTQ3IEw3MDEgMTYwIEw3MDIgMTYwIEw3MDIgMTY3IEw3MDMgMTY3IEw3MDQgMTk0IEw3MDMgMTk0IEw3MDMgMjA2IEw3MDIgMjA2IEw3MDEgMjE4IEw3MDAgMjE4IEw2OTkgMjI2IEw2OTggMjI2IEw2OTQgMjQxIEw2OTMgMjQxIEw2OTMgMjQzIEw2OTIgMjQzIEw2ODYgMjU3IEw2ODIgMjYxIEw2ODIgMjYzIEw2NzkgMjY1IEw2NzkgMjY3IEw2NzYgMjY5IEw2NzYgMjcxIEw2NjIgMjg1IEw2NjAgMjg1IEw2NTggMjg4IEw2NTYgMjg4IEw2NTEgMjkzIEw2NDcgMjk0IEw2NDYgMjk2IEw2NDQgMjk2IEw2NDQgMjk3IEw2NDIgMjk3IEw2NDIgMjk4IEw2NDAgMjk4IEw2NDAgMjk5IEw2MzggMjk5IEw2MzggMzAwIEw2MzYgMzAwIEw2MzIgMzAzIEw2MjkgMzAzIEw2MjkgMzA0IEw2MjYgMzA0IEw2MjYgMzA1IEw2MjMgMzA1IEw2MjMgMzA2IEw2MjAgMzA2IEw2MjAgMzA3IEw2MTcgMzA3IEw2MTcgMzA4IEw2MDkgMzA5IEw2MDkgMzEwIEw2MDMgMzEwIEw2MDMgMzExIEw1ODcgMzEyIEw1ODcgMzEzIEw0NjkgMzEzIFogTTQ5NCA4MyBMNDk0IDI5MyBMNTA2IDI5MyBMNTA2IDI5MiBMNTUwIDI5MiBMNTUwIDI5MyBMNTU0IDI5MiBMNTU0IDI5MyBMNTU3IDI5MyBMNTU3IDI5MiBMNTg5IDI5MiBMNTg5IDI5MSBMNTk2IDI5MSBMNTk2IDI5MCBMNjAxIDI5MCBMNjAxIDI4OSBMNjA5IDI4OCBMNjA5IDI4NyBMNjE1IDI4NiBMNjE3IDI4NCBMNjIwIDI4NCBMNjIwIDI4MyBMNjMwIDI3OSBMNjMxIDI3NyBMNjM1IDI3NiBMNjQwIDI3MSBMNjQyIDI3MSBMNjU3IDI1NiBMNjU3IDI1NCBMNjU5IDI1MyBMNjU5IDI1MSBMNjYzIDI0NyBMNjY0IDI0MyBMNjY2IDI0MiBMNjY2IDI0MCBMNjY4IDIzOCBMNjY4IDIzNSBMNjcxIDIzMSBMNjc0IDIxOSBMNjc1IDIxOSBMNjc1IDIxNCBMNjc2IDIxNCBMNjc2IDIwOSBMNjc3IDIwOSBMNjc3IDIwMiBMNjc4IDIwMiBMNjc4IDE3MiBMNjc3IDE3MiBMNjc2IDE1OSBMNjc1IDE1OSBMNjc1IDE1NSBMNjc0IDE1NSBMNjcwIDE0MCBMNjY5IDE0MCBMNjY2IDEzMiBMNjY0IDEzMSBMNjYzIDEyNyBMNjU4IDEyMiBMNjU4IDEyMCBMNjU0IDExNyBMNjU0IDExNSBMNjUxIDExMiBMNjQ5IDExMiBMNjQzIDEwNSBMNjQxIDEwNSBMNjM5IDEwMiBMNjM1IDEwMSBMNjM0IDk5IEw2MzIgOTkgTDYzMiA5OCBMNjMwIDk4IEw2MzAgOTcgTDYyOCA5NyBMNjI4IDk2IEw2MjYgOTYgTDYyNiA5NSBMNjI0IDk1IEw2MjAgOTIgTDYxNyA5MiBMNjE3IDkxIEw2MTQgOTEgTDYxNCA5MCBMNjExIDkwIEw2MTEgODkgTDYwOCA4OSBMNjA4IDg4IEw2MDAgODcgTDYwMCA4NiBMNTg3IDg1IEw1ODcgODQgTDU3MSA4NCBMNTcxIDgzIEw0OTggODMgTDQ5OCA4NCBaIE03NDggNjQgTDg4NiA2NCBMODg2IDY1IEw4OTQgNjUgTDg5NCA2NiBMOTA0IDY3IEw5MDQgNjggTDkwOCA2OCBMOTA4IDY5IEw5MTQgNzAgTDkxNiA3MiBMOTE5IDcyIEw5MTkgNzMgTDkyOSA3NyBMOTMwIDc5IEw5MzIgNzkgTDkzNCA4MiBMOTM2IDgyIEw5NDIgODggTDk0MiA5MCBMOTQ1IDkyIEw5NDUgOTQgTDk0NyA5NSBMOTQ3IDk3IEw5NTAgMTAxIEw5NTAgMTA0IEw5NTEgMTA0IEw5NTIgMTA5IEw5NTMgMTA5IEw5NTQgMTE5IEw5NTUgMTE5IEw5NTUgMTQ4IEw5NTQgMTQ4IEw5NTIgMTYxIEw5NTAgMTYzIEw5NTAgMTY2IEw5NDkgMTY2IEw5NDYgMTc0IEw5NDQgMTc1IEw5NDIgMTgwIEw5MzIgMTkwIEw5MzAgMTkwIEw5MjggMTkzIEw5MjQgMTk0IEw5MjMgMTk2IEw5MjEgMTk2IEw5MTkgMTk4IEw5MTYgMTk4IEw5MTYgMTk5IEw5MDggMjAxIEw5MDggMjAyIEw5MDAgMjAzIEw5MDAgMjA0IEw4ODggMjA1IEw4ODggMjA2IEw4NzggMjA2IEw4NzggMjA3IEw4NzEgMjA3IEw4NzEgMjA4IEw5NzUgMzExIEw5NzUgMzEzIEw5NDIgMzEzIEw5MjggMjk5IEw5MjggMjk3IEw4MjUgMTk1IEw4MjUgMTkzIEw4NjYgMTkzIEw4NjYgMTkyIEw4NzYgMTkyIEw4NzYgMTkxIEw4ODIgMTkxIEw4ODIgMTkwIEw4OTMgMTg4IEw4OTUgMTg2IEw4OTggMTg2IEw4OTggMTg1IEw5MDggMTgxIEw5MTAgMTc4IEw5MTIgMTc4IEw5MjEgMTY5IEw5MjIgMTY1IEw5MjQgMTY0IEw5MjQgMTYyIEw5MjYgMTYwIEw5MjggMTUwIEw5MjkgMTUwIEw5MjkgMTQ1IEw5MzAgMTQ1IEw5MzAgMTIxIEw5MjkgMTIxIEw5MjggMTEzIEw5MjcgMTEzIEw5MjMgMTAzIEw5MTYgOTYgTDkxNCA5NiBMOTEzIDk0IEw5MTEgOTQgTDkxMCA5MiBMOTA4IDkyIEw5MDQgODkgTDg5NCA4NyBMODk0IDg2IEw4OTAgODYgTDg5MCA4NSBMODcxIDg0IEw4NzEgODMgTDc3MyA4MyBMNzczIDMxMyBMNzQ5IDMxMyBMNzQ4IDMxMiBaIE0xMDA4IDMxMSBMMTAxMSAzMTAgTDEwMTEgMzA4IEwxMDY3IDI1MyBMMTA2NyAyNTEgTDEwMTEgMTk1IEwxMDA5IDE5NSBMMTAwOSAxOTMgTDEwMzQgMTkzIEwxMDc5IDIzOSBMMTA4MSAyMzkgTDExMjUgMTkzIEwxMTUwIDE5MyBMMTA5MiAyNTIgTDExNTEgMzExIEwxMTUxIDMxMyBMMTEyNiAzMTMgTDExMjMgMzEwIEwxMTIzIDMwOCBMMTA4MCAyNjUgTDEwNzggMjY1IEwxMDYyIDI4MSBMMTA2MiAyODMgTDEwMzYgMzA4IEwxMDM2IDMxMCBMMTAzMyAzMTMgTDEwMDggMzEzIFoiIGZpbGw9InVybCgjY2hhcmNvYWwpIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiLz4NCjwvc3ZnPg0K";
    brand.alt = 'DRx';
    brand.width = 91;
    brand.height = 28;
    const date = targetDocument.createElement('time');
    const now = new Date();
    date.dateTime = now.toISOString();
    date.textContent = [now.getDate(), now.getMonth() + 1, now.getFullYear()].map(value => String(value).padStart(2, '0')).join('.');
    targetDocument.title = `Recetë-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    meta.append(brand, date);
    header.append(title, meta);
    targetDocument.body.appendChild(header);

    appendDiagnosisSection(targetDocument, model);

    appendPrescription(targetDocument, prescriptionText);
    const signature = targetDocument.createElement('footer');
    signature.className = 'document-signature';
    signature.textContent = 'Nënshkrimi / vula';
    targetDocument.body.appendChild(signature);
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
      // Wait for the local brand asset before opening the system PDF/print dialog.
      const brand = popup.document.querySelector('.document-meta img');
      if (brand && !brand.complete) {
        let timer;
        const ready = () => { window.clearTimeout(timer); brand.removeEventListener('load', ready); brand.removeEventListener('error', ready); runPrint(); };
        brand.addEventListener('load', ready, { once:true });
        brand.addEventListener('error', ready, { once:true });
        timer = window.setTimeout(ready, 1600);
      } else window.setTimeout(runPrint, 80);
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
