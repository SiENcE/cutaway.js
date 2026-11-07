// A worker thread of the solver (solver.mjs, `workers`): it loads the game itself (`setup`) and expands
// the states it is sent, every move from each, returning the states they lead to. Snapshots travel
// packed (deflated JSON); a state this worker has already sent goes back as its key alone (the main
// thread has it).
import { parentPort, workerData } from "node:worker_threads";
import { makeSolver, loadFor, unpack } from "./solver.mjs";

const solver = await makeSolver(loadFor(workerData.setup), { trace: workerData.trace });
const sent = new Set();

parentPort.on("message", async (msg) => {
  try {
    if (msg.op === "expand") {
      const out = [];
      // the solver's own expansion (view flags too); a state this worker has sent once goes back as its key
      const known = (/** @type {string} */ rk) => { if (sent.has(rk)) return true; sent.add(rk); return false; };
      for (const s of msg.states) out.push(await solver.expandState(unpack(s), known));
      parentPort.postMessage({ id: msg.id, out, trace: solver.takeTrace() });   // what the moves read and changed (trace), since the last job
    } else if (msg.op === "hint") {
      const out = [];
      for (const s of msg.states) { await solver.C.save.apply(unpack(s)); out.push(solver.C.hints.currentIndex()); }
      parentPort.postMessage({ id: msg.id, out });
    }
  } catch (e) {
    parentPort.postMessage({ id: msg.id, error: String(e?.stack ?? e) });
  }
});
parentPort.postMessage({ ready: true });
