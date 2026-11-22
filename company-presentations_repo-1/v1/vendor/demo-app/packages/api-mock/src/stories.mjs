import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC, store, activeId, findChat, voiceMessage, emit } from './store.mjs';

// Demo stories: a fixed home conversation for a demo teammate, read from files so a story can be swapped without a
// rebuild. demo/stories.json names the active story for each teammate; each story is a folder with story.json, its
// report and its recordings. See demo/README.md. The mock reads the files again whenever one of them changes.

export const DEMO_DIR = process.env.DEMO_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'demo');
const AUDIO_TYPES = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.aac': 'audio/aac', '.ogg': 'audio/ogg' };
const FILE_TYPES = { ...AUDIO_TYPES, '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
// Speech is about 2.5 words a second. Used for a recording that is not there yet, or that ffprobe cannot read.
const WORDS_PER_SECOND = 2.5;
const FAR_FUTURE = '2099-01-01T00:00:00Z';

const mtime = (path) => (existsSync(path) ? statSync(path).mtimeMs : 0);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// The active story for a teammate, or null. `key` changes when the config, the story or its folder changes, so a new
// recording dropped into the folder also counts.
export function activeStory(teammateId) {
  const config = join(DEMO_DIR, 'stories.json');
  if (!existsSync(config)) return null;
  const path = readJson(config)[teammateId];
  if (typeof path !== 'string') return null;
  const dir = join(DEMO_DIR, 'stories', path);
  const file = join(dir, 'story.json');
  if (!existsSync(file)) return null;
  return { path, dir, story: readJson(file), key: [path, mtime(config), mtime(file), mtime(dir)].join(' ') };
}

// A file inside the stories folder, or null for anything outside it.
export function storyFile(relative) {
  const root = join(DEMO_DIR, 'stories');
  const file = normalize(join(root, relative));
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return null;
  return { file, contentType: FILE_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' };
}
export const storyFileUrl = (path, name) => `${PUBLIC}/mock/stories/${path}/${name}`;

function audioSeconds(file) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeout: 10000 }).toString();
    const seconds = Number.parseFloat(out);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

// "today", "yesterday" or YYYY-MM-DD, plus a local HH:MM, as an ISO time.
export function storyTime(date = 'yesterday', time = '09:00') {
  const [h, m] = time.split(':').map(Number);
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, mo, day] = date.split('-').map(Number);
    d = new Date(y, mo - 1, day, h, m);
  } else {
    const now = new Date();
    d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (date === 'today' ? 0 : 1), h, m);
  }
  return d.toISOString();
}

// One voice message from a story part. The recording is optional: without it the app reads the text aloud.
export function storyVoice(found, part, author, id, chatId, createdAt) {
  const file = part.audio ? join(found.dir, part.audio) : null;
  const has = file && existsSync(file);
  const seconds = (has && audioSeconds(file)) || Math.max(1, part.text.split(/\s+/).length / WORDS_PER_SECOND);
  const asset = has
    ? { id: `ast_story_${id}`, url: storyFileUrl(found.path, part.audio), contentType: AUDIO_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', sizeBytes: statSync(file).size, expiresAt: FAR_FUTURE }
    : null;
  return voiceMessage(chatId, author, part.text, Math.round(seconds * 1000), createdAt, [], `msg_story_${id}`, asset);
}

// The question, the acknowledgement and the report, as the home chat's messages. A story may add a short exchange
// between the acknowledgement and the report: `answer` (the user's reply) and `confirm` (the teammate's reply to it).
const STORY_PARTS = [['question', 'user'], ['ack', 'teammate'], ['answer', 'user'], ['confirm', 'teammate'], ['report', 'teammate']];
export function storyThread(found, chatId) {
  const { story } = found;
  return STORY_PARTS.filter(([key]) => story[key]).map(([key, author]) => storyVoice(found, story[key], author, key, chatId, storyTime(story.date, story[key].time)));
}

// Puts the active teammate's story in its home chat when the story is new or changed. Anything said after it (the
// follow-up) stays until then.
export function syncStory() {
  const found = activeStory(activeId);
  if (!found || store.storyKey === found.key) return found;
  const home = findChat('home');
  store.chatMessages[home.id] = storyThread(found, home.id);
  home.updatedAt = store.chatMessages[home.id].at(-1).createdAt;
  store.storyKey = found.key;
  store.teammate = { ...store.teammate, status: 'idle', statusLine: 'Ready when you are', activity: null };
  emit('teammate.status.changed', { status: 'idle', statusLine: 'Ready when you are', activity: null });
  return found;
}

// What the app adds to the story's messages: the "worked for" tag and the report card. Not part of the contract.
export function storyExtras(teammateId) {
  const found = activeStory(teammateId);
  if (!found) return { story: null, messages: {} };
  const { story, path } = found;
  const card = story.report.card;
  return {
    story: { path, title: story.title },
    messages: {
      msg_story_report: {
        workedFor: story.report.workedFor ?? null,
        card: card ? { label: card.label ?? null, title: card.title, subtitle: card.subtitle ?? null, figures: card.figures ?? [], caption: card.caption ?? null, graphic: card.graphic ?? null, url: card.file ? storyFileUrl(path, card.file) : null } : null,
      },
    },
  };
}
