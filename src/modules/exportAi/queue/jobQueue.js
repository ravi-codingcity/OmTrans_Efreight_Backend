const { logger } = require("../config/logger");

/** Lightweight in-process FIFO queue with bounded concurrency (no Redis dep). */
class JobQueue {
  constructor({ concurrency = 2 } = {}) {
    this.concurrency = concurrency;
    this.active = 0;
    this.queue = [];
    this.worker = null;
  }
  setWorker(fn) { this.worker = fn; }
  enqueue(payload) {
    if (!this.worker) throw new Error("JobQueue worker not configured");
    this.queue.push(payload);
    this._drain();
  }
  _drain() {
    while (this.active < this.concurrency && this.queue.length) {
      const payload = this.queue.shift();
      this.active += 1;
      Promise.resolve(this.worker(payload))
        .catch((err) => logger.error("Queue worker crashed", { error: err.message, stack: err.stack }))
        .finally(() => { this.active -= 1; this._drain(); });
    }
  }
  stats() { return { active: this.active, pending: this.queue.length, concurrency: this.concurrency }; }
}

const jobQueue = new JobQueue({ concurrency: Number(process.env.AI_QUEUE_CONCURRENCY) || 2 });

module.exports = { jobQueue };
