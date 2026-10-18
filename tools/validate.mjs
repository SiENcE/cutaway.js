// Check a Cutaway game's data: every reference resolves, polygons are valid, the points actors must
// stand on are reachable, every string exists in every language.
//   node tools/validate.mjs <index.html> [--quiet]
// Exit code 1 on any error; warnings are printed but don't fail.
import { loadGame, boot } from "./lib/game.mjs";
import { validate } from "./lib/validate.mjs";

const args = process.argv.slice(2), page = args.find((a) => !a.startsWith("--"));
if (!page) { console.error("usage: node tools/validate.mjs <index.html>"); process.exit(2); }
const g = loadGame(page);
await boot(g, { instant: true });
const { issues, texts } = validate(g.C, { languages: g.options?.languages, demo: g.options?.demo, title: g.options?.title, intro: g.options?.intro, gate: g.options?.gate });
const errors = issues.filter((i) => i.level === "error"), warnings = issues.filter((i) => i.level === "warning");
for (const i of [...errors, ...(args.includes("--quiet") ? [] : warnings)]) console.log(`${i.level === "error" ? "ERROR" : "warn "}  ${i.where}: ${i.msg}`);
const C = g.C;
const acts = C.act.ids().length, hints = C.hints.all().length, seqs = C.sequence?.ids().length ?? 0;
console.log(`${C.room.ids().length} rooms, ${C.actors.all().length} actors, ${C.item.ids().length} items, ${C.dialog.ids().length} dialogs, ` +
  `${acts ? acts + " acts, " : ""}${seqs ? seqs + " sequences, " : ""}${hints ? hints + " hints, " : ""}${texts.size} texts: ` +
  `${errors.length} errors, ${warnings.length} warnings`);
process.exitCode = errors.length ? 1 : 0;
