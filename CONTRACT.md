# API contract: server <-> browser

Read `PLAN.md` first. This file is the exact wire format both sides build to.
Server lives in `server.js` + `lib/`. UI lives in `ui/`.

## Hard rules

- Azure DevOps is READ ONLY. Allowed HTTP to DevOps: GET, plus POST only to
  `_apis/wit/wiql`, `_apis/wit/workitemsbatch`, and `git/.../commitsbatch`
  (query endpoints that take a body). Never PATCH/PUT/DELETE, never POST to
  anything else. Never call `add_comment`, `update_work_item`, etc.
- Auth: `az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798`
  only (already in `lib/auth.js`). No PAT, no env var, no fallback.
- The only files the server writes: `data.json`, `cache/*.json`.
- Zero npm dependencies on the server. Node 26 built-ins only.

## Identity

Everyone is keyed by lowercase email (`uniqueName` from DevOps). Commits by
`author.email`, PRs by `createdBy.uniqueName`, reviewers by
`reviewers[].uniqueName`, work items by `System.AssignedTo.uniqueName`,
`CreatedBy`, `ResolvedBy`, `ClosedBy`. Server lowercases all of them.

## Routes (all JSON; errors are `{ error: string }` with 4xx/5xx)

| Route | Request | Response |
|---|---|---|
| GET /api/settings | | `Settings` (contents of data.json, `{}` if missing) |
| PUT /api/settings | `Settings` | `Settings` |
| GET /api/projects | `?org=` | `[{ id, name }]` |
| GET /api/teams | `?org=&project=` | `[{ id, name }]` |
| GET /api/members | `?org=&project=&team=<teamId>` | `[{ id, name, email, imageUrl }]` |
| GET /api/repos | `?org=&project=` | `[{ id, name, defaultBranch, webUrl }]` (`defaultBranch` like `refs/heads/main` or null) |
| GET /api/branches | `?org=&project=&repo=<repoId>` | `string[]` branch names without `refs/heads/`, sorted |
| GET /api/areas | `?org=&project=` | `AreaNode = { path, name, children: AreaNode[] }` (root is the project) |
| GET /api/iterations/current | `?org=&project=&team=<teamId>` | `{ name, path, start, finish }` or `null` |
| POST /api/activity | `ActivityRequest` | `{ jobId }` |
| GET /api/jobs/:id | | `Job` |
| GET /api/health | | `{ ok: true, user: string }` (user from `az account show`, read only) |
| GET /* | | static files from `dist/`, SPA fallback to `dist/index.html` |

Server port: 4310. Errors from `az` return 401 `{ error: 'az login required ...' }`.

```ts
type Settings = {
  org: string;            // https://dev.azure.com/<org>
  project: string;        // <project>
  teamId: string;
  teamName: string;
  members: string[];      // emails
  preset: '12m' | '6m' | '3m' | '30d' | 'sprint' | 'custom';
  from: string;           // YYYY-MM-DD (local)
  to: string;             // YYYY-MM-DD (local)
  scope: 'all' | string[];  // repo ids
  areaPath: string;       // e.g. "<project>\\<team>"
  granularity: 'day' | 'week' | 'month' | 'year';
  branches: { [repoId: string]: string[] };  // branch names without refs/heads/; missing or empty entry = default behaviour
};

type ActivityRequest = {
  org: string;
  project: string;
  fromISO: string;        // inclusive, UTC ISO, e.g. 2025-10-09T16:00:00.000Z
  toISO: string;          // inclusive, UTC ISO
  scope: 'all' | string[];
  areaPath: string;
  includeUpdates: boolean; // true only for Digest windows (<= 8 days)
  branches?: { [repoId: string]: string[] };  // same as Settings.branches; missing = {}
  force?: boolean;         // bypass cache
};

type Job = {
  id: string;
  status: 'running' | 'done' | 'error';
  stage: string;          // 'repos' | 'commits' | 'pullrequests' | 'workitems' | 'updates' | 'cache'
  done: number;
  total: number;
  result?: Activity;      // when done
  error?: string;         // when error
  fromCache?: boolean;
};

type Activity = {
  fetchedAt: string;      // ISO
  durationMs: number;
  repos: { id: string; name: string; branches: number }[];  // what was scanned
  warnings: string[];     // e.g. repo X skipped: no default branch
  commits: Commit[];
  prs: PR[];
  workItems: WorkItem[];
  updates: Update[];      // [] unless includeUpdates
};

type Commit = {
  id: string; repoId: string; repoName: string;
  email: string; name: string;
  date: string;           // author.date ISO
  message: string;        // first line of comment
  add: number; edit: number; del: number;   // changeCounts
  isMerge: boolean;
  url: string;            // web url to the commit
};

type PR = {
  id: number; repoId: string; repoName: string; title: string;
  createdBy: string;      // email
  created: string; closed: string | null;
  status: 'active' | 'completed' | 'abandoned';
  mergeStrategy: string | null;   // completionOptions.mergeStrategy
  source: string; target: string; // branch names without refs/heads/
  reviewers: { email: string; vote: number }[];   // vote: 10, 5, 0, -5, -10
  url: string;
};

type WorkItem = {
  id: number; type: string; title: string; state: string;
  assignedTo: string | null; createdBy: string | null;
  resolvedBy: string | null; closedBy: string | null;
  created: string; changed: string;
  activated: string | null; resolved: string | null; closed: string | null;
  points: number | null; priority: number | null;
  area: string; iteration: string; tags: string[];
  url: string;            // https://dev.azure.com/<org>/<project>/_workitems/edit/<id>
};

type Update = {
  itemId: number; rev: number;
  by: string | null;      // email
  date: string;           // System.ChangedDate.newValue if present else revisedDate
  state?: { old: string | null; new: string };
  assignedTo?: { old: string | null; new: string | null };
  comment?: string;       // System.History newValue, HTML stripped to text
  created?: boolean;      // rev 1
};
```

## Fetch rules (server)

- `scope: 'all'`: every enabled repo, default branch only. Repos with no
  default branch go to `warnings`.
- `scope: [ids]`: every branch under `refs/heads/` of those repos, commits
  deduped by commit id per repo.
- `branches` override wins in both scope modes: a repo with a non-empty
  `branches[repoId]` reads only those branches (in `'all'` mode even when it
  has no default branch; in pick mode only for picked repos). Names are
  checked against the repo's refs (one refs call per overridden repo). A
  missing name adds warning `repo <name>: branch <b> not found`; if none are
  left the repo is dropped with warning `repo <name> skipped: no readable branch`.
- Commits: `commits?searchCriteria.fromDate&toDate&itemVersion.version=<branch>&itemVersion.versionType=branch&$top=1000&$skip`, paged.
  Parallelism 8. Progress: stage 'commits', total = branch count.
- `isMerge`: message matches `/^Merged PR (\d+):/` or `/^Merge (branch|pull request|remote-tracking branch)\b/i`.
  Exception: `Merged PR n` where PR n is in the fetched PR set with
  `mergeStrategy === 'squash'` -> `isMerge = false`.
- PRs: project-level `_apis/git/pullrequests?searchCriteria.status=all&searchCriteria.queryTimeRangeType=created&minTime&maxTime&$top=1000&$skip`
  and the same with `queryTimeRangeType=closed`. Union by id.
- Work items: WIQL (POST, `?timePrecision=true&$top=19999`):
  `AreaPath UNDER '<areaPath>'` AND ( CreatedDate in range OR ResolvedDate in
  range OR ClosedDate in range OR ChangedDate in range OR State NOT IN
  ('Resolved','Closed','Removed','Done') ). Then POST `workitemsbatch` in
  200s with fields: System.Id, Title, WorkItemType, State, AssignedTo,
  CreatedDate, CreatedBy, ChangedDate, AreaPath, IterationPath, Tags,
  Microsoft.VSTS.Common.ActivatedDate, ResolvedDate, ResolvedBy, ClosedDate,
  ClosedBy, Priority, Microsoft.VSTS.Scheduling.StoryPoints.
- Updates (only when includeUpdates): for items whose `changed` is within
  range, GET `workitems/{id}/updates?$top=200&$skip`, keep updates whose
  `date` is within range. Parallelism 8.
- Cache: key = sha1 of `{org, project, fromISO, toISO, scope, areaPath, includeUpdates, branches}`
  (`branches` keys and values sorted; missing = `{}`; see `lib/cache.js`). On hit, job completes immediately with `fromCache: true`.

## UI expectations

- UI computes every metric from `Activity` in the browser (`ui/src/lib/metrics.js`).
- Local-day bucketing: `new Date(iso)` then local getters. Range `from`/`to`
  (YYYY-MM-DD) convert to `fromISO = startOfLocalDay(from).toISOString()`,
  `toISO = endOfLocalDay(to).toISOString()`.
- On load: GET /api/settings; if `org` is set, load catalog and auto-run.
- Save settings (PUT) on every Run.
- Poll `/api/jobs/:id` every 500 ms while `running`.
