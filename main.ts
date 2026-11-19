// main.ts — SOLMAR's entry program (Node 22, standard library only).
// The game is this directory's game/ folder: plain static files a
// desktop browser loads offline (game/index.html and its ES
// modules, three.js vendored under game/vendor/, no network
// request). This program hands it in: it copies game/ and
// screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library (vendor/makefun-game.ts, the scorer's
// own copy, unchanged — never edit that file; the scorer compares
// it byte for byte with its own copy).
//
// The program itself is deterministic: it copies files and writes
// one dossier, reading nothing from the clock or the network, so
// running it twice into two directories gives byte-identical
// outputs. That is checked on every verification pass with
// `diff -r` (see TESTS.md). The game it copies is deterministic
// for a different reason: one seeded RNG builds the city from
// ?seed=, and the fence and hills at the city limit draw no
// randomness, so the edge never reshuffles the world behind it.
// The weather and the airport draw only from forks of that stream,
// and the rain schedule is fixed at build time, so the sky and the
// taxiing plane are the same on every replay of the same steps —
// the dossier read-back at the end of this file proves the new
// modules were copied, and the replay check proves the game still
// plays the same way twice. The taxi side-job draws from its own
// stream seeded from ?seed=, so offering a fare costs the shared
// stream nothing and the city builds exactly as it did before cab
// work existed.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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

// The scorer's own caps (reference/gate.json): only text_max_bytes
// shapes the bytes; the others refuse an entry the scorer would
// refuse (more than 4 screenshots or one over 256 KiB; more than
// 993 files in game/ or 48 MiB of game files, in all, or a path
// under game/ over 1000 bytes). The caps are passed here so the
// dossier carries the same limits the scorer enforces — the entry
// cannot pass the dossier and fail the gate on a size the author
// never checked. Current headroom, measured at the R4 re-author
// verification: game/ is 17 files and about 2.3 MiB against a
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

// Read the dossier back and prove the R2 modules made it in — and
// the R3 taxi module with them: the entry program is the one place
// that can fail loudly if a new file was added to game/src but
// never copied, instead of letting the scorer discover a missing
// import. The check is cheap (one parse) and deterministic — it
// reads only what was just written — so it costs the replay
// nothing and catches a packaging slip every run.
//
// Two different checks, because the dossier text is a budget, not
// the game: the text holds at most text_max_bytes (163840, the
// scorer's gate), so the tail files fall out of the text once the
// code grows past it — at R3 rev B the text holds nine files and
// weather.js, audio.js, hud.js, shots.js and taxi.js are outside
// it, while still copied to /output and still played. A filename
// check against the dossier text would fail on exactly those
// files, so the proof below is the copy: it lists the repo's own
// game/src/ directory and proves every module was copied,
// whichever files the text budget kept. The one dossier-text check
// that stays is airport.js, the largest district module, which the
// text still holds.
{
  const dossier = JSON.parse(readFileSync(join(out, 'dossier.json'), 'utf8'));
  const dossierText = JSON.stringify(dossier);
  if (!dossierText.includes('game/src/airport.js')) {
    throw new Error('dossier is missing game/src/airport.js — the airport re-author did not copy');
  }
  for (const file of readdirSync(join(here, 'game', 'src'))) {
    if (!file.endsWith('.js')) continue;
    if (!existsSync(join(out, 'game', 'src', file))) {
      throw new Error(`output is missing game/src/${file} — the copy step did not copy it`);
    }
  }
  // The hunt is data, not code: the dossier text cannot prove the
  // twelve cases exist, so main.ts reads the copied city.js and
  // counts the package table's rows itself. A table edit that drops
  // a row fails here, at build time, not in a player's hunt.
  {
    const cityText = readFileSync(join(out, 'game/src/city.js'), 'utf8');
    const rows = (cityText.match(/\['(hospital|bank|garage|safehouse|shop|docks|marina|hangar|runway|shuttle|sportscar|taxiStand)',/g) ?? []).length;
    if (rows !== 12) {
      throw new Error(`package table holds ${rows} rows, expected 12`);
    }
  }
}
