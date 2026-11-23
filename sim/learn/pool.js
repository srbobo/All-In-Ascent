// Run tasks on all cores: runPool(workerUrl, tasks) → results in task order.
// The worker module must export nothing special: it imports
// `serveTasks(handler)` from this file and calls it with an async function
// (task) → result. Results are deterministic per task, so they do not depend
// on the worker count.

import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

export function runPool(workerUrl, tasks, { workers = Math.max(1, availableParallelism() - 1), onProgress = null } = {}) {
  const results = new Array(tasks.length);
  if (!tasks.length) return Promise.resolve(results);
  let next = 0;
  let done = 0;
  return new Promise((resolve, rejectRun) => {
    const pool = [];
    const reject = (e) => { for (const w of pool) w.terminate(); rejectRun(e); };
    const feed = (w) => {
      if (next >= tasks.length) { w.terminate(); return; }
      const i = next++;
      w.postMessage({ i, task: tasks[i] });
    };
    for (let k = 0; k < Math.min(workers, tasks.length); k++) {
      const w = new Worker(workerUrl);
      w.on('message', ({ i, result, error }) => {
        if (error) { reject(new Error(`task ${i}: ${error}`)); return; }
        results[i] = result;
        done++;
        if (onProgress) onProgress(done, tasks.length);
        if (done === tasks.length) { for (const x of pool) x.terminate(); resolve(results); } else feed(w);
      });
      w.on('error', reject);
      pool.push(w);
      feed(w);
    }
  });
}

export function serveTasks(handler) {
  if (isMainThread) return;
  parentPort.on('message', async ({ i, task }) => {
    try {
      parentPort.postMessage({ i, result: await handler(task) });
    } catch (e) {
      parentPort.postMessage({ i, error: e.stack || String(e) });
    }
  });
}
