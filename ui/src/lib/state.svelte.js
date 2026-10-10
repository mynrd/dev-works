import { presets, ymd, addDays } from './dates.js';

const def = presets('12m');

export const app = $state({
  settings: {
    org: '',
    project: '',
    teamId: '',
    teamName: '',
    members: [],
    preset: '12m',
    from: def.from,
    to: def.to,
    scope: 'all',
    areaPath: '',
    granularity: 'week',
    branches: {}           // repoId -> branch names (no refs/heads/); missing = default
  },
  catalog: { projects: [], teams: [], members: [], repos: [], areas: null, branches: {} },
  loadedOrg: '',         // org the catalog projects were loaded for
  loading: { projects: false, teams: false, members: false, repos: false, areas: false, branches: {} },

  activity: null,        // Activity for the main range
  activityRange: null,   // { from, to } the activity was fetched for
  job: null,             // Job while running
  running: false,
  error: '',
  runSeq: 0,             // bumps on every finished main Run
  lastForce: false,

  digest: {
    mode: 'day',                        // 'day' | 'week'
    anchor: ymd(addDays(new Date(), -1)), // selected day (or any day in the selected week)
    activity: null,
    range: null,                        // { from, to } of the digest window
    job: null,
    running: false,
    error: ''
  },

  route: { view: 'digest', param: '' }
});

const ACCENTS = 8;

export function accent(email) {
  const i = app.settings.members.indexOf(email);
  return `var(--a${((i < 0 ? 0 : i) % ACCENTS) + 1})`;
}

export function memberName(email) {
  const m = app.catalog.members.find((x) => x.email === email);
  return m ? m.name : email;
}

export function currentRange() {
  return app.activityRange || { from: app.settings.from, to: app.settings.to };
}
