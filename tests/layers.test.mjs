// The edits layer and recorded voices in Node, on the demo: a script replaced and reverted, null removes
// (and the layer keeps the removal), a dialogue kept whole, a thing without an id patched by its place, a
// sequence's steps replaced and reverted, and a recorded line found by its text (the speaker's own
// first), holding its line as long as it plays.
import { loadGame, boot } from "../tools/lib/game.mjs";

export default async function (t) {
  const g = loadGame("demo/index.html");
  await boot(g, { instant: true });
  const C = g.C, shelf = () => C.room.get("hall").hotspots.shelf;
  const own = JSON.stringify(shelf().use);

  C.edits.change("rooms", "hall", { hotspots: { shelf: { use: ["Not now."] } } });
  t.ok("edits: a script replaces the game's", JSON.stringify(shelf().use) === '["Not now."]');
  t.ok("edits: the layer has it", C.edits.changed("rooms", "hall", ["hotspots", "shelf", "use"]) && !C.edits.changed("rooms", "hall", ["hotspots", "shelf", "look"]));
  t.ok("edits: the game's own is kept", JSON.stringify(C.edits.original("rooms", "hall", ["hotspots", "shelf", "use"])) === own);
  C.edits.change("rooms", "hall", { hotspots: { shelf: { z: 3 } } });
  C.edits.revert("rooms", "hall", ["hotspots", "shelf", "use"]);
  t.ok("edits: revert brings the script back", JSON.stringify(shelf().use) === own);
  t.ok("edits: and only that path leaves the layer", !C.edits.changed("rooms", "hall", ["hotspots", "shelf", "use"]) && C.edits.data().rooms.hall.hotspots.shelf.z === 3);

  C.edits.change("rooms", "hall", { hotspots: { shelf: { z: null } } });
  t.ok("edits: null removes", !("z" in shelf()));
  t.ok("edits: the layer keeps the removal", C.edits.data().rooms.hall.hotspots.shelf.z === null);
  C.edits.change("rooms", "hall", { hotspots: { shelf: { z: undefined } } });
  t.ok("edits: undefined removes too (a field emptied)", !("z" in shelf()));

  const tree = { start: [{ text: "One.", goto: "two" }], two: [{ text: "Bye.", goto: "end" }] };
  const before = JSON.stringify(C.dialog.get("bolt"));
  C.edits.change("dialogs", "bolt", tree);
  t.ok("edits: a dialogue is kept whole", JSON.stringify(C.dialog.get("bolt")) === JSON.stringify(tree) && JSON.stringify(C.edits.data().dialogs.bolt) === JSON.stringify(tree));
  C.edits.revert("dialogs", "bolt");
  t.ok("edits: revert gives the dialogue back", JSON.stringify(C.dialog.get("bolt")) === before && !C.edits.changed("dialogs", "bolt"));

  // a layer file as loaded: null removes in the data
  C.edits({ rooms: { hall: { hotspots: { shelf: { walkTo: null } } } } });
  t.ok("edits: a loaded layer's null removes", !("walkTo" in shelf()));

  // a thing without an id (the hall's effects) goes by its place in the list
  const fx = () => C.room.get("hall").fx;
  C.edits.change("rooms", "hall", { fx: { 1: { count: 30 } } });
  t.ok("edits: a thing without an id is patched by its place", fx()[1].count === 30 && fx()[0].count === undefined && C.edits.changed("rooms", "hall", ["fx", "1", "count"]));
  C.edits.revert("rooms", "hall", ["fx", "1", "count"]);
  t.ok("edits: and reverted by it", fx()[1].count === 18 && !C.edits.changed("rooms", "hall", ["fx"]));

  // a sequence: its steps (and after) are scripts that replace the game's
  const intro = () => C.sequence.get("intro"), steps = JSON.stringify(intro().steps);
  C.edits.change("sequences", "intro", { steps: [{ shot: "one" }, { wait: 100 }] });
  t.ok("edits: a sequence's steps replace the game's", JSON.stringify(intro().steps) === '[{"shot":"one"},{"wait":100}]'
    && C.edits.changed("sequences", "intro", ["steps"]) && C.edits.data().sequences.intro.steps.length === 2);
  t.ok("edits: the game's own steps are kept", C.edits.original("sequences", "intro", ["steps"]).length === JSON.parse(steps).length);
  C.edits.revert("sequences", "intro", ["steps"]);
  t.ok("edits: revert gives the sequence its steps back", JSON.stringify(intro().steps) === steps && !C.edits.changed("sequences", "intro"));
  C.edits({ sequences: { intro: { after: [{ set: "intro_skipped" }] }, nope: { steps: [] } } });
  t.ok("edits: a loaded layer changes a sequence (one the game hasn't is left out)", intro().after?.[0]?.set === "intro_skipped" && !C.sequence.get("nope"));

  // recorded voices
  const lang = C.i18n.language, clip = { sample: "data:audio/wav;base64,AAAA", ms: 2600 };
  C.voice.layer(lang, { "Morning, Pip.": { ...clip, ms: 900 }, "bolt|Morning, Pip.": clip });
  t.ok("voice: the speaker's own clip first", C.voice.clip("bolt", "Morning, Pip.")?.ms === 2600 && C.voice.clip("pip", "Morning, Pip.")?.ms === 900);
  C.i18n.setLanguage("xx");
  t.ok("voice: none in another language", !C.voice.clip("bolt", "Morning, Pip.") && C.voice.clipMs("bolt", "Morning, Pip.") === 0);
  C.i18n.setLanguage(lang);
  /** @type {any} */
  let said = null;
  C.ui.say = async (/** @type {any} */ a, /** @type {string} */ text, /** @type {any} */ o) => { said = { actor: a.id, text, ...o }; };   // the tools' stub, watched
  await C.script.run([{ say: "bolt", text: "Morning, Pip." }]);
  t.ok("voice: a line is said with its source text", said?.source === "Morning, Pip." && said?.actor === "bolt");
  t.ok("voice: a clip holds its line as long as it plays", said?.minMs >= 2600, String(said?.minMs));
  C.voice.layer(lang, { "bolt|Morning, Pip.": null });
  t.ok("voice: null removes a clip", C.voice.clip("bolt", "Morning, Pip.")?.ms === 900);
}
