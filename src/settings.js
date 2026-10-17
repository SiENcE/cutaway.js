// Cutaway.js player settings: volumes, voices on/off, text speed. Kept in localStorage per game
// (not in the saves: they belong to the player, not to a game in progress). The pause menu edits them.
"use strict";

/**
 * @typedef {object} Settings
 * @property {number} master     0..1
 * @property {number} music      0..1
 * @property {number} sfx        0..1
 * @property {number} voice      0..1 (blips and recorded voices)
 * @property {boolean} voices    speak lines at all
 * @property {number} textSpeed  line time factor: 1.5 slow, 1 normal, 0.7 fast
 */

Cutaway.settings = (function () {
  /** @type {Settings} */
  const values = { master: 0.8, music: 0.7, sfx: 0.8, voice: 0.8, voices: true, textSpeed: 1 };
  let storeKey = "";

  function apply() {
    Cutaway.audio.setVolume({ master: values.master, music: values.music, sfx: values.sfx, voice: values.voice });
    Cutaway.voice.setEnabled(values.voices);
    Cutaway.ui.setTextSpeed(values.textSpeed);
  }

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
    /**
     * Load the stored settings for a game and apply them.
     * @param {string} gameId
     * @param {Partial<Settings>} [defaults]  the game's defaults for players who never changed anything
     */
    init(gameId, defaults = {}) {
      storeKey = `cutaway.${gameId}.settings`;
      Object.assign(values, defaults);
      try {
        const raw = localStorage.getItem(storeKey);
        if (raw) Object.assign(values, JSON.parse(raw));
      } catch { /* unreadable: defaults */ }
      apply();
    },
  };
})();
