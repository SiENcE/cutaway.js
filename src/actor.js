// Cutaway.js actors: characters with a position, a facing, and walk/idle/talk animations.
// A costume names one animation per state. A plain name is a side view facing right; the engine
// mirrors it for left. Per-direction animations ({ right, left, up, down }) are used when present:
// with `up` and `down` walks, an actor going mostly up or down the screen shows its back or front.
// Actors walk along the room's walk map at a per-axis speed (slower up and down the screen, which
// reads as depth), keep their walk cycle running between waypoints and are drawn on whole pixels.
"use strict";

/**
 * @typedef {string | {right?: string, left?: string, up?: string, down?: string}} CostumeEntry
 * @typedef {{idle: CostumeEntry, walk?: CostumeEntry, talk?: CostumeEntry, [key: string]: CostumeEntry | undefined}} Costume
 * @typedef {"right" | "left" | "up" | "down"} Facing
 */
/**
 * @typedef {object} ActorDef
 * @property {string} [name]       display name
 * @property {string} [color]      subtitle colour
 * @property {Costume} costume
 * @property {[number, number]} [speed]  pixels per second along x and y (default [24, 12])
 * @property {number} [run]        running speed as a multiple of walking (default 2; double click, { walk, run: true })
 * @property {string} [room]       where the actor starts
 * @property {[number, number]} [at]
 * @property {Facing} [facing]
 * @property {string} [portrait]   sprite for the party portraits
 * @property {string} [portraitActive]  sprite while this actor is the active one (frames drawn by the game)
 * @property {boolean} [hidden]    not clickable
 * @property {VoiceProfile} [voice] how the actor's blips sound
 * @property {Script} [look]       when another actor is in control: right click
 * @property {Script} [talk]       left click
 * @property {Record<string, Script>} [with]  an item used on this actor (party members take items by default)
 * @property {({if: Cond} & Partial<Costume>)[]} [poses]  costume entries that apply while a condition holds
 *                                 (the first match wins), e.g. { if: "on_sofa", idle: "cody_sit_r" }
 */

