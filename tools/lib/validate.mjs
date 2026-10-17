// The validator: every reference in a game's data must resolve. Works on a game loaded with
// loadGame() + boot(): rooms, hotspots, props, actors, items, dialogs, scripts, conditions, assets,
// walk polygons (valid, reachable points) and strings in every language.
/** @typedef {{level: "error" | "warning", where: string, msg: string}} Issue */

const FACINGS = new Set(["left", "right", "up", "down"]);

/**
 * @param {any} C the Cutaway namespace of a booted game
 * @param {{languages?: string[], demo?: any, title?: any}} [o]  (o: the game's start options)
 * @returns {{issues: Issue[], texts: Set<string>, flags: {set: Set<string>, tested: Set<string>}}}
 */
export function validate(C, o = {}) {
  /** @type {Issue[]} */
  const issues = [];
  const err = (where, msg) => issues.push({ level: "error", where, msg });
  const warn = (where, msg) => issues.push({ level: "warning", where, msg });
  const texts = new Set(), keys = new Set();
  const flagsSet = new Set(), flagsTested = new Set();
  const actions = new Set(C.script.names());
  const roomIds = new Set(C.room.ids()), itemIds = new Set(C.item.ids()), dialogIds = new Set(C.dialog.ids());
  const actorIds = new Set(C.actors.all().map((a) => a.id));
  const actIds = new Set(C.act.ids());
  const party = new Set(C.party.members());
  /** @type {Map<string, Set<string>>} object ids per room (props and hotspots) */
  const objects = new Map();
  for (const id of roomIds) {
    const r = C.room.get(id);
    objects.set(id, new Set([...(r.props ?? []).map((p) => p.id).filter(Boolean), ...Object.keys(r.hotspots ?? {})]));
  }
  /** points that must be reachable, per room: [x, y, where] */
  const mustReach = new Map([...roomIds].map((id) => [id, []]));

  const text = (t, where) => {
    if (typeof t !== "string") { err(where, "text must be a string, got " + JSON.stringify(t)); return; }
    if (t.startsWith("@")) keys.add(t.slice(1)); else texts.add(t);
  };
  const asset = (name, where) => { if (!C.assets.has(name)) err(where, `unknown image or animation "${name}"`); };
  const item = (id, where) => { if (!itemIds.has(id)) err(where, `unknown item "${id}"`); };
  const room = (id, where) => { if (!roomIds.has(id)) err(where, `unknown room "${id}"`); };
  const actor = (id, where) => { if (!actorIds.has(id)) err(where, `unknown actor "${id}"`); };
  const xy = (v, where) => { if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite)) err(where, "expected [x, y], got " + JSON.stringify(v)); return Array.isArray(v); };
  /** "room/id" or a bare id in the script's room */
  const object = (ref, roomId, where) => {
    const [r, id] = String(ref).includes("/") ? String(ref).split("/") : [roomId, String(ref)];
    if (!r) { warn(where, `object "${ref}" outside a room: write "room/${ref}"`); return; }
    if (!objects.get(r)?.has(id)) err(where, `unknown object "${ref}" in room "${r}"`);
  };

  /** @param {any} c @param {string} roomId @param {string} where */
  function cond(c, roomId, where) {
    if (c === undefined || c === null) return;
    if (Array.isArray(c)) { c.forEach((x) => cond(x, roomId, where)); return; }
    if (typeof c === "object") {
      if ("and" in c) return cond(c.and, roomId, where);
      if ("or" in c) return cond(c.or, roomId, where);
      if ("not" in c) return cond(c.not, roomId, where);
      return err(where, "unknown condition " + JSON.stringify(c));
    }
    const s = String(c).trim().replace(/^!/, ""), colon = s.indexOf(":");
    if (colon < 0) { flagsTested.add(s.split("=")[0]); return; }
    const kind = s.slice(0, colon), arg = s.slice(colon + 1);
    if (kind === "has") item(arg, where);
    else if (kind === "visited") room(arg, where);
    else if (kind === "is") actor(arg, where);
    else if (kind === "hidden") object(arg, roomId, where);
    else if (kind === "state") object(arg.split("=")[0], roomId, where);
    else if (kind === "at") { const [a, r] = arg.split("="); actor(a, where); room(r, where); }
    else err(where, `unknown condition "${c}"`);
  }

  /** @param {any} s @param {string} roomId @param {string} where */
  function script(s, roomId, where) {
    if (s === undefined || s === null) return;
    if (Array.isArray(s)) { s.forEach((x, i) => script(x, roomId, `${where}.${i}`)); return; }
    if (typeof s === "string") { text(s, where); return; }
    if (typeof s !== "object") { err(where, "a script step must be a string or an object"); return; }
    if ("if" in s) { cond(s.if, roomId, where); script(s.then, roomId, where + ".then"); script(s.else, roomId, where + ".else"); return; }
    if ("once" in s) { script(s.once, roomId, where + ".once"); script(s.else, roomId, where + ".else"); return; }
    const name = Object.keys(s).find((k) => actions.has(k));
    if (!name) { err(where, "unknown action " + JSON.stringify(s)); return; }
    const v = s[name];
    switch (name) {
      case "say": if ("text" in s) { actor(v, where); text(s.text, where); } else text(v, where); break;
      case "narrate": case "end": text(v, where); break;
      case "card": text(v, where); if (s.title !== undefined) text(s.title, where + ".title"); break;
      case "act": if (v !== "next" && !actIds.has(v)) err(where, `unknown act "${v}"`); break;
      case "walk": if (Array.isArray(v)) xy(v, where); else { actor(v, where); xy(s.to, where); } break;
      case "face": { const f = "to" in s ? s.to : v; if ("to" in s) actor(v, where); if (!FACINGS.has(f)) err(where, `unknown facing "${f}"`); break; }
      case "anim": {
        const [a, k] = String(v).includes(":") ? String(v).split(":") : [null, String(v)];
        if (a) { actor(a, where); const def = C.actors.get(a)?.def; if (def && !def.costume[k]) err(where, `actor "${a}" has no costume animation "${k}"`); }
        break;
      }
      case "wait": if (!Number.isFinite(Number(v))) err(where, "wait needs milliseconds"); break;
      case "give": item(v, where); if (s.to) actor(s.to, where); break;
      case "take": item(v, where); if (s.hide) object(s.hide, roomId, where); break;
      case "remove": item(v, where); if (s.from) actor(s.from, where); break;
      case "set": case "unset": case "inc": flagsSet.add(String(v)); break;
      case "state": object(v, roomId, where); break;
      case "show": case "hide": object(v, roomId, where); break;
      case "goto": room(v, where); if (s.at && xy(s.at, where) && roomIds.has(v)) mustReach.get(v).push([s.at[0], s.at[1], where]); break;
      case "place": actor(v, where); if (s.room) room(s.room, where); if (s.at) xy(s.at, where); break;
      case "switch": case "lock": case "unlock": case "stay": case "follow": actor(v, where); if (!party.has(v)) err(where, `"${v}" is not in the party`); break;
      case "music": music(v, where); break;
      case "stinger": if (C.score && !C.score.getStinger(v)) err(where, `unknown stinger "${v}"`); break;
      case "sfx": if (C.sfx && !C.sfx.has(v)) err(where, `unknown sound "${v}"`); if (s.at) xy(s.at, where); break;
      case "fade": if (!["in", "out"].includes(v) && !(Number(v) >= 0 && Number(v) <= 1)) err(where, 'fade is "in", "out" or a level 0..1'); break;
      case "dialog": {
        if (!dialogIds.has(v)) err(where, `unknown dialog "${v}"`);
        else if (s.node && !C.dialog.get(v)[s.node]) err(where, `dialog "${v}" has no node "${s.node}"`);
        break;
      }
    }
  }

  /** A music state: a theme id or { theme, section, intensity }. @param {any} m @param {string} where */
  function music(m, where) {
    if (!C.score || m === undefined) return;
    const st = typeof m === "string" ? { theme: m } : m;
    if (typeof st !== "object" || st === null) { err(where, "music is a theme id or { theme, section, intensity }"); return; }
    if (st.theme && !C.score.has(st.theme)) { err(where, `unknown music theme "${st.theme}"`); return; }
    if (st.section && st.theme && !C.score.get(st.theme).sections[st.section]) err(where, `theme "${st.theme}" has no section "${st.section}"`);
    if (st.intensity !== undefined && !(st.intensity >= 0 && st.intensity <= 1)) err(where, "intensity goes from 0 to 1");
  }

  /** @param {number[]} flat @param {string} where */
  function polygon(flat, where) {
    if (!Array.isArray(flat) || flat.length < 6 || flat.length % 2 || !flat.every(Number.isFinite)) {
      err(where, "a polygon needs at least 3 points as x,y pairs"); return null;
    }
    const p = []; for (let i = 0; i < flat.length; i += 2) p.push([flat[i], flat[i + 1]]);
    let area = 0;
    for (let i = 0; i < p.length; i++) { const [a, b] = [p[i], p[(i + 1) % p.length]]; area += a[0] * b[1] - b[0] * a[1]; }
    if (Math.abs(area) < 1) err(where, "polygon has no area");
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    for (let i = 0; i < p.length; i++) for (let j = i + 2; j < p.length; j++) {
      if (i === 0 && j === p.length - 1) continue;
      const [a, b, c, d] = [p[i], p[(i + 1) % p.length], p[j], p[(j + 1) % p.length]];
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) { err(where, "polygon edges cross each other"); return p; }
    }
    return p;
  }

  for (const id of roomIds) {
    const r = C.room.get(id), w = `room ${id}`;
    if (r.name) text(r.name, w + ".name");
    if (r.background) asset(r.background, w + ".background");
    (r.walk ?? []).forEach((poly, i) => polygon(poly, `${w}.walk.${i}`));
    (r.holes ?? []).forEach((poly, i) => polygon(poly, `${w}.holes.${i}`));
    if (!(r.walk ?? []).length) warn(w, "no walkable area");
    for (const [i, p] of (r.props ?? []).entries()) {
      const pw = `${w}.props.${p.id ?? i}`;
      asset(p.image, pw);
      for (const img of Object.values(p.states ?? {})) asset(img, pw + ".states");
      xy(p.at, pw + ".at");
    }
    for (const f of r.foreground ?? []) asset(f.image, w + ".foreground");
    for (const [hid, h] of Object.entries(r.hotspots ?? {})) {
      const hw = `${w}.hotspots.${hid}`;
      if (h.name !== undefined) text(h.name, hw + ".name"); else warn(hw, "no name (the hover label shows the id)");
      if (h.poly) polygon(h.poly, hw + ".poly");
      else if (h.rect) { if (h.rect.length !== 4 || h.rect[2] <= 0 || h.rect[3] <= 0) err(hw, "rect is [x, y, w, h] with w, h > 0"); }
      else if (!(r.props ?? []).some((p) => p.id === (h.prop ?? hid))) err(hw, `no poly, rect or prop "${h.prop ?? hid}" to click on`);
      if (h.walkTo && xy(h.walkTo, hw + ".walkTo")) mustReach.get(id).push([h.walkTo[0], h.walkTo[1], hw + ".walkTo"]);
      if (h.face && !FACINGS.has(h.face)) err(hw, `unknown facing "${h.face}"`);
      cond(h.if, id, hw + ".if");
      for (const v of ["look", "talk", "use", "take"]) script(h[v], id, `${hw}.${v}`);
      for (const [it, s] of Object.entries(h.with ?? {})) { if (it !== "*") item(it, `${hw}.with`); script(s, id, `${hw}.with.${it}`); }
      if (h.exit) {
        room(h.exit.to, hw + ".exit");
        if (h.exit.at && xy(h.exit.at, hw + ".exit.at") && roomIds.has(h.exit.to)) mustReach.get(h.exit.to).push([h.exit.at[0], h.exit.at[1], hw + ".exit.at"]);
      }
    }
    script(r.enter, id, w + ".enter");
    music(r.music, w + ".music");
    room_extras(r, id, w);
  }

  /** light, effects, ambience and depth scale of a room */
  function room_extras(r, id, w) {
    const color = (c, where) => { if (c !== undefined && !/^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(c)) err(where, `colour "${c}" is not #rrggbb`); };
    if (r.light) {
      const L = r.light;
      if (L.ambient !== undefined && !(L.ambient >= 0 && L.ambient <= 2)) err(w + ".light", "ambient goes from 0 to 2");
      color(L.color, w + ".light.color");
      const ids = new Set();
      (L.lamps ?? []).forEach((l, i) => {
        const lw = `${w}.light.lamps.${l.id ?? i}`;
        xy(l.at, lw + ".at");
        if (!(l.r > 0)) err(lw, "a lamp needs a reach r > 0");
        if (l.flicker !== undefined && !(l.flicker >= 0 && l.flicker <= 1)) err(lw, "flicker goes from 0 to 1");
        color(l.color, lw + ".color");
        cond(l.if, id, lw + ".if");
        if (l.id) ids.add(l.id);
      });
      r.__lampIds = ids;
    }
    const KINDS = new Set(C.fx ? Object.keys(C.fx.kinds) : []);
    (r.fx ?? []).forEach((f, i) => {
      const fw = `${w}.fx.${i}`;
      if (!KINDS.has(f.kind)) { err(fw, `unknown effect "${f.kind}"`); return; }
      if (f.poly) polygon(f.poly, fw + ".poly");
      if (f.rect && (f.rect.length !== 4 || f.rect[2] <= 0 || f.rect[3] <= 0)) err(fw, "rect is [x, y, w, h] with w, h > 0");
      if (["haze", "dust", "rain"].includes(f.kind) && !f.poly && !f.rect) err(fw, `"${f.kind}" needs a poly or rect`);
      if (["drip", "steam"].includes(f.kind) && !xy(f.at, fw + ".at")) return;
      if (f.kind === "sparkle" && !(Array.isArray(f.points) && f.points.every((p) => Array.isArray(p) && p.length === 2))) err(fw, "sparkle needs points: [[x, y], ...]");
      color(f.color, fw + ".color");
      cond(f.if, id, fw + ".if");
      if (f.lamp && !r.__lampIds?.has(f.lamp)) err(fw, `unknown lamp "${f.lamp}"`);
    });
    delete r.__lampIds;
    for (const a of r.ambience ?? []) {
      const n = typeof a === "string" ? a : a?.sfx;
      if (C.sfx && !C.sfx.get(n)?.loop) err(w + ".ambience", `"${n}" is not a sound loop`);
    }
    if (r.scale) {
      const ok = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[1] > 0;
      if (!ok(r.scale.far) || !ok(r.scale.near)) err(w + ".scale", "scale is { far: [y, scale], near: [y, scale] }");
    }
  }

  for (const p of C.room.geometryIssues?.() ?? []) err("geometry", p);

  for (const a of C.actors.all()) {
    const d = a.def, w = `actor ${a.id}`;
    text(a.name, w + ".name");
    for (const [k, e] of Object.entries(d.costume ?? {})) {
      for (const n of typeof e === "string" ? [e] : Object.values(e ?? {})) asset(n, `${w}.costume.${k}`);
    }
    if (!d.costume?.idle) err(w, "costume needs an idle animation");
    (d.poses ?? []).forEach((p, i) => {
      cond(p.if, d.room ?? "", `${w}.poses.${i}.if`);
      for (const [k, e] of Object.entries(p)) if (k !== "if") for (const n of typeof e === "string" ? [e] : Object.values(e ?? {})) asset(n, `${w}.poses.${i}.${k}`);
    });
    if (d.portrait) asset(d.portrait, w + ".portrait");
    if (d.room) { room(d.room, w + ".room"); if (d.at && roomIds.has(d.room)) mustReach.get(d.room).push([d.at[0], d.at[1], w + ".at"]); }
    script(d.look, d.room ?? "", w + ".look");
    script(d.talk, d.room ?? "", w + ".talk");
    for (const [it, s] of Object.entries(d.with ?? {})) { if (it !== "*") item(it, w + ".with"); script(s, d.room ?? "", `${w}.with.${it}`); }
  }

  for (const id of itemIds) {
    const it = C.item.get(id), w = `item ${id}`;
    if (it.name !== undefined) text(it.name, w + ".name");
    if (it.icon) asset(it.icon, w + ".icon"); else warn(w, "no icon");
    script(it.look, "", w + ".look");
    for (const [o2, s] of Object.entries(it.combine ?? {})) { item(o2, w + ".combine"); script(s, "", `${w}.combine.${o2}`); }
  }

  for (const id of dialogIds) {
    const d = C.dialog.get(id);
    for (const [node, n] of Object.entries(d)) {
      const w = `dialog ${id}.${node}`, choices = Array.isArray(n) ? n : n.choices;
      if (!Array.isArray(choices)) { err(w, "a node is a list of choices or { enter, choices }"); continue; }
      if (!Array.isArray(n)) script(n.enter, "", w + ".enter");
      choices.forEach((c, i) => {
        text(c.text, `${w}.${i}.text`);
        cond(c.if, "", `${w}.${i}.if`);
        script(c.then, "", `${w}.${i}.then`);
        if (c.goto && c.goto !== "end" && !d[c.goto]) err(`${w}.${i}`, `goto unknown node "${c.goto}"`);
      });
    }
  }

  // acts: their rooms, actors and start steps; a demo lists acts that exist
  for (const id of actIds) {
    const a = C.act.get(id), w = `act ${id}`;
    room(a.room, w + ".room");
    if (a.actor) { actor(a.actor, w + ".actor"); if (!party.has(a.actor)) err(w + ".actor", `"${a.actor}" is not in the party`); }
    if (a.title !== undefined) text(a.title, w + ".title");
    if (a.name !== undefined) text(a.name, w + ".name");
    script(a.start, a.room, w + ".start");
  }
  for (const id of o.demo?.acts ?? []) if (!actIds.has(id)) err("demo", `unknown act "${id}"`);
  if (o.demo?.text !== undefined) text(o.demo.text, "demo.text");
  if (o.title) {
    if (o.title.room) room(o.title.room, "title.room");
    if (o.title.logo) asset(o.title.logo, "title.logo");
    if (o.title.tagline !== undefined) text(o.title.tagline, "title.tagline");
    for (const k of ["name", "footer"]) if (o.title[k] !== undefined && typeof o.title[k] !== "string") err("title." + k, "must be a string");
    if (!actIds.size) warn("title", "a title screen needs acts (Cutaway.act) to start");
  }

  // hints: conditions, lines, and what they are about (hotspots, actors, items)
  const known = new Set([...itemIds, ...actorIds, ...[...objects].flatMap(([r, ids]) => [...ids].flatMap((h) => [h, `${r}/${h}`]))]);
  (C.hints?.all() ?? []).forEach((h, i) => {
    const w = `hints.${i}`;
    cond(h.if, "", w + ".if");
    const lines = Array.isArray(h.text) ? h.text : [h.text];
    if (!lines.length) err(w, "a hint needs text");
    lines.forEach((l, j) => text(l, `${w}.text.${j}`));
    for (const a of h.about === undefined ? [] : [].concat(h.about)) if (!known.has(a)) err(w + ".about", `"${a}" is no hotspot, actor or item`);
  });

  if (C.score) {
    for (const id of C.score.ids()) for (const p of C.score.check(id)) err(`music theme ${id}`, p);
    for (const id of C.score.stingerIds()) for (const p of C.score.checkStinger(id)) err(`stinger ${id}`, p);
  }

  // reachability: every point the actors must stand on is walkable and connected
  for (const [id, pts] of mustReach) {
    if (!pts.length) continue;
    const map = C.walk.create({ walk: C.room.get(id).walk ?? [], holes: C.room.get(id).holes ?? [] });
    const [x0, y0] = pts[0];
    for (const [x, y, where] of pts) {
      if (!map.inside({ x, y })) { err(where, `[${x}, ${y}] is outside the walkable area of "${id}"`); continue; }
      const p = map.path({ x: x0, y: y0 }, { x, y }), end = p[p.length - 1] ?? { x: x0, y: y0 };
      if (Math.hypot(end.x - x, end.y - y) > 1) err(where, `[${x}, ${y}] can't be reached from [${x0}, ${y0}] in "${id}"`);
    }
  }

  for (const f of flagsTested) if (!f.startsWith("~") && !flagsSet.has(f)) err("flags", `flag "${f}" is tested but never set`);
  for (const f of flagsSet) if (!flagsTested.has(f)) warn("flags", `flag "${f}" is set but never tested`);

  // strings: "@keys" must exist in every language; literal texts need a translation in every other one
  const langs = o.languages ?? [C.i18n.language];
  for (const k of keys) for (const l of langs) if (!(k in C.i18n.strings(l))) err("strings", `"@${k}" missing in "${l}"`);
  for (const l of langs.slice(1)) {
    const table = C.i18n.strings(l), missing = [...texts].filter((t) => !(t in table));
    if (missing.length) warn("strings", `${missing.length} of ${texts.size} texts not translated to "${l}", e.g. ${missing.slice(0, 3).map((t) => JSON.stringify(t)).join(", ")}`);
  }
  return { issues, texts, flags: { set: flagsSet, tested: flagsTested } };
}
