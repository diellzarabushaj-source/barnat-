(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root?.document) api.init(root.document);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TEMPLATES = [
    {
      key: 'tablet',
      label: 'Tableta',
      icon: 'Tab.',
      aliases: /tablet|tableta|tab\.?/i,
      template: 'Nga {{1}} tabletë çdo 8 orë, për 5 ditë.',
      preview: 'Nga 1 tabletë çdo 8 orë, për 5 ditë.',
    },
    {
      key: 'capsule',
      label: 'Kapsula',
      icon: 'Caps.',
      aliases: /kapsul|capsul|caps\.?/i,
      template: 'Nga {{1}} kapsulë çdo 8 orë, për 5 ditë.',
      preview: 'Nga 1 kapsulë çdo 8 orë, për 5 ditë.',
    },
    {
      key: 'ointment',
      label: 'Unguentum / krem',
      icon: 'Ung.',
      aliases: /unguent|ointment|krem|cream|ung\.?/i,
      template: 'Aplikohet një shtresë e hollë në zonën e prekur {{2}} herë në ditë, për 7 ditë.',
      preview: 'Aplikohet një shtresë e hollë 2 herë në ditë.',
    },
    {
      key: 'injection',
      label: 'Injeksion',
      icon: 'Amp.',
      aliases: /ampul|amp\.?|injeks|injection|flakon|vial/i,
      template: 'Administrohet {{1}} ampulë IM/IV/SC, 1 herë në ditë, për 1 ditë.',
      preview: '1 ampulë IM/IV/SC, sipas skemës së zgjedhur.',
    },
    {
      key: 'infusion',
      label: 'Infuzion',
      icon: 'Inf.',
      aliases: /infuz|infusion|inf\.?/i,
      template: 'Administrohet IV si infuzion për {{30}} minuta, 1 herë në ditë.',
      preview: 'IV si infuzion për 30 minuta.',
    },
    {
      key: 'manual',
      label: 'Shkruaje vetë',
      icon: 'S.',
      aliases: null,
      template: '',
      preview: 'Vendoset vetëm fusha bosh e Signaturës.',
    },
  ];

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[character]));

  function detectForm(value) {
    const source = String(value || '');
    const ordered = ['infusion', 'injection', 'ointment', 'capsule', 'tablet'];
    return ordered.find(key => TEMPLATES.find(item => item.key === key)?.aliases?.test(source)) || '';
  }

  function contextAtCursor(value, cursor) {
    const source = String(value || '');
    const position = Math.max(0, Math.min(Number.isFinite(cursor) ? cursor : source.length, source.length));
    const before = source.slice(0, position);
    const blockStart = Math.max(before.lastIndexOf('\n\n'), before.lastIndexOf('\r\n\r\n'));
    return before.slice(blockStart >= 0 ? blockStart + 2 : 0).trim();
  }

  function renderTemplate(template) {
    const source = String(template || '');
    const match = /\{\{([^{}]+)\}\}/.exec(source);
    if (!match) return { text: source, selectionStart: source.length, selectionEnd: source.length };
    const before = source.slice(0, match.index);
    const selected = match[1];
    const after = source.slice(match.index + match[0].length).replace(/\{\{([^{}]+)\}\}/g, '$1');
    return {
      text: `${before}${selected}${after}`,
      selectionStart: before.length,
      selectionEnd: before.length + selected.length,
    };
  }

  function insertionFor(value, selectionStart, selectionEnd, signatureText) {
    const source = String(value || '');
    const start = Math.max(0, Math.min(selectionStart ?? source.length, source.length));
    const end = Math.max(start, Math.min(selectionEnd ?? start, source.length));
    const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextBreak = source.indexOf('\n', end);
    const lineEnd = nextBreak < 0 ? source.length : nextBreak;
    const currentLine = source.slice(lineStart, lineEnd);
    const replacement = `S (Signatura): ${signatureText}`;

    if (/^\s*(?:S(?:\s*\(Signatura\))?\.?|Signatura)\s*:/i.test(currentLine)) {
      return {
        value: `${source.slice(0, lineStart)}${replacement}${source.slice(lineEnd)}`,
        insertionStart: lineStart,
      };
    }

    const before = source.slice(0, start);
    const after = source.slice(end);
    const prefix = before && !before.endsWith('\n') ? '\n' : '';
    const suffix = after && !after.startsWith('\n') ? '\n' : '';
    return {
      value: `${before}${prefix}${replacement}${suffix}${after}`,
      insertionStart: before.length + prefix.length,
    };
  }

  function selectedContext(documentRef) {
    const composer = documentRef.getElementById('rxComposer');
    if (!composer) return '';
    const local = contextAtCursor(composer.value, composer.selectionStart ?? composer.value.length);
    if (detectForm(local)) return local;
    const lastDrug = documentRef.querySelector('#rxSelectedDrugs .rx-drug-chip:last-of-type span');
    return `${local} ${lastDrug?.textContent || ''}`.trim();
  }

  function setStatus(documentRef, message) {
    const status = documentRef.getElementById('rxStatus');
    if (!status) return;
    status.textContent = message;
    status.className = 'rx-status is-success';
  }

  function createPopover(documentRef) {
    let popover = documentRef.getElementById('rxSignaturePopover');
    if (popover) return popover;

    popover = documentRef.createElement('div');
    popover.id = 'rxSignaturePopover';
    popover.className = 'rx-popover rx-signature-popover';
    popover.hidden = true;
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Modelet e Signaturës');

    const anchor = documentRef.getElementById('rxDrugPopover') || documentRef.getElementById('rxSelectedDrugs');
    anchor?.insertAdjacentElement('afterend', popover);
    return popover;
  }

  function renderPopover(documentRef, recommendedKey = '') {
    const popover = createPopover(documentRef);
    const ordered = [...TEMPLATES].sort((a, b) => {
      if (a.key === recommendedKey) return -1;
      if (b.key === recommendedKey) return 1;
      return 0;
    });

    popover.innerHTML = `<div class="rx-signature-head"><div><strong>Zgjidh modelin e Signaturës</strong><small>Numrat janë shembull. Pasi vendoset modeli, mund t’i ndryshosh lirshëm.</small></div><button type="button" data-close-signature aria-label="Mbyll">×</button></div><div class="rx-signature-grid">${ordered.map(item => `<button class="rx-signature-option${item.key === recommendedKey ? ' is-recommended' : ''}" type="button" data-signature-template="${escapeHtml(item.key)}"><span class="rx-signature-icon">${escapeHtml(item.icon)}</span><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.preview)}</small></span>${item.key === recommendedKey ? '<em>E sugjeruar</em>' : ''}</button>`).join('')}</div>`;
    return popover;
  }

  function close(documentRef) {
    const popover = documentRef.getElementById('rxSignaturePopover');
    if (popover) popover.hidden = true;
    const trigger = documentRef.querySelector('[data-rx-command="signature"]');
    trigger?.setAttribute('aria-expanded', 'false');
  }

  function open(documentRef) {
    ['rxFormPopover', 'rxDrugPopover'].forEach(id => {
      const node = documentRef.getElementById(id);
      if (node) node.hidden = true;
    });
    const recommendedKey = detectForm(selectedContext(documentRef));
    const popover = renderPopover(documentRef, recommendedKey);
    popover.hidden = false;
    const trigger = documentRef.querySelector('[data-rx-command="signature"]');
    trigger?.setAttribute('aria-expanded', 'true');
    popover.querySelector('.is-recommended, .rx-signature-option')?.focus({ preventScroll:true });
  }

  function insertTemplate(documentRef, key) {
    const item = TEMPLATES.find(template => template.key === key) || TEMPLATES.at(-1);
    const composer = documentRef.getElementById('rxComposer');
    if (!composer) return;

    const rendered = renderTemplate(item.template);
    const insertion = insertionFor(
      composer.value,
      composer.selectionStart ?? composer.value.length,
      composer.selectionEnd ?? composer.selectionStart ?? composer.value.length,
      rendered.text,
    );

    composer.value = insertion.value;
    const contentStart = insertion.insertionStart + 'S (Signatura): '.length;
    const selectionStart = contentStart + rendered.selectionStart;
    const selectionEnd = contentStart + rendered.selectionEnd;
    composer.focus();
    composer.setSelectionRange(selectionStart, selectionEnd);
    composer.dispatchEvent(new Event('input', { bubbles:true }));
    close(documentRef);
    setStatus(documentRef, item.key === 'manual'
      ? 'Signatura bosh u vendos. Shkruaje udhëzimin vetë.'
      : `Modeli për ${item.label.toLocaleLowerCase('sq')} u vendos. Ndrysho numrat, rrugën ose kohëzgjatjen sipas nevojës.`);
  }

  function init(documentRef = document) {
    if (!documentRef.querySelector('[data-rx-command="signature"]')) return;
    createPopover(documentRef);

    documentRef.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-rx-command="signature"]');
      if (trigger) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const popover = createPopover(documentRef);
        if (popover.hidden) open(documentRef);
        else close(documentRef);
        return;
      }

      const templateButton = event.target.closest?.('[data-signature-template]');
      if (templateButton) {
        event.preventDefault();
        insertTemplate(documentRef, templateButton.dataset.signatureTemplate);
        return;
      }

      if (event.target.closest?.('[data-close-signature]')) {
        event.preventDefault();
        close(documentRef);
        return;
      }

      if (!event.target.closest?.('#rxSignaturePopover')) close(documentRef);
    }, true);

    documentRef.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !documentRef.getElementById('rxSignaturePopover')?.hidden) {
        close(documentRef);
        documentRef.querySelector('[data-rx-command="signature"]')?.focus();
      }
    });
  }

  return {
    TEMPLATES,
    detectForm,
    contextAtCursor,
    renderTemplate,
    insertionFor,
    init,
  };
});
