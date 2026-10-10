import { AuthError } from './auth.js';
import { ado, url, pageAll, limiter, normalizeOrg, listRepos, listBranches } from './devops.js';

const PAR = 8;
const WIQL_TOP = 19999;
const BATCH = 200;
const WI_FIELDS = [
  'System.Id', 'System.Title', 'System.WorkItemType', 'System.State', 'System.AssignedTo',
  'System.CreatedDate', 'System.CreatedBy', 'System.ChangedDate', 'System.AreaPath',
  'System.IterationPath', 'System.Tags',
  'Microsoft.VSTS.Common.ActivatedDate', 'Microsoft.VSTS.Common.ResolvedDate',
  'Microsoft.VSTS.Common.ResolvedBy', 'Microsoft.VSTS.Common.ClosedDate',
  'Microsoft.VSTS.Common.ClosedBy', 'Microsoft.VSTS.Common.Priority',
  'Microsoft.VSTS.Scheduling.StoryPoints',
];
const MERGED_PR_RE = /^Merged PR (\d+):/;
const MERGE_RE = /^Merge (branch|pull request|remote-tracking branch)\b/i;

const lower = (s) => (typeof s === 'string' && s ? s.toLowerCase() : null);
const identity = (v) => lower(v?.uniqueName);
const stripHeads = (ref) => (ref ?? '').replace(/^refs\/heads\//, '');
const validDate = (s) => (typeof s === 'string' && !s.startsWith('0001-') && !s.startsWith('9999-') ? s : null);
const wiqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function htmlToText(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function fetchActivity(req, progress) {
  const t0 = Date.now();
  const { org, project, fromISO, toISO, scope, areaPath, includeUpdates, branches: picks = {} } = req;
  const orgBase = normalizeOrg(org);
  const fromMs = Date.parse(fromISO);
  const toMs = Date.parse(toISO);
  const inRange = (iso) => { const t = Date.parse(iso); return t >= fromMs && t <= toMs; };
  const warnings = [];
  const soft = (what) => (err) => {
    if (err instanceof AuthError) throw err;
    warnings.push(`${what}: ${err.message}`);
  };

  // ---- repos / branches ----
  progress.stage('repos', 1);
  const allRepos = await listRepos(org, project);
  progress.tick();
  const repoById = new Map(allRepos.map((r) => [r.id, r]));
  let targets; // [{ repo, branches: string[] }]
  const refsById = new Map(); // repoId -> branch names without refs/heads/, null when the refs call failed
  if (scope === 'all') {
    targets = [];
    for (const r of allRepos) {
      if (picks[r.id]?.length) targets.push({ repo: r, branches: [] }); // filled by the override below
      else if (r.defaultBranch) targets.push({ repo: r, branches: [r.defaultBranch] });
      else warnings.push(`repo ${r.name} skipped: no default branch`);
    }
  } else {
    const picked = [];
    for (const id of scope) {
      const r = repoById.get(id);
      if (r) picked.push(r); else warnings.push(`repo ${id} skipped: not found or disabled`);
    }
    progress.stage('repos', picked.length);
    const lim = limiter(PAR);
    targets = await Promise.all(picked.map((r) => lim(async () => {
      let branches = [];
      let ok = true;
      try { branches = await listBranches(org, project, r.id); } catch (e) { ok = false; soft(`repo ${r.name} branches`)(e); }
      if (!branches.length) warnings.push(`repo ${r.name}: no branches`);
      refsById.set(r.id, ok ? branches.map(stripHeads) : null);
      progress.tick();
      return { repo: r, branches };
    })));
  }

  // ---- per-repo branch override (wins in both scope modes) ----
  const overridden = targets.filter((t) => picks[t.repo.id]?.length);
  const unfetched = overridden.filter((t) => !refsById.has(t.repo.id));
  if (unfetched.length) {
    progress.stage('repos', unfetched.length);
    const rlim = limiter(PAR);
    await Promise.all(unfetched.map((t) => rlim(async () => {
      try {
        refsById.set(t.repo.id, (await listBranches(org, project, t.repo.id)).map(stripHeads));
      } catch (e) {
        refsById.set(t.repo.id, null);
        soft(`repo ${t.repo.name} branches`)(e);
      } finally {
        progress.tick();
      }
    })));
  }
  const dropped = new Set();
  for (const t of overridden) {
    const refs = refsById.get(t.repo.id); // null: refs call failed, already warned
    const have = new Set(refs ?? []);
    const keep = [];
    for (const b of picks[t.repo.id]) {
      if (have.has(b)) keep.push(b);
      else if (refs) warnings.push(`repo ${t.repo.name}: branch ${b} not found`);
    }
    if (keep.length) t.branches = keep;
    else { warnings.push(`repo ${t.repo.name} skipped: no readable branch`); dropped.add(t); }
  }
  if (dropped.size) targets = targets.filter((t) => !dropped.has(t));

  // ---- pull requests (needed before commits for the squash exception) ----
  progress.stage('pullrequests', 2);
  const rawPrs = new Map();
  await Promise.all(['created', 'closed'].map(async (type) => {
    const list = await pageAll((skip, top) => url(org, [project, '_apis', 'git', 'pullrequests'], {
      'searchCriteria.status': 'all',
      'searchCriteria.queryTimeRangeType': type,
      'searchCriteria.minTime': fromISO,
      'searchCriteria.maxTime': toISO,
      $top: top,
      $skip: skip,
    }), 1000);
    for (const p of list) rawPrs.set(p.pullRequestId, p);
    progress.tick();
  }));
  const prs = [...rawPrs.values()].map((p) => {
    const repo = repoById.get(p.repository?.id);
    const repoName = p.repository?.name ?? repo?.name ?? '';
    const webUrl = repo?.webUrl ?? `${orgBase}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repoName)}`;
    return {
      id: p.pullRequestId,
      repoId: p.repository?.id ?? null,
      repoName,
      title: p.title ?? '',
      createdBy: identity(p.createdBy),
      created: p.creationDate,
      closed: validDate(p.closedDate),
      status: p.status,
      mergeStrategy: p.completionOptions?.mergeStrategy ?? null,
      source: stripHeads(p.sourceRefName),
      target: stripHeads(p.targetRefName),
      reviewers: (p.reviewers ?? [])
        .filter((r) => r.uniqueName)
        .map((r) => ({ email: r.uniqueName.toLowerCase(), vote: r.vote ?? 0 })),
      url: `${webUrl}/pullrequest/${p.pullRequestId}`,
    };
  }).sort((a, b) => a.created.localeCompare(b.created));
  const squashPrIds = new Set(prs.filter((p) => p.mergeStrategy === 'squash').map((p) => p.id));

  // ---- commits ----
  const totalBranches = targets.reduce((n, t) => n + t.branches.length, 0);
  progress.stage('commits', totalBranches);
  const lim = limiter(PAR);
  const byRepo = new Map(); // repoId -> Map(commitId -> raw)
  await Promise.all(targets.flatMap((t) => t.branches.map((branch) => lim(async () => {
    try {
      const list = await pageAll((skip, top) => url(org, [project, '_apis', 'git', 'repositories', t.repo.id, 'commits'], {
        'searchCriteria.fromDate': fromISO,
        'searchCriteria.toDate': toISO,
        'searchCriteria.itemVersion.version': stripHeads(branch),
        'searchCriteria.itemVersion.versionType': 'branch',
        'searchCriteria.$top': top,
        'searchCriteria.$skip': skip,
      }), 1000);
      let m = byRepo.get(t.repo.id);
      if (!m) byRepo.set(t.repo.id, (m = new Map()));
      for (const c of list) m.set(c.commitId, c);
    } catch (e) {
      soft(`repo ${t.repo.name} ${stripHeads(branch)} commits`)(e);
    } finally {
      progress.tick();
    }
  }))));

  const commits = [];
  for (const t of targets) {
    for (const c of byRepo.get(t.repo.id)?.values() ?? []) {
      const message = String(c.comment ?? '').split(/\r?\n/, 1)[0];
      const pr = MERGED_PR_RE.exec(message);
      let isMerge = Boolean(pr) || MERGE_RE.test(message);
      if (pr && squashPrIds.has(Number(pr[1]))) isMerge = false;
      commits.push({
        id: c.commitId,
        repoId: t.repo.id,
        repoName: t.repo.name,
        email: lower(c.author?.email) ?? '',
        name: c.author?.name ?? '',
        date: c.author?.date,
        message,
        add: c.changeCounts?.Add ?? 0,
        edit: c.changeCounts?.Edit ?? 0,
        del: c.changeCounts?.Delete ?? 0,
        isMerge,
        url: `${t.repo.webUrl}/commit/${c.commitId}`,
      });
    }
  }
  commits.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // ---- work items ----
  let workItems = [];
  if (!areaPath) {
    warnings.push('work items skipped: no area path');
  } else {
    progress.stage('workitems', 1);
    const f = wiqlStr(fromISO);
    const to = wiqlStr(toISO);
    const between = (field) => `([${field}] >= ${f} AND [${field}] <= ${to})`;
    const query = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project `
      + `AND [System.AreaPath] UNDER ${wiqlStr(areaPath)} AND (`
      + [
        between('System.CreatedDate'),
        between('Microsoft.VSTS.Common.ResolvedDate'),
        between('Microsoft.VSTS.Common.ClosedDate'),
        between('System.ChangedDate'),
        `[System.State] NOT IN ('Resolved', 'Closed', 'Removed', 'Done')`,
      ].join(' OR ')
      + `) ORDER BY [System.Id]`;
    const res = await ado(url(org, [project, '_apis', 'wit', 'wiql'], { timePrecision: true, $top: WIQL_TOP }),
      { method: 'POST', body: { query } });
    const ids = (res?.workItems ?? []).map((w) => w.id);
    if (ids.length >= WIQL_TOP) warnings.push(`work items truncated at ${WIQL_TOP}`);
    progress.tick();

    const batches = [];
    for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));
    progress.stage('workitems', batches.length);
    const blim = limiter(4);
    const raw = (await Promise.all(batches.map((chunk) => blim(async () => {
      const r = await ado(url(org, [project, '_apis', 'wit', 'workitemsbatch']), {
        method: 'POST', body: { ids: chunk, fields: WI_FIELDS, errorPolicy: 'omit' },
      });
      progress.tick();
      return (r?.value ?? []).filter(Boolean);
    })))).flat();

    workItems = raw.map((w) => {
      const x = w.fields ?? {};
      return {
        id: w.id,
        type: x['System.WorkItemType'] ?? '',
        title: x['System.Title'] ?? '',
        state: x['System.State'] ?? '',
        assignedTo: identity(x['System.AssignedTo']),
        createdBy: identity(x['System.CreatedBy']),
        resolvedBy: identity(x['Microsoft.VSTS.Common.ResolvedBy']),
        closedBy: identity(x['Microsoft.VSTS.Common.ClosedBy']),
        created: x['System.CreatedDate'],
        changed: x['System.ChangedDate'],
        activated: validDate(x['Microsoft.VSTS.Common.ActivatedDate']),
        resolved: validDate(x['Microsoft.VSTS.Common.ResolvedDate']),
        closed: validDate(x['Microsoft.VSTS.Common.ClosedDate']),
        points: numOrNull(x['Microsoft.VSTS.Scheduling.StoryPoints']),
        priority: numOrNull(x['Microsoft.VSTS.Common.Priority']),
        area: x['System.AreaPath'] ?? '',
        iteration: x['System.IterationPath'] ?? '',
        tags: x['System.Tags'] ? x['System.Tags'].split(';').map((s) => s.trim()).filter(Boolean) : [],
        url: `${orgBase}/${encodeURIComponent(project)}/_workitems/edit/${w.id}`,
      };
    }).sort((a, b) => a.id - b.id);
  }

  // ---- updates ----
  const updates = [];
  if (includeUpdates) {
    const touched = workItems.filter((w) => inRange(w.changed));
    progress.stage('updates', touched.length);
    const ulim = limiter(PAR);
    await Promise.all(touched.map((w) => ulim(async () => {
      try {
        const list = await pageAll((skip, top) => url(org, [project, '_apis', 'wit', 'workItems', w.id, 'updates'],
          { $top: top, $skip: skip }), 200);
        for (const u of list) {
          const fx = u.fields ?? {};
          const date = fx['System.ChangedDate']?.newValue ?? validDate(u.revisedDate);
          if (!date || !inRange(date)) continue;
          const out = { itemId: w.id, rev: u.rev, by: identity(u.revisedBy), date };
          if (fx['System.State']?.newValue !== undefined) {
            out.state = { old: fx['System.State'].oldValue ?? null, new: fx['System.State'].newValue };
          }
          if (fx['System.AssignedTo']) {
            const old = identity(fx['System.AssignedTo'].oldValue);
            const neu = identity(fx['System.AssignedTo'].newValue);
            // DevOps sometimes lists AssignedTo with neither value (unassigned on create); skip no-op entries.
            if (old !== neu) out.assignedTo = { old, new: neu };
          }
          if (fx['System.History']?.newValue) {
            const text = htmlToText(fx['System.History'].newValue);
            if (text) out.comment = text;
          }
          // Update id 1 is the creation. `rev` can repeat (link/attachment-only updates), so it is not a creation marker.
          if (u.id === 1) out.created = true;
          if (!out.created && !out.state && !out.assignedTo && !out.comment) continue;
          updates.push(out);
        }
      } catch (e) {
        soft(`work item ${w.id} updates`)(e);
      } finally {
        progress.tick();
      }
    })));
    updates.sort((a, b) => a.date.localeCompare(b.date) || a.itemId - b.itemId || a.rev - b.rev);
  }

  return {
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    repos: targets.map((t) => ({ id: t.repo.id, name: t.repo.name, branches: t.branches.length })),
    warnings,
    commits,
    prs,
    workItems,
    updates,
  };
}
