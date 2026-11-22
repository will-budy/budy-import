// Maintainers only. Rebuilds the copy of the Budy phone app and its mock API that lives in vendor/demo-app/.
// Usage: npm run demo:refresh -- <path to the app-demo-mockup-v1 folder>
// It needs that repository set up with its private package (see its DEMO-SETUP.md). Reps who only run the presentation never use this.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = process.argv[2];
const src = arg ? resolve(arg) : '';
if (!src || !existsSync(join(src, 'apps/app/package.json'))) {
  console.error('Usage: npm run demo:refresh -- <path to the app-demo-mockup-v1 folder>');
  process.exit(1);
}
const out = resolve('vendor/demo-app');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. The app as a static web site. The API address (the mock on port 4010) is fixed at build time.
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', join(out, 'web')], {
  cwd: join(src, 'apps/app'),
  stdio: 'inherit',
  env: { ...process.env, EXPO_OFFLINE: '1', CI: '1', EXPO_PUBLIC_API_URL: 'http://localhost:4010' },
});

// 1b. The app asks Google Fonts for its fonts on the web. The same font files are inside the export, so a local
// stylesheet declares them, and the app looks right with no internet.
const WEIGHTS = { Thin: 100, ExtraLight: 200, Light: 300, Regular: 400, Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800, Black: 900 };
const FAMILIES = { AlbertSans: 'Albert Sans', Mulish: 'Mulish', FragmentMono: 'Fragment Mono' };
const fontRoot = join(out, 'web/assets/__node_modules/@expo-google-fonts');
const rules = [];
for (const dir of readdirSync(fontRoot, { recursive: true })) {
  const m = String(dir).match(/([A-Za-z]+)_(\d)00([A-Za-z]+?)(_Italic)?\.[0-9a-f]+\.ttf$/);
  if (!m || !FAMILIES[m[1]] || !WEIGHTS[m[3]]) continue;
  rules.push(`@font-face{font-family:'${FAMILIES[m[1]]}';font-weight:${WEIGHTS[m[3]]};font-style:${m[4] ? 'italic' : 'normal'};font-display:swap;src:url('/assets/__node_modules/@expo-google-fonts/${String(dir).replaceAll('\\', '/')}') format('truetype')}`);
}
if (!rules.length) throw new Error('No font files found in the export. The app would load its fonts from the internet.');
// The phone frame is a picture of a phone: hide the scroll bars the browser would draw inside the app.
rules.push('*{scrollbar-width:none}*::-webkit-scrollbar{display:none}');
writeFileSync(join(out, 'web/fonts.css'), rules.join('\n') + '\n');
const indexFile = join(out, 'web/index.html');
writeFileSync(indexFile, readFileSync(indexFile, 'utf8').replace('</head>', '<link rel="stylesheet" href="/fonts.css"/></head>'));

// 2. The mock API (it needs only the `ws` package) and the demo stories it plays. Same folder layout as the app repository.
const mock = join(out, 'packages/api-mock');
cpSync(join(src, 'packages/api-mock/src'), join(mock, 'src'), { recursive: true });
cpSync(join(src, 'packages/api-mock/assets'), join(mock, 'assets'), { recursive: true });
const stories = JSON.parse(readFileSync(join(src, 'demo/stories.json'), 'utf8'));
mkdirSync(join(out, 'demo'), { recursive: true });
cpSync(join(src, 'demo/stories.json'), join(out, 'demo/stories.json'));
for (const path of Object.values(stories)) {
  // Only the active stories. The .wav files are large copies of the .mp3 recordings and are not used.
  cpSync(join(src, 'demo/stories', path), join(out, 'demo/stories', path), { recursive: true, filter: (f) => !f.endsWith('.wav') });
}

// 3. Say where this copy came from.
const git = (...a) => execFileSync('git', ['-C', src, ...a], { encoding: 'utf8' }).trim();
const dirty = git('status', '--porcelain', '--', 'apps', 'packages', 'demo/stories.json') ? ' (with uncommitted changes)' : '';
writeFileSync(
  join(out, 'SOURCE.md'),
  `Copy of the Budy phone app and its mock API.\n\n- Source: app-demo-mockup-v1, branch ${git('branch', '--show-current')}, commit ${git('rev-parse', '--short', 'HEAD')}${dirty}\n- Built: ${new Date().toISOString()}\n- Refresh: npm run demo:refresh -- <path to app-demo-mockup-v1>\n`,
);
console.log('Done. vendor/demo-app is up to date.');
