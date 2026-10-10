import { getToken, AuthError } from './auth.js';

const API_VERSION = '7.1';
const MAX_BACKOFF_RETRIES = 4;
const REQUEST_TIMEOUT_MS = 60_000;
// The only DevOps endpoints that may receive a POST (read-only query endpoints).
const POST_ALLOWED = [/\/_apis\/wit\/wiql$/, /\/_apis\/wit\/workitemsbatch$/];

export class AdoError extends Error {
  constructor(status, msg, options) { super(msg, options); this.name = 'AdoError'; this.status = status; }
}

/**
 * Validate and normalize an org URL. The bearer token is only ever sent to
 * dev.azure.com/<org> or <org>.visualstudio.com.
 */
export function normalizeOrg(org) {
  let u;
  try { u = new URL(String(org ?? '').trim()); } catch { throw new AdoError(400, `invalid org url: ${org}`); }
  const path = u.pathname.replace(/\/+$/, '');
  const okHost = (u.hostname === 'dev.azure.com' && /^\/[^/]+$/.test(path))
    || (u.hostname.endsWith('.visualstudio.com') && path === '');
  if (u.protocol !== 'https:' || !okHost || u.search || u.username || u.port) {
    throw new AdoError(400, `org must look like https://dev.azure.com/<org>, got: ${org}`);
  }
  return u.origin + path;
}

export function url(org, segments, params = {}) {
  const base = normalizeOrg(org);
  const path = segments.map((s) => encodeURIComponent(String(s))).join('/');
  const q = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    q.push(`${k}=${encodeURIComponent(String(v))}`);
  }
  q.push(`api-version=${API_VERSION}`);
  return `${base}/${path}?${q.join('&')}`;
}

function assertReadOnly(target, method) {
  if (method === 'GET') return;
  const { pathname } = new URL(target);
  if (method === 'POST' && POST_ALLOWED.some((re) => re.test(pathname))) return;
  throw new Error(`refusing ${method} ${pathname}: Azure DevOps is read only`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function backoffMs(attempt, res) {
  const ra = res?.headers.get('retry-after');
  if (ra && /^\d+$/.test(ra)) return Math.min(Number(ra) * 1000, 60_000);
  return Math.min(500 * 2 ** attempt, 15_000) + Math.floor(Math.random() * 250);
}

export async function ado(target, { method = 'GET', body } = {}) {
  assertReadOnly(target, method);
  let authRetried = false;
  let attempt = 0;
  for (;;) {
    const token = await getToken(authRetried);
    let res;
    try {
      res = await fetch(target, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (attempt < MAX_BACKOFF_RETRIES) { await sleep(backoffMs(attempt++)); continue; }
      throw new AdoError(502, `request failed: ${err.message}`, { cause: err });
    }

    const ctype = res.headers.get('content-type') || '';
    const isJson = ctype.includes('json');
    // DevOps answers a bad/expired token with 401, or 203 + HTML sign-in page.
    const unauthorized = res.status === 401 || (res.status === 203 && !isJson);
    if (unauthorized) {
      await res.body?.cancel();
      if (!authRetried) { authRetried = true; continue; }
      throw new AuthError(`Azure DevOps rejected the az token (${res.status}). Run "az login".`);
    }
    if (res.status === 429 || res.status >= 500) {
      await res.body?.cancel();
      if (attempt < MAX_BACKOFF_RETRIES) { await sleep(backoffMs(attempt++, res)); continue; }
      throw new AdoError(res.status, `Azure DevOps ${res.status} after ${MAX_BACKOFF_RETRIES} retries: ${new URL(target).pathname}`);
    }
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try { const j = await res.json(); if (j?.message) msg = j.message; } catch { /* non-JSON error body */ }
      throw new AdoError(res.status, `Azure DevOps: ${msg}`);
    }
    if (res.status === 204) return null;
    if (!isJson) throw new AdoError(502, `Azure DevOps returned non-JSON (${ctype}) for ${new URL(target).pathname}`);
    return res.json();
  }
}

/** limiter(n) -> run(fn): runs at most n fns concurrently. */
export function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

/** $top/$skip paging. buildUrl(skip, top) -> url. Stops on a short page. */
export async function pageAll(buildUrl, top) {
  const out = [];
  for (let skip = 0, pages = 0; pages < 10_000; skip += top, pages++) {
    const r = await ado(buildUrl(skip, top));
    const v = r?.value ?? [];
    for (const x of v) out.push(x);
    if (v.length < top) return out;
  }
  throw new AdoError(500, 'paging did not terminate');
}

// ---- catalog ----

export async function listProjects(org) {
  const list = await pageAll((skip, top) => url(org, ['_apis', 'projects'], { $top: top, $skip: skip }), 500);
  return list.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listTeams(org, project) {
  const list = await pageAll(
    (skip, top) => url(org, ['_apis', 'projects', project, 'teams'], { $top: top, $skip: skip }), 500);
  return list.map((t) => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listMembers(org, project, teamId) {
  const list = await pageAll(
    (skip, top) => url(org, ['_apis', 'projects', project, 'teams', teamId, 'members'], { $top: top, $skip: skip }), 500);
  const out = [];
  const seen = new Set();
  for (const m of list) {
    const i = m.identity ?? m;
    if (!i?.uniqueName?.includes('@')) continue;
    const email = i.uniqueName.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ id: i.id, name: i.displayName, email, imageUrl: i.imageUrl ?? null });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listRepos(org, project) {
  const r = await ado(url(org, [project, '_apis', 'git', 'repositories']));
  return (r?.value ?? [])
    .filter((x) => !x.isDisabled)
    .map((x) => ({ id: x.id, name: x.name, defaultBranch: x.defaultBranch ?? null, webUrl: x.webUrl }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Branch ref names (refs/heads/...) of one repo. */
export async function listBranches(org, project, repoId) {
  const r = await ado(url(org, [project, '_apis', 'git', 'repositories', repoId, 'refs'], { filter: 'heads/' }));
  return (r?.value ?? []).map((x) => x.name);
}

export async function listAreas(org, project) {
  const root = await ado(url(org, [project, '_apis', 'wit', 'classificationnodes', 'Areas'], { $depth: 20 }));
  const walk = (node, parentPath) => {
    const path = parentPath ? `${parentPath}\\${node.name}` : node.name;
    return {
      path,
      name: node.name,
      children: (node.children ?? []).map((c) => walk(c, path)).sort((a, b) => a.name.localeCompare(b.name)),
    };
  };
  return walk(root, '');
}

export async function currentIteration(org, project, teamId) {
  const r = await ado(url(org, [project, teamId, '_apis', 'work', 'teamsettings', 'iterations'], { $timeframe: 'current' }));
  const it = r?.value?.[0];
  if (!it) return null;
  return {
    name: it.name,
    path: it.path,
    start: it.attributes?.startDate ?? null,
    finish: it.attributes?.finishDate ?? null,
  };
}
