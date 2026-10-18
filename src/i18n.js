// Cutaway.js languages: string tables and the language switch.
// Game data may hold text inline (in the game's first language) or as "@key" references.
//   t("@door.locked")   -> the current table's "door.locked", else the fallback table's, else the key
//   t("Abgeschlossen.") -> the current table's translation of that source text, else the text itself
// Tables: Cutaway.i18n.table("en", { "door.locked": "Locked.", "Abgeschlossen.": "Locked." }).
// The engine's own texts (default replies) use keys starting with "cutaway.".
"use strict";

Cutaway.i18n = (function () {
  /** @type {Map<string, Record<string, string>>} */
  const tables = new Map();
  let lang = "en", fallback = "en";

  /**
   * Translate a text or "@key".
   * @param {string} text
   * @returns {string}
   */
  function t(text) {
    if (typeof text !== "string") return String(text ?? "");
    if (text.charCodeAt(0) === 31) text = Cutaway.assets.reveal(text);     // scrambled by a release build
    const isKey = text.startsWith("@"), k = isKey ? text.slice(1) : text;
    const hit = tables.get(lang)?.[k] ?? tables.get(fallback)?.[k];
    return hit ?? (isKey ? k : text);
  }

  // Engine defaults; games override them in their own tables.
  tables.set("en", {
    "cutaway.look": "Nothing special.",
    "cutaway.use": "That doesn't work.",
    "cutaway.with": "That doesn't work.",
    "cutaway.useWith": "{item} on {target}",
    "cutaway.satchel": "Inventory",
    "cutaway.empty": "Nothing in here.",
    "cutaway.menu.title": "Paused",
    "cutaway.menu.continue": "Continue",
    "cutaway.menu.save": "Save",
    "cutaway.menu.load": "Load",
    "cutaway.menu.language": "Language",
    "cutaway.menu.fullscreen": "Fullscreen",
    "cutaway.menu.back": "Back",
    "cutaway.menu.slot": "Slot",
    "cutaway.menu.autosave": "Autosave",
    "cutaway.menu.empty": "empty",
    "cutaway.menu.settings": "Settings",
    "cutaway.menu.volume": "Volume",
    "cutaway.menu.music": "Music",
    "cutaway.menu.sfx": "Sounds",
    "cutaway.menu.voice": "Voices",
    "cutaway.menu.voices": "Speech",
    "cutaway.menu.on": "on",
    "cutaway.menu.off": "off",
    "cutaway.menu.textSpeed": "Text speed",
    "cutaway.menu.slow": "slow",
    "cutaway.menu.normal": "normal",
    "cutaway.menu.fast": "fast",
    "cutaway.menu.verySlow": "very slow",
    "cutaway.menu.sound": "Sound",
    "cutaway.menu.text": "Text and dialogue",
    "cutaway.menu.picture": "Picture",
    "cutaway.menu.controls": "Controls",
    "cutaway.menu.defaults": "Reset to defaults",
    "cutaway.menu.muteUnfocused": "Mute in background",
    "cutaway.menu.advance": "Next line",
    "cutaway.menu.auto": "auto",
    "cutaway.menu.onClick": "on click",
    "cutaway.menu.textBox": "Text box",
    "cutaway.menu.fit": "Picture size",
    "cutaway.menu.sharp": "pixel-perfect",
    "cutaway.menu.fill": "fill",
    "cutaway.menu.crt": "Old screen",
    "cutaway.menu.scanlines": "scanlines",
    "cutaway.menu.tube": "CRT",
    "cutaway.menu.motion": "Shake and flicker",
    "cutaway.menu.swap": "Mouse buttons",
    "cutaway.menu.swapped": "swapped",
    "cutaway.menu.alwaysRun": "Always run",
    "cutaway.menu.hold": "Hold to look",
    "cutaway.menu.short": "short",
    "cutaway.menu.long": "long",
    "cutaway.menu.buttons": "Screen buttons",
    "cutaway.menu.always": "always",
    "cutaway.menu.hintButton": "Hint button",
    "cutaway.rotate": "Turn your device sideways",
    "cutaway.menu.hint": "Hint",
    "cutaway.menu.toTitle": "Title screen",
    "cutaway.title.new": "New game",
    "cutaway.title.continue": "Continue",
    "cutaway.title.acts": "Acts",
    "cutaway.title.quit": "Quit",
    "cutaway.end.text": "The end.",
    "cutaway.demo.title": "End of the demo",
    "cutaway.demo.text": "Thanks for playing!",
    "cutaway.demo.link": "To the full game",
    "cutaway.demo.toTitle": "Title screen",
    "cutaway.hint.prefix": "Hint: ",
    "cutaway.hint.none": "No hint right now.",
    "cutaway.button.hint": "Hint",
    "cutaway.button.hotspots": "Show hotspots",
    "cutaway.button.menu": "Menu",
  });
  tables.set("de", {
    "cutaway.look": "Nichts Besonderes.",
    "cutaway.use": "Das geht nicht.",
    "cutaway.with": "Das geht so nicht.",
    "cutaway.useWith": "{item} mit {target}",
    "cutaway.satchel": "Inventar",
    "cutaway.empty": "Hier ist nichts drin.",
    "cutaway.menu.title": "Pause",
    "cutaway.menu.continue": "Weiter",
    "cutaway.menu.save": "Speichern",
    "cutaway.menu.load": "Laden",
    "cutaway.menu.language": "Sprache",
    "cutaway.menu.fullscreen": "Vollbild",
    "cutaway.menu.back": "Zurück",
    "cutaway.menu.slot": "Platz",
    "cutaway.menu.autosave": "Automatisch",
    "cutaway.menu.empty": "leer",
    "cutaway.menu.settings": "Einstellungen",
    "cutaway.menu.volume": "Lautstärke",
    "cutaway.menu.music": "Musik",
    "cutaway.menu.sfx": "Geräusche",
    "cutaway.menu.voice": "Stimmen",
    "cutaway.menu.voices": "Sprechen",
    "cutaway.menu.on": "an",
    "cutaway.menu.off": "aus",
    "cutaway.menu.textSpeed": "Textgeschwindigkeit",
    "cutaway.menu.slow": "langsam",
    "cutaway.menu.normal": "normal",
    "cutaway.menu.fast": "schnell",
    "cutaway.menu.verySlow": "sehr langsam",
    "cutaway.menu.sound": "Ton",
    "cutaway.menu.text": "Text und Dialoge",
    "cutaway.menu.picture": "Bild",
    "cutaway.menu.controls": "Steuerung",
    "cutaway.menu.defaults": "Standardwerte",
    "cutaway.menu.muteUnfocused": "Im Hintergrund stumm",
    "cutaway.menu.advance": "Nächste Zeile",
    "cutaway.menu.auto": "automatisch",
    "cutaway.menu.onClick": "per Klick",
    "cutaway.menu.textBox": "Textkasten",
    "cutaway.menu.fit": "Bildgröße",
    "cutaway.menu.sharp": "pixelgenau",
    "cutaway.menu.fill": "füllend",
    "cutaway.menu.crt": "Röhrenbild",
    "cutaway.menu.scanlines": "Zeilen",
    "cutaway.menu.tube": "Röhre",
    "cutaway.menu.motion": "Wackeln und Flackern",
    "cutaway.menu.swap": "Maustasten",
    "cutaway.menu.swapped": "getauscht",
    "cutaway.menu.alwaysRun": "Immer rennen",
    "cutaway.menu.hold": "Halten zum Ansehen",
    "cutaway.menu.short": "kurz",
    "cutaway.menu.long": "lang",
    "cutaway.menu.buttons": "Bildschirmknöpfe",
    "cutaway.menu.always": "immer",
    "cutaway.menu.hintButton": "Tipp-Knopf",
    "cutaway.rotate": "Bitte das Gerät quer halten",
    "cutaway.menu.hint": "Tipp",
    "cutaway.menu.toTitle": "Zum Titelbild",
    "cutaway.title.new": "Neues Spiel",
    "cutaway.title.continue": "Weiterspielen",
    "cutaway.title.acts": "Akte",
    "cutaway.title.quit": "Beenden",
    "cutaway.end.text": "Ende.",
    "cutaway.demo.title": "Ende der Demo",
    "cutaway.demo.text": "Danke fürs Spielen!",
    "cutaway.demo.link": "Zum vollen Spiel",
    "cutaway.demo.toTitle": "Zum Titelbild",
    "cutaway.hint.prefix": "Tipp: ",
    "cutaway.hint.none": "Gerade gibt es keinen Tipp.",
    "cutaway.button.hint": "Tipp",
    "cutaway.button.hotspots": "Hotspots zeigen",
    "cutaway.button.menu": "Menü",
  });

  /** @type {Map<string, Record<string, string>>} the editor's text layers, per language */
  const layers = new Map();

  /** A table's keys and texts as they are (a release build may have scrambled them). @param {Record<string, string>} strings */
  function plain(strings) {
    /** @param {string} s */
    const r = (s) => (typeof s === "string" && s.charCodeAt(0) === 31 ? Cutaway.assets.reveal(s) : s);
    return Object.fromEntries(Object.entries(strings).map(([k, v]) => [r(k), r(v)]));
  }

  return {
    t,
    /**
     * Add (merge) strings into a language's table.
     * @param {string} code
     * @param {Record<string, string>} strings
     */
    table(code, strings) { tables.set(code, { ...(tables.get(code) ?? {}), ...plain(strings) }); },
    /**
     * The editor's text layer of a language (game/strings/<lang>.texts.js): merged into the table like
     * any other, and kept apart so the editor can save it back with its changes.
     * @param {string} code
     * @param {Record<string, string>} strings
     */
    layer(code, strings) {
      const p = plain(strings);
      layers.set(code, { ...(layers.get(code) ?? {}), ...p });
      tables.set(code, { ...(tables.get(code) ?? {}), ...p });
    },
    /** The editor's text layer of a language. @param {string} code */
    layerOf(code) { return { ...(layers.get(code) ?? {}) }; },
    /** @param {string} code */
    setLanguage(code) { lang = code; Cutaway.events.emit("language", code); },
    /** Language used when the current table misses a key. @param {string} code */
    setFallback(code) { fallback = code; },
    get language() { return lang; },
    /** @param {string} code */
    strings(code) { return tables.get(code) ?? {}; },
    languages() { return [...tables.keys()]; },
  };
})();
