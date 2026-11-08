// The editor's film (src/film.js) in Node on the demo's intro: a trace says when each step starts and ends
// (a camera drive's 2.6 s, a prop's move that goes on at once still running 3.6 s, the captions typed and
// held), the shots and the rooms; a seek shows a moment, the same whether it comes from the start or after
// a later one; and the game is as it was after the film.
import { loadGame, boot } from "../tools/lib/game.mjs";

export default async function (t) {
  const g = loadGame("demo/index.html", { scripts: ["src/film.js"] });
  const C = g.C, wait = C.clock.wait;
  await boot(g, { instant: true });
  C.clock.wait = wait;
  C.tween.instant = false;
  C.settings.init("film-test");
  C.state.set("before_film", 3);
  const was = JSON.stringify(C.state.snapshot()), room = C.scene.room.id, at = [C.scene.active.x, C.scene.active.y];

  const tr = await C.film.trace("intro");
  const top = tr.steps.filter((s) => s.depth === 0);
  const byKind = (k) => top.filter((s) => s.kind === k);
  t.ok("film: every step of the intro traced, in order", top.length === C.sequence.get("intro").steps.length && top.every((s, i) => s.path === `sequence.intro.${i}`), top.map((s) => s.path).join());
  const cam = byKind("camera")[0];
  t.ok("film: the camera's drive lasts its 2.6 s", Math.abs(cam.end - cam.start - 2600) < 20, `${cam.end - cam.start}`);
  const mv = byKind("move")[0];
  t.ok("film: a move that goes on at once (wait: false) ends at once in the flow and runs its 3.6 s", mv.end - mv.start < 20 && Math.abs(mv.until - mv.start - 3600) < 20, `${mv.end - mv.start} ${mv.until - mv.start}`);
  const cap = byKind("caption")[0], letters = "Somewhere, a small house.".length;
  t.ok("film: a typed caption: its letters, then held 1.4 s", Math.abs(cap.end - cap.start - (letters * 50 + 1400)) < 40, `${cap.end - cap.start}`);
  t.ok("film: the shots, at their times", tr.shots.map((s) => s.name).join() === "hall,sky,yard" && tr.shots[0].t === 0 && tr.shots[1].t > 2000, JSON.stringify(tr.shots));
  t.ok("film: the rooms it shows and the step that showed each", tr.rooms.map((r) => r.id).join() === "hall,intro_sky,yard" && tr.rooms[1].path === "sequence.intro.5", JSON.stringify(tr.rooms));
  const last = top[top.length - 1];
  t.ok("film: it runs to its end", tr.waits === "" && Math.abs(tr.ms - last.end) < 20 && tr.ms > 9000, `${tr.ms} ${last.end}`);

  // a moment in the sky shot: half the camera's drive (its ease is inOut: half the way)
  const mid = cam.start + 1300;
  await C.film.seek("intro", mid);
  const y1 = C.scene.camera.y;
  t.ok("film: a seek shows the moment (the camera halfway down)", C.scene.room.id === "intro_sky" && Math.abs(y1 - 60) < 3 && Math.abs(C.film.time - mid) < 20, `${C.scene.room.id} ${y1}`);
  await C.film.seek("intro", tr.ms - 100);
  const late = C.scene.room.id;
  await C.film.seek("intro", mid);
  t.ok("film: back to the same moment after a later one, it is the same", late === "yard" && C.scene.room.id === "intro_sky" && C.scene.camera.y === y1, `${late} ${C.scene.camera.y} ${y1}`);
  const base = C.clock.time - C.film.time;
  await C.film.seek("intro", 200);
  t.ok("film: every run starts at the same clock time (what draws by the clock looks the same)", Math.abs(C.clock.time - C.film.time - base) < 1);
  t.ok("film: the sound is quiet while it seeks", C.audio.quiet);

  await C.film.close();
  t.ok("film: closed, the game is as it was", JSON.stringify(C.state.snapshot()) === was && C.scene.room.id === room && C.scene.active.x === at[0] && C.scene.active.y === at[1] && !C.sequence.playing() && !C.audio.quiet,
    `${C.scene.room.id} ${C.sequence.playing()}`);

  // changing its timing: the steps changed, guided by the trace
  const E = C.film.edits, S = C.sequence.get("intro").steps, J = JSON.stringify;
  const len = E.length(S, tr, "sequence.intro.7", 3000);
  t.ok("film edits: a camera drive's length is its ms", len[7].ms === 3000 && S[7].ms === 2600 && J(len.slice(0, 7)) === J(S.slice(0, 7)));
  const w12 = tr.steps.find((s) => s.path === "sequence.intro.12");
  const ins = E.insert(S, tr, w12.start + 100, { sfx: "_tick" });
  t.ok("film edits: a new step at the playhead splits the wait under it", J(ins.slice(12, 15)) === J([{ wait: 100 }, { sfx: "_tick" }, { wait: 400 }]) && ins.length === S.length + 2);
  C.edits.change("sequences", "intro", { steps: ins });
  const trIns = await C.film.trace("intro");
  t.ok("film edits: it sounds there, and the rest keeps its times", Math.abs(trIns.steps.find((x) => x.path === "sequence.intro.13").start - (w12.start + 100)) < 20 && Math.abs(trIns.ms - tr.ms) < 20);
  const mv2 = E.move(ins, trIns, "sequence.intro.13", w12.start + 350);
  t.ok("film edits: a step that goes on at once moves on in its wait: the waits round it change, nothing else", J(mv2.slice(12)) === J([{ wait: 350 }, { sfx: "_tick" }, { wait: 150 }, S[13]]), J(mv2.slice(12)));
  const mv3 = E.move(ins, trIns, "sequence.intro.13", cam.start + 600);
  t.ok("film edits: moved into a drive, it goes to the drive's nearer edge, and the waits where it was join", J(mv3[7]) === J({ sfx: "_tick" }) && J(mv3[8]) === J(S[7]) && J(mv3.slice(13)) === J(S.slice(12)), J(mv3));
  C.edits.change("sequences", "intro", { steps: S });
  const rip = E.ripple(S, tr, "sequence.intro.8", 500);
  t.ok("film edits: ripple makes a wait before a step that has none", J(rip[8]) === J({ wait: 500 }) && J(rip[9]) === J(S[8]));
  const rip2 = E.ripple(S, tr, "sequence.intro.13", -200);
  t.ok("film edits: ripple shrinks the wait before", rip2[12].wait === 300);
  const inCam = E.insert(S, tr, cam.start + 1000, { sfx: "_tick" });
  t.ok("film edits: at a moment inside a drive, it goes after the drive", J(inCam[8]) === J({ sfx: "_tick" }) && J(inCam[7]) === J(S[7]));
  const rmCam = E.remove(S, tr, "sequence.intro.7");
  t.ok("film edits: a step taken out leaves its time as a wait", J(rmCam[7]) === J({ wait: Math.round(cam.end - cam.start) }) && rmCam.length === S.length);
  const rmWait = E.remove(S, tr, "sequence.intro.12");
  t.ok("film edits: a wait taken out is gone", rmWait.length === S.length - 1 && J(rmWait[12]) === J(S[13]));
  C.edits.change("sequences", "intro", { steps: len });
  const tr2 = await C.film.trace("intro");
  const cam2 = tr2.steps.find((s) => s.path === "sequence.intro.7");
  t.ok("film edits: the changed steps trace again with the new time", Math.abs(cam2.end - cam2.start - 3000) < 20 && Math.abs(tr2.ms - tr.ms - 400) < 40, `${cam2.end - cam2.start} ${tr2.ms - tr.ms}`);
  C.edits.change("sequences", "intro", { steps: S });
  await C.film.close();

  // a film that waits for the player's choice ends its run there
  C.sequence("asks", { steps: [{ wait: 400 }, { dialog: "bolt" }, { wait: 400 }] });
  const ask = await C.film.trace("asks");
  t.ok("film: a dialogue's choices end the run (it waits for the player)", ask.waits === "choice" && Math.abs(ask.ms - 400) < 40, `${ask.waits} ${ask.ms}`);
  await C.film.close();
  t.ok("film: and after it the game is as it was", JSON.stringify(C.state.snapshot()) === was && !C.dialogs.choices && !C.script.busy, `${C.dialogs.choices} ${C.script.busy}`);
}
