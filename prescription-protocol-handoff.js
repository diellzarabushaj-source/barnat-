(() => {
  'use strict';

  const TRANSFER_KEY = 'medindexPrescriptionProtocolDraft';
  const PROTOCOL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;
  const HASH_PATTERN = /^[a-f0-9]{64}$/i;

  const clean = (value, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const boundedMultiline = (value, max = 6000) => String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);

  function readTransfer() {
    try {
      const raw = sessionStorage.getItem(TRANSFER_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(TRANSFER_KEY);
      const value = JSON.parse(raw);
      if (Number(value?.version) !== 1) return null;
      const protocolId = clean(value.protocolId, 64);
      const sourceHash = clean(value.sourceHash, 64).toLowerCase();
      if (!PROTOCOL_ID_PATTERN.test(protocolId) || !HASH_PATTERN.test(sourceHash)) return null;
      return {
        protocolId,
        sourceHash,
        protocolTitle:clean(value.protocolTitle, 200),
        diagnosis:clean(value.diagnosis, 200),
        composer:boundedMultiline(value.composer),
        createdAt:clean(value.createdAt, 40),
      };
    } catch {
      try { sessionStorage.removeItem(TRANSFER_KEY); } catch {}
      return null;
    }
  }

  async function sourceStillMatches(transfer) {
    try {
      const response = await fetch('/data/protocols.json', {
        credentials:'same-origin',
        cache:'no-cache',
        headers:{ Accept:'application/json' },
      });
      if (!response.ok) return false;
      const manifest = await response.json();
      const record = Array.isArray(manifest?.documents)
        ? manifest.documents.find(item => clean(item?.id, 64) === transfer.protocolId)
        : null;
      return Boolean(record && clean(record.contentSha256, 64).toLowerCase() === transfer.sourceHash);
    } catch {
      return false;
    }
  }

  function setStatus(message, type = '') {
    const node = document.getElementById('rxStatus');
    if (!node) return;
    node.textContent = message;
    node.className = `rx-status${type ? ` is-${type}` : ''}`;
  }

  function insertBanner(transfer) {
    const card = document.querySelector('.rx-compose-card');
    const head = card?.querySelector('.rx-card-head');
    if (!card || !head || card.querySelector('[data-rx-protocol-import]')) return;
    const banner = document.createElement('div');
    banner.className = 'rx-protocol-import';
    banner.dataset.rxProtocolImport = '1';
    banner.innerHTML = `<div><span>Nga protokolli</span><strong>${escapeHtml(transfer.protocolTitle || 'Protokoll klinik')}</strong><p>Drafti është bartur vetëm si pikënisje. Zgjidh preparatin konkret dhe verifiko dozën, rrugën, shpeshtësinë, kohëzgjatjen dhe kundërindikacionet para përdorimit.</p></div><a href="protokollet.html?protocol=${encodeURIComponent(transfer.protocolId)}">Kthehu te protokolli</a>`;
    head.insertAdjacentElement('afterend', banner);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
    }[character]));
  }

  function applyTransfer(transfer) {
    const diagnosis = document.getElementById('rxDiagnosis');
    const composer = document.getElementById('rxComposer');
    if (!diagnosis || !composer) return false;

    if (!clean(diagnosis.value) && transfer.diagnosis) diagnosis.value = transfer.diagnosis;
    if (!boundedMultiline(composer.value) && transfer.composer) composer.value = transfer.composer;
    insertBanner(transfer);

    diagnosis.dispatchEvent(new Event('input', { bubbles:true }));
    composer.dispatchEvent(new Event('input', { bubbles:true }));
    setStatus(
      transfer.composer
        ? 'Drafti nga protokolli u bart. Kontrolloje klinikisht dhe zgjidh preparatin konkret para ruajtjes.'
        : 'Indikacioni nga protokolli u bart. Zgjidh barin me @bari dhe plotëso recetën.',
      'success',
    );
    composer.focus({ preventScroll:true });
    return true;
  }

  async function init() {
    const transfer = readTransfer();
    if (!transfer) return;
    const valid = await sourceStillMatches(transfer);
    if (!valid) {
      setStatus('Burimi i protokollit nuk përputhet më me versionin aktual. Drafti nuk u importua.', 'error');
      return;
    }
    applyTransfer(transfer);
  }

  if (document.readyState === 'complete') void init();
  else window.addEventListener('load', () => { void init(); }, { once:true });
})();
