import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { readFile, writeFile, rename, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, resolve, extname, sep } from 'node:path';
import { AuthError } from './lib/auth.js';
import {
  AdoError, listProjects, listTeams, listMembers, listRepos, listBranches, listAreas, currentIteration,
} from './lib/devops.js';
import { fetchActivity } from './lib/activity.js';
import { startJob, getJob } from './lib/jobs.js';
import { cacheKey, readCache, writeCache } from './lib/cache.js';

const HOST = '127.0.0.1';
const PORT = 4310;
const BODY_LIMIT = 1 << 20;
const ROOT = import.meta.dirname;
const DIST = resolve(ROOT, 'dist');
const DATA_FILE = join(ROOT, 'data.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

// ---- helpers ----

function sendJson(res, status, value) {
  const body = JSON.stringify(value ?? null);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new HttpError(413, 'request body exceeds 1 MB');
    chunks.push(chunk);
  }
  if (!size) throw new HttpError(400, 'empty body');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'invalid JSON body'); }
}

function need(q, ...names) {
  const out = {};
  for (const n of names) {
    const v = q.get(n);
    if (!v) throw new HttpError(400, `missing query parameter: ${n}`);
    out[n] = v;
  }
  return out;
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function azAccountShow() {
  return new Promise((resolveP, reject) => {
    exec('az account show -o json', { windowsHide: true, maxBuffer: 1 << 20 },
      (err, stdout) => {
        if (err) return reject(new AuthError('az login required (az account show failed)'));
        try { resolveP(JSON.parse(stdout)); } catch { reject(new AuthError('az login required (az returned non-JSON)')); }
      });
  });
}

function validateActivity(b) {
  if (!isPlainObject(b)) throw new HttpError(400, 'body must be an object');
  for (const k of ['org', 'project', 'fromISO', 'toISO']) {
    if (typeof b[k] !== 'string' || !b[k]) throw new HttpError(400, `${k} is required`);
  }
  const from = Date.parse(b.fromISO);
  const to = Date.parse(b.toISO);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new HttpError(400, 'fromISO/toISO invalid');
  const scope = b.scope ?? 'all';
  if (scope !== 'all' && !(Array.isArray(scope) && scope.every((s) => typeof s === 'string' && s))) {
    throw new HttpError(400, 'scope must be "all" or an array of repo ids');
  }
  if (b.areaPath != null && typeof b.areaPath !== 'string') throw new HttpError(400, 'areaPath must be a string');
  const rawBranches = b.branches ?? {};
  if (!isPlainObject(rawBranches) || !Object.values(rawBranches)
    .every((v) => Array.isArray(v) && v.every((s) => typeof s === 'string' && s))) {
    throw new HttpError(400, 'branches must be an object of repoId -> string[]');
  }
  const branches = Object.fromEntries(Object.entries(rawBranches)
    .map(([id, names]) => [id, [...new Set(names.map((s) => s.replace(/^refs\/heads\//, '')).filter(Boolean))]])
    .filter(([, names]) => names.length));
  return {
    org: b.org,
    project: b.project,
    fromISO: new Date(from).toISOString(),
    toISO: new Date(to).toISOString(),
    scope,
    areaPath: b.areaPath ?? '',
    includeUpdates: Boolean(b.includeUpdates),
    branches,
    force: Boolean(b.force),
  };
}

// key -> jobId of a running fetch, so double-clicking Run does not double the DevOps calls
const inflight = new Map();

async function startActivity(body) {
  const { force, ...params } = validateActivity(body);
  const key = cacheKey(params);
  if (!force) {
    const running = inflight.get(key);
    if (running && getJob(running)?.status === 'running') return running;
    const hit = await readCache(key, params.toISO);
    if (hit) {
      return startJob((p) => { p.stage('cache', 1); p.tick(); return hit; }, { fromCache: true });
    }
  }
  const id = startJob(async (p) => {
    try {
      const data = await fetchActivity(params, p);
      p.stage('cache', 1);
      await writeCache(key, params, data);
      p.tick();
      return data;
    } finally {
      inflight.delete(key);
    }
  });
  inflight.set(key, id);
  return id;
}

// ---- static ----

async function serveStatic(req, res, pathname) {
  try { await stat(join(DIST, 'index.html')); } catch {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('dist/ not found. Run `npm run build`, then restart `node server.js`.\n');
    return;
  }
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { throw new HttpError(400, 'bad path'); }
  let file = resolve(DIST, '.' + rel);
  if (file !== DIST && !file.startsWith(DIST + sep)) throw new HttpError(403, 'forbidden');
  let st = await stat(file).catch(() => null);
  if (!st?.isFile()) {
    file = join(DIST, 'index.html');
    st = await stat(file);
  }
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const isHtml = type.startsWith('text/html');
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': st.size,
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=3600',
  });
  if (req.method === 'HEAD') return void res.end();
  await new Promise((ok, fail) => {
    const s = createReadStream(file);
    s.on('error', fail);
    res.on('close', ok);
    s.pipe(res);
  });
}

// ---- routes ----

async function route(req, res) {
  const u = new URL(req.url, `http://${HOST}`);
  const p = u.pathname;
  const q = u.searchParams;
  const m = req.method;

  if (!p.startsWith('/api/')) {
    if (m !== 'GET' && m !== 'HEAD') throw new HttpError(405, 'method not allowed');
    return serveStatic(req, res, p);
  }

  if (p === '/api/settings') {
    if (m === 'GET') {
      let data = {};
      try { data = JSON.parse(await readFile(DATA_FILE, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      return sendJson(res, 200, data);
    }
    if (m === 'PUT') {
      const body = await readJsonBody(req);
      if (!isPlainObject(body)) throw new HttpError(400, 'settings must be an object');
      const tmp = `${DATA_FILE}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(body, null, 2));
      await rename(tmp, DATA_FILE);
      return sendJson(res, 200, body);
    }
    throw new HttpError(405, 'method not allowed');
  }

  if (m === 'POST' && p === '/api/activity') {
    const jobId = await startActivity(await readJsonBody(req));
    return sendJson(res, 200, { jobId });
  }

  if (m !== 'GET') throw new HttpError(405, 'method not allowed');

  switch (p) {
    case '/api/health': {
      const acct = await azAccountShow();
      return sendJson(res, 200, { ok: true, user: acct?.user?.name ?? '' });
    }
    case '/api/projects': {
      const { org } = need(q, 'org');
      return sendJson(res, 200, await listProjects(org));
    }
    case '/api/teams': {
      const { org, project } = need(q, 'org', 'project');
      return sendJson(res, 200, await listTeams(org, project));
    }
    case '/api/members': {
      const { org, project, team } = need(q, 'org', 'project', 'team');
      return sendJson(res, 200, await listMembers(org, project, team));
    }
    case '/api/repos': {
      const { org, project } = need(q, 'org', 'project');
      return sendJson(res, 200, await listRepos(org, project));
    }
    case '/api/branches': {
      const { org, project, repo } = need(q, 'org', 'project', 'repo');
      const names = (await listBranches(org, project, repo)).map((r) => r.replace(/^refs\/heads\//, ''));
      return sendJson(res, 200, names.sort((a, b) => a.localeCompare(b)));
    }
    case '/api/areas': {
      const { org, project } = need(q, 'org', 'project');
      return sendJson(res, 200, await listAreas(org, project));
    }
    case '/api/iterations/current': {
      const { org, project, team } = need(q, 'org', 'project', 'team');
      return sendJson(res, 200, await currentIteration(org, project, team));
    }
  }

  const jm = /^\/api\/jobs\/([\w-]+)$/.exec(p);
  if (jm) {
    const job = getJob(jm[1]);
    if (!job) throw new HttpError(404, 'job not found or expired');
    return sendJson(res, 200, job);
  }

  throw new HttpError(404, `no route: ${m} ${p}`);
}

function errorStatus(err) {
  if (err instanceof AuthError) return 401;
  if (err instanceof HttpError) return err.status;
  if (err instanceof AdoError) return err.status >= 400 && err.status < 600 ? err.status : 502;
  return 500;
}

const server = createServer(async (req, res) => {
  const t0 = performance.now();
  res.on('finish', () => {
    const ms = Math.round(performance.now() - t0);
    process.stdout.write(`${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${ms}ms\n`);
  });
  try {
    await route(req, res);
  } catch (err) {
    const status = errorStatus(err);
    if (status >= 500) console.error(err);
    if (res.headersSent) return void res.destroy();
    sendJson(res, status, { error: err?.message ?? String(err) });
  }
});

server.on('error', (err) => {
  console.error(`server error: ${err.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`dev-works listening on http://${HOST}:${PORT}`);
});
