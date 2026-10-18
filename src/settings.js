// Cutaway.js player settings: sound, text, picture and controls. Kept in localStorage per game
// (not in the saves: they belong to the player, not to a game in progress). The pause menu edits them.
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
  let storeKey = "", focusHooked = false;

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
    reset() { Object.assign(values, DEFAULTS, gameDefaults); apply(); persist(); },
    /**
     * Load the stored settings for a game and apply them.
     * @param {string} gameId
     * @param {Partial<Settings>} [defaults]  the game's defaults for players who never changed anything
     */
    init(gameId, defaults = {}) {
      storeKey = `cutaway.${gameId}.settings`;
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
