(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const gate = $('pulseGate');
  const dashboard = $('pulseDashboard');
  const refresh = $('pulseRefresh');
  let snapshot = null;
  let timer = null;
  let lastReadAt = 0;

  const set = (id, value) => { const node = $(id); if (node) node.textContent = value == null ? '—' : String(value); };
  const date = value => {
    if (!value || !Number.isFinite(new Date(value).getTime())) return 'Koha e panjohur';
    return new Intl.DateTimeFormat('sq-AL', {dateStyle:'medium', timeStyle:'short'}).format(new Date(value));
  };
  const link = value => {
    try {
      const u = new URL(String(value || ''));
      return u.protocol === 'https:' && u.hostname === 'github.com' ? u.href : null;
    } catch { return null; }
  };
  const clear = node => { while (node.firstChild) node.firstChild.remove(); };
  const sourceOk = (data, name) => data.sources?.[name] === 'live';

  function signal(id, color) {
    const node = $(id);
    node.className = `pulse-stage-light${color ? ` is-${color}` : ''}`;
  }

  function itemRow({icon, title, subtitle, href}) {
    const row = document.createElement(href ? 'a' : 'div');
    row.className = 'pulse-list-item';
    if (href && link(href)) {
      row.href = link(href);
      row.target = '_blank';
      row.rel = 'noopener noreferrer';
    }
    const symbol = document.createElement('span');
    symbol.className = 'pulse-item-icon';
    symbol.textContent = icon;
    const body = document.createElement('div');
    body.className = 'pulse-item-body';
    const main = document.createElement('span');
    main.className = 'pulse-list-title';
    main.textContent = title;
    const sub = document.createElement('span');
    sub.className = 'pulse-list-subtitle';
    sub.textContent = subtitle;
    body.append(main, sub);
    const arrow = document.createElement('span');
    arrow.className = 'pulse-list-arrow';
    arrow.textContent = '↗';
    row.append(symbol, body, arrow);
    return row;
  }

  function emptyList(id, message) {
    const holder = $(id);
    clear(holder);
    const text = document.createElement('p');
    text.className = 'pulse-empty';
    text.textContent = message;
    holder.appendChild(text);
  }

  async function loadHealth() {
    const badge = $('pulseRuntimeState');
    try {
      const response = await fetch('/api/neon-status', {credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'}});
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.connected === false) throw new Error(payload.error || `HTTP ${response.status}`);
      const counts = payload.counts || {};
      const count = value => Number.isFinite(Number(value)) && value != null ? Number(value).toLocaleString('sq-AL') : '—';
      set('pulseLiveDrugs', count(counts.drugs));
      set('pulseLiveDoses', count(counts.dosageRegimens));
      set('pulseLiveIcd', count(counts.icdCodes));
      set('pulseLiveLabs', count(counts.labTests));
      badge.className = 'pulse-tag';
      badge.textContent = payload.overall?.label || 'Snapshot i disponueshëm';
      if (payload.overall?.code === 'healthy') badge.classList.add('is-green');
      else if (payload.overall?.severity === 'danger') badge.classList.add('is-red');
      else badge.classList.add('is-orange');
      set('pulseRuntimeChecked', `Gjendja e të dhënave · ${date(payload.checkedAt)} · ${payload.source || 'Supabase status'}`);
    } catch (error) {
      badge.className = 'pulse-tag is-red';
      badge.textContent = 'Nuk u verifikua';
      for (const id of ['pulseLiveDrugs','pulseLiveDoses','pulseLiveIcd','pulseLiveLabs']) set(id,'—');
      set('pulseRuntimeChecked', `Burimi i të dhënave nuk u lexua: ${error.message}. Nuk tregohet rezultat i supozuar.`);
    }
  }

  function render(data) {
    snapshot = data;
    lastReadAt = Date.now();
    set('pulseUpdated', `Kontrolluar: ${date(data.capturedAt)}`);
    set('pulseMainSha', data.main?.shortSha || '—');
    set('pulseMainTime', data.main?.date ? date(data.main.date) : 'Nuk u verifikua');
    set('pulseDeploySha', data.deployment?.shortSha || '—');

    const deployment = data.deployment || {};
    const state = deployment.state || 'unknown';
    const deployText = state === 'synced' ? 'I njëjtë me main' : state === 'different' ? 'Ndryshon nga main' : 'SHA e panjohur';
    set('pulseDeployState', deployText);
    set('pulseStageDeploy', state === 'synced' ? `Vercel shërben commit-in ${deployment.shortSha}` :
      state === 'different' ? `Vercel ${deployment.shortSha}, main ${data.main?.shortSha || '—'}` : deployment.note);
    signal('pulseDeployLight', state === 'synced' ? 'green' : state === 'different' ? 'orange' : '');

    set('pulseStageMain', data.main?.title ? `${data.main.shortSha} · ${data.main.title}` : 'Nuk u verifikua commit-i në main');
    signal('pulseMainLight', data.main?.sha ? 'green' : 'red');

    const checks = data.checks;
    set('pulseChecks', checks ? `${checks.passed}/${checks.total}` : '—');
    let checkLabel = 'Nuk u verifikuan kontrollet';
    if (checks) {
      checkLabel = checks.state === 'passed' ? 'Të gjitha kontrollet e raportuara kaluan' :
        checks.state === 'failed' ? `${checks.failed} kontrolle dështuan` :
        checks.state === 'running' ? `${checks.pending} kontrolle janë në proces` :
        checks.state === 'partial' ? 'Lista e kontrolleve është e pjesshme' : 'Nuk ka kontrolle të raportuara';
    }
    set('pulseCheckState', checkLabel);
    set('pulseStageChecks', checkLabel);
    signal('pulseChecksLight', checks?.state === 'passed' ? 'green' : checks?.state === 'failed' ? 'red' : checks?.state === 'running' ? 'orange' : '');

    const badge = $('pulseReleaseBadge');
    badge.className = 'pulse-tag';
    if (state === 'synced' && checks?.state === 'passed') {
      badge.textContent = 'Kod & kontrolle në sinkron'; badge.classList.add('is-green');
    } else if (checks?.state === 'failed') {
      badge.textContent = 'Kontrolle të dështuara'; badge.classList.add('is-red');
    } else if (state === 'different') {
      badge.textContent = 'Versione të ndryshme'; badge.classList.add('is-orange');
    } else { badge.textContent = 'Verifikim i pjesshëm'; badge.classList.add('is-orange'); }

    const issues = data.issues;
    set('pulseIssueTotal', issues?.total ?? '—');
    set('pulseIssueState', issues?.exact ? `${issues.open} të hapura` : 'Mbulimi nuk është i plotë');
    set('pulseTotal', issues?.total ?? '—');
    set('pulseOpen', issues?.exact ? issues.open : '—');
    set('pulseClosed', issues?.exact ? issues.closed : '—');
    set('pulsePercent', issues?.percent == null ? '—' : `${issues.percent}%`);
    $('pulseRing').style.background = issues?.percent == null ? '#eef0f6' :
      `conic-gradient(#625cf2 0% ${issues.percent}%, #e8eaf3 ${issues.percent}% 100%)`;
    set('pulseCoverage', issues?.exact ?
      'Matet vetëm raporti i GitHub Issues të mbyllura. Nuk mat saktësinë klinike apo gatishmërinë totale të platformës.' :
      'Përqindja nuk shfaqet sepse lista e GitHub Issues është e pjesshme ose mungon.');

    if (issues?.items?.length) {
      const holder = $('pulseTasks'); clear(holder);
      issues.items.forEach(issue => holder.appendChild(itemRow({
        icon:'○', title:issue.title, subtitle:`#${issue.number} · ${issue.labels?.join(' · ') || date(issue.updatedAt)}`, href:issue.url,
      })));
    } else emptyList('pulseTasks', issues?.exact && issues.total === 0 ? 'Nuk ka GitHub Issues të regjistruara.' :
      issues?.exact && issues.open === 0 ? 'Nuk ka detyra të hapura në GitHub Issues.' : 'Detyrat nuk mund të verifikohen.');

    if (data.commits?.length) {
      const holder = $('pulseCommits'); clear(holder);
      data.commits.slice(0, 8).forEach(commit => holder.appendChild(itemRow({
        icon:'⌁', title:commit.title, subtitle:`${commit.sha || '—'} · ${date(commit.date)}`, href:commit.url,
      })));
    } else emptyList('pulseCommits', 'Historiku i commit-eve nuk mund të lexohet.');

    const failed = Object.entries(data.sources || {}).filter(([, status]) => status !== 'live');
    const alert = $('pulseAlert');
    if (failed.length) {
      alert.hidden = false;
      alert.textContent = `Disa burime nuk u verifikuan: ${failed.map(([name, reason]) => `${name} (${reason})`).join('; ')}. Për këto të dhëna nuk tregohet rezultat i supozuar.`;
    } else alert.hidden = true;
  }

  function showError(message, status) {
    dashboard.hidden = true;
    gate.hidden = false;
    set('pulseGateTitle', status === 401 ? 'Kërkohet hyrja' : status === 403 ? 'Vetëm për administratorin' : 'Lidhja dështoi');
    set('pulseGateText', message);
    $('pulseLoginLink').hidden = status !== 401;
  }

  async function load() {
    refresh.disabled = true;
    try {
      const response = await fetch('/api/project-progress', {credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'}});
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true) throw Object.assign(new Error(payload.error || `HTTP ${response.status}`), {status:response.status});
      render(payload);
      gate.hidden = true;
      dashboard.hidden = false;
      void loadHealth();
    } catch (error) {
      if (snapshot && error.status !== 401 && error.status !== 403) {
        const alert = $('pulseAlert');
        alert.hidden = false;
        alert.textContent = `Rifreskimi dështoi: ${error.message}. Të dhënat në ekran janë nga ${date(snapshot.capturedAt)} dhe mund të jenë të vjetruara.`;
      } else showError(error.message, error.status);
    } finally {
      refresh.disabled = false;
      clearTimeout(timer);
      timer = setTimeout(() => { if (!document.hidden) void load(); }, snapshot?.refreshAfterMs || 300_000);
    }
  }

  function handoffText(data) {
    const ci = data.checks ? `${data.checks.state}, ${data.checks.passed}/${data.checks.total} success, ${data.checks.failed} failed` : 'not verified';
    const issues = data.issues?.exact ? `${data.issues.closed}/${data.issues.total} issues closed; ${data.issues.open} open` : 'not fully verified';
    return [
      '# DRx/Barnat — AI continuation context',
      `Snapshot: ${data.capturedAt}`,
      `Repository: https://github.com/${data.repository}`,
      `Main commit: ${data.main?.sha || 'unknown'}`,
      `Serving deployment commit: ${data.deployment?.sha || 'unknown'} (${data.deployment?.state || 'unknown'})`,
      `CI checks: ${ci}`,
      `GitHub Issues: ${issues}`,
      '',
      'Before any change: read AGENTS.md, docs/PROJECT_CONTEXT.md, README.md, and relevant domain documentation.',
      'Inspect the actual source and newest commits/PRs. Treat any unverified result as UNKNOWN, never complete.',
      'Only update status after tests and deployment evidence; preserve clinical source fidelity and existing admin security.',
      '',
      'Open Issues:',
      ...(data.issues?.items || []).map(issue => `- #${issue.number} ${issue.title} ${issue.url || ''}`),
      '',
      'Latest commits:',
      ...(data.commits || []).slice(0, 6).map(commit => `- ${commit.sha || '?'} ${commit.title}`),
      '',
      'Live website database health is reported separately by /api/neon-status; check it before making runtime assumptions.',
      'Caution: issue closure measures tracked tasks only; it is not whole-product or clinical completeness.',
    ].join('\n');
  }

  refresh.addEventListener('click', () => void load());
  $('pulseCopy').addEventListener('click', async () => {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(handoffText(snapshot));
      const button = $('pulseCopy');
      button.textContent = 'U kopjua ✓';
      setTimeout(() => { button.textContent = 'Kopjo kontekstin për AI'; }, 2500);
    } catch {
      const alert = $('pulseAlert');
      alert.hidden = false;
      alert.textContent = 'Kopjimi automatik u bllokua nga browser-i. Provo HTTPS ose një browser që lejon clipboard.';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastReadAt >= (snapshot?.refreshAfterMs || 300_000)) void load();
  });
  void load();
})();
