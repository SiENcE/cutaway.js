// A worker thread of the solver (solver.mjs, `workers`): it loads the game itself (`setup`) and expands
// the states it is sent, every move from each, returning the states they lead to. Snapshots travel
// packed (deflated JSON); a state this worker has already sent goes back as its key alone (the main
// thread has it).
import { parentPort, workerData } from "node:worker_threads";
import { makeSolver, loadFor, pack, unpack } from "./solver.mjs";

const solver = await makeSolver(loadFor(workerData.setup));
const sent = new Set();

parentPort.on("message", async (msg) => {
  try {
    if (msg.op === "expand") {
      const out = [];
      for (const s of msg.states) {
        const snap = unpack(s), res = [], here = new Set();
        for (const m of await solver.moves(snap)) {
          for (const r of await solver.play(snap, m)) {
            const rk = r.ended ? "WIN:" + solver.key(r.snap) : solver.key(r.snap);
            if (here.has(rk)) continue;
            here.add(rk);
            const fresh = !sent.has(rk);
            if (fresh) sent.add(rk);
            res.push({ rk, move: r.move, ended: r.ended, room: r.snap.room, snap: fresh ? pack(r.snap) : null });
          }
        }
        out.push(res);
      }
      parentPort.postMessage({ id: msg.id, out });
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
