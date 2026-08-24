(() => {
  'use strict';

  const core = window.MedIndexEmergencyEvidenceV16;
  const client = window.MedIndexSanity;
  if (!core?.packet || !client?.query) return;

  const QUERY = `*[_type == "emergencyProtocol" && reviewStatus == "review"] | order(triageLevel asc, title asc){
    _id,title,"slug":slug.current,triageLevel,reviewStatus,version,reviewedBy,lastReviewedAt,reviewDueAt,
    primaryCareSteps[]{_key,title,action,why,setting,priority,note},
    secondaryCareSteps[]{_key,title,action,why,setting,priority,note},redFlags,doNotDo,
    referral{when,destination,urgency,beforeTransfer,handover,secondaryCareOverview},
    sources[]{_key,title,organization,url,publishedAt,note}
  }`;

  let richerItems = [];
  let loading = false;
  let frame = 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function sourceMarkup(source, index) {
    const meta = [source.organization, source.publishedAt].filter(Boolean).join(' · ');
    const title = source.url
      ? `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a>`
      : `<strong>${esc(source.title)}</strong>`;
    return `<li><span>${index + 1}</span><div>${title}${meta ? `<small>${esc(meta)}</small>` : ''}${source.note ? `<p>${esc(source.note)}</p>` : ''}</div></li>`;
  }

  function governanceMarkup(gov) {
    const missing = gov.reasons.length ? gov.reasons.map(reason => ({
      'missing-reviewer':'mungon rishikuesi',
      'missing-last-reviewed':'mungon data e rishikimit',
      'missing-review-due':'mungon afati i rishikimit',
      'review-overdue':'rishikimi ka skaduar',
    })[reason] || reason).join(' · ') : '';
    return `<div class="ck-v16-governance ${gov.ready ? 'is-ready' : 'is-blocked'}">
      <div><span>Rishikuesi</span><strong>${esc(gov.reviewedBy || '—')}</strong></div>
      <div><span>Rishikuar</span><strong>${esc(gov.lastReviewedAt || '—')}</strong></div>
      <div><span>Rishikim deri</span><strong>${esc(gov.reviewDueAt || '—')}</strong></div>
      <p>${gov.ready ? 'Metadata e rishikimit është e plotë dhe brenda afatit.' : `Bllokues governance: ${esc(missing)}`}</p>
    </div>`;
  }

  function enhance(card) {
    if (!card || card.querySelector('[data-ck-v16-evidence]')) return;
    const id = String(card.dataset.ckV14Card || '').trim();
    const item = richerItems.find(row => String(row?._id || '') === id);
    if (!item) return;
    const packet = core.packet(item);
    const section = document.createElement('section');
    section.className = 'ck-v16-evidence';
    section.dataset.ckV16Evidence = id;
    section.innerHTML = `<div class="ck-v16-head"><span>EVIDENCE TRACEABILITY v16</span><strong>${packet.sources.length} burime · ${packet.blocks.length} blloqe klinike</strong></div>
      <p class="ck-v16-warning"><strong>Gjurmueshmëri në nivel protokolli.</strong> Burimet janë në nivel protokolli. MedIndex nuk po lidh automatikisht një burim me një hap apo pohim specifik.</p>
      ${governanceMarkup(packet.governance)}
      <ol class="ck-v16-source-list">${packet.sources.map(sourceMarkup).join('') || '<li class="is-empty">Nuk ka burime të dokumentuara.</li>'}</ol>
      <details class="ck-v16-blocks"><summary>Shiko tekstet që duhen krahasuar me burimet</summary><div>${packet.blocks.map(block => `<article><span>${esc(block.section)} · ${esc(block.heading)}</span><code>${esc(block.path)}</code><p>${esc(block.text)}</p></article>`).join('')}</div></details>
      <p class="ck-v16-governance-note">Para statusit “verified”, rishikimi njerëzor duhet të dokumentojë reviewedBy, lastReviewedAt dhe reviewDueAt. Ky panel nuk aprovon dhe nuk ndryshon Sanity.</p>`;
    const checks = card.querySelector('.ck-v14-checks');
    if (checks) checks.insertAdjacentElement('beforebegin', section);
    else card.appendChild(section);
  }

  function render() {
    document.querySelectorAll('.ck-v14-review-card[data-ck-v14-card]').forEach(enhance);
  }
  function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); }

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const result = await client.query(QUERY, {}, {timeout:9000, cache:'no-cache'});
      richerItems = Array.isArray(result) ? result : [];
      window.MedIndexEmergencyEvidenceAuditV16 = Object.freeze({report:() => core.audit(richerItems), packets:() => richerItems.map(item => core.packet(item))});
      render();
    } catch {
      richerItems = [];
    } finally {
      loading = false;
    }
  }

  const root = document.querySelector('.clinical-knowledge-page') || document.body;
  const observer = new MutationObserver(schedule);
  observer.observe(root, {childList:true, subtree:true});
  load();
})();
