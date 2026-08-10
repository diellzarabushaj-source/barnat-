(() => {
  'use strict';

  const VERSION = 'registry-insulin-row-bridge-v1.1.0';
  const SUPPORTED = Object.freeze([
    {
      registryNumber: '2508',
      name: 'NovoRapid Flex Pen',
      nameKey: 'novorapid flex pen',
      atc: 'A10AB05',
      adultLabel: 'Dozim individual · Smart Insulin',
      pediatricLabel: '≥1 vjeç · dozim individual',
    },
    {
      registryNumber: '2509',
      name: 'NovoMix30 FlexPen',
      nameKey: 'novomix30 flexpen',
      atc: 'A10AD05',
      adultLabel: 'Dozim individual · Smart Insulin',
      pediatricLabel: '≥10 vjeç · dozim individual',
    },
    {
      registryNumber: '2510',
      name: 'Ryzodeg',
      nameKey: 'ryzodeg',
      atc: 'A10AD06',
      adultLabel: 'Dozim individual · Smart Insulin',
      pediatricLabel: '≥2 vjeç · dozim individual',
    },
    {
      registryNumber: '2511',
      name: 'Levemir FlexPen',
      nameKey: 'levemir flexpen',
      atc: 'A10AE05',
      adultLabel: 'Dozim individual · Smart Insulin',
      pediatricLabel: '≥1 vjeç · dozim individual',
    },
    {
      registryNumber: '2512',
      name: 'Tresiba',
      nameKey: 'tresiba',
      atc: 'A10AE06',
      adultLabel: 'Dozim individual · Smart Insulin',
      pediatricLabel: '≥1 vjeç · dozim individual',
    },
    {
      registryNumber: '2965',
      name: 'APIDRA SOLOSTAR',
      nameKey: 'apidra solostar',
      atc: 'A10AB06',
      adultLabel: 'Dozim individual · Smart Insulin',
      pediatricLabel: '≥6 vjeç · dozim individual',
    },
    {
      registryNumber: '3730',
      name: 'Semglee',
      nameKey: 'semglee',
      atc: 'A10AE04',
      adultLabel: 'Dozim individual · Smart Insulin',
      pediatricLabel: '≥2 vjeç · dozim individual',
    },
  ]);

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const norm = value => clean(value).toLocaleLowerCase('sq-AL');
  let scheduled = false;
  let observer = null;

  function headerMap() {
    const map = [];
    document.querySelectorAll('#headerRow > th').forEach((th, index) => {
      map.push({ index, text: norm(th.textContent).replace(/[▲▼↕]/g, '').trim() });
    });
    return map;
  }

  function headerCell(row, headers, matcher) {
    const found = headers.find(item => matcher(item.text));
    return found ? row.children[found.index] || null : null;
  }

  function columnCell(row, headers, key, matcher) {
    return row.querySelector(`[data-registry-column-key="${key}"]`)
      || row.querySelector(`[data-registry-dose-calculator-column="${key}"]`)
      || row.querySelector(`[data-column-key="${key}"]`)
      || headerCell(row, headers, matcher);
  }

  function registryNumber(row, headers) {
    const direct = clean(
      row.dataset.registryNumber
      || row.querySelector('.drug-select')?.dataset?.registryNumber
      || row.querySelector('[data-registry-number]')?.dataset?.registryNumber
    );
    if (direct) return direct;
    const cell = headerCell(row, headers, text => text === 'nr' || text === 'nr.' || text.includes('rendor'));
    const value = clean(cell?.textContent).match(/\d+/)?.[0];
    return value || '';
  }

  function canonicalName(row) {
    const fromData = clean(row.dataset.drugName);
    if (fromData) return fromData;

    const rawKey = clean(row.querySelector('.drug-select')?.dataset?.drugKey);
    const firstSeparator = rawKey.indexOf('|');
    const lastSeparator = rawKey.lastIndexOf('|');
    if (firstSeparator >= 0 && lastSeparator > firstSeparator) {
      const value = clean(rawKey.slice(firstSeparator + 1, lastSeparator));
      if (value) return value;
    }

    const cell = row.querySelector('td.name, [data-registry-column-key="trade-name"], [data-registry-column-key="trade_name"]');
    if (!cell) return '';
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('[data-registry-ui-only],button,.favorite-marker,.drug-actions-trigger').forEach(node => node.remove());
    return clean(clone.textContent);
  }

  function atcForRow(row, headers) {
    const direct = clean(row.dataset.atcCode || row.querySelector('[data-atc-code]')?.dataset?.atcCode);
    if (direct) return direct.toUpperCase();
    const cell = columnCell(row, headers, 'atc-code', text => text === 'atc' || text.includes('atc'));
    const text = clean(cell?.textContent).toUpperCase();
    return text.match(/A10A[A-Z0-9]{3}/)?.[0] || text;
  }

  function productForRow(row, headers) {
    const nr = registryNumber(row, headers);
    const name = norm(canonicalName(row));
    const atc = atcForRow(row, headers);

    return SUPPORTED.find(product => {
      if (nr && nr === product.registryNumber) return true;
      const nameMatches = name.includes(product.nameKey) || product.nameKey.includes(name);
      const atcMatches = atc === product.atc;
      return Boolean(nameMatches && atcMatches);
    }) || null;
  }

  function placeholderDose(cell) {
    if (!cell) return false;
    if (cell.querySelector('[data-insulin-dose-bridge]')) return false;
    const text = norm(cell.textContent);
    return !text
      || text === '—'
      || text === '-'
      || text.includes('nuk ka dozë')
      || text.includes('nuk ka doze')
      || text.includes('pa dozë të strukturuar')
      || text.includes('pa doze te strukturuar');
  }

  function bridgeDoseCell(cell, product, audience) {
    if (!cell || !placeholderDose(cell)) return;
    const wrapper = document.createElement('div');
    wrapper.dataset.insulinDoseBridge = audience;
    wrapper.dataset.registryUiOnly = 'true';
    wrapper.style.display = 'grid';
    wrapper.style.gap = '3px';
    wrapper.style.lineHeight = '1.25';
    wrapper.innerHTML = `<strong style="font-size:.76rem;color:var(--teal-dark,#0d3d40)">${audience === 'adult' ? product.adultLabel : product.pediatricLabel}</strong><small style="font-size:.64rem;color:#64748b">Hap kalkulatorin e thjeshtë për dozimin klinik.</small>`;
    cell.replaceChildren(wrapper);
    cell.title = `${product.name}: doza individualizohet sipas kontekstit klinik.`;
  }

  function bridgeCalculatorCell(cell, product) {
    if (!cell || cell.querySelector('[data-insulin-smart-open]')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'insulin-smart-cell';
    wrapper.dataset.insulinBridge = 'true';
    wrapper.dataset.registryUiOnly = 'true';
    wrapper.innerHTML = `<span class="insulin-smart-badge">INSULIN</span><button type="button" class="insulin-smart-open" data-insulin-smart-open="${product.registryNumber}" aria-label="Hap Smart Insulin për ${product.name}">Hap Smart Insulin</button>`;

    const placeholder = norm(cell.textContent);
    const genericButton = cell.querySelector('.dose-calculator-open');
    if (!genericButton && (!placeholder || placeholder === '—' || placeholder === '-')) cell.replaceChildren(wrapper);
    else cell.appendChild(wrapper);
  }

  function processRow(row, headers) {
    if (!(row instanceof HTMLElement) || row.querySelector('.empty-state')) return;
    const product = productForRow(row, headers);
    if (!product) return;

    row.dataset.insulinSmartSupported = product.registryNumber;

    const adultCell = columnCell(
      row,
      headers,
      'dosage-adult',
      text => text.includes('doza') && (text.includes('rritur') || text.includes('adult'))
    );
    const pediatricCell = columnCell(
      row,
      headers,
      'dosage-pediatric',
      text => text.includes('doza') && (text.includes('pediatr') || text.includes('fëmij') || text.includes('femij'))
    );
    const calculatorCell = columnCell(
      row,
      headers,
      'dose-calculator',
      text => text.includes('kalk') || text.includes('calculator')
    );

    bridgeDoseCell(adultCell, product, 'adult');
    bridgeDoseCell(pediatricCell, product, 'pediatric');
    bridgeCalculatorCell(calculatorCell, product);
  }

  function refresh() {
    scheduled = false;
    const tbody = document.getElementById('tbody');
    if (!tbody) return;
    const headers = headerMap();
    tbody.querySelectorAll(':scope > tr').forEach(row => processRow(row, headers));
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refresh);
  }

  function bind() {
    const tbody = document.getElementById('tbody');
    if (tbody && !observer) {
      observer = new MutationObserver(schedule);
      observer.observe(tbody, { childList: true, subtree: true, characterData: true });
    }
    window.addEventListener('medindex:registry-data-ready', schedule);
    window.addEventListener('medindex:dosage-ready', schedule);
    window.addEventListener('medindex:dose-catalog-ready', schedule);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();

  window.MEDINDEX_INSULIN_ROW_BRIDGE = Object.freeze({
    version: VERSION,
    supported: SUPPORTED.map(item => item.registryNumber),
    refresh: schedule,
  });
})();
