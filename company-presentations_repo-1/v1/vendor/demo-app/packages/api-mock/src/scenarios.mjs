import { createHmac, timingSafeEqual } from 'node:crypto';
import { store, activate, setTeammate, addMessage, upsertRun, newId, now, voiceMessage, homeChat, learnSomething, setReaction } from './store.mjs';

// Simulated teammate work. A request or an inbound email becomes a run that moves through queued and running to
// succeeded, with a voice reply in the home chat at the end. Every change is pushed over the WebSocket.
// MOCK_SPEED=3 makes it run three times faster.

const SPEED = Number(process.env.MOCK_SPEED || 1);
const READY = 'Ready when you are';
const canceled = new Set();
const seenEvents = new Set();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms / SPEED));
const FINAL = ['succeeded', 'failed', 'canceled'];

// A request from the user (voice, text, photo or file): the teammate reads it, thinks, learns, writes and replies.
// It finishes by itself and never asks for a decision, because nothing is being sent anywhere.
export const REQUEST_STEPS = [
  { status: 'running', progress: 0.2, summary: 'Reading your note.', activity: { type: 'reading', label: 'Reading your note' } },
  { status: 'running', progress: 0.4, summary: 'Thinking it through.', activity: { type: 'thinking', label: 'Thinking it through' } },
  { status: 'running', progress: 0.6, summary: 'Learning from it.', activity: { type: 'learning', label: 'Learning about this' }, learn: true },
  { status: 'running', progress: 0.8, summary: 'Writing the reply.', activity: { type: 'writing', label: 'Writing the reply' } },
  { status: 'succeeded', progress: 1, summary: 'Replied.', activity: null },
];

// An inbound email: the teammate reads it and drafts a reply, then tells the user. Nothing is sent.
export const EMAIL_STEPS = [
  { status: 'running', progress: 0.2, summary: 'Reading the email.', activity: { type: 'email', label: 'Reading a new email' } },
  { status: 'running', progress: 0.6, summary: 'Drafting a reply.', activity: { type: 'writing', label: 'Writing a reply' } },
  { status: 'succeeded', progress: 1, summary: 'Drafted a reply. Nothing was sent.', activity: null },
];

const reply = (transcript, seconds) => voiceMessage(homeChat().id, 'teammate', transcript, seconds * 1000);

export function startRun({ title, statusLine, activity = { type: 'reading', label: 'Reading your note' }, steps = REQUEST_STEPS, replyWith, reactTo = null }) {
  const r = { id: newId('run'), actionId: null, title, status: 'queued', progress: 0, summary: null, usedNodeIds: [], learnedNodeIds: [], createdAt: now(), updatedAt: now() };
  upsertRun(r);
  setTeammate('working', statusLine, activity);
  (async () => {
    await sleep(800);
    for (const { activity: stepActivity, learn, ...s } of steps) {
      await sleep(1500);
      if (canceled.has(r.id)) return;
      Object.assign(r, s);
      if (learn) learnSomething(r);
      upsertRun(r);
      setTeammate('working', statusLine, stepActivity ?? null);
    }
    setTeammate('idle', READY);
    if (reactTo) setReaction(reactTo, 'teammate', '✅');
    addMessage(reply(replyWith.text, replyWith.seconds));
  })().catch((err) => console.error('scenario failed', err));
  return r;
}

export function cancelRun(id) {
  const r = store.runs.find((x) => x.id === id);
  if (!r) return 'missing';
  if (FINAL.includes(r.status)) return 'finished';
  canceled.add(id);
  r.status = 'canceled';
  upsertRun(r);
  setTeammate('idle', READY);
  return 'canceled';
}

// The user's decision on a waiting run. Approve lets the work go ahead; decline holds it and sends nothing.
export function decideRun(id, decision) {
  const r = store.runs.find((x) => x.id === id);
  if (!r) return 'missing';
  if (r.status !== 'waiting') return 'conflict';
  if (decision === 'decline') {
    r.status = 'canceled';
    r.summary = 'Held. Nothing was sent.';
    upsertRun(r);
    setTeammate('idle', READY);
    addMessage(reply('Understood. Nothing was sent.', 3));
    return 'declined';
  }
  r.status = 'running';
  r.progress = 0.95;
  r.summary = 'Sending it now.';
  upsertRun(r);
  setTeammate('working', 'Sending the note', { type: 'sending', label: 'Sending the note' });
  (async () => {
    await sleep(1500);
    r.status = 'succeeded';
    r.progress = 1;
    r.summary = 'Sent.';
    upsertRun(r);
    setTeammate('idle', READY);
    addMessage(reply('Sent. I will let you know if there is a reply.', 4));
  })().catch((err) => console.error('scenario failed', err));
  return 'approved';
}

// Inbound webhooks, signed as in the Standard Webhooks spec: HMAC-SHA256 over "<id>.<timestamp>.<body>", base64,
// sent as `webhook-signature: v1,<signature>`. Timestamps older than five minutes are refused.
export const WEBHOOK_SECRET = process.env.MOCK_WEBHOOK_SECRET || 'mock-webhook-secret';
const TOLERANCE_SECONDS = 5 * 60;
export const signWebhook = (id, timestamp, raw) =>
  'v1,' + createHmac('sha256', WEBHOOK_SECRET).update(`${id}.${timestamp}.${raw}`).digest('base64');

export function verifyWebhook(headers, raw) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatures = headers['webhook-signature'];
  if (typeof id !== 'string' || typeof timestamp !== 'string' || typeof signatures !== 'string') return false;
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signWebhook(id, timestamp, raw));
  return signatures.split(' ').some((s) => {
    const got = Buffer.from(s);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

// Acknowledge at once, then process in the background. A repeated webhook-id is not processed twice.
// The mock routes an event to `data.teammateId`, or to Sam when it is not set.
export function acceptInbound(id, event) {
  if (seenEvents.has(id)) return 'duplicate';
  if (event.type !== 'email.received') return 'unsupported';
  seenEvents.add(id);
  setTimeout(() => {
    activate(event.data?.teammateId === 'tm_sarah' ? 'tm_sarah' : 'tm_sam');
    const from = event.data?.from ?? 'someone';
    startRun({
      title: `Reply to ${from}`,
      statusLine: 'Reading a new email',
      activity: { type: 'email', label: 'Reading a new email' },
      steps: EMAIL_STEPS,
      replyWith: { text: `I read the email from ${from} and drafted a reply. I have not sent anything.`, seconds: 6 },
    });
  }, 400 / SPEED);
  return 'accepted';
}

export function resetScenarios() {
  canceled.clear();
  seenEvents.clear();
}
