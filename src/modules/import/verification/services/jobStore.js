const crypto = require("node:crypto");

/* ------------------------------------------------------------------ */
/*  In-memory job store for async document verification.              */
/*                                                                    */
/*  The AI comparison can take 20-90s. Holding the HTTP request open   */
/*  that long trips the hosting reverse-proxy's gateway timeout (which  */
/*  returns a header-less error the browser reports as CORS). Instead   */
/*  we run the comparison in the BACKGROUND and let the client poll a   */
/*  fast status endpoint — every HTTP request now completes in <1s.     */
/*                                                                    */
/*  Jobs are ephemeral (single Node instance). They auto-expire so the  */
/*  map never grows unbounded. For a multi-instance deployment, back    */
/*  this with a shared store (e.g. Mongo) — the interface stays the same.*/
/* ------------------------------------------------------------------ */
const jobs = new Map();
const TTL_MS = 15 * 60 * 1000; // keep finished jobs for 15 min so slow polls still find them

function createJob(meta = {}) {
  const id = crypto.randomUUID();
  jobs.set(id, { id, status: "processing", data: null, error: null, meta, createdAt: Date.now(), finishedAt: null });
  return id;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function completeJob(id, data) {
  const job = jobs.get(id);
  if (job) { job.status = "completed"; job.data = data; job.finishedAt = Date.now(); }
}

function failJob(id, error) {
  const job = jobs.get(id);
  if (job) { job.status = "failed"; job.error = error; job.finishedAt = Date.now(); }
}

// Periodic cleanup of expired jobs (unref so it never keeps the process alive).
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - (job.finishedAt || job.createdAt) > TTL_MS) jobs.delete(id);
  }
}, 60 * 1000);
if (cleanup.unref) cleanup.unref();

module.exports = { createJob, getJob, completeJob, failJob };
