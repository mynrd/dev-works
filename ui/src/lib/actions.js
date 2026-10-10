// State mutations that talk to the server. Views and TopBar call these.
import * as api from './api.js';
import { app } from './state.svelte.js';
import { startOfLocalDay, endOfLocalDay, presets, ymd, mondayOf, addDays } from './dates.js';

const msg = (e) => (e && e.message) || String(e);

// Deep copy of settings.branches with empty entries dropped.
const branchesCopy = (b) => Object.fromEntries(
  Object.entries(b || {}).filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => [k, [...v]])
);

export async function loadProjects() {
  const { org } = app.settings;
  if (!org) return;
  app.loading.projects = true;
  try {
    app.catalog.projects = await api.getProjects(org);
    app.loadedOrg = org;
    app.error = '';
  } catch (e) {
    app.error = msg(e);
    app.catalog.projects = [];
  } finally {
    app.loading.projects = false;
  }
}

export async function loadTeams() {
  const { org, project } = app.settings;
  if (!org || !project) { app.catalog.teams = []; return; }
  app.loading.teams = true;
  try {
    app.catalog.teams = await api.getTeams(org, project);
    const t = app.catalog.teams.find((x) => x.id === app.settings.teamId)
      || app.catalog.teams[0];
    if (t) { app.settings.teamId = t.id; app.settings.teamName = t.name; }
    app.error = '';
  } catch (e) {
    app.error = msg(e);
    app.catalog.teams = [];
  } finally {
    app.loading.teams = false;
  }
}

export async function loadMembers() {
  const { org, project, teamId } = app.settings;
  if (!org || !project || !teamId) { app.catalog.members = []; return; }
  app.loading.members = true;
  try {
    const list = await api.getMembers(org, project, teamId);
    app.catalog.members = list.map((m) => ({ ...m, email: (m.email || '').toLowerCase() }));
    const emails = new Set(app.catalog.members.map((m) => m.email));
    app.settings.members = app.settings.members.filter((e) => emails.has(e));
    app.error = '';
  } catch (e) {
    app.error = msg(e);
    app.catalog.members = [];
  } finally {
    app.loading.members = false;
  }
}

export async function loadRepos() {
  const { org, project } = app.settings;
  if (!org || !project) { app.catalog.repos = []; return; }
  app.loading.repos = true;
  try {
    app.catalog.repos = await api.getRepos(org, project);
  } catch (e) {
    app.error = msg(e);
    app.catalog.repos = [];
  } finally {
    app.loading.repos = false;
  }
}

export async function loadAreas() {
  const { org, project } = app.settings;
  if (!org || !project) { app.catalog.areas = null; return; }
  app.loading.areas = true;
  try {
    app.catalog.areas = await api.getAreas(org, project);
    if (!app.settings.areaPath && app.catalog.areas) app.settings.areaPath = app.catalog.areas.path;
  } catch (e) {
    app.error = msg(e);
    app.catalog.areas = null;
  } finally {
    app.loading.areas = false;
  }
}

// After org is known: projects -> teams -> members, repos + areas in parallel.
export async function loadCatalog() {
  await loadProjects();
  if (!app.settings.project) {
    const p = app.catalog.projects[0];
    if (p) app.settings.project = p.name;
  }
  await Promise.all([loadTeams().then(loadMembers), loadRepos(), loadAreas()]);
}

export async function onProjectChange() {
  app.settings.teamId = '';
  app.settings.teamName = '';
  app.settings.members = [];
  app.settings.areaPath = '';
  app.settings.scope = 'all';
  app.settings.branches = {};
  app.catalog.branches = {};
  await Promise.all([loadTeams().then(loadMembers), loadRepos(), loadAreas()]);
}

export async function onTeamChange() {
  const t = app.catalog.teams.find((x) => x.id === app.settings.teamId);
  app.settings.teamName = t ? t.name : '';
  await loadMembers();
}

export async function applyPreset(preset) {
  app.settings.preset = preset;
  if (preset === 'custom') return;
  if (preset === 'sprint') {
    const { org, project, teamId } = app.settings;
    try {
      const it = await api.getCurrentIteration(org, project, teamId);
      if (!it || !it.start || !it.finish) { app.error = 'No current sprint for this team'; return; }
      app.settings.from = ymd(new Date(it.start));
      app.settings.to = ymd(new Date(it.finish));
      app.error = '';
    } catch (e) {
      app.error = msg(e);
    }
    return;
  }
  const r = presets(preset);
  app.settings.from = r.from;
  app.settings.to = r.to;
}

