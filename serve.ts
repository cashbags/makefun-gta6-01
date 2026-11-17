// serve.ts — a tiny static server for game/ (Node 22, standard library
// only), so SOLMAR can be played locally without a build step:
// `node serve.ts` serves game/ on http://localhost:8080, and
// `node serve.ts --port 8904` serves it on 8904 — the port the
// verification tools (tools/playtest.mjs, tools/shots.mjs,
// tools/boundary-probe.mjs) expect. It sends the MIME types a browser
// game needs, refuses any path outside game/, and otherwise does nothing
// clever: a development convenience, not a web server for the internet.
// It serves only game/, never the repo root, so the screenshots and the
// docs are not reachable from the game page; the ?shot= scenes the
// screenshots come from are served the same way, from the same files
// the player gets.
//
// Two details worth knowing before changing it: the port flag is
// `--port <n>` and anything that is not a positive integer below
// 65536 falls back to 8080 instead of crashing, so a typo in the
// port still serves the game somewhere findable; and the server
// binds 127.0.0.1 only, so the game is reachable from this machine
// and nobody else's — there is no remote play here by design, and
// no CORS or range handling because a local static game needs
// neither. It also answers GET /healthz with a small JSON object
// ({ok, files, bytes} for game/), so the verification tools can prove
// the server is up and serving the current tree before they drive a
// browser at it — a failed health check is a faster diagnosis than a
// browser timeout. /healthz is not a game route: the game itself never
// fetches it, and the game page makes no network requests at all.
import { createReadStream, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    // Count the game tree (files and bytes, recursively) so a tool can
    // tell at a glance whether the server is serving the tree it
    // expects — after the R2 re-author that is 16 files, the two new
    // modules included. A walk, not a cached number, so the answer is
    // never stale after an edit.
    let files = 0;
    let bytes = 0;
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.isFile()) {
          files += 1;
          bytes += statSync(p).size;
        }
      }
    };
    try {
      walk(root);
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: true, files, bytes }));
    } catch {
      response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: false, files: 0, bytes: 0 }));
    }
    return;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size: number;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`game/ is on http://localhost:${port} (/healthz answers ok/files/bytes)`);
});
