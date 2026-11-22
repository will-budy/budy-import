import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  PUBLIC, store, activeId, clients, uploads, newId, now, reset, activate, emit, teammateView, userByEmail, userView, startSession,
  sessionUser, endSession, findChat, addMessage, findMessage, setReaction, setTeammate, textMessage, unnamedChats, nameFor,
} from './store.mjs';
import { startRun, cancelRun, decideRun, acceptInbound, verifyWebhook, resetScenarios, REQUEST_STEPS } from './scenarios.mjs';
import { activeStory, storyExtras, storyFile, storyVoice, syncStory } from './stories.mjs';

// The Budy App API mock. Routes, status codes and validation follow @budybot/app-api-contract. Handlers return
// { status, body } and never write the response themselves, so errors and Idempotency-Key replays live in one place.

const PORT = Number(process.env.PORT || 4010);
const SPEED = Number(process.env.MOCK_SPEED || 1);
const FEEDBACK_TITLE = 'One-on-one feedback';
const FEEDBACK_INVITE = 'Happy to. Tell me what I could do better: how I talk, what I notice, what I miss. Say it however it comes and I will keep it in mind.';
const MAX_UPLOAD_BYTES = 104857600;
const ASSET_URL_TTL_MS = 60 * 60 * 1000;
const MOCK_TRANSCRIPT = 'This is a stand-in transcript of your voice note.';
const execFileAsync = promisify(execFile);
async function transcribeLocally(bytes) {
  const folder = await mkdtemp(join(tmpdir(), 'budy-voice-'));
  const source = join(folder, 'recording');
  const wav = join(folder, 'recording.wav');
  const output = join(folder, 'transcript');
  try {
    await writeFile(source, bytes);
    await execFileAsync('ffmpeg', ['-nostdin', '-v', 'error', '-i', source, '-ar', '16000', '-ac', '1', '-y', wav], { timeout: 60000 });
    await execFileAsync('whisper-cli', ['-m', process.env.WHISPER_MODEL, '-f', wav, '-l', 'en', '-otxt', '-of', output, '-nt', '-np'], { timeout: 120000, maxBuffer: 1024 * 1024 });
    return (await readFile(`${output}.txt`, 'utf8')).trim();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
// Avatars are plain image files, served without a token like an image CDN would.
const AVATARS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'avatars');
const AVATAR_FILE = /^(sam|sarah)-(idle\.png|working\.gif|asleep\.gif)$/;
// One-use WebSocket tickets: ticket -> { userId, expires }. Tickets last 30 seconds.
const tickets = new Map();
// Idempotency-Key replays: "<userId> <method> <path> <key>" -> the first response. Kept for the mock's lifetime.
const idempotent = new Map();
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type,idempotency-key,webhook-id,webhook-timestamp,webhook-signature',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-expose-headers': 'retry-after',
};

// Responses.
const ok = (body, status = 200) => ({ status, body });
const TITLES = {
  bad_request: 'The request is malformed.',
  unauthorized: 'Authentication is required.',
  not_found: 'The resource was not found.',
  conflict: 'The request conflicts with the current state.',
  validation_failed: 'The request is not valid.',
  asset_not_uploaded: 'The asset has not been uploaded.',
  internal: 'Something went wrong.',
};
const STATUS = { bad_request: 400, unauthorized: 401, not_found: 404, conflict: 409, validation_failed: 422, asset_not_uploaded: 422, internal: 500 };
function problem(code, detail, errors) {
  return { status: STATUS[code], problem: true, body: { type: `urn:budy:problem:${code}`, title: TITLES[code], status: STATUS[code], detail, code, requestId: newId('req'), ...(errors ? { errors } : {}) } };
}
const invalid = (pointer, detail) => problem('validation_failed', detail, [{ pointer, detail }]);
const notFound = (what) => problem('not_found', `No ${what}.`);

