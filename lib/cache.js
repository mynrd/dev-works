import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '..', 'cache');
const TTL_MS = 15 * 60 * 1000;
const FROZEN_AFTER_MS = 24 * 60 * 60 * 1000;

export function cacheKey({ org, project, fromISO, toISO, scope, areaPath, includeUpdates, branches = {} }) {
  const canon = JSON.stringify({
    org, project, fromISO, toISO,
    scope: Array.isArray(scope) ? [...scope].sort() : scope,
    areaPath, includeUpdates: Boolean(includeUpdates),
    branches: Object.keys(branches ?? {}).sort().map((k) => [k, [...branches[k]].sort()]),
  });
  return createHash('sha1').update(canon).digest('hex');
}

/** Returns cached Activity or null. Ranges that ended >24h before the save never expire. */
export async function readCache(key, toISO) {
  let entry;
  try { entry = JSON.parse(await readFile(join(DIR, `${key}.json`), 'utf8')); } catch { return null; }
  const savedAt = Date.parse(entry?.savedAt);
  if (!Number.isFinite(savedAt) || !entry.data) return null;
  if (savedAt - Date.parse(toISO) > FROZEN_AFTER_MS) return entry.data;
  return Date.now() - savedAt < TTL_MS ? entry.data : null;
}

export async function writeCache(key, params, data) {
  await mkdir(DIR, { recursive: true });
  const file = join(DIR, `${key}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify({ savedAt: new Date().toISOString(), params, data }));
  await rename(tmp, file);
}
