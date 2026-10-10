// Fetch wrappers for every route in CONTRACT.md. Errors throw Error(message)
// with the server's `{ error }` text when present.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(path, opts) {
  let res;
  try {
    res = await fetch(path, opts);
  } catch (e) {
    throw new Error(`server unreachable (${e.message}). Start it with: node server.js`);
  }
  let body = null;
  const text = await res.text();
  if (text) {
    try { body = JSON.parse(text); } catch { body = null; }
  }
  if (!res.ok) {
    if (body && body.error) throw new Error(body.error);
    if (res.status >= 500 && !body) throw new Error(`server not reachable on :4310 (${res.status}). Start it with: node server.js`);
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  return body;
}

const qs = (o) => '?' + new URLSearchParams(o).toString();

const json = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

export const getSettings = () => req('/api/settings');
export const putSettings = (settings) => req('/api/settings', json('PUT', settings));
export const getProjects = (org) => req('/api/projects' + qs({ org }));
export const getTeams = (org, project) => req('/api/teams' + qs({ org, project }));
export const getMembers = (org, project, team) => req('/api/members' + qs({ org, project, team }));
export const getRepos = (org, project) => req('/api/repos' + qs({ org, project }));
export const getBranches = (org, project, repo) => req('/api/branches' + qs({ org, project, repo }));
export const getAreas = (org, project) => req('/api/areas' + qs({ org, project }));
export const getCurrentIteration = (org, project, team) => req('/api/iterations/current' + qs({ org, project, team }));
export const postActivity = (request) => req('/api/activity', json('POST', request));
export const getJob = (id) => req(`/api/jobs/${encodeURIComponent(id)}`);
export const getHealth = () => req('/api/health');

// POST /api/activity then poll /api/jobs/:id every 500 ms. Resolves with the
// finished Job (result, fromCache). onProgress(job) is called on every poll.
export async function runActivity(request, onProgress) {
  const { jobId } = await postActivity(request);
  for (;;) {
    const job = await getJob(jobId);
    if (onProgress) onProgress(job);
    if (job.status === 'done') return job;
    if (job.status === 'error') throw new Error(job.error || 'activity job failed');
    await sleep(500);
  }
}
