// Cutaway.js editor, State tab: the game in progress, to test from anywhere (the developer's menu).
// Who is played and where, go to any room, begin an act, the flags (change, add, remove), the backpack
// (give, take), what is hidden and the states of the room's things, the rooms visited, the hint for
// now, and a quick save slot ("dev") to come back to.
"use strict";

(function () {
  const E = Cutaway.editor, el = E.el, button = E.button;
  const st = { font: "inherit", background: "#221c30", color: "#eee", border: "1px solid #4a4066" };
  /** @param {string[]} opts @param {string} v @param {(v: string) => void} set @param {string} [none] */
  const select = (opts, v, set, none) => el("select", { style: st, onchange: (/** @type {any} */ e) => set(e.target.value) },
    [...(none !== undefined ? [none] : []), ...opts].map((o) => el("option", { value: o === none ? "" : o, textContent: o, selected: o === v })));
  /** @param {string} title @param {(Node | string)[]} kids */
  const section = (title, kids) => el("div", { style: { marginTop: "6px", borderTop: "1px solid #3a3350", paddingTop: "3px" } },
    [el("div", { style: { color: "#ffe14a" } }, [title]), ...kids]);

  /** Go to a room with the active actor, standing near where they stood (on that room's floor). @param {string} id */
  async function goTo(id) {
    const a = Cutaway.scene.active, r = Cutaway.room.get(id);
    if (!a) { await E.openRoom(id); return; }
    const map = Cutaway.walk.create({ walk: r.walk ?? [], holes: r.holes ?? [] }), p = map.nearest({ x: a.x, y: a.y }) ?? { x: a.x, y: a.y };
    await Cutaway.scene.go(id, [Math.round(p.x), Math.round(p.y)], undefined, { follow: false });
    await E.openRoom(id);
  }

  function build(/** @type {HTMLElement} */ box) {
    const S = Cutaway.state, snap = S.snapshot(), a = Cutaway.scene.active, room = Cutaway.scene.room;
    // who and where
    box.append(section("who and where", [
      el("div", {}, ["playing ", select(Cutaway.party.members(), a?.id ?? "", (v) => { if (v) Cutaway.party.switchTo(v).then(() => E.refresh()); }),
        " in ", select(Cutaway.room.ids(), room?.id ?? "", (v) => { goTo(v).then(() => E.refresh()); })]),
      el("div", {}, Cutaway.party.members().map((m) => {
        const x = Cutaway.actors.get(m), locked = !Cutaway.party.playable().includes(m);
        return el("div", {}, [`${m}: ${x?.room ?? "(nowhere)"} `, button(locked ? "unlock" : "lock", () => { if (locked) Cutaway.party.unlock(m); else Cutaway.party.lock(m); E.refresh(); }),
          button("bring here", () => { if (x && room && a) { x.place(room.id, Math.round(a.x + 16), Math.round(a.y), a.facing); E.refresh(); } }, "put them beside the one played")]);
      })),
      ...(Cutaway.act.ids().length ? [el("div", {}, ["act ", select(Cutaway.act.ids(), Cutaway.acts.current ?? "", (v) => { if (v && confirm(`Begin ${v} as a new game?`)) { E.close(); Cutaway.acts.begin(v, { fresh: true }); } }),
        " (begins it as a new game)"])] : []),
    ]));
    // flags
    const flags = Object.entries(snap.flags).sort(([x], [y]) => x.localeCompare(y));
    const name = /** @type {HTMLInputElement} */ (el("input", { placeholder: "flag", style: { ...st, width: "120px" } }));
    const val = /** @type {HTMLInputElement} */ (el("input", { placeholder: "true", style: { ...st, width: "60px" } }));
    box.append(section(`flags (${flags.length})`, [
      ...flags.map(([k, v]) => el("div", {}, [
        el("input", { value: String(v), style: { ...st, width: "60px" }, onchange: (/** @type {any} */ e) => { const t = e.target.value; S.set(k, t === "true" ? true : t === "false" ? false : isNaN(Number(t)) || t === "" ? t : Number(t)); } }),
        ` ${k} `, button("x", () => { S.unset(k); E.refresh(); }, "unset")])),
      el("div", {}, [name, " = ", val, " ", button("set", () => { if (name.value.trim()) { const t = val.value.trim(); S.set(name.value.trim(), t === "" || t === "true" ? true : isNaN(Number(t)) ? t : Number(t)); E.refresh(); } })]),
    ]));
    // the backpack (the active actor's bag)
    const items = S.items();
    box.append(section(`${a ? a.id + "'s" : "the"} bag`, [
      ...items.map((i) => el("div", {}, [`${i} `, button("take away", () => { S.remove(i); E.refresh(); })])),
      el("div", {}, ["give ", select(Cutaway.item.ids().filter((i) => !items.includes(i)), "", (v) => { if (v) { S.give(v); E.refresh(); } }, "(an item)")]),
    ]));
    // this room's things: hidden, states
    if (room) {
      const things = [...(room.props ?? []).filter((p) => p.id).map((p) => ({ id: /** @type {string} */ (p.id), hidden: !!p.hidden })),
        ...Object.entries(room.hotspots ?? {}).map(([id, h]) => ({ id, hidden: !!h.hidden }))].filter((t, i, l) => l.findIndex((u) => u.id === t.id) === i);
      box.append(section(`${room.id}: shown, hidden, states`, things.map((t) => el("div", {}, [
        el("input", { type: "checkbox", checked: !S.isHidden(t.id, t.hidden), onchange: (/** @type {any} */ e) => S.setHidden(t.id, !e.target.checked) }), ` ${t.id} `,
        el("input", { value: S.objState(t.id), placeholder: "state", style: { ...st, width: "70px" }, onchange: (/** @type {any} */ e) => S.setObjState(t.id, e.target.value) })]))));
    }
    // rooms visited, the hint, a save slot
    box.append(section("visited", [el("div", {}, Cutaway.room.ids().map((r) => el("label", { style: { marginRight: "8px" } }, [
      el("input", { type: "checkbox", checked: S.visited(r), onchange: (/** @type {any} */ e) => { const d = S.snapshot(); if (e.target.checked) d.visited[r] = true; else delete d.visited[r]; S.restore(d); } }), r])))]));
    const h = Cutaway.hints.current();
    if (Cutaway.hints.any()) box.append(section("the hint for now", [h ? (Array.isArray(h.text) ? h.text : [h.text]).map((t) => Cutaway.i18n.t(t)).join("\n") : "(none holds)"]));
    box.append(section("save slot \"dev\"", [el("div", {}, [button("Save here", () => { E.setStatus(Cutaway.save.write("dev") ? "saved in the slot \"dev\"" : "nothing to save"); }),
      button("Load it", async () => { if (await Cutaway.save.load("dev")) { await E.openRoom(Cutaway.scene.room?.id ?? ""); E.setStatus("loaded \"dev\""); } else E.setStatus("the slot \"dev\" is empty"); }),
      button("Refresh", () => E.refresh())])]));
  }

  E.tab({ id: "state", label: "State", build });
})();
