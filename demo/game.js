// The Cutaway.js demo: original placeholder content used to develop and test the engine.
// Pip and Bolt, two small robots, want to switch on the lamp in the yard.
//   The door to the yard is locked; the key is in a jar on the shelf, which only tall Bolt can reach.
//   In the yard, the mailbox holds a dusty bulb; Pip's plastic leaf polishes it; the clean bulb
//   goes into the lamp post, and the demo ends. It is one act, with a title screen and hints.
// Before the title: a click to let sound start (the gate, in browsers) and, the first time, a short
// intro (a sequence: the hall, a tilt down a tall shot room with a parallax lamp post, the yard).
"use strict";
(function () {
  // fixed: it stays in the bag, a click only looks at it
  Cutaway.item("sticker", { name: "Pip's sticker", icon: "inv_leaf", fixed: true, look: "Pip's sticker. It stays in the bag." });
  Cutaway.item("key", { name: "key", icon: "inv_key", look: "A small brass key." });
  Cutaway.item("leaf", { name: "plastic leaf", icon: "inv_leaf", look: "Plastic. Dusty. Surprisingly soft." });
  Cutaway.item("bulb", { name: "dusty bulb", icon: "inv_bulb", look: "A light bulb under a fur of dust.",
    combine: { leaf: [{ remove: "bulb" }, { give: "bulb_clean" }, { set: "bulb_polished" }, "A quick polish with the leaf... shiny!"] } });
  Cutaway.item("bulb_clean", { name: "light bulb", icon: "inv_bulb_clean", look: "Clean and ready to shine." });

  Cutaway.room("hall", {
    name: "Hall",
    background: "hall_bg",
    // the hall's tune comes from the shelf (a radio up there, say): fuller and more to that side the nearer one is
    music: { theme: "hall", intensity: 0.4, at: [58, 60], reach: 420, near: 60 },
    // the art is flat (unlit): the sunlight through the window is added at runtime, with a hazy beam
    light: { ambient: 1, lamps: [{ id: "sun", at: [158, 142], r: 46, power: 1.12, color: "#fff4d8", add: true }] },
    fx: [
      { kind: "haze", poly: [119, 72, 181, 72, 214, 150, 104, 150], color: "#fff6dc", alpha: 0.16, fade: 0.25 },
      { kind: "dust", poly: [119, 72, 181, 72, 214, 150, 104, 150], count: 18, color: "#fffbe8" },
      { kind: "sparkle", points: [[126, 26], [171, 52], [137, 61]], every: 2600 },
    ],
    walk: [[6, 124, 314, 124, 318, 177, 2, 177]],
    holes: [
      [138, 139, 182, 139, 182, 153, 138, 153],     // the crate's footprint
      [31, 166, 49, 166, 49, 175, 31, 175],         // the plant pot
    ],
    props: [
      { id: "crate", image: "crate", at: [160, 151] },
      { id: "plant", image: "plant", at: [40, 174] },
      // the door stands open once it is unlocked: a condition, no state of the prop's own
      { id: "door", image: "hall_door_open", at: [284, 119], baseline: 0, if: "door_open" },
    ],
    hotspots: {
      window: { name: "window", rect: [118, 20, 64, 52], walkTo: [150, 128], face: "up",
        look: "Clouds. Lots of them.", use: ["It doesn't open.", "Somebody painted it shut."] },
      shelf: { name: "shelf", rect: [28, 36, 60, 20], walkTo: [58, 130],
        look: "Jars of bolts, nuts and one suspicious pickle.",
        use: [{ if: "is:bolt", then: [{ if: "!got_key", then: [{ give: "key" }, { set: "got_key" }, { stinger: "discovery" }, "A key, in the pickle jar. Of course."],
          else: "Just bolts and nuts now." }], else: "I'm too short to reach anything up there." }] },
      logbook: { name: "logbook", rect: [200, 44, 40, 30], walkTo: [220, 130], face: "up", look: "The hall's logbook. Mostly weather.", use: [{ logbook: true }] },
      crate: { name: "crate", walkTo: [160, 158], look: "A big crate. It says THIS WAY UP on the bottom.",
        use: [{ once: ["Locked tight."], else: "Still locked." }] },
      plant: { name: "plant", walkTo: [58, 170], face: "left", look: "A plastic fern. Low maintenance.",
        take: [{ take: "leaf" }, { stinger: "pickup" }, "A plastic leaf. Might be useful. Probably not."] },
      door: { name: "door", if: "!door_open", rect: [262, 30, 44, 89], walkTo: [284, 130], face: "up",
        look: "The door to the yard.", use: "Locked.",
        with: { key: [{ remove: "key" }, { sfx: "door", at: [284, 100] }, { set: "door_open" }, { music: { intensity: 0.75 } }, "Click. Open!"] } },
      doorway: { name: "yard", if: "door_open", rect: [262, 30, 44, 89], walkTo: [284, 130],
        look: "Sunshine out there.", exit: { to: "yard", at: [40, 150], face: "right" } },
    },
    enter: [{ if: "!visited:hall", then: ["Morning, hall.", { say: "bolt", text: "Morning, Pip." }, "Let's get the lamp in the yard working."] }],
  });

  // the little radio on the mailbox: a tune at a place, its theme in demo/music.js, through a small speaker
  Cutaway.sfx.define("mailbox_radio", { loop: { theme: "mailbox_radio", speaker: 1, gain: 0.5 } });
  Cutaway.room("yard", {
    name: "Yard",
    background: "yard_bg",
    music: { theme: "yard", intensity: 0.5 },
    // the wind everywhere; the lamp post's transformer hums where it stands
    // ... and a little radio on the mailbox plays its own tune, heard as Pip comes near (a tune at a place: demo/music.js)
    ambience: [{ sfx: "wind", gain: 0.6 }, { sfx: "hum", gain: 1.5, at: [270, 120], reach: 160 }, { sfx: "mailbox_radio", at: [200, 140], reach: 120 }],
    scale: { far: [126, 0.86], near: [177, 1] },
    // the lamp post's light is not in the art: it comes on with the lamp (an added, flickering lamp)
    light: { lamps: [{ id: "lamp", at: [270, 80], r: 46, power: 1.15, color: "#ffe28a", flicker: 0.06, add: true, glow: 9, if: "state:lamp=lit" }] },
    fx: [{ kind: "dust", rect: [250, 60, 40, 50], count: 10, color: "#fff2b0", lamp: "lamp" }],
    walk: [[6, 134, 52, 134, 316, 126, 316, 177, 4, 177]],
    holes: [[193, 145, 207, 145, 207, 152, 193, 152]],
    // passers-by (extras.js), drawn with the robots' own sprites as placeholders: one paces along the fence and back, one
    // crosses the front, one stands about and turns now and then; all of them make way for Pip and for each other
    extras: [
      { costume: { idle: "bolt_idle_r", walk: "bolt_walk_r" }, at: [70, 140], path: [[300, 134]], loop: "back", speed: [14, 7], pause: 900, space: [9, 4] },
      { costume: { idle: "pip_idle_r", walk: "pip_walk_r" }, at: [296, 170], facing: "left", path: [[30, 168], [120, 160]], speed: [18, 9], space: [7, 4] },
      { costume: { idle: "pip_idle_r" }, at: [112, 152], facing: "right", space: [7, 4] },
      // one stands up on the crate in the middle of the yard, where nobody walks (apart: on purpose, not a mistake)
      { costume: { idle: "bolt_idle_r" }, at: [200, 148], facing: "left", apart: true },
    ],
    props: [
      { id: "mailbox", image: "mailbox", states: { open: "mailbox_open" }, at: [200, 150] },
      // whoever walks behind the lamp post shows through it
      { id: "lamp", image: "lamppost", states: { lit: "lamppost_lit" }, at: [270, 140], seeThrough: true },
      // a projection hanging in the air, in front of everyone: only partly there
      { id: "holo", image: "bolt_walk_r", at: [130, 112], baseline: 999, alpha: 0.35 },
    ],
    hotspots: {
      door: { name: "door", rect: [10, 62, 34, 72], walkTo: [28, 140], face: "up", look: "Back into the hall.",
        exit: { to: "hall", at: [284, 132], face: "left" } },
      mailbox: { name: "mailbox", walkTo: [186, 156], face: "right", look: "Our mailbox. Red, like all good mailboxes.",
        use: [{ if: "!state:mailbox=open", then: [{ state: "mailbox", value: "open" }, { sfx: "creak", at: [200, 140] },
          { if: "!got_bulb", then: [{ give: "bulb" }, { set: "got_bulb" }, { stinger: "pickup" }, "No letters. But a light bulb!"], else: "Empty." }],
          else: [{ state: "mailbox", value: "" }, "Closed again."] }] },
      lamp: { name: "lamp post", walkTo: [256, 150], face: "right", look: "The lamp is dark. Its bulb is missing.",
        use: "No bulb, no light.",
        with: {
          bulb: "Too dusty. It would never shine like that.",
          bulb_clean: [{ remove: "bulb_clean" }, { state: "lamp", value: "lit" }, { stinger: "discovery" }, { music: { intensity: 1 } }, "Let there be light!",
            { say: "bolt", text: "Nice work, Pip." }, { end: "The lamp shines. Thanks for playing the Cutaway.js demo!" }],
        } },
      hills: { name: "hills", rect: [60, 78, 260, 18], look: "Hills. They go on for a while.",
        use: ["Looking at the hills always helps me think.", { hint: true }] },   // a thing that gives the hints
    },
    enter: [{ if: "!visited:yard", then: ["Fresh air!"] }],
  });

  // a room that is only a shot of the intro: taller than the screen, so the camera can tilt down it;
  // the lamp post in front (depth 1.4) rises faster than the hills behind it
  Cutaway.room("intro_sky", {
    name: "Sky", color: "#79c6ee", size: [320, 300],
    props: [
      { id: "hills", image: "yard_bg", at: [0, 120], anchor: [0, 0], baseline: 0 },
      { id: "walker", image: "bolt_walk_r", at: [-20, 278] },
      { id: "post", image: "lamppost", at: [36, 348], depth: 1.4 },
    ],
    // clouds drifting across the sky, two bands at their own speeds (the effect "mist": a texture drifting inside its area)
    fx: [
      { kind: "mist", image: "cloud_band", rect: [0, 0, 320, 130], at: [0, 24], drift: [-6, 0], alpha: 0.9 },
      { kind: "mist", image: "cloud_band", rect: [0, 0, 320, 130], at: [40, 70], drift: [-11, 0], alpha: 0.6, bob: 2 },
    ],
  });

  Cutaway.sequence("intro", {
    steps: [
      { shot: "hall" },
      { goto: "hall", transition: false },
      { letterbox: true, ms: 600 },
      { caption: "Somewhere, a small house.", type: true, blip: "_tick", ms: 1400 },
      { shot: "sky" },
      { goto: "intro_sky", transition: "dissolve", dissolve: 700 },
      { move: "walker", by: [190, 0], ms: 3600, ease: "linear", wait: false },
      { camera: [0, 120], ms: 2600 },
      { caption: "Outside, a lamp post without a bulb.", at: "tr", type: true, blip: "_tick", ms: 1400 },
      { shot: "yard" },
      { goto: "yard", transition: "dissolve", dissolve: 700 },
      { letterbox: false, ms: 600 },
      { wait: 500 },
      { fade: "out", ms: 400 },
    ],
  });

  Cutaway.dialog("bolt", {
    main: [
      { text: "How are you, Bolt?", then: [{ say: "bolt", text: "Rusty, but cheerful." }] },
      { text: "Can you reach the shelf?", if: "!got_key", once: true, goto: "shelf" },
      { text: "Bye.", goto: "end" },
    ],
    shelf: {
      enter: [{ say: "bolt", text: "With my long legs? Easy." }],
      choices: [
        { text: "There must be a key up there.", then: [{ say: "bolt", text: "Switch to me and I'll have a look." }], goto: "main" },
        { text: "Never mind.", goto: "main" },
      ],
    },
  });

  Cutaway.actor("pip", {
    name: "Pip", color: "#5af0c0", room: "hall", at: [90, 160], portrait: "pip_portrait",
    costume: { idle: "pip_idle_r", walk: "pip_walk_r", talk: "pip_talk_r" },
    speed: [16, 8],
    // out in the yard's wind she hurries (a pose's speed; a pose's walk would also decide the ways a step turns her)
    poses: [{ if: "at:pip=yard", speed: [24, 12] }],
    voice: { pitch: 74, range: 4, wave: "square", syllable: 65, speed: 1.15, gain: 0.2, formant: 1.15 },
    look: "Pip. Small, but full of ideas.", talk: [{ say: "pip", text: "Need anything, Bolt?" }, "Just checking on you."],
  });
  Cutaway.actor("bolt", {
    name: "Bolt", color: "#ffa060", room: "hall", at: [230, 150], facing: "left", portrait: "bolt_portrait",
    costume: { idle: "bolt_idle_r", walk: "bolt_walk_r", talk: "bolt_talk_r" },
    speed: [18, 9],
    voice: { pitch: 57, range: 3, wave: "saw", syllable: 85, speed: 0.9, gain: 0.2, formant: 0.9 },
    // Pip talks to him from in front of him, a little to his left (not wherever she happens to come from)
    walkTo: [204, 154], face: "right",
    look: "Bolt. Tall, orange and very polite.", talk: [{ say: "bolt", text: "Yes, Pip?" }, { dialog: "bolt" }],
  });

  // A German table shows the language switch (?lang=de or the menu). Missing lines would stay English.
  Cutaway.i18n.table("de", {
    "key": "Schlüssel", "plastic leaf": "Plastikblatt", "dusty bulb": "staubige Glühbirne", "light bulb": "Glühbirne",
    "window": "Fenster", "shelf": "Regal", "crate": "Kiste", "plant": "Pflanze", "door": "Tür", "yard": "Hof",
    "mailbox": "Briefkasten", "lamp post": "Laterne", "hills": "Hügel", "Hall": "Flur", "Yard": "Hof",
    "Morning, hall.": "Morgen, Flur.", "Morning, Pip.": "Morgen, Pip.",
    "Let's get the lamp in the yard working.": "Lass uns die Laterne im Hof reparieren.",
    "Locked.": "Abgeschlossen.", "Click. Open!": "Klick. Offen!", "Fresh air!": "Frische Luft!",
    "How are you, Bolt?": "Wie geht's, Bolt?", "Rusty, but cheerful.": "Rostig, aber fröhlich.",
    "Can you reach the shelf?": "Kommst du ans Regal?", "Bye.": "Tschüss.", "Yes, Pip?": "Ja, Pip?",
    "Clouds. Lots of them.": "Wolken. Jede Menge.", "It doesn't open.": "Es geht nicht auf.",
    "Somebody painted it shut.": "Jemand hat es zugestrichen.",
    "Jars of bolts, nuts and one suspicious pickle.": "Gläser mit Schrauben, Muttern und einer verdächtigen Gurke.",
    "A key, in the pickle jar. Of course.": "Ein Schlüssel im Gurkenglas. Natürlich.", "Just bolts and nuts now.": "Nur noch Schrauben und Muttern.",
    "I'm too short to reach anything up there.": "Ich bin zu klein, da oben komme ich nicht ran.",
    "A big crate. It says THIS WAY UP on the bottom.": "Eine große Kiste. Unten steht DIESE SEITE OBEN drauf.",
    "Locked tight.": "Fest verschlossen.", "Still locked.": "Immer noch zu.", "A plastic fern. Low maintenance.": "Ein Plastikfarn. Pflegeleicht.",
    "A plastic leaf. Might be useful. Probably not.": "Ein Plastikblatt. Vielleicht nützlich. Eher nicht.",
    "The door to the yard.": "Die Tür zum Hof.", "Sunshine out there.": "Draußen scheint die Sonne.", "Back into the hall.": "Zurück in den Flur.",
    "Our mailbox. Red, like all good mailboxes.": "Unser Briefkasten. Rot, wie alle guten Briefkästen.",
    "No letters. But a light bulb!": "Keine Briefe. Aber eine Glühbirne!", "Empty.": "Leer.", "Closed again.": "Wieder zu.",
    "The lamp is dark. Its bulb is missing.": "Die Laterne ist dunkel. Die Birne fehlt.", "No bulb, no light.": "Ohne Birne kein Licht.",
    "Too dusty. It would never shine like that.": "Zu staubig. So leuchtet die nie.", "Let there be light!": "Es werde Licht!",
    "Nice work, Pip.": "Gut gemacht, Pip.", "The lamp shines. Thanks for playing the Cutaway.js demo!": "Die Laterne leuchtet. Danke fürs Spielen der Cutaway.js-Demo!",
    "Hills. They go on for a while.": "Hügel. Ziemlich viele.", "Looking at the hills always helps me think.": "Wenn ich auf die Hügel schaue, fällt mir was ein.", "Pip": "Pip", "Bolt": "Bolt",
    "Pip. Small, but full of ideas.": "Pip. Klein, aber voller Ideen.", "Need anything, Bolt?": "Brauchst du was, Bolt?",
    "Just checking on you.": "Ich schau nur, ob alles passt.", "Bolt. Tall, orange and very polite.": "Bolt. Groß, orange und sehr höflich.",
    "A small brass key.": "Ein kleiner Messingschlüssel.", "Plastic. Dusty. Surprisingly soft.": "Plastik. Staubig. Erstaunlich weich.",
    "A light bulb under a fur of dust.": "Eine Glühbirne unter einem Staubpelz.", "A quick polish with the leaf... shiny!": "Kurz mit dem Blatt poliert ... glänzt!",
    "Clean and ready to shine.": "Sauber und bereit zu leuchten.", "With my long legs? Easy.": "Mit meinen langen Beinen? Klar.",
    "There must be a key up there.": "Da oben muss ein Schlüssel sein.", "Switch to me and I'll have a look.": "Wechsel zu mir, dann schau ich nach.",
    "Never mind.": "Schon gut.",
    "Sky": "Himmel", "Somewhere, a small house.": "Irgendwo ein kleines Haus.",
    "Outside, a lamp post without a bulb.": "Draußen eine Laterne ohne Birne.",
    "Act 1": "Erster Akt", "The lamp in the yard": "Die Laterne im Hof", "The demo": "Die Demo",
    "The door is locked. Is the key somewhere up high?": "Die Tür ist zu. Liegt der Schlüssel irgendwo weit oben?",
    "Bolt is tall enough to reach the shelf.": "Bolt ist groß genug fürs Regal.", "Switch to Bolt and search the shelf.": "Wechsel zu Bolt und durchsuch das Regal.",
    "Bolt found a key. What could it open?": "Bolt hat einen Schlüssel. Was der wohl aufschließt?", "Bolt can use the key on the door.": "Bolt kann den Schlüssel an der Tür benutzen.",
    "The lamp needs a bulb. Have you checked the mail?": "Die Laterne braucht eine Birne. Schon die Post geholt?", "Open the mailbox in the yard.": "Öffne den Briefkasten im Hof.",
    "That bulb is far too dusty to shine.": "Die Birne ist viel zu staubig zum Leuchten.", "Something soft could polish it. The plant in the hall?": "Etwas Weiches könnte sie polieren. Die Pflanze im Flur?",
    "Use the plastic leaf on the dusty bulb.": "Benutz das Plastikblatt mit der staubigen Birne.", "A clean bulb, a dark lamp post...": "Eine saubere Birne, eine dunkle Laterne ...",
    "Use the clean bulb on the lamp post.": "Benutz die saubere Birne mit der Laterne.",
  });

  Cutaway.act("act1", { title: "Act 1", name: "The lamp in the yard", room: "hall", actor: "pip", start: [{ give: "sticker", to: "pip" }] });

  // the first that holds is the hint for now; each asks again more plainly
  // the logbook: a long list in a UI layer that scrolls, by the wheel, by a finger, and by its arrows (a pixel at a time, eased); a click elsewhere closes it
  const LOG = Cutaway.i18n.declare("logbook", ["Monday: rain.", "Tuesday: rain.", "Wednesday: a cloud shaped like a wrench.", "Thursday: rain.", "Friday: Bolt oiled the door.", "Saturday: the door still sticks.",
    "Sunday: rain.", "Monday: Pip found a sticker.", "Tuesday: rain, then more rain.", "Wednesday: the pickle jar was moved.", "Thursday: nobody admits to it.", "Friday: sun, for a minute."]);
  const L = { open: false, y: 0, to: 0, box: [60, 20, 200, 120], max: () => Math.max(0, LOG.length * 12 - 116) };
  /** @type {any} */ (Cutaway).demoLog = L;
  const by = (/** @type {number} */ d) => { L.to = Math.max(0, Math.min(L.max(), L.to + d)); };
  Cutaway.script.action("logbook", () => { L.open = true; L.y = L.to = 0; });
  Cutaway.events.on("pointer.wheel", (/** @type {{dy: number}} */ e) => { if (L.open) { by(e.dy / 4); L.y = L.to; } });
  Cutaway.events.on("pointer.drag", (/** @type {{dy: number, claim: () => void}} */ e) => { if (L.open) { e.claim(); by(-e.dy); L.y = L.to; } });
  Cutaway.ui.addLayer({ z: 70, modal: true,
    update() { L.y += (L.to - L.y) * 0.2; },
    targets() { const [x, y, w, h] = L.box; return L.open ? [{ x: x + w - 12, y, w: 12, h: 12, name: "up" }, { x: x + w - 12, y: y + h - 12, w: 12, h: 12, name: "down" }] : []; },
    click(/** @type {{x: number, y: number}} */ p) {
      if (!L.open) return false;
      const [x, y, w, h] = L.box;
      if (p.x >= x + w - 12 && p.x < x + w && p.y >= y && p.y < y + 12) by(-24);
      else if (p.x >= x + w - 12 && p.x < x + w && p.y >= y + h - 12 && p.y < y + h) by(24);
      else L.open = false;
      return true;
    },
    render(/** @type {CanvasRenderingContext2D} */ ctx) {
      if (!L.open) return;
      const [x, y, w, h] = L.box, f = Cutaway.ui.font();
      ctx.fillStyle = "#1c2230"; ctx.fillRect(x, y, w, h);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y + 2, w, h - 4); ctx.clip();
      LOG.forEach((/** @type {string} */ l, /** @type {number} */ i) => f.draw(ctx, Cutaway.i18n.t(l), x + 6, y + 3 + i * 12 - Math.round(L.y), { color: "#e8e8d8" }));
      ctx.restore();
      ctx.fillStyle = "#8fb0d0";
      for (let d = 0; d < 3; d++) { ctx.fillRect(x + w - 7 - d, y + 3 + d, 1 + 2 * d, 1); ctx.fillRect(x + w - 7 - d, y + h - 4 - d, 1 + 2 * d, 1); }
    },
  });

  Cutaway.hints([
    { if: "!got_key", about: "shelf", text: ["The door is locked. Is the key somewhere up high?", "Bolt is tall enough to reach the shelf.", "Switch to Bolt and search the shelf."] },
    { if: "!door_open", about: "door", text: ["Bolt found a key. What could it open?", "Bolt can use the key on the door."] },
    { if: "!got_bulb", about: "mailbox", text: ["The lamp needs a bulb. Have you checked the mail?", "Open the mailbox in the yard."] },
    { if: "!bulb_polished", about: ["leaf", "bulb"], text: ["That bulb is far too dusty to shine.", "Something soft could polish it. The plant in the hall?", "Use the plastic leaf on the dusty bulb."] },
    { about: "lamp", text: ["A clean bulb, a dark lamp post...", "Use the clean bulb on the lamp post."] },
  ]);

  Cutaway.start({ width: 320, height: 180, actor: "pip", party: ["pip", "bolt"],
    id: "cutaway-demo", version: 2, languages: ["en", "de"], intro: "intro", gate: { room: "yard", introOnly: true },
    title: { room: "yard", name: "Cutaway.js", tagline: "The demo", footer: "Cutaway.js " + Cutaway.version + " - MIT" } });
})();