/** Define an actor: `Cutaway.actor("mikey", { costume: { idle: "mikey_idle_r", walk: "mikey_walk_r" } })`. */
Cutaway.actor = (function () {
  class Actor {
    /** @param {string} id @param {ActorDef} def */
    constructor(id, def) {
      this.id = id;
      this.def = def;
      this.name = def.name ?? id;
      this.color = def.color ?? "#fff";
      this.costume = def.costume;
      this.speed = def.speed ?? [24, 12];
      /** @type {string | null} */
      this.room = def.room ?? null;
      this.x = def.at?.[0] ?? 0;
      this.y = def.at?.[1] ?? 0;
      /** @type {Facing} */
      this.facing = def.facing ?? "right";
      /** @type {string} "idle", "walk", "talk" or any other costume key played with playOnce */
      this.state = "idle";
      /** @type {(() => void) | null} */
      this.onceDone = null;
      this.t = 0;                                   // time in the current animation, ms
      /** @type {{x: number, y: number}[]} */
      this.path = [];
      /** @type {(() => void)[]} */
      this.arrived = [];
      /** running to the current target (faster, with a quicker stride) */
      this.running = false;
    }

    /**
     * Put the actor somewhere without walking.
     * @param {string | null} room
     * @param {number} x
     * @param {number} y
     * @param {Facing} [facing]
     */
    place(room, x, y, facing) {
      this.room = room; this.x = x; this.y = y; this.path = [];
      if (facing) this.facing = facing;
      this.setState("idle");
    }

    /** @param {string} s */
    setState(s) { if (this.state !== s) { this.state = s; this.t = 0; } }

    /**
     * Play a costume animation once (e.g. "reach"), then return to idle.
     * @param {string} k
     * @returns {Promise<void>}
     */
    playOnce(k) {
      this.path = [];
      this.setState(k);
      this.t = 0;
      return new Promise((resolve) => { this.onceDone = resolve; });
    }

    /** Height of the current frame in pixels, scaled with depth (subtitles go above it). */
    height() {
      const a = Cutaway.assets.get(this.look().anim);
      return a ? Cutaway.assets.scaled(Cutaway.assets.frameAt(a, this.t), this.scale()).h : 32;
    }

    /** Scale by depth in the current room (1 elsewhere or in rooms without a `scale`). */
    scale() { return this.room && this.room === Cutaway.scene.room?.id ? Cutaway.scene.scaleAt(this.y) : 1; }

    /**
     * Walk (or run) to a point through the current room's walk map. Resolves on arrival (or when stopped).
     * @param {number} x
     * @param {number} y
     * @param {boolean} [run]
     * @returns {Promise<void>}
     */
    walkTo(x, y, run = false) {
      this.running = run;
      const map = this.room === Cutaway.scene.room?.id ? Cutaway.scene.walkMap : null;
      this.path = map ? map.path({ x: this.x, y: this.y }, { x, y }) : [{ x, y }];
      for (const done of this.arrived.splice(0)) done();      // a new walk ends the previous one
      if (!this.path.length) { this.setState("idle"); return Promise.resolve(); }
      if (this.state !== "walk") this.setState("walk");
      return new Promise((resolve) => this.arrived.push(resolve));
    }

    stop() {
      this.path = [];
      this.running = false;
      this.setState("idle");
      for (const done of this.arrived.splice(0)) done();
    }

    /** @param {Facing} f */
    face(f) { this.facing = f; }

    /**
     * The facing for a step: up or down the screen if it goes more that way than sideways and the
     * costume has those views, else left or right (or as before, for a step straight up without them).
     * @param {number} dx @param {number} dy @returns {Facing}
     */
    heading(dx, dy) {
      const w = this.costume.walk, v = dy < 0 ? "up" : "down";
      if (Math.abs(dy) > Math.abs(dx) && w && typeof w === "object" && w[v]) return v;
      return Math.abs(dx) >= 1 ? (dx > 0 ? "right" : "left") : this.facing;
    }

    /** @param {number} dt ms */
    update(dt) {
      const run = this.running && this.state === "walk" ? this.def.run ?? 2 : 1;
      this.t += dt * (run > 1 ? 0.6 + 0.4 * run : 1);              // running: a quicker stride, not twice as quick
      dt *= run;
      if (this.onceDone) {
        const a = Cutaway.assets.get(this.look().anim);
        if (!a || this.t >= a.total) { const done = this.onceDone; this.onceDone = null; this.setState("idle"); done(); }
        return;
      }
      if (this.state !== "walk") return;
      let budget = dt / 1000;                        // seconds of walking left in this step
      while (budget > 0 && this.path.length) {
        const p = this.path[0], dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
        if (d < 1e-6) { this.path.shift(); continue; }
        // speed along this direction: an ellipse between the x and y speeds
        const ux = dx / d, uy = dy / d;
        const v = this.scale() / Math.hypot(ux / this.speed[0], uy / this.speed[1]);   // further away = slower
        this.facing = this.heading(dx, dy);
        const step = v * budget;
        if (step >= d) { this.x = p.x; this.y = p.y; this.path.shift(); budget -= d / v; }
        else { this.x += ux * step; this.y += uy * step; budget = 0; }
      }
      if (!this.path.length) {
        this.running = false;
        this.setState("idle");
        for (const done of this.arrived.splice(0)) done();
        Cutaway.events.emit("actor.arrived", { id: this.id });
      }
    }

    /** The animation name and mirroring for the current state and facing. */
    look() {
      const pose = this.def.poses?.find((p) => p[this.state] !== undefined && Cutaway.state.test(p.if));
      const entry = pose?.[this.state] ?? this.costume[this.state] ?? this.costume.idle;
      if (typeof entry === "string") return { anim: entry, flip: this.facing === "left" };
      const f = this.facing;
      if (entry[f]) return { anim: /** @type {string} */ (entry[f]), flip: false };
      if (f === "left" && entry.right) return { anim: entry.right, flip: true };
      if (f === "right" && entry.left) return { anim: entry.left, flip: true };
      const side = entry.right ?? entry.left ?? entry.down ?? entry.up ?? "";
      return { anim: side, flip: !entry.right && !!entry.left };
    }

    /** The room box of the current frame: [x, y, w, h]. @returns {[number, number, number, number]} */
    box() {
      const { anim, flip } = this.look(), a = Cutaway.assets.get(anim);
      if (!a) return [Math.round(this.x) - 8, Math.round(this.y) - 32, 16, 32];
      const f = Cutaway.assets.frameAt(a, this.t), s = Cutaway.assets.scaled(f, this.scale(), a.anchor);
      return [Math.round(this.x) - (flip ? s.w - 1 - s.ax : s.ax), Math.round(this.y) - s.ay, s.w, s.h];
    }

    /**
     * Draw the actor, tinted by the light where it stands (the scene passes the room's light).
     * @param {CanvasRenderingContext2D} ctx
     * @param {[number, number, number]} [light]
     */
    draw(ctx, light) {
      const { anim, flip } = this.look(), scale = this.scale();
      if (!light) { Cutaway.assets.draw(ctx, anim, Math.round(this.x), Math.round(this.y), { t: this.t, flip, scale }); return; }
      const [x, y, w, h] = this.box(), a = Cutaway.assets.get(anim);
      if (!a) return;
      const s = Cutaway.assets.scaled(Cutaway.assets.frameAt(a, this.t), scale, a.anchor);
      Cutaway.light.drawTinted(ctx, (c, left, top) => Cutaway.assets.draw(c, anim, left + (flip ? s.w - 1 - s.ax : s.ax), top + s.ay, { t: this.t, flip, scale }), [x, y, w, h], light);
    }
  }

  /** @type {Map<string, Actor>} */
  const all = new Map();

  /**
   * @param {string} id
   * @param {ActorDef} def
   */
  function actor(id, def) {
    const a = new Actor(id, def);
    all.set(id, a);
    return a;
  }
  actor.Actor = Actor;
  actor.registry = all;
  return actor;
})();

/** Look up actors at runtime. */
Cutaway.actors = (function () {
  return {
    /** @param {string} id */
    get(id) {
      const a = Cutaway.actor.registry.get(id);
      return a ?? null;
    },
    all() { return [...Cutaway.actor.registry.values()]; },
  };
})();
