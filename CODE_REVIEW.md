# Cutaway.js code review

**Scope:** the whole repository at `39d7fd7` (`main`): the runtime engine (`src/*.js`, `src/music/`), the in-game editor (`src/editor*.js`), the studio server and the Node tools (`tools/`), and the tests.
**Date:** 2026-10-30

## Summary

Cutaway.js is small, tidy and unusually well thought through for a 0.1. Games are data, the runtime is a set of no-build classic scripts that share one namespace, everything is JSDoc-typed and passes `tsc --checkJs --strict`, and the tooling (validator, solver, headless playthrough) is a real strength. The code is consistent in style and dense with useful comments.

Most of the serious problems are in one area: **the lifecycle of running scripts.** Scripts are fire-and-forget promises with no owner. Nothing cancels them when a game is loaded, nothing stops a save from being taken half-way through one, and some actor operations can leave a script waiting forever. In an adventure game every one of these is a soft-lock or a corrupt save. All of the high-severity engine findings below come from this.

**Baseline checks**

| Check | Result |
|---|---|
| `npm run check` (`tsc`) | clean |
| `node tests/run.mjs` | **389 / 389 pass**, but only with `CHROME` pointing at a Chromium wrapper that adds `--no-sandbox` (see [T1](#t1)). Out of the box it stops at the first browser test with "no Chrome found". |

Findings marked **(reproduced)** were confirmed by running code: a Node script against the engine files, or headless Chromium on the demo. The rest come from reading the code.

<!-- SECTIONS -->
