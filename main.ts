// main.ts — SOLMAR's entry program (Node 22, standard library only).
// The game is this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html and its ES modules, three.js
// vendored under game/vendor/, no network request). This program hands it
// in: it copies game/ and screenshots/ from beside this file to /output
// and writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library (vendor/makefun-game.ts, the scorer's own
// copy, unchanged — never edit that file; the scorer compares it byte
// for byte with its own copy).
//
// The program itself is deterministic: it copies files and writes one
// dossier, reading nothing from the clock or the network, so running it
// twice into two directories gives byte-identical outputs. That is
// checked on every verification pass with `diff -r` (see TESTS.md).
// The game it copies is deterministic for a different reason: one
// seeded RNG builds the city from ?seed=, and the fence and hills at
// the city limit draw no randomness, so the edge never reshuffles the
// world behind it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse (more than
// 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB
// of game files, in all, or a path under game/ over 1000 bytes). The caps
// are passed here so the dossier carries the same limits the scorer
// enforces — the entry cannot pass the dossier and fail the gate on a
// size the author never checked. Current headroom, measured at the
// final verification: game/ is 14 files and about 2.2 MiB against a
// 993-file / 48 MiB cap, screenshots/ is 4 files each under 256 KiB
// against a cap of 4. The dossier itself is written by buildDossier
// from the /output tree, so it always describes the files that were
// actually copied, never a stale list.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
