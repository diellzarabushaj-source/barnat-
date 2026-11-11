'use strict';

// All displayed project metrics are derived from GitHub or from the running
// deployment. Missing/partial evidence must never be presented as completion.
const REPOSITORY = 'diellzarabushaj-source/barnat-';
const GITHUB = `https://api.github.com/repos/${REPOSITORY}`;

function shortSha(sha) {
  return /^[a-f\d]{40}$/i.test(String(sha || '')) ? String(sha).slice(0, 7) : null;
}

function safeGithubUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'github.com' ? parsed.href : null;
  } catch { return null; }
}

async function githubRequest(path, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const token = options.token || '';
  const endpoint = path.startsWith('/search/') ? 'https://api.github.com' : GITHUB;
  const response = await fetchImpl(`${endpoint}${path}`, {
    headers:{
      Accept:'application/vnd.github+json',
      'User-Agent':'DRx-Project-Progress',
      'X-GitHub-Api-Version':'2022-11-28',
      ...(token ? { Authorization:`Bearer ${token}` } : {}),
    },
    signal:AbortSignal.timeout(9000),
  });
  if (!response.ok) {
    const limit = response.status === 403 || response.status === 429 ? ' (GitHub API limit ose qasje e kufizuar)' : '';
    throw new Error(`GitHub ${response.status}${limit}`);
  }
  return response.json();
}

function issueProgress(payload) {
  const total = Number(payload?.total_count);
  const rows = Array.isArray(payload?.items) ? payload.items.filter(item => !item.pull_request) : [];
  const exact = Number.isInteger(total) && total >= 0 && total <= rows.length;
  const closed = rows.filter(item => item.state === 'closed').length;
  const open = rows.filter(item => item.state === 'open').length;
  return {
    total:Number.isInteger(total) && total >= 0 ? total : null,
    sampled:rows.length,
    exact,
    closed:exact ? closed : null,
    open:exact ? open : null,
    percent:exact && total > 0 ? Math.round(100 * closed / total) : null,
    items:rows.filter(item => item.state === 'open').slice(0, 12).map(item => ({
      number:item.number,
      title:String(item.title || ''),
      url:safeGithubUrl(item.html_url),
      updatedAt:item.updated_at || null,
      labels:(Array.isArray(item.labels) ? item.labels : []).map(label => String(label.name || '')).slice(0, 4),
    })),
  };
}

function checkProgress(payload) {
  const rows = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
  const total = Number(payload?.total_count);
  const complete = rows.filter(run => run.status === 'completed');
  const failed = complete.filter(run => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(run.conclusion));
  const passed = complete.filter(run => run.conclusion === 'success');
  const pending = rows.filter(run => run.status !== 'completed');
  return {
    total:Number.isInteger(total) ? total : rows.length,
    sampled:rows.length,
    exact:Number.isInteger(total) && total <= rows.length,
    passed:passed.length,
    failed:failed.length,
    pending:pending.length,
    other:complete.length - passed.length - failed.length,
    state:rows.length === 0 ? 'untracked' : failed.length ? 'failed' : pending.length ? 'running' :
      total > rows.length ? 'partial' : 'passed',
    failedChecks:failed.slice(0, 8).map(run => ({
      name:String(run.name || ''),
      url:safeGithubUrl(run.html_url),
    })),
  };
}

function deployedState(deployedSha, mainSha) {
  if (!shortSha(deployedSha) || !shortSha(mainSha)) return 'unknown';
  return deployedSha.toLowerCase() === mainSha.toLowerCase() ? 'synced' : 'different';
}

async function buildProjectSnapshot(options = {}) {
  const environment = options.env || process.env;
  const token = String(environment.PROJECT_PROGRESS_GITHUB_TOKEN || environment.GITHUB_TOKEN || '');
  const get = path => githubRequest(path, {fetchImpl:options.fetchImpl, token});
  const capturedAt = new Date(options.now || Date.now()).toISOString();
  const sources = {};

  let main = null;
  try {
    const commit = await get('/commits/main');
    main = {
      sha:shortSha(commit.sha) ? commit.sha : null,
      title:String(commit.commit?.message || '').split('\n')[0].slice(0, 180),
      date:commit.commit?.committer?.date || commit.commit?.author?.date || null,
      url:safeGithubUrl(commit.html_url),
    };
    sources.main = 'live';
  } catch (error) { sources.main = String(error.message || error); }

  const work = [
    ['checks', main?.sha ? `/commits/${main.sha}/check-runs?per_page=100` : null],
    ['issues', `/search/issues?q=${encodeURIComponent(`repo:${REPOSITORY} is:issue`)}&per_page=100`],
    ['commits', '/commits?sha=main&per_page=10'],
  ];
  const results = await Promise.allSettled(work.map(([, path]) => path ? get(path) : Promise.reject(new Error('Main commit i panjohur'))));
  const data = {};
  results.forEach((result, index) => {
    const key = work[index][0];
    if (result.status === 'fulfilled') { data[key] = result.value; sources[key] = 'live'; }
    else sources[key] = String(result.reason?.message || result.reason);
  });

  const deployedSha = String(environment.VERCEL_GIT_COMMIT_SHA || '');
  const deployment = {
    sha:shortSha(deployedSha) ? deployedSha : null,
    shortSha:shortSha(deployedSha),
    id:String(environment.VERCEL_DEPLOYMENT_ID || '') || null,
    state:deployedState(deployedSha, main?.sha || ''),
    note:shortSha(deployedSha) ? 'SHA e funksionit që po përgjigjet' :
      'VERCEL_GIT_COMMIT_SHA nuk është ekspozuar në këtë deployment',
  };

  return {
    repository:REPOSITORY,
    capturedAt,
    refreshAfterMs:token ? 60_000 : 300_000,
    sources,
    main:{...main, shortSha:shortSha(main?.sha)},
    deployment,
    checks:data.checks ? checkProgress(data.checks) : null,
    issues:data.issues ? issueProgress(data.issues) : null,
    commits:Array.isArray(data.commits) ? data.commits.slice(0, 10).map(item => ({
      sha:shortSha(item.sha),
      title:String(item.commit?.message || '').split('\n')[0].slice(0, 180),
      date:item.commit?.committer?.date || item.commit?.author?.date || null,
      url:safeGithubUrl(item.html_url),
    })) : [],
    limitations:[
      'Përqindja tregon vetëm GitHub Issues të mbyllura, jo përfundimin klinik të website-it.',
      'Kontrollet CI tregojnë vetëm rezultatet e publikuara nga GitHub për commit-in aktual.',
      'Ndryshimet në databazë ose në përmbajtje jashtë GitHub kërkojnë burime shtesë telemetry.',
    ],
  };
}

module.exports = {REPOSITORY, shortSha, safeGithubUrl, issueProgress, checkProgress, deployedState, buildProjectSnapshot};
