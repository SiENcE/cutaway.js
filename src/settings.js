// Cutaway.js player settings: sound, text, picture and controls. Kept in localStorage per game
// (not in the saves: they belong to the player, not to a game in progress). The pause menu edits them.
// Beside them, what the player has seen once (the intro: `seen`, `markSeen`), which "Reset to defaults"
// leaves alone.
"use strict";

/**
 * @typedef {object} Settings
 * @property {number} master     0..1
 * @property {number} music      0..1
 * @property {number} sfx        0..1
 * @property {number} voice      0..1 (blips and recorded voices)
 * @property {boolean} voices    speak lines at all
 * @property {boolean} muteUnfocused  silent while the window isn't the one in front
 * @property {number} textSpeed  line time factor: 2 very slow, 1.5 slow, 1 normal, 0.7 fast
 * @property {"auto" | "click"} advance  lines go on by themselves, or wait for a click (or a key)
 * @property {boolean} textBox   a dark box behind spoken lines
 * @property {"off" | "scanlines" | "crt"} crt  the picture as on an old screen
 * @property {"sharp" | "fill"} fit  whole-number scaling only, or fill the window
 * @property {boolean} motion    screen shake and flickering lamps (off for players who'd rather not)
 * @property {boolean} swapButtons  the mouse's left button looks, the right one acts
 * @property {boolean} alwaysRun    every walk is a run (otherwise a double click runs)
 * @property {number} holdMs     touch: how long a finger holds to look
 * @property {boolean} buttons   the eye and menu buttons show even before the screen is touched
 * @property {boolean} hintButton  the bulb button by the satchel (the hint stays in the menu and on H)
 */

Cutaway.settings = (function () {
  /** @type {Settings} */
  const DEFAULTS = { master: 0.8, music: 0.7, sfx: 0.8, voice: 0.8, voices: true, muteUnfocused: false,
    textSpeed: 1, advance: "auto", textBox: false, crt: "off", fit: "sharp", motion: true,
    swapButtons: false, alwaysRun: false, holdMs: 450, buttons: false, hintButton: true };
  /** @type {Settings} */
  const values = { ...DEFAULTS };
  /** @type {Partial<Settings>} the game's own defaults */
  let gameDefaults = {};
  /**
   * Settings a game adds (Cutaway.settings.define): shown on a settings page, kept like the others,
   * tested in conditions ("setting:violence=bars").
   * @typedef {{key: string, page: string, pageLabel?: string, label: string, options: [any, string][], default: any}} GameSetting
   * @type {GameSetting[]}
   */
  const defined = [];
  let storeKey = "", seenKey = "", focusHooked = false;

  /** @returns {string[]} */
  function seenList() {
    try { const v = JSON.parse(localStorage.getItem(seenKey) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
  }

  function apply() {
    Cutaway.audio.setVolume({ master: values.master, music: values.music, sfx: values.sfx, voice: values.voice });
    Cutaway.voice.setEnabled(values.voices);
    Cutaway.ui.setTextSpeed(values.textSpeed);
    Cutaway.light.setCalm(!values.motion);
    Cutaway.input.setHoldTime(values.holdMs);
    Cutaway.ui.configure({ advance: values.advance, textBox: values.textBox, swap: values.swapButtons, alwaysRun: values.alwaysRun,
      buttons: values.buttons, hintButton: values.hintButton });
    if (typeof window !== "undefined" && Cutaway.display.screen) {
      Cutaway.display.setFit(values.fit);
      Cutaway.display.setCrt(values.crt);
      muteIfUnfocused();
    }
  }

  function muteIfUnfocused() { Cutaway.audio.mute(values.muteUnfocused && !document.hasFocus()); }

  function persist() {
    if (!storeKey) return;
    try { localStorage.setItem(storeKey, JSON.stringify(values)); } catch { /* private mode: keep them for this session */ }
  }

  return {
    /** A copy of the current settings. */
    get values() { return { ...values }; },
    /**
     * Change settings (and store them).
     * @param {Partial<Settings>} v
     */
    set(v) { Object.assign(values, v); apply(); persist(); },
    /** Back to the game's defaults. */
    reset() { Object.assign(values, DEFAULTS, Object.fromEntries(defined.map((d) => [d.key, d.default])), gameDefaults); apply(); persist(); },
    /**
     * A setting of the game's own, on one of the settings pages ("sound", "text", "picture", "controls") or a
     * page of its own (`page` with its `pageLabel`). Labels are game texts ("@key" or plain).
     *   Cutaway.settings.define("violence", { page: "content", pageLabel: "Inhalt", label: "Gewalt",
     *     options: [["bars", "mit Balken"], ["shown", "gezeigt"]], default: "bars" })
     * Call it before Cutaway.start. Conditions: "setting:violence=bars".
     * @param {string} key @param {{page?: string, pageLabel?: string, label: string, options: [any, string][], default?: any}} o
     */
    define(key, o) {
      const d = { key, page: o.page ?? "content", pageLabel: o.pageLabel, label: o.label, options: o.options, default: o.default ?? o.options[0]?.[0] };
      const i = defined.findIndex((x) => x.key === key);
      if (i >= 0) defined[i] = d; else defined.push(d);
      if (!(key in values)) /** @type {any} */ (values)[key] = d.default;
    },
    /** The game's own settings (the menu shows them). */
    get defined() { return defined.slice(); },
    /** A setting's value now, the engine's or the game's. @param {string} key */
    get(key) { return /** @type {any} */ (values)[key]; },
    /** Has the player seen this (a sequence id: the intro) on this machine? @param {string} id */
    seen(id) { return seenList().includes(id); },
    /** Remember that the player has seen it. @param {string} id */
    markSeen(id) {
      if (!seenKey || seenList().includes(id)) return;
      try { localStorage.setItem(seenKey, JSON.stringify([...seenList(), id])); } catch { /* private mode: again next time */ }
    },
    /**
     * Load the stored settings for a game and apply them.
     * @param {string} gameId
     * @param {Partial<Settings>} [defaults]  the game's defaults for players who never changed anything
     */
    init(gameId, defaults = {}) {
      storeKey = `cutaway.${gameId}.settings`;
      seenKey = `cutaway.${gameId}.seen`;
      gameDefaults = defaults;
      Object.assign(values, defaults);
      try {
        const raw = localStorage.getItem(storeKey);
        if (raw) Object.assign(values, JSON.parse(raw));
      } catch { /* unreadable: defaults */ }
      if (typeof window !== "undefined" && !focusHooked) {
        focusHooked = true;
        window.addEventListener("blur", muteIfUnfocused);
        window.addEventListener("focus", muteIfUnfocused);
      }
      apply();
    },
  };
})();
