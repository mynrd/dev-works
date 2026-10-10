import { randomUUID } from 'node:crypto';

const TTL_MS = 30 * 60 * 1000;
const jobs = new Map();

/**
 * startJob(run, extra) -> id. run(progress) returns the result.
 * progress.stage(name, total) resets done to 0; progress.tick(n = 1) advances.
 * `extra` is merged into the job (e.g. { fromCache: true }).
 */
export function startJob(run, extra = {}) {
  const id = randomUUID();
  const job = { id, status: 'running', stage: '', done: 0, total: 0, ...extra, createdAt: Date.now() };
  jobs.set(id, job);
  setTimeout(() => jobs.delete(id), TTL_MS).unref();

  const progress = {
    stage(name, total = 0) { job.stage = name; job.total = total; job.done = 0; },
    tick(n = 1) { job.done = Math.min(job.done + n, job.total || job.done + n); },
  };

  Promise.resolve()
    .then(() => run(progress))
    .then(
      (result) => { job.status = 'done'; job.result = result; },
      (err) => { job.status = 'error'; job.error = err?.message ?? String(err); job.errorStatus = err?.status; },
    );
  return id;
}

export function getJob(id) {
  const job = jobs.get(id);
  if (!job) return null;
  const { createdAt, errorStatus, ...pub } = job;
  return pub;
}
