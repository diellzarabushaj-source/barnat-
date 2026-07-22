(() => {
  let scheduled = false;

  const normalize = value => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

  function badge(status, message) {
    const span = document.createElement('span');
    span.className = `data-quality-badge ${status}`;
    span.textContent = status === 'corrected' ? '✓ Korrigjuar' : '! Verifiko';
    span.title = message;
    return span;
  }

  function decorateRow(row) {
    if (row.dataset.qualityDecorated === '1') return;
    const cells = row.cells;
    if (!cells || cells.length < 6) return;
    const trade = normalize(cells[0].textContent);
    const substance = normalize(cells[1].textContent);
    const atc = String(cells[2].textContent || '').toUpperCase().replace(/\s+/g, '');
    const strength = normalize(cells[4].textContent);
    const isMetamizole = ['metamizole', 'metamizol', 'dipyrone', 'noramidopyrine'].some(value => substance.includes(value));
    const isCorrectedAnalgin = trade.includes('analgin') && atc === 'N02BB02' && strength.includes('1g2ml') && isMetamizole;
    const isMismatch = (trade.includes('analgin') || atc === 'N02BB02') && !isMetamizole;

    if (isCorrectedAnalgin) {
      row.classList.add('quality-corrected');
      cells[1].appendChild(badge('corrected', 'REG-2026-001: substanca në burim u korrigjua nga Metronidazole micronised në Metamizole sodium pas verifikimit zyrtar.'));
    } else if (isMismatch) {
      row.classList.add('quality-blocked');
      cells[1].appendChild(badge('blocked', 'Mospërputhje emër–substancë–ATC. Kërkohet verifikim para përdorimit.'));
    }
    row.dataset.qualityDecorated = '1';
  }

  function decorate() {
    scheduled = false;
    document.querySelectorAll('#drugTableBody tr').forEach(decorateRow);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  const target = document.getElementById('drugTableBody') || document.documentElement;
  new MutationObserver(schedule).observe(target, { childList:true, subtree:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorate, { once:true });
  else decorate();
})();
