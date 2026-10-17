// Cutaway.js party: several playable characters ("new kid" in the Maniac Mansion sense).
// Each actor keeps their own room, position and inventory. Portraits at the top left show who can
// be played; click one (or press 1-9) to switch. Scripts lock and unlock members per story section:
//   { switch: "bolt" }  { lock: "bolt" }  { unlock: "bolt" }
// With `follow` on (Cutaway.start({ follow: true })), members in the same room go along when the
// active one changes rooms; one who is busy stays behind: { stay: "bolt" } ... { follow: "bolt" }.
"use strict";

/**
 * Portrait strip layout. With `framed: false` the game's portrait sprites include their own frame,
 * and actors may name a `portraitActive` sprite for the active member.
 * nameY: where the active name goes, below the top of the strip.
 * @typedef {{x: number, y: number, step: number, size: number, framed: boolean, nameY: number}} PortraitLayout
 */

Cutaway.party = (function () {
  /** @type {PortraitLayout} */
  const L = { x: 3, y: 3, step: 22, size: 20, framed: true, nameY: 23 };
  /** @type {string[]} */
  let members = [];
  /** @type {Set<string>} */
  let locked = new Set();
  /** @type {Set<string>} members who don't follow right now */
  let staying = new Set();
  let follow = false;

  function playable() { return members.filter((m) => !locked.has(m)); }
  function visibleNow() { return playable().length > 1 && !!Cutaway.scene.active && !Cutaway.script.busy && Cutaway.inventory.openness === 0; }

  /** @param {number} x @param {number} y @returns {string | null} */
  function memberAt(x, y) {
    if (!visibleNow() || y < L.y || y >= L.y + L.size) return null;
    const list = playable(), i = Math.floor((x - L.x) / L.step);
    return i >= 0 && i < list.length && x - L.x - i * L.step < L.size ? list[i] : null;
  }

  /**
   * Make another member the active one; shows their room.
   * @param {string} id
   */
  async function switchTo(id) {
    const a = Cutaway.actors.get(id);
    if (!a || !a.room) throw new Error(`Cutaway: can't switch to "${id}"`);
    Cutaway.ui.hold(null);
    const prev = Cutaway.scene.active, other = a.room !== Cutaway.scene.room?.id;
    if (prev && prev.state === "walk") prev.stop();
    if (other) await Cutaway.fx.transition("out");
    Cutaway.scene.setActive(id);
    if (other) { const loaded = Cutaway.scene.load(a.room); Cutaway.fx.transition("in"); await loaded; }
    Cutaway.events.emit("party.switch", { id });
  }

  /** @type {UiLayer} */
  const layer = {
    z: 30,
    click(p) {
      const id = memberAt(p.x, p.y);
      if (!id) return false;
      if (id !== Cutaway.scene.active?.id) switchTo(id);
      return true;
    },
    hover(x, y) {
      const id = memberAt(x, y);
      return id ? Cutaway.i18n.t(Cutaway.actors.get(id)?.name ?? id) : undefined;
    },
    render(ctx) {
      if (!visibleNow()) return;
      const s = Cutaway.ui.style, active = Cutaway.scene.active?.id;
      playable().forEach((id, i) => {
        const a = Cutaway.actors.get(id), x = L.x + i * L.step, y = L.y, on = id === active;
        const inset = L.framed ? 1 : 0;
        if (L.framed) {
          ctx.fillStyle = on ? s.accent : s.outline;
          ctx.fillRect(x, y, L.size, L.size);
          ctx.fillStyle = s.panel;
          ctx.fillRect(x + 1, y + 1, L.size - 2, L.size - 2);
        }
        const p = (on && a?.def.portraitActive) || a?.def.portrait;
        if (p && Cutaway.assets.has(p)) Cutaway.assets.draw(ctx, p, x + inset, y + inset, { anchor: [0, 0] });
        else Cutaway.ui.font().draw(ctx, (a?.name ?? id).slice(0, 1), x + L.size / 2, y + 7, { align: "center", color: a?.color ?? "#fff" });
      });
      const a = Cutaway.scene.active;
      if (a) Cutaway.ui.font().draw(ctx, Cutaway.i18n.t(a.name), L.x, L.y + L.nameY, { color: a.color, outline: s.outline });
    },
  };

  /** @param {Record<string, any>} s */
  function lockStep(s) { locked.add(s.lock); }

  return {
    switchTo,
    /** Set who belongs to the party (all playable unless locked). @param {string[]} ids */
    set(ids) { members = ids.slice(); },
    /** @param {string} id */
    has(id) { return members.includes(id); },
    members() { return members.slice(); },
    playable,
    /** @param {string} id */
    lock(id) { locked.add(id); },
    /** @param {string} id */
    unlock(id) { locked.delete(id); },
    /** Screen centre of a member's portrait (for tools), or null. @param {string} id */
    portraitPoint(id) {
      const i = playable().indexOf(id);
      return i < 0 || !visibleNow() ? null : { x: L.x + i * L.step + Math.floor(L.size / 2), y: L.y + Math.floor(L.size / 2) };
    },
    /** Change the portrait strip's layout. @param {Partial<PortraitLayout>} o */
    layout(o) { Object.assign(L, o); },
    snapshot() { return { members: members.slice(), locked: [...locked], staying: [...staying] }; },
    /** @param {{members: string[], locked: string[], staying?: string[]}} d */
    restore(d) { members = d.members.slice(); locked = new Set(d.locked); staying = new Set(d.staying ?? []); },
    /** Members go along with the active one through doors. @param {boolean} on */
    setFollow(on) { follow = on; },
    /**
     * Who goes along when `leader` leaves `room`: unlocked members there who aren't staying behind.
     * @param {string | null | undefined} room @param {string | undefined} leader
     */
    followers(room, leader) {
      if (!follow || !room) return [];
      return members.filter((m) => m !== leader && !locked.has(m) && !staying.has(m) && Cutaway.actors.get(m)?.room === room);
    },
    /** @param {string} id */
    isStaying(id) { return staying.has(id); },
    init() {
      Cutaway.ui.addLayer(layer);
      Cutaway.script.action("switch", (s) => switchTo(s.switch));
      Cutaway.script.action("lock", lockStep);
      Cutaway.script.action("unlock", (s) => { locked.delete(s.unlock); });
      Cutaway.script.action("stay", (s) => { staying.add(s.stay); });
      Cutaway.script.action("follow", (s) => { staying.delete(s.follow); });
      Cutaway.events.on("key", (k) => {
        const n = Number(k.key);
        if (n >= 1 && n <= 9 && !Cutaway.script.busy && playable()[n - 1]) switchTo(playable()[n - 1]);
      });
    },
  };
})();
