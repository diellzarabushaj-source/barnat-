(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { substances:[], substance:null, regimens:[], regimen:null };

  async function json(url, options = {}) {
    const response = await fetch(url, {
      credentials:'same-origin', cache:'no-store',
      headers:{ Accept:'application/json', ...(options.body ? {'Content-Type':'application/json'} : {}) },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.error || 'Kërkesa dështoi.');
    return payload;
  }

  async function ensureAuth() {
    const response = await fetch('/api/auth', { credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'} });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.authenticated !== true) {
      const target = new URL('/landing.html', location.origin);
      target.searchParams.set('return', location.pathname);
      location.replace(target.pathname + target.search);
      throw new Error('Sesioni nuk është aktiv.');
    }
  }

  function option(value, label) {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    return node;
  }

  function resetResult() {
    $('result').hidden = true;
    $('resultBody').textContent = '';
  }

  function renderSubstances() {
    const select = $('substance');
    select.textContent = '';
    select.append(option('', 'Zgjedh substancën aktive'));
    for (const item of state.substances) select.append(option(item.id, `${item.name} · ${item.atc}`));
  }

  function renderRegimens() {
    const select = $('regimen');
    select.textContent = '';
    select.append(option('', 'Zgjedh indikacionin'));
    const population = $('population').value;
    const filtered = state.regimens.filter(item => !population || item.population === population);
    for (const item of filtered) select.append(option(item.id, `${item.indication} · ${item.populationLabel} · ${item.route}`));
    $('regimenField').hidden = !state.substance;
    $('patientFields').hidden = true;
    $('calculate').disabled = true;
    resetResult();
  }

  function selectRegimen() {
    state.regimen = state.regimens.find(item => item.id === $('regimen').value) || null;
    if (!state.regimen) {
      $('patientFields').hidden = true;
      $('calculate').disabled = true;
      return;
    }
    const needsWeight = (state.regimen.requires || []).includes('weightKg');
    $('weightWrap').hidden = !needsWeight;
    $('patientFields').hidden = false;
    $('durationPreview').textContent = state.regimen.duration?.label || '—';
    $('routePreview').textContent = state.regimen.route || '—';
    $('calculate').disabled = false;
    resetResult();
  }

  function fact(label, value) {
    const row = document.createElement('div');
    row.className = 'result-fact';
    const k = document.createElement('span');
    k.textContent = label;
    const v = document.createElement('strong');
    v.textContent = value || '—';
    row.append(k, v);
    return row;
  }

  function renderResult(result) {
    const body = $('resultBody');
    body.textContent = '';
    body.append(
      fact('Substanca', result.substanceName),
      fact('Indikacioni', result.indication),
      fact('Doza', result.dose?.label),
      fact('Frekuenca', result.frequency?.label),
      fact('Kohëzgjatja', result.duration?.label),
      fact('Rruga', result.route),
      fact('Maksimumi', result.maximum?.label || '—')
    );
    if (result.notes) body.append(fact('Shënim', result.notes));
    const source = document.createElement('a');
    source.href = result.source.url;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = `Burimi · SmPC §${result.source.section}`;
    source.className = 'source-link';
    body.append(source);
    const review = document.createElement('p');
    review.className = 'review-note';
    review.textContent = 'Kërkon verifikim klinik para përdorimit në recetë.';
    body.append(review);
    $('result').hidden = false;
  }

  async function loadSubstance() {
    const id = $('substance').value;
    state.substance = state.substances.find(item => item.id === id) || null;
    state.regimen = null;
    resetResult();
    if (!id) {
      state.regimens = [];
      renderRegimens();
      return;
    }
    $('loading').hidden = false;
    try {
      const payload = await json(`/api/dosage?view=regimens&substance=${encodeURIComponent(id)}`);
      state.regimens = payload.regimens || [];
      renderRegimens();
    } catch (error) {
      $('status').textContent = error.message;
    } finally {
      $('loading').hidden = true;
    }
  }

  async function calculate() {
    if (!state.substance || !state.regimen) return;
    const weightKg = Number($('weightKg').value);
    $('calculate').disabled = true;
    $('status').textContent = 'Duke llogaritur…';
    try {
      const payload = await json('/api/dosage', {
        method:'POST',
        body:JSON.stringify({ action:'calculate', substanceId:state.substance.id, regimenId:state.regimen.id, weightKg }),
      });
      renderResult(payload.result);
      $('status').textContent = 'Rezultati u llogarit në server.';
    } catch (error) {
      $('status').textContent = error.message;
    } finally {
      $('calculate').disabled = false;
    }
  }

  async function boot() {
    try {
      await ensureAuth();
      const payload = await json('/api/dosage?view=substances');
      state.substances = payload.substances || [];
      renderSubstances();
      $('app').dataset.ready = 'true';
    } catch (error) {
      $('status').textContent = error.message;
    }
  }

  $('substance').addEventListener('change', loadSubstance);
  $('population').addEventListener('change', renderRegimens);
  $('regimen').addEventListener('change', selectRegimen);
  $('calculate').addEventListener('click', calculate);
  document.addEventListener('DOMContentLoaded', boot, { once:true });
})();