function write(res, result, instance) {
  if (result.problem) result.body.instance = instance;
  const type = result.problem ? 'application/problem+json' : 'application/json';
  const headers = { ...CORS, ...(result.body === undefined ? {} : { 'content-type': type }) };
  res.writeHead(result.status, headers);
  res.end(result.body === undefined ? undefined : JSON.stringify(result.body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
// undefined: no body. BAD: not JSON.
const BAD = Symbol('bad json');
async function readJson(req) {
  const raw = await readBody(req);
  if (raw.length === 0) return undefined;
  try {
    return JSON.parse(raw.toString());
  } catch {
    return BAD;
  }
}

// Validation helpers. Each returns a problem result, or null when the value is fine.
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const strIn = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
function onlyKeys(b, allowed) {
  const extra = Object.keys(b).find((k) => !allowed.includes(k));
  return extra ? invalid(`/${extra}`, `${extra} is not a known field.`) : null;
}
function bodyObject(b) {
  if (b === BAD) return problem('bad_request', 'The body is not valid JSON.');
  if (!isObj(b)) return invalid('', 'The body must be a JSON object.');
  return null;
}

// Cursor pagination over an array already in the list's order. The cursor is an offset, but clients treat it as opaque.
function page(items, url) {
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const cursor = url.searchParams.get('cursor');
  const offset = cursor === null ? 0 : Number(cursor);
  if (!intIn(limit, 1, 100)) return invalid('query:limit', 'limit must be 1 to 100.');
  if (!Number.isInteger(offset) || offset < 0) return invalid('query:cursor', 'cursor is not valid.');
  const next = offset + limit < items.length ? String(offset + limit) : null;
  return ok({ items: items.slice(offset, offset + limit), nextCursor: next });
}
const newestFirst = (items, key = 'updatedAt') => [...items].sort((a, b) => (a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : 0));

// A calendar day N days from today, in UTC, as YYYY-MM-DD.
function daysFromToday(n) {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + n);
  return day.toISOString().slice(0, 10);
}

function assetView(id) {
  const a = uploads.get(id);
  return { id, url: `${PUBLIC}/mock-storage/${id}`, contentType: a.contentType, sizeBytes: a.sizeBytes, expiresAt: new Date(Date.now() + ASSET_URL_TTL_MS).toISOString() };
}

function validateSendMessage(b, user) {
  const bad = bodyObject(b);
  if (bad) return bad;
  const fields = { text: ['type', 'text'], voice: ['type', 'assetId', 'durationMs'], image: ['type', 'assetId'], file: ['type', 'assetId', 'filename'] }[b.type];
  if (!fields) return invalid('/type', 'type must be text, voice, image or file.');
  const extra = onlyKeys(b, fields);
  if (extra) return extra;
  if (b.type === 'text') return strIn(b.text, 1, 4000) ? null : invalid('/text', 'text must be 1 to 4000 characters.');
  if (typeof b.assetId !== 'string') return invalid('/assetId', `assetId is required for a ${b.type} message.`);
  if (b.type === 'voice' && !intIn(b.durationMs, 1, 600000)) return invalid('/durationMs', 'durationMs must be 1 to 600000.');
  if (b.type === 'file' && !strIn(b.filename, 1, 200)) return invalid('/filename', 'filename must be 1 to 200 characters.');
  const up = uploads.get(b.assetId);
  if (!up || up.userId !== user.id) return invalid('/assetId', 'Unknown assetId.');
  if (up.purpose !== b.type) return invalid('/assetId', `The asset was uploaded for ${up.purpose}, not ${b.type}.`);
  if (!up.bytes) return problem('asset_not_uploaded', 'PUT the file to uploadUrl before sending it.');
  return null;
}

function messageFrom(b, chatId) {
  const base = { id: newId('msg'), chatId, type: b.type, author: 'user', createdAt: now(), reactions: [] };
  if (b.type === 'text') return { ...base, text: b.text };
  if (b.type === 'voice') return { ...base, asset: assetView(b.assetId), durationMs: b.durationMs, transcript: uploads.get(b.assetId)?.transcript ?? null };
  if (b.type === 'image') return { ...base, asset: assetView(b.assetId) };
  return { ...base, asset: assetView(b.assetId), filename: b.filename };
}

// The teammate's side of a conversation. In home, a message becomes a run and a voice reply. In any other chat, the
// teammate reacts, answers in text and, for a new chat, names it once.
function respondTo(chat, message) {
  if (chat.type === 'home') {
    const story = activeStory(activeId);
    if (story) return followUp(story, chat, message);
    const title = message.type === 'text' ? message.text.slice(0, 60) : { voice: 'Voice request', image: 'Image request', file: 'File request' }[message.type];
    startRun({ title, statusLine: 'Working on your request', steps: REQUEST_STEPS, replyWith: { text: 'All done. I looked into that and I have what you asked for.', seconds: 5 }, reactTo: message });
    // An eye straight away; a tick when the run is done.
    setTimeout(() => setReaction(message, 'teammate', '👀'), 400 / SPEED);
    return;
  }
  const firstMessage = unnamedChats.has(chat.id);
  // A chat deleted while the teammate is still replying has nowhere to write, so the timers stop quietly.
  const gone = () => !store.chatMessages[chat.id];
  setTimeout(() => { if (!gone()) setReaction(message, 'teammate', '👍'); }, 400 / SPEED);
  setTimeout(() => {
    if (gone()) return;
    const what = { text: 'that', voice: 'your voice note', image: 'your photo', file: 'the file' }[message.type];
    addMessage(textMessage(chat.id, 'teammate', `Noted. I will come back with ${what}.`));
    if (!firstMessage) return;
    unnamedChats.delete(chat.id);
    setTimeout(() => {
      if (gone()) return;
      chat.title = nameFor(message);
      chat.updatedAt = now();
      emit('chat.updated', { chat });
    }, 300 / SPEED);
  }, 1200 / SPEED);
}

// A demo story's follow-up: the teammate reads the new question (the typing dots show), then acknowledges it. The
// pause before the acknowledgement makes the reply look written, not instant.
const FOLLOW_UP_THINKING_MS = 3000;
function followUp(found, chat, message) {
  const ack = found.story.followUp?.ack;
  setTimeout(() => setReaction(message, 'teammate', '👀'), 400 / SPEED);
  if (!ack) return;
  setTimeout(() => setTeammate('working', 'Reading your question', { type: 'thinking', label: 'Reading your question' }), 700 / SPEED);
  setTimeout(() => {
    addMessage(storyVoice(found, ack, 'teammate', newId('follow_up'), chat.id, now()));
    // The dots end with the reply, so they never show after it.
    setTeammate('idle', 'Ready when you are');
  }, (700 + FOLLOW_UP_THINKING_MS) / SPEED);
}

// Routes under /v1/teammates/{teammateId}. Each pattern is matched against the rest of the path.
const TEAMMATE_ROUTES = [
  ['GET', /^$/, ({ tid }) => ok(teammateView(tid))],
  ['PATCH', /^$/, async ({ req, tid }) => {
    const b = await readJson(req);
    const bad = bodyObject(b) ?? onlyKeys(b, ['name']);
    if (bad) return bad;
    if (Object.keys(b).length === 0) return invalid('', 'Send at least one field.');
    if (!strIn(b.name, 1, 40)) return invalid('/name', 'name must be 1 to 40 characters.');
    store.teammate.name = b.name.trim();
    return ok(teammateView(tid));
  }],

  ['GET', /^\/chats$/, ({ url }) => {
    const archivedParam = url.searchParams.get('archived') ?? 'false';
    if (!['true', 'false'].includes(archivedParam)) return invalid('query:archived', 'archived must be true or false.');
    const archived = archivedParam === 'true';
    return page(newestFirst(store.chats.filter((c) => Boolean(c.archivedAt) === archived)), url);
  }],
  ['POST', /^\/chats$/, async ({ req }) => {
    const raw = await readJson(req);
    const b = raw === undefined ? {} : raw;
    const bad = bodyObject(b) ?? onlyKeys(b, ['title']);
    if (bad) return bad;
    if (b.title !== undefined && !strIn(b.title, 1, 80)) return invalid('/title', 'title must be 1 to 80 characters.');
    const created = now();
    const chat = { id: newId('chat'), type: 'side', title: b.title?.trim() ?? 'New chat', createdAt: created, updatedAt: created, archivedAt: null };
    if (b.title === undefined) unnamedChats.add(chat.id);
    store.chats.push(chat);
    store.chatMessages[chat.id] = [];
    return ok(chat, 201);
  }],
  ['GET', /^\/chats\/([^/]+)$/, ({ m }) => findChat(m[1]) ? ok(findChat(m[1])) : notFound(`chat ${m[1]}`)],
  ['PATCH', /^\/chats\/([^/]+)$/, async ({ req, m }) => {
    const chat = findChat(m[1]);
    if (!chat) return notFound(`chat ${m[1]}`);
    const b = await readJson(req);
    const bad = bodyObject(b) ?? onlyKeys(b, ['title', 'archived']);
    if (bad) return bad;
    if (Object.keys(b).length === 0) return invalid('', 'Send title, archived, or both.');
    if (b.title !== undefined && !strIn(b.title, 1, 80)) return invalid('/title', 'title must be 1 to 80 characters.');
    if (b.archived !== undefined && typeof b.archived !== 'boolean') return invalid('/archived', 'archived must be true or false.');
    if (chat.type === 'home') return problem('conflict', 'The home chat cannot be renamed or archived.');
    if (b.title !== undefined) {
      chat.title = b.title.trim();
      unnamedChats.delete(chat.id);
    }
    if (b.archived !== undefined) chat.archivedAt = b.archived ? now() : null;
    chat.updatedAt = now();
    emit('chat.updated', { chat });
    return ok(chat);
  }],
  ['DELETE', /^\/chats\/([^/]+)$/, ({ m }) => {
    const chat = findChat(m[1]);
    if (!chat) return notFound(`chat ${m[1]}`);
    if (chat.type === 'home') return problem('conflict', 'The home chat cannot be deleted.');
    store.chats.splice(store.chats.indexOf(chat), 1);
    delete store.chatMessages[chat.id];
    unnamedChats.delete(chat.id);
    return ok(undefined, 204);
  }],
  ['POST', /^\/feedback-chat$/, () => {
    const existing = store.chats.find((c) => c.type === 'feedback');
    if (existing) return ok(existing);
    const created = now();
    const chat = { id: newId('chat'), type: 'feedback', title: FEEDBACK_TITLE, createdAt: created, updatedAt: created, archivedAt: null };
    store.chats.push(chat);
    store.chatMessages[chat.id] = [textMessage(chat.id, 'teammate', FEEDBACK_INVITE, created)];
    return ok(chat, 201);
  }],

  ['GET', /^\/chats\/([^/]+)\/messages$/, ({ m, url }) => {
    const chat = findChat(m[1]);
    return chat ? page([...store.chatMessages[chat.id]].reverse(), url) : notFound(`chat ${m[1]}`);
  }],
  ['POST', /^\/chats\/([^/]+)\/messages$/, async ({ req, m, user }) => {
    const chat = findChat(m[1]);
    if (!chat) return notFound(`chat ${m[1]}`);
    const b = await readJson(req);
    const bad = validateSendMessage(b, user);
    if (bad) return bad;
    const message = addMessage(messageFrom(b, chat.id));
    respondTo(chat, message);
    return ok(message, 201);
  }],
  // A teammate with a demo story uses a configured local model. Without one, or when it fails, the transcript is the
  // story's scripted follow-up question. Other teammates get the stand-in transcript.
  ['POST', /^\/chats\/([^/]+)\/transcriptions$/, async ({ req, m, user }) => {
    if (!findChat(m[1])) return notFound(`chat ${m[1]}`);
    const b = await readJson(req);
    const bad = bodyObject(b) ?? onlyKeys(b, ['assetId']);
    if (bad) return bad;
    if (typeof b.assetId !== 'string') return invalid('/assetId', 'assetId is required.');
    const up = uploads.get(b.assetId);
    if (!up || up.userId !== user.id || up.purpose !== 'voice') return notFound(`voice upload ${b.assetId}`);
    if (!up.bytes) return problem('asset_not_uploaded', 'PUT the file to uploadUrl before transcribing it.');
    const story = activeStory(activeId);
    if (story) {
      let text = story.story.followUp?.question ?? MOCK_TRANSCRIPT;
      if (process.env.WHISPER_MODEL) {
        try { text = (await transcribeLocally(up.bytes)) || text; }
        catch (error) { console.error('Local transcription failed, using the scripted question:', error.message); }
      }
      up.transcript = text;
      return ok({ assetId: b.assetId, text });
    }
    return ok({ assetId: b.assetId, text: MOCK_TRANSCRIPT });
  }],
  ['PUT', /^\/chats\/([^/]+)\/messages\/([^/]+)\/reaction$/, async ({ req, m }) => {
    const chat = findChat(m[1]);
    const message = chat && findMessage(chat.id, m[2]);
    if (!message) return notFound(`message ${m[2]}`);
    const b = await readJson(req);
    const bad = bodyObject(b) ?? onlyKeys(b, ['emoji']);
    if (bad) return bad;
    if (typeof b.emoji !== 'string' || b.emoji.length < 1 || b.emoji.length > 16) return invalid('/emoji', 'emoji must be 1 to 16 characters.');
    return ok(setReaction(message, 'user', b.emoji));
  }],
  ['DELETE', /^\/chats\/([^/]+)\/messages\/([^/]+)\/reaction$/, ({ m }) => {
    const chat = findChat(m[1]);
    const message = chat && findMessage(chat.id, m[2]);
    return message ? ok(setReaction(message, 'user', null)) : notFound(`message ${m[2]}`);
  }],

  // Missions are themes. Actions sit under a mission; steps and nested actions sit under an action.
  ['GET', /^\/missions$/, ({ url }) => page(newestFirst(store.missions), url)],
  ['GET', /^\/missions\/([^/]+)$/, ({ m }) => {
    const mission = store.missions.find((x) => x.id === m[1]);
    return mission ? ok(mission) : notFound(`mission ${m[1]}`);
  }],
  ['GET', /^\/missions\/([^/]+)\/actions$/, ({ m, url }) => {
    if (!store.missions.some((x) => x.id === m[1])) return notFound(`mission ${m[1]}`);
    return page(store.actions.filter((a) => a.missionId === m[1] && a.parentActionId === null), url);
  }],
  ['GET', /^\/actions\/([^/]+)$/, ({ m }) => {
    const a = store.actions.find((x) => x.id === m[1]);
    return a ? ok(a) : notFound(`action ${m[1]}`);
  }],
  ['GET', /^\/actions\/([^/]+)\/children$/, ({ m, url }) => {
    if (!store.actions.some((x) => x.id === m[1])) return notFound(`action ${m[1]}`);
    const items = (store.children[m[1]] ?? []).map((id) => store.steps.find((s) => s.id === id) ?? store.actions.find((a) => a.id === id));
    return page(items, url);
  }],

  ['GET', /^\/runs$/, ({ url }) => page(newestFirst(store.runs, 'createdAt'), url)],
  ['GET', /^\/runs\/([^/]+)$/, ({ m }) => {
    const r = store.runs.find((x) => x.id === m[1]);
    return r ? ok(r) : notFound(`run ${m[1]}`);
  }],
  ['POST', /^\/runs\/([^/]+)\/cancel$/, ({ m }) => {
    const result = cancelRun(m[1]);
    if (result === 'missing') return notFound(`run ${m[1]}`);
    if (result === 'finished') return problem('conflict', 'The run has already finished.');
    return ok(undefined, 202);
  }],
  ['POST', /^\/runs\/([^/]+)\/decision$/, async ({ req, m }) => {
    if (!store.runs.some((x) => x.id === m[1])) return notFound(`run ${m[1]}`);
    const b = await readJson(req);
    const bad = bodyObject(b) ?? onlyKeys(b, ['decision']);
    if (bad) return bad;
    if (!['approve', 'decline'].includes(b.decision)) return invalid('/decision', 'decision must be approve or decline.');
    return decideRun(m[1], b.decision) === 'conflict' ? problem('conflict', 'The run is not waiting for a decision.') : ok(undefined, 202);
  }],

  // The brain: a graph of what the teammate knows, and the detail for each node.
  ['GET', /^\/brain\/graph$/, () => {
    const { nodes, edges } = store.brain;
    const count = (t) => nodes.filter((n) => n.type === t).length;
    return ok({ counts: { people: count('person'), facts: count('fact'), missions: count('mission') }, nodes, edges });
  }],
  ['GET', /^\/brain\/nodes\/([^/]+)$/, ({ m }) => {
    const node = store.brain.nodes.find((n) => n.id === m[1]);
    if (!node) return notFound(`node ${m[1]}`);
    const byId = Object.fromEntries(store.brain.nodes.map((n) => [n.id, n]));
    const related = store.brain.edges
      .filter((e) => e.fromId === node.id || e.toId === node.id)
      .map((e) => byId[e.fromId === node.id ? e.toId : e.fromId])
      .filter(Boolean)
      .map(({ id, type, label }) => ({ id, type, label }));
    const runs = store.runs
      .filter((r) => r.usedNodeIds.includes(node.id) || r.learnedNodeIds.includes(node.id))
      .map(({ id, title }) => ({ id, title }));
    return ok({ id: node.id, type: node.type, label: node.label, ref: node.ref, ...store.brain.details[node.id], related, runs });
  }],

  // Channels are read only.
  ['GET', /^\/channel-types$/, ({ url }) => page(store.channelTypes, url)],
  ['GET', /^\/channels$/, ({ url }) => page(store.channels, url)],
  ['GET', /^\/channels\/([^/]+)$/, ({ m }) => {
    const c = store.channels.find((x) => x.id === m[1]);
    return c ? ok(c) : notFound(`channel ${m[1]}`);
  }],
  ['GET', /^\/channels\/([^/]+)\/conversations$/, ({ m, url }) => {
    if (!store.channels.some((x) => x.id === m[1])) return notFound(`channel ${m[1]}`);
    return page(newestFirst(store.conversations.filter((c) => c.channelId === m[1])), url);
  }],
  ['GET', /^\/conversations\/([^/]+)$/, ({ m }) => {
    const c = store.conversations.find((x) => x.id === m[1]);
    return c ? ok(c) : notFound(`conversation ${m[1]}`);
  }],
  ['GET', /^\/conversations\/([^/]+)\/threads$/, ({ m, url }) => {
    if (!store.conversations.some((x) => x.id === m[1])) return notFound(`conversation ${m[1]}`);
    return page(newestFirst(store.threads.filter((t) => t.conversationId === m[1])), url);
  }],
  ['GET', /^\/conversations\/([^/]+)\/messages$/, ({ m, url }) => {
    if (!store.conversations.some((x) => x.id === m[1])) return notFound(`conversation ${m[1]}`);
    return page([...(store.channelMessages[m[1]] ?? [])].reverse(), url);
  }],
  ['GET', /^\/threads\/([^/]+)\/messages$/, ({ m, url }) => {
    if (!store.threads.some((x) => x.id === m[1])) return notFound(`thread ${m[1]}`);
    return page(store.threadMessages[m[1]] ?? [], url);
  }],
];

// Routes that need a user but no teammate.
async function userRoute(method, path, ctx) {
  const { req, url, user } = ctx;
  if (method === 'GET' && path === '/v1/me') return ok({ user: userView(user), teammates: user.teammateIds.map(teammateView) });
  if (method === 'GET' && path === '/v1/me/plan') return ok({ name: 'Explore plan', usedPercent: 16, resetsOn: daysFromToday(5) });
  if (method === 'GET' && path === '/v1/teammates') return page(user.teammateIds.map(teammateView), url);
  if (method === 'POST' && path === '/v1/realtime-tickets') {
    for (const [k, v] of tickets) if (v.expires < Date.now()) tickets.delete(k);
    const ticket = newId('rt');
    const expires = Date.now() + 30_000;
    tickets.set(ticket, { userId: user.id, expires });
    return ok({ ticket, expiresAt: new Date(expires).toISOString() }, 201);
  }
  if (method === 'POST' && path === '/v1/uploads') {
    const b = await readJson(req);
    const bad = bodyObject(b) ?? onlyKeys(b, ['purpose', 'contentType', 'sizeBytes']);
    if (bad) return bad;
    if (!['voice', 'image', 'file'].includes(b.purpose)) return invalid('/purpose', 'purpose must be voice, image or file.');
    if (typeof b.contentType !== 'string' || b.contentType.length < 3 || b.contentType.length > 127 || !b.contentType.includes('/')) return invalid('/contentType', 'contentType must be a media type.');
    if (!intIn(b.sizeBytes, 1, MAX_UPLOAD_BYTES)) return invalid('/sizeBytes', `sizeBytes must be 1 to ${MAX_UPLOAD_BYTES}.`);
    const assetId = newId('ast');
    uploads.set(assetId, { userId: user.id, purpose: b.purpose, contentType: b.contentType, sizeBytes: b.sizeBytes, bytes: null });
    return ok({ assetId, uploadUrl: `${PUBLIC}/mock-storage/${assetId}`, method: 'PUT', headers: { 'Content-Type': b.contentType }, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() }, 201);
  }
  const download = /^\/v1\/assets\/([^/]+)\/download-url$/.exec(path);
  if (method === 'POST' && download) {
    const up = uploads.get(download[1]);
    if (!up || up.userId !== user.id) return notFound(`asset ${download[1]}`);
    if (!up.bytes) return problem('asset_not_uploaded', 'PUT the file to uploadUrl first.');
    const { url, expiresAt } = assetView(download[1]);
    return ok({ assetId: download[1], url, expiresAt });
  }
  return null;
}

// Stand-in for the auth service (docs/handoff/auth-service.draft.yaml). Not part of the app API contract.
async function authRoute(method, path, req) {
  const emailOk = (e) => typeof e === 'string' && e.length <= 254 && /^[^@\s]+@[^@\s]+$/.test(e);
  if (method === 'POST' && path === '/auth/v1/email-lookup') {
    const b = await readJson(req);
    // The same answer for every well-formed email, so this step never shows which accounts exist.
    return bodyObject(b) ?? (emailOk(b.email) ? ok(undefined, 204) : invalid('/email', 'email must be an email address.'));
  }
  if (method === 'POST' && path === '/auth/v1/tokens') {
    const b = await readJson(req);
    const bad = bodyObject(b);
    if (bad) return bad;
    if (!emailOk(b.email)) return invalid('/email', 'email must be an email address.');
    if (!strIn(b.password, 1, 200)) return invalid('/password', 'password is required.');
    const user = userByEmail(b.email);
    // An unknown email and a wrong password get the same answer.
    if (!user || b.password !== user.password) return problem('unauthorized', 'Email or password is incorrect.');
    // Every sign-in starts the demo again: the stories are as written and nothing said before is left.
    reset();
    resetScenarios();
    idempotent.clear();
    const { token, expiresAt } = startSession(user.id);
    return ok({ accessToken: token, tokenType: 'Bearer', expiresAt }, 201);
  }
  if (method === 'DELETE' && path === '/auth/v1/tokens/current') {
    const token = bearer(req);
    if (!token || !sessionUser(token)) return problem('unauthorized', 'The access token is missing or not valid.');
    endSession(token);
    return ok(undefined, 204);
  }
  return null;
}

const bearer = (req) => /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1] ?? null;

async function route(req, res, url) {
  const path = url.pathname;
  const method = req.method;

  // Mock controls. Not part of the contract.
  if (path === '/mock/reset' && method === 'POST') {
    reset();
    resetScenarios();
    idempotent.clear();
    return ok({ ok: true });
  }

  // Demo stories (demo/README.md): their files, served without a token like a CDN, and the extras the app draws.
  if (path.startsWith('/mock/stories/') && method === 'GET') {
    const found = storyFile(decodeURIComponent(path.slice('/mock/stories/'.length)));
    if (!found) return notFound('story file');
    res.writeHead(200, { ...CORS, 'content-type': found.contentType });
    createReadStream(found.file).pipe(res);
    return null;
  }
  const extras = /^\/mock\/story\/([^/]+)$/.exec(path);
  if (extras && method === 'GET') return ok(storyExtras(extras[1]));

  // Stands in for object storage. The app PUTs the file here after createUpload; asset URLs GET it back.
  if (path.startsWith('/mock-storage/')) {
    const id = path.split('/')[2];
    const up = uploads.get(id);
    if (!up) return notFound(`upload ${id}`);
    if (method === 'PUT') {
      up.bytes = await readBody(req);
      return ok(undefined, 200);
    }
    if (method === 'GET' && up.bytes) {
      res.writeHead(200, { ...CORS, 'content-type': up.contentType });
      res.end(up.bytes);
      return null;
    }
    return notFound(`upload ${id}`);
  }

  // Avatars: served as is, with their own content type.
  if (path.startsWith('/assets/avatars/') && method === 'GET') {
    const name = path.slice('/assets/avatars/'.length);
    const file = join(AVATARS_DIR, name);
    if (!AVATAR_FILE.test(name) || !existsSync(file)) return notFound('avatar');
    res.writeHead(200, { ...CORS, 'content-type': name.endsWith('.gif') ? 'image/gif' : 'image/png', 'cache-control': 'public, max-age=3600' });
    createReadStream(file).pipe(res);
    return null;
  }

  // Inbound webhooks (docs/handoff/inbound-webhooks.draft.yaml), signed as Standard Webhooks.
  if (path === '/v1/webhooks/email' && method === 'POST') {
    const raw = (await readBody(req)).toString();
    if (!verifyWebhook(req.headers, raw)) return problem('unauthorized', 'The webhook signature or timestamp is not valid.');
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return problem('bad_request', 'The body is not valid JSON.');
    }
    const outcome = acceptInbound(req.headers['webhook-id'], event);
    if (outcome === 'unsupported') return problem('bad_request', `Event type ${event.type} is not handled.`);
    return ok({ outcome }, 202);
  }

  if (path.startsWith('/auth/v1/')) return (await authRoute(method, path, req)) ?? problem('not_found', `No route for ${method} ${path}.`);
  if (!path.startsWith('/v1/')) return problem('not_found', `No route for ${method} ${path}.`);

  const token = bearer(req);
  const user = token && sessionUser(token);
  if (!user) return problem('unauthorized', 'The access token is missing or not valid.');
  const ctx = { req, url, user };

  const replay = (key) => key && `${user.id} ${method} ${path} ${key}`;
  const key = method === 'POST' ? replay(req.headers['idempotency-key']) : null;
  if (key && idempotent.has(key)) return idempotent.get(key);
  const remember = (result) => {
    if (key && result && result.status < 500) idempotent.set(key, result);
    return result;
  };

  const userResult = await userRoute(method, path, ctx);
  if (userResult) return remember(userResult);

  const tm = /^\/v1\/teammates\/([^/]+)(.*)$/.exec(path);
  if (!tm) return problem('not_found', `No route for ${method} ${path}.`);
  // A teammate the user does not manage is reported as not found, the same as one that does not exist.
  if (!user.teammateIds.includes(tm[1])) return notFound(`teammate ${tm[1]}`);
  activate(tm[1]);
  syncStory();
  for (const [verb, pattern, handler] of TEAMMATE_ROUTES) {
    const m = pattern.exec(tm[2]);
    if (m && verb === method) return remember(await handler({ ...ctx, m, tid: tm[1] }));
  }
  return problem('not_found', `No route for ${method} ${path}.`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC);
  if (req.method === 'OPTIONS') return write(res, ok(undefined, 204), url.pathname);
  try {
    const result = await route(req, res, url);
    if (result) write(res, result, url.pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) write(res, problem('internal', 'The mock server failed.'), url.pathname);
  }
});

// WebSocket at /v1/realtime. The app takes a one-use ticket from POST /v1/realtime-tickets and connects with
// ?ticket=, so no access token sits in a URL. The first connection that uses a ticket spends it.
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, PUBLIC);
  const ticket = url.searchParams.get('ticket') || '';
  const entry = url.pathname === '/v1/realtime' ? tickets.get(ticket) : undefined;
  tickets.delete(ticket);
  if (!entry || entry.expires < Date.now()) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    clients.add(ws);
    ws.userId = entry.userId;
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });
});
setInterval(() => {
  for (const ws of clients) ws.ping();
}, 25000).unref();

// Sends a 1001 close to every socket on shutdown, as the contract describes.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const ws of clients) ws.close(1001, 'Server shutting down');
    server.close();
    process.exit(0);
  });
}

server.listen(PORT, () => {
  console.log(`Budy mock API at ${PUBLIC} (REST, webhooks, auth stand-in), WebSocket at ${PUBLIC.replace('http', 'ws')}/v1/realtime`);
});

