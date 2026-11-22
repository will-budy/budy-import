// Checks every deck folder under src/decks/.
// Run it with:  npm run check:slides
// It also runs inside `npm test`. It prints plain sentences and exits with code 1 when something is wrong.
//
// A deck is the folder src/decks/<events|users>/<namespace>/<deck>/ with a deck.json and the slide pictures.
// What it checks for each deck:
//  - the folder names are lower case letters, digits and hyphens
//  - deck.json is valid JSON with a title and a list of slides
//  - the list has exactly one live slide ({ "live": true }), the live phone slide
//  - every picture slide has a picture named by its place in the deck (01.png, 02.png, ...): the live slide takes a place but has no picture
//  - every picture is a PNG of 2000 x 1125 pixels
//  - no picture file is left over that the list does not use
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GROUPS = ['events', 'users'];
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const WIDTH = 2000;
const HEIGHT = 1125;

/** Width and height of a PNG file, or null when the file is not a PNG. */
function pngSize(file) {
  const b = readFileSync(file);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (b.length < 24 || !b.subarray(0, 8).equals(signature)) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const folders = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith('.') && statSync(join(dir, f)).isDirectory()) : []);

/** Returns { problems: string[], summary: string[] }. `root` is the v1 folder. */
export function checkSlides(root = resolve(fileURLToPath(new URL('..', import.meta.url)))) {
  const problems = [];
  const summary = [];
  const base = join(root, 'src/decks');

  for (const group of folders(base)) {
    if (!GROUPS.includes(group)) {
      problems.push(`src/decks/${group}: decks must be in "events" or "users". Move this folder.`);
      continue;
    }
    for (const namespace of folders(join(base, group))) {
      if (!SLUG.test(namespace)) problems.push(`src/decks/${group}/${namespace}: use lower case letters, digits and hyphens only.`);
      for (const slug of folders(join(base, group, namespace))) {
        const path = `${group}/${namespace}/${slug}`;
        const dir = join(base, group, namespace, slug);
        if (!SLUG.test(slug)) problems.push(`${path}: use lower case letters, digits and hyphens only.`);

        const manifestFile = join(dir, 'deck.json');
        if (!existsSync(manifestFile)) {
          problems.push(`${path}: there is no deck.json in this folder.`);
          continue;
        }
        let manifest;
        try {
          manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
        } catch (e) {
          problems.push(`${path}: deck.json is not valid JSON (${e.message}).`);
          continue;
        }
        if (typeof manifest.title !== 'string' || !manifest.title.trim()) problems.push(`${path}: deck.json needs a "title".`);
        if (!Array.isArray(manifest.slides) || manifest.slides.length === 0) {
          problems.push(`${path}: deck.json needs a list of "slides".`);
          continue;
        }

        const lives = manifest.slides.filter((s) => s && s.live === true).length;
        if (lives !== 1) problems.push(`${path}: the list must have exactly one live slide ({ "live": true }). It has ${lives}.`);

        const used = new Set();
        manifest.slides.forEach((s, i) => {
          if (s && s.live === true) return;
          if (!s || typeof s.alt !== 'string' || !s.alt.trim()) problems.push(`${path}: slide ${i + 1} needs an "alt" text (a short title).`);
          const file = `${String(i + 1).padStart(2, '0')}.png`;
          used.add(file);
          const pic = join(dir, file);
          if (!existsSync(pic)) {
            problems.push(`${path}: the picture ${file} is missing from src/decks/${path}/.`);
            return;
          }
          const size = pngSize(pic);
          if (!size) problems.push(`${path}: ${file} is not a PNG picture.`);
          else if (size.width !== WIDTH || size.height !== HEIGHT) problems.push(`${path}: ${file} is ${size.width} x ${size.height} pixels. It must be ${WIDTH} x ${HEIGHT}.`);
        });

        for (const f of readdirSync(dir)) {
          if (f.startsWith('.') || f === 'deck.json' || used.has(f)) continue;
          problems.push(`${path}: the file src/decks/${path}/${f} is not used by deck.json. Remove it (ask the person first).`);
        }

        const place = manifest.slides.findIndex((s) => s && s.live === true) + 1;
        summary.push(`${path}: ${manifest.slides.length} slides, the live phone slide is slide ${place || '?'}, ${used.size} pictures.`);
      }
    }
  }
  if (summary.length === 0 && problems.length === 0) problems.push('I found no deck under src/decks/.');
  return { problems, summary };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { problems, summary } = checkSlides();
  summary.forEach((line) => console.log(line));
  if (problems.length) {
    console.error('\nProblems found:');
    problems.forEach((p) => console.error(` - ${p}`));
    process.exit(1);
  }
  console.log('Slide pictures are OK.');
}
