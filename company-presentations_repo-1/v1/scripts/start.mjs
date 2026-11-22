// One command to run everything on this laptop, with no internet: npm start
//   http://localhost:4173  the presentation (/v1/, /v1/ops, /v1/sales, /v1/integrated)
//   http://localhost:8081  the Budy phone app (shown in the phone frame)
//   http://localhost:4010  the app's mock API (made-up data, nothing leaves this laptop)
// The presentation must be built first (npm run setup does this).
import http from 'node:http';
import net from 'node:net';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
// The build puts the presentation in dist/v1 (see vite.config.ts). `entry` is the main page of each site.
const PRESENTATION = { name: 'presentation', dir: join(root, 'dist'), entry: 'v1/index.html', port: 4173 };
const APP = { name: 'phone app', dir: join(root, 'vendor/demo-app/web'), entry: 'index.html', port: 8081 };
const MOCK_PORT = 4010;

for (const site of [PRESENTATION, APP]) {
  if (!existsSync(join(site.dir, site.entry))) {
    console.error(`Missing ${site.dir}. ${site === PRESENTATION ? 'Run: npm run setup' : 'The folder vendor/demo-app is incomplete. Download the repository again.'}`);
    process.exit(1);
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
};

/** The headers the site gets on Cloudflare (public/_headers, rule "/*"), so local runs behave like the real site. */
function securityHeaders(dir) {
  const file = join(dir, '_headers');
  if (!existsSync(file)) return {};
  const headers = {};
  for (const line of readFileSync(file, 'utf8').split('\n').slice(1)) {
    const m = line.match(/^\s+([\w-]+):\s*(.+)$/);
    if (m) headers[m[1].toLowerCase()] = m[2].trim();
  }
  return headers;
}

function serve(site, extra = {}) {
  const base = site.dir + sep;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    // The presentation lives under /v1/. The bare address goes there.
    if (site === PRESENTATION && url.pathname === '/') return void res.writeHead(302, { location: '/v1/' }).end();
    let file = normalize(join(site.dir, decodeURIComponent(url.pathname)));
    if (file !== site.dir && !file.startsWith(base)) return void res.writeHead(403).end();
    // A path that is not a file (/v1/ops, /v1/sales, /v1/integrated) gets the main page; the page picks what to show.
    // The phone app does the same for any path. The presentation does it only under /v1/.
    if (!existsSync(file) || statSync(file).isDirectory()) {
      if (site === PRESENTATION && !url.pathname.startsWith('/v1/') && url.pathname !== '/v1') return void res.writeHead(404).end();
      file = join(site.dir, site.entry);
    }
    const immutable = /[\\/](assets|_expo)[\\/]/.test(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...extra,
    });
    createReadStream(file).pipe(res);
  });
  server.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE' ? `Port ${site.port} is already in use. Stop the other program, or the earlier "npm start", and try again.` : e.message);
    process.exit(1);
  });
  server.listen(site.port, '127.0.0.1');
}

/** Is something already listening on this port? Checked first, so nothing starts half way. */
const busy = (port) =>
  new Promise((done) => {
    const probe = net.connect(port, '127.0.0.1');
    probe.once('connect', () => { probe.destroy(); done(true); });
    probe.once('error', () => done(false));
  });
const taken = [];
for (const [name, port] of [[PRESENTATION.name, PRESENTATION.port], [APP.name, APP.port], ['mock API', MOCK_PORT]]) {
  if (await busy(port)) taken.push(`${port} (${name})`);
}
if (taken.length) {
  console.error(`These ports are already in use: ${taken.join(', ')}.\nStop the program that uses them (for example an earlier "npm start", "expo start" or "npm run mock:api") and try again.`);
  process.exit(1);
}

serve(PRESENTATION, securityHeaders(join(PRESENTATION.dir, 'v1')));
serve(APP);

// The mock API starts listening when it is loaded. It reads the demo stories from vendor/demo-app/demo.
process.env.PORT = String(MOCK_PORT);
process.env.DEMO_DIR = join(root, 'vendor/demo-app/demo');
await import(pathToFileURL(join(root, 'vendor/demo-app/packages/api-mock/src/server.mjs')).href);

console.log(`\nBudy presentation is running. Open http://localhost:${PRESENTATION.port}/v1/\nPress Ctrl+C to stop.\n`);