export function settingsSnapshot() {
  const s = app.settings;
  return {
    org: s.org, project: s.project, teamId: s.teamId, teamName: s.teamName,
    members: [...s.members], preset: s.preset, from: s.from, to: s.to,
    scope: s.scope === 'all' ? 'all' : [...s.scope], areaPath: s.areaPath, granularity: s.granularity,
    branches: branchesCopy(s.branches)
  };
}

export function activityRequest(from, to, includeUpdates, force) {
  const s = app.settings;
  return {
    org: s.org,
    project: s.project,
    fromISO: startOfLocalDay(from).toISOString(),
    toISO: endOfLocalDay(to).toISOString(),
    scope: s.scope === 'all' ? 'all' : [...s.scope],
    areaPath: s.areaPath,
    branches: branchesCopy(s.branches),
    includeUpdates,
    force: !!force
  };
}

// Branch names for one repo, fetched once per project and cached in catalog.
export async function loadBranches(repoId) {
  const { org, project } = app.settings;
  if (!org || !project || !repoId) return;
  if (app.catalog.branches[repoId] || app.loading.branches[repoId]) return;
  app.loading.branches[repoId] = true;
  try {
    app.catalog.branches[repoId] = await api.getBranches(org, project, repoId);
  } catch (e) {
    app.error = msg(e);
  } finally {
    app.loading.branches[repoId] = false;
  }
}

export async function saveSettings() {
  try {
    await api.putSettings(settingsSnapshot());
    return true;
  } catch (e) {
    app.error = `settings not saved: ${msg(e)}`;
    return false;
  }
}

// Main Run: save settings, fetch activity for the main range.
export async function run({ force = false } = {}) {
  const s = app.settings;
  if (!s.org) { app.error = 'Enter org URL'; return; }
  if (!s.project) { app.error = 'Pick a project'; return; }
  if (!s.areaPath) { app.error = 'Pick an area path'; return; }
  if (s.from > s.to) { app.error = 'Range: from is after to'; return; }
  app.error = '';
  app.running = true;
  app.job = { status: 'running', stage: 'queue', done: 0, total: 0 };
  const range = { from: s.from, to: s.to };
  try {
    try { await api.putSettings(settingsSnapshot()); } catch (e) { app.error = `settings not saved: ${msg(e)}`; }
    const job = await api.runActivity(activityRequest(range.from, range.to, false, force), (j) => { app.job = j; });
    app.activity = job.result;
    app.activityRange = range;
    app.lastForce = force;
    app.runSeq++;
  } catch (e) {
    app.error = msg(e);
  } finally {
    app.running = false;
    app.job = null;
  }
}

export function digestWindow() {
  const d = app.digest;
  if (d.mode === 'week') {
    const mon = mondayOf(d.anchor);
    return { from: ymd(mon), to: ymd(addDays(mon, 6)) };
  }
  return { from: d.anchor, to: d.anchor };
}

// Digest fetch: separate from the main activity, includeUpdates = true.
export async function runDigest({ force = false } = {}) {
  const s = app.settings;
  const d = app.digest;
  if (!s.org || !s.project || !s.areaPath) return;
  const range = digestWindow();
  d.error = '';
  d.running = true;
  d.job = { status: 'running', stage: 'queue', done: 0, total: 0 };
  try {
    const job = await api.runActivity(activityRequest(range.from, range.to, true, force), (j) => { d.job = j; });
    d.activity = job.result;
    d.range = range;
  } catch (e) {
    d.error = msg(e);
  } finally {
    d.running = false;
    d.job = null;
  }
}

// Startup: GET /api/settings; if org present, load catalog and auto-run.
export async function boot() {
  let saved = null;
  try {
    saved = await api.getSettings();
  } catch (e) {
    app.error = msg(e);
    return;
  }
  if (saved && typeof saved === 'object') {
    const s = app.settings;
    for (const k of Object.keys(s)) if (saved[k] !== undefined && saved[k] !== null) s[k] = saved[k];
    if (!Array.isArray(s.members)) s.members = [];
    if (s.scope !== 'all' && !Array.isArray(s.scope)) s.scope = 'all';
    if (!s.branches || typeof s.branches !== 'object' || Array.isArray(s.branches)) s.branches = {};
    for (const [k, v] of Object.entries(s.branches)) {
      if (!Array.isArray(v) || !v.length || !v.every((b) => typeof b === 'string' && b)) delete s.branches[k];
    }
    if (s.preset && s.preset !== 'custom' && s.preset !== 'sprint') {
      const r = presets(s.preset);
      s.from = r.from; s.to = r.to;
    }
  }
  if (!app.settings.org) return;
  await loadCatalog();
  if (app.settings.project && app.settings.areaPath) await run();
}
