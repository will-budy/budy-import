import { randomUUID } from 'node:crypto';

// In-memory state for the mock, one store per teammate. Shapes follow @budybot/app-api-contract.
// Restart the server, or POST /mock/reset, to go back to this seed. All data is fake.
//
// Per teammate:
// - chats: the home chat, side chats and the feedback chat. chatMessages holds each chat's messages, oldest first.
// - missions, actions, steps, children: the planning structure (see docs/missions-and-actions.md).
// - runs: executions. brain: nodes, edges and node detail. channels, conversations, threads: read-only views.

export const clients = new Set(); // open WebSocket connections
export const now = () => new Date().toISOString();
const ago = (hours) => new Date(Date.now() - hours * 3600 * 1000).toISOString();
export const newId = (prefix) => `${prefix}_${randomUUID().slice(0, 8)}`;
export const PUBLIC = process.env.MOCK_PUBLIC_URL || `http://localhost:${Number(process.env.PORT || 4010)}`;

// Brain node ids get their own prefix, so they never collide with the ids of the resources they stand for.
const bn = (id) => (id === 'you' ? 'bn_user' : `bn_${id}`);

// Builds the brain from compact rows. A row is { id, type, label, weight, mission?, d: { summary, h, src, c } }, where
// h is hours since it was learned, src is [provenance type, id, label] and c is confidence.
function brainFrom(rows, edges) {
  return {
    nodes: rows.map((n) => ({
      id: bn(n.id),
      type: n.type === 'you' ? 'user' : n.type,
      label: n.label,
      weight: n.weight,
      ref: n.type === 'mission' ? { type: 'mission', id: n.id } : null,
    })),
    edges: edges.map(([from, to, label]) => ({ fromId: bn(from), toId: bn(to), label })),
    details: Object.fromEntries(rows.map((n) => [bn(n.id), {
      summary: n.d.summary,
      learnedAt: ago(n.d.h),
      provenance: { type: n.d.src[0], id: n.d.src[1], label: n.d.src[2] },
      confidence: n.d.c,
    }])),
  };
}

// Messages, in the contract's shape.
export function textMessage(chatId, author, text, createdAt = now(), reactions = [], id = newId('msg')) {
  return { id, chatId, type: 'text', author, createdAt, reactions, text };
}
export function voiceMessage(chatId, author, transcript, durationMs, createdAt = now(), reactions = [], id = newId('msg'), asset = null) {
  return { id, chatId, type: 'voice', author, createdAt, reactions, asset, durationMs, transcript };
}
const chat = (id, type, title, createdAt, updatedAt) => ({ id, type, title, createdAt, updatedAt, archivedAt: null });

// One channel message.
function cm(id, conversationId, name, isUser, text, createdAt, extra = {}) {
  return { id, conversationId, author: { name, isUser }, subject: extra.subject ?? null, text, createdAt, threadId: extra.threadId ?? null, replyCount: extra.replyCount ?? 0 };
}
const step = (id, title, detail = null) => ({ id, type: 'step', title, detail });
const action = (id, missionId, parentActionId, mode, title, summary, trigger, updatedAt) =>
  ({ id, type: 'action', missionId, parentActionId, mode, title, summary, trigger, updatedAt });
const run = (id, actionId, title, summary, used, learned, createdAt, updatedAt) =>
  ({ id, actionId, title, status: 'succeeded', progress: 1, summary, usedNodeIds: used.map(bn), learnedNodeIds: learned.map(bn), createdAt, updatedAt });
const weekly = (cron) => ({ type: 'schedule', cron, timezone: 'America/Los_Angeles' });
const onEvent = (event) => ({ type: 'event', event });
const CHANNEL_TYPES = [
  { type: 'text', title: 'Text messages', connected: true },
  { type: 'slack', title: 'Slack', connected: true },
  { type: 'email', title: 'Email', connected: true },
];
const CHANNELS = [
  { id: 'chn_text', type: 'text', title: 'Text messages', threaded: false, updatedAt: '2026-10-15T12:55:00Z' },
  { id: 'chn_slack', type: 'slack', title: 'Slack', threaded: true, updatedAt: '2026-10-15T12:40:00Z' },
  { id: 'chn_email', type: 'email', title: 'Email', threaded: false, updatedAt: '2026-10-15T11:15:00Z' },
];

// Sam is the CEO.
const SAM_NODES = [
  { id: 'you', type: 'you', label: 'You', weight: 1, d: { summary: 'The person Sam works for. Everything here is learned from you or for you.', h: 400, src: ['import', null, 'Set up when you started'], c: 1 } },
  { id: 'per_01', type: 'person', label: 'Mira', weight: 0.9, d: { summary: 'Runs the sales team. Likes a short voice note on Fridays.', h: 70, src: ['message', 'msg_01', 'A voice note from you'], c: 0.92 } },
  { id: 'per_02', type: 'person', label: 'Dev', weight: 0.6, d: { summary: 'Engineer on the team. Usually answers check-ins late in the day.', h: 120, src: ['action', 'act_02', 'Check team health'], c: 0.8 } },
  { id: 'per_03', type: 'person', label: 'Priya', weight: 0.55, d: { summary: 'Designer. Shares work in progress on Wednesdays.', h: 130, src: ['action', 'act_02', 'Check team health'], c: 0.78 } },
  { id: 'per_04', type: 'person', label: 'Tom', weight: 0.5, d: { summary: 'Runs operations and keeps the team calendar.', h: 200, src: ['import', null, 'Calendar contacts'], c: 0.85 } },
  { id: 'per_05', type: 'person', label: 'Lena', weight: 0.4, d: { summary: 'Finance partner. Needs numbers by the third of the month.', h: 260, src: ['message', null, 'A text note from you'], c: 0.7 } },
  { id: 'per_06', type: 'person', label: 'Arjun', weight: 0.6, d: { summary: 'Sales rep who gets the weekly lead list.', h: 90, src: ['action', 'act_01', 'Send leads for follow-up'], c: 0.88 } },
  { id: 'per_07', type: 'person', label: 'Chloe', weight: 0.35, d: { summary: 'A new inbound lead from a design studio.', h: 31, src: ['action', 'act_09', 'Reply to a new inbound lead'], c: 0.74 } },
  { id: 'fact_01', type: 'fact', label: 'Prefers voice notes', weight: 0.6, d: { summary: 'Mira answers faster to a voice note than to an email.', h: 70, src: ['message', 'msg_01', 'A voice note from you'], c: 0.9 } },
  { id: 'fact_02', type: 'fact', label: 'Friday pipeline note', weight: 0.55, d: { summary: 'You want the pipeline numbers sent to Mira every Friday.', h: 3, src: ['run', 'run_01', 'Your note about Friday'], c: 0.95 } },
  { id: 'fact_03', type: 'fact', label: 'Stand-up at 9:30', weight: 0.4, d: { summary: 'The team stand-up starts at 9:30 on weekdays.', h: 220, src: ['import', null, 'Calendar'], c: 0.97 } },
  { id: 'fact_04', type: 'fact', label: 'Thursday sync at 3 PM', weight: 0.45, d: { summary: 'The Thursday sync was moved to 3 PM.', h: 27, src: ['action', 'act_08', 'Reschedule a meeting'], c: 0.93 } },
  { id: 'fact_05', type: 'fact', label: 'Add 15 min travel', weight: 0.3, d: { summary: 'Leave 15 minutes between meetings in different places.', h: 300, src: ['message', null, 'A voice note from you'], c: 0.82 } },
  { id: 'fact_06', type: 'fact', label: 'Pacific time', weight: 0.3, d: { summary: 'Your day is in Pacific time.', h: 400, src: ['import', null, 'Set up when you started'], c: 1 } },
  { id: 'fact_07', type: 'fact', label: 'Leads stall after 7 days', weight: 0.5, d: { summary: 'A lead with no reply in seven days counts as stalled.', h: 90, src: ['action', 'act_01', 'Send leads for follow-up'], c: 0.86 } },
  { id: 'fact_08', type: 'fact', label: 'Summary on Mondays', weight: 0.35, d: { summary: 'The weekly team summary arrives as a voice note on Monday.', h: 150, src: ['action', 'act_02', 'Check team health'], c: 0.9 } },
  { id: 'fact_09', type: 'fact', label: 'Likes short replies', weight: 0.5, d: { summary: 'You prefer replies under thirty seconds.', h: 180, src: ['message', null, 'A voice note from you'], c: 0.88 } },
  { id: 'mis_01', type: 'mission', label: 'Team management', weight: 0.7, d: { summary: "Keeps the team's check-ins and follow-ups on track.", h: 300, src: ['import', null, 'Set up with the mission'], c: 1 } },
  { id: 'mis_02', type: 'mission', label: 'Calendar management', weight: 0.65, d: { summary: "Watches the calendar and sends the day's agenda.", h: 300, src: ['import', null, 'Set up with the mission'], c: 1 } },
  { id: 'mis_03', type: 'mission', label: 'Sales', weight: 0.7, d: { summary: 'Follows up on leads and answers pipeline questions.', h: 300, src: ['import', null, 'Set up with the mission'], c: 1 } },
];
const SAM_EDGES = [
  ['you', 'per_01', 'works with'], ['you', 'per_02', 'works with'], ['you', 'per_03', 'works with'], ['you', 'per_04', 'works with'],
  ['you', 'per_05', 'works with'], ['you', 'fact_06', 'lives by'], ['you', 'fact_09', 'prefers'], ['you', 'fact_05', 'prefers'],
  ['per_01', 'fact_01', 'prefers'], ['per_01', 'fact_02', 'gets'], ['per_06', 'fact_07', 'follows'], ['per_04', 'fact_03', 'runs'],
  ['per_04', 'fact_04', 'moved'], ['per_02', 'fact_08', 'reports in'], ['per_07', 'per_06', 'handed to'],
  ['mis_01', 'per_02', 'involves'], ['mis_01', 'per_03', 'involves'], ['mis_01', 'fact_08', 'uses'], ['mis_01', 'per_04', 'involves'],
  ['mis_02', 'per_04', 'involves'], ['mis_02', 'fact_03', 'uses'], ['mis_02', 'fact_04', 'uses'], ['mis_02', 'fact_05', 'uses'],
  ['mis_03', 'per_01', 'involves'], ['mis_03', 'per_06', 'involves'], ['mis_03', 'per_07', 'involves'], ['mis_03', 'fact_07', 'uses'], ['mis_03', 'fact_02', 'uses'],
  ['you', 'mis_01', 'owns'], ['you', 'mis_02', 'owns'], ['you', 'mis_03', 'owns'], ['per_05', 'fact_09', 'told'],
];

function seedSam() {
  const home = 'chat_sam_home';
  return {
    teammate: { name: 'Sam', role: 'CEO', status: 'idle', statusLine: 'Ready when you are', activity: null,
      identity: {
        brief: 'I keep things moving quietly and tell you only what matters. I would rather ask one good question than guess. I do my best work when I have a clear goal and some room.',
        cultureCode: ['Calm under pressure', 'Plain spoken', 'Asks before guessing', 'Brief by default', 'Follows through', 'Keeps your secrets'],
      } },
    chats: [
      chat(home, 'home', 'Home', '2026-10-01T09:00:00Z', '2026-10-15T13:02:20Z'),
      chat('chat_sam_01', 'side', 'Offsite planning', '2026-10-14T16:00:00Z', '2026-10-15T10:30:00Z'),
      chat('chat_sam_03', 'side', 'Hiring loop for the sales role', '2026-10-13T09:00:00Z', '2026-10-13T09:40:00Z'),
    ],
    chatMessages: {
      [home]: [
        voiceMessage(home, 'user', 'Pull the pipeline numbers for Friday and send them to Mira.', 9000, '2026-10-15T13:02:00Z', [{ emoji: '✅', author: 'teammate' }], 'msg_01'),
        voiceMessage(home, 'teammate', 'Got it. I will pull the pipeline and draft the note to Mira. I will check back before I send anything.', 8000, '2026-10-15T13:02:20Z', [{ emoji: '👍', author: 'user' }], 'msg_02'),
      ],
      chat_sam_01: [
        textMessage('chat_sam_01', 'user', "Let's plan the offsite around the sales review.", '2026-10-15T10:28:00Z', [{ emoji: '👍', author: 'teammate' }], 'msg_s01'),
        textMessage('chat_sam_01', 'teammate', 'Noted. I will draft three options for dates.', '2026-10-15T10:29:00Z', [{ emoji: '❤️', author: 'user' }], 'msg_s02'),
      ],
      chat_sam_03: [
        textMessage('chat_sam_03', 'user', 'Set up the loop for the sales role.', '2026-10-13T09:00:00Z', [], 'msg_s04'),
      ],
    },
    missions: [
      { id: 'mis_01', title: 'Team management', icon: 'team', summary: "Keeps the team's check-ins, questions and follow-ups on track.", updatedAt: '2026-10-15T09:00:00Z' },
      { id: 'mis_02', title: 'Calendar management', icon: 'calendar', summary: "Watches the calendar for clashes and sends the day's agenda.", updatedAt: '2026-10-15T07:00:00Z' },
      { id: 'mis_03', title: 'Sales', icon: 'sales', summary: 'Follows up on leads and answers pipeline questions.', updatedAt: '2026-10-14T08:00:00Z' },
    ],
    actions: [
      action('act_01', 'mis_03', null, 'proactive', 'Send leads for follow-up', "Sends the week's stalled leads to the rep, ranked by deal size.", weekly('0 8 * * 1'), '2026-10-14T08:00:00Z'),
      action('act_03', 'mis_03', null, 'reactive', 'Answer a pipeline question', 'Pulls the pipeline when you ask and replies in voice.', null, '2026-10-15T13:02:00Z'),
      action('act_09', 'mis_03', null, 'proactive', 'Reply to a new inbound lead', 'Drafts a reply to a new lead and waits for your OK.', onEvent('email.received'), '2026-10-14T08:00:00Z'),
      action('act_02', 'mis_01', null, 'proactive', 'Check team health', "Reads this week's check-ins every weekday morning.", weekly('0 9 * * 1-5'), '2026-10-15T09:00:00Z'),
      action('act_04', 'mis_01', 'act_02', 'proactive', 'Flag a drop in mood', 'Starts when a check-in is submitted with a lower score.', onEvent('checkin.submitted'), '2026-10-15T09:00:00Z'),
      action('act_05', 'mis_01', null, 'reactive', 'Answer a question about the team', "Looks through the team's notes and replies in voice.", null, '2026-10-15T09:00:00Z'),
      action('act_06', 'mis_02', null, 'proactive', 'Warn about double bookings', 'Checks each new calendar event for clashes.', onEvent('calendar.event.created'), '2026-10-15T07:00:00Z'),
      action('act_07', 'mis_02', null, 'proactive', "Send the day's agenda", 'Sends a voice summary of today before you start.', weekly('0 7 * * 1-5'), '2026-10-15T07:00:00Z'),
      action('act_08', 'mis_02', null, 'reactive', 'Reschedule a meeting', 'Finds free slots and waits for you to choose one.', null, '2026-10-15T07:00:00Z'),
    ],
    // Ordered children of each action: step ids and nested action ids.
    children: {
      act_01: ['stp_01', 'stp_02', 'stp_03'], act_02: ['stp_04', 'stp_05', 'act_04', 'stp_06'], act_03: ['stp_09', 'stp_10'],
      act_04: ['stp_07', 'stp_08'], act_05: ['stp_11', 'stp_12'], act_06: ['stp_13', 'stp_14'], act_07: ['stp_15', 'stp_16', 'stp_17'],
      act_08: ['stp_18', 'stp_19', 'stp_20'], act_09: ['stp_21', 'stp_22', 'stp_23'],
    },
    steps: [
      step('stp_01', 'Pull leads with no reply in seven days'), step('stp_02', 'Rank them by deal size'), step('stp_03', 'Send the list to the rep', 'Sent only after you approve.'),
      step('stp_04', "Collect this week's check-ins"), step('stp_05', 'Compare with the last four weeks'), step('stp_06', 'Write the weekly summary for you', 'Sent as a voice note on Monday.'),
      step('stp_07', 'Read the three latest check-ins'), step('stp_08', 'Draft a note for the manager'),
      step('stp_09', 'Pull the pipeline'), step('stp_10', 'Reply in voice'),
      step('stp_11', "Search the team's notes"), step('stp_12', 'Reply in voice'),
      step('stp_13', 'Check the new event against existing ones'), step('stp_14', 'Ask before moving anything'),
      step('stp_15', "Read today's events"), step('stp_16', 'Add travel time'), step('stp_17', 'Send a voice summary'),
      step('stp_18', 'Find three free slots'), step('stp_19', 'Wait for your choice'), step('stp_20', 'Send the invites'),
      step('stp_21', 'Read the email'), step('stp_22', 'Draft a reply'), step('stp_23', 'Wait for your OK', 'Nothing is sent before you approve.'),
    ],
    // Earlier work, so the activity list has a Today and a Yesterday. Times are relative to when the mock starts.
    runs: [
      run('run_01', 'act_03', 'Friday pipeline note to Mira', 'Draft is ready for your review.', ['per_01', 'fact_01', 'fact_02', 'mis_03'], ['fact_02'], '2026-10-15T13:02:20Z', '2026-10-15T13:05:00Z'),
      run('run_02', 'act_07', "Send the day's agenda", 'Sent a voice summary of today.', ['fact_03', 'fact_04', 'fact_05', 'mis_02'], [], ago(5.1), ago(5)),
      run('run_03', 'act_02', 'Check team health', 'Read six check-ins. No drop in mood.', ['per_02', 'per_03', 'per_04', 'fact_08', 'mis_01'], [], ago(7.1), ago(7)),
      run('run_04', 'act_08', 'Reschedule a meeting', 'Moved the Thursday sync to 3 PM.', ['per_04', 'fact_04', 'mis_02'], ['fact_04'], ago(27.1), ago(27)),
      run('run_05', 'act_09', 'Reply to a new inbound lead', 'Reply sent after your OK.', ['per_07', 'per_06', 'fact_07', 'mis_03'], ['per_07'], ago(30.1), ago(30)),
    ],
    brain: brainFrom(SAM_NODES, SAM_EDGES),
    channelTypes: CHANNEL_TYPES.map((t) => ({ ...t })),
    channels: CHANNELS.map((c) => ({ ...c })),
    conversations: [
      { id: 'conv_text_ria', channelId: 'chn_text', type: 'text_thread', title: 'Ria Shah', threaded: false, updatedAt: '2026-10-15T12:55:00Z' },
      { id: 'conv_slack_sales', channelId: 'chn_slack', type: 'slack_channel', title: '#sales', threaded: true, updatedAt: '2026-10-15T12:40:00Z' },
      { id: 'conv_slack_mira', channelId: 'chn_slack', type: 'slack_dm', title: 'Mira Patel', threaded: false, updatedAt: '2026-10-15T10:05:00Z' },
      { id: 'conv_email_acme', channelId: 'chn_email', type: 'email_thread', title: 'Pipeline follow-up for Acme', threaded: false, updatedAt: '2026-10-15T11:15:00Z' },
      { id: 'conv_email_northwind', channelId: 'chn_email', type: 'email_thread', title: 'Renewal terms for Northwind', threaded: false, updatedAt: '2026-10-15T08:30:00Z' },
      { id: 'conv_email_hiring', channelId: 'chn_email', type: 'email_thread', title: 'Interview loop for the sales role', threaded: false, updatedAt: '2026-10-14T19:10:00Z' },
    ],
    // Slack threads only. Each thread started from a message in the channel.
    threads: [
      { id: 'thr_sales_01', conversationId: 'conv_slack_sales', title: 'Friday pipeline numbers', replyCount: 4, updatedAt: '2026-10-15T12:40:00Z' },
      { id: 'thr_sales_02', conversationId: 'conv_slack_sales', title: 'Q4 offsite venue', replyCount: 2, updatedAt: '2026-10-14T17:20:00Z' },
    ],
    // Top-level messages of each conversation, oldest first. Thread replies are in threadMessages.
    channelMessages: {
      conv_text_ria: [
        cm('cm_t1', 'conv_text_ria', 'Ria Shah', false, 'Running 10 min late, start without me', '2026-10-15T12:31:00Z'),
        cm('cm_t2', 'conv_text_ria', 'You', true, 'No problem, I will grab us a table', '2026-10-15T12:33:00Z'),
        cm('cm_t3', 'conv_text_ria', 'Ria Shah', false, 'Thank you! Also did you see the deck from Mira? I think the pipeline slide needs another pass before Friday, the numbers for the east region look off to me and I would rather we catch it before the review than during it.', '2026-10-15T12:50:00Z'),
        cm('cm_t4', 'conv_text_ria', 'You', true, 'Yes, I will ask Sam to check the east region', '2026-10-15T12:55:00Z'),
      ],
      conv_slack_sales: [
        cm('cm_s2', 'conv_slack_sales', 'Dev Rao', false, 'Venue shortlist for the Q4 offsite is in the doc. Three options, all within two hours of the office.', '2026-10-14T17:00:00Z', { threadId: 'thr_sales_02', replyCount: 2 }),
        cm('cm_s1', 'conv_slack_sales', 'Mira Patel', false, 'Can someone share the Friday pipeline numbers?', '2026-10-15T12:10:00Z', { threadId: 'thr_sales_01', replyCount: 4 }),
        cm('cm_s3', 'conv_slack_sales', 'You', true, 'Sam is pulling the pipeline together and will post it here.', '2026-10-15T12:12:00Z'),
      ],
      conv_slack_mira: [
        cm('cm_m1', 'conv_slack_mira', 'Mira Patel', false, 'Morning! Do you have five minutes before the sales review?', '2026-10-15T09:40:00Z'),
        cm('cm_m2', 'conv_slack_mira', 'You', true, 'Sure, call me at 9:50', '2026-10-15T09:42:00Z'),
        cm('cm_m3', 'conv_slack_mira', 'Mira Patel', false, 'Perfect. I want to walk through the Acme numbers and agree who sends the follow-up.', '2026-10-15T10:05:00Z'),
      ],
      conv_email_acme: [
        cm('cm_e1', 'conv_email_acme', 'Jordan Lee', false, "Hi,\n\nThanks for the call last week. I went back to our finance team with the numbers you shared and they have a few questions before we can move forward. First, can you confirm whether the quoted price includes the onboarding sessions or whether those are billed separately? Second, we would like to understand how seats are counted if we add a second team in the new year. Third, is there room on the annual commitment, since our budget cycle resets in January and we would prefer to sign for a shorter initial term and extend if it works out.\n\nIf it is easier to talk it through I am free most afternoons this week.\n\nBest,\nJordan", '2026-10-14T15:20:00Z', { subject: 'Pipeline follow-up for Acme' }),
        cm('cm_e2', 'conv_email_acme', 'You', true, 'Hi Jordan, thanks for the detail. Onboarding is included for the first ninety days. I will send written answers on seats and the term by Thursday.', '2026-10-14T18:05:00Z'),
        cm('cm_e3', 'conv_email_acme', 'Jordan Lee', false, 'Great, that helps. Thursday works.', '2026-10-15T11:15:00Z'),
      ],
      conv_email_northwind: [
        cm('cm_n1', 'conv_email_northwind', 'Elena Brandt', false, "Hello,\n\nOur annual agreement comes up for renewal on the first of December and I wanted to get ahead of it. Last year we were on the standard plan with twelve seats, and since then the team has grown to nineteen. I would like to understand what the pricing looks like at that size, whether the multi-year discount we discussed in the spring is still available, and what changes if we move billing from annual to quarterly.\n\nWe are also hoping to add single sign-on this time round. Could you send over what that involves on your side so I can brief our IT lead before the next planning call?\n\nThanks,\nElena", '2026-10-15T07:50:00Z', { subject: 'Renewal terms for Northwind' }),
        cm('cm_n2', 'conv_email_northwind', 'You', true, 'Hi Elena, good timing. The multi-year discount is still open until the end of November. I will put the nineteen-seat pricing and the single sign-on steps in one note for you today.', '2026-10-15T08:10:00Z'),
        cm('cm_n3', 'conv_email_northwind', 'Elena Brandt', false, 'Perfect, thank you. Please copy Hamid from IT when you send it.', '2026-10-15T08:30:00Z'),
      ],
      conv_email_hiring: [
        cm('cm_h1', 'conv_email_hiring', 'Marcus Webb', false, "Hi,\n\nWe have three candidates through to the final round for the sales role. Each needs a thirty minute call with you and a forty-five minute session with Mira and Arjun on the pipeline case study. I have held Tuesday and Wednesday afternoon next week for the calls. Can you confirm those slots work, or send me two other windows?\n\nI have attached the scorecard from the first round so you can see where each candidate was strongest.\n\nMarcus", '2026-10-14T18:30:00Z', { subject: 'Interview loop for the sales role' }),
        cm('cm_h2', 'conv_email_hiring', 'You', true, 'Tuesday works, Wednesday does not. Can we do Thursday morning for the third one?', '2026-10-14T19:10:00Z'),
      ],
    },
    // Each thread's messages, oldest first, starting with the message that began it.
    threadMessages: {
      thr_sales_01: [
        cm('cm_s1', 'conv_slack_sales', 'Mira Patel', false, 'Can someone share the Friday pipeline numbers?', '2026-10-15T12:10:00Z', { threadId: 'thr_sales_01', replyCount: 4 }),
        cm('cm_s1a', 'conv_slack_sales', 'Arjun Nair', false, 'Pulling them now.', '2026-10-15T12:14:00Z'),
        cm('cm_s1b', 'conv_slack_sales', 'Arjun Nair', false, 'East region is up eight percent week on week. West is flat. Two deals slipped to next month, details in the sheet.', '2026-10-15T12:25:00Z'),
        cm('cm_s1c', 'conv_slack_sales', 'Mira Patel', false, 'Thanks. Which two slipped?', '2026-10-15T12:31:00Z'),
        cm('cm_s1d', 'conv_slack_sales', 'Arjun Nair', false, 'Acme and the design studio. Both waiting on budget sign-off.', '2026-10-15T12:40:00Z'),
      ],
      thr_sales_02: [
        cm('cm_s2', 'conv_slack_sales', 'Dev Rao', false, 'Venue shortlist for the Q4 offsite is in the doc. Three options, all within two hours of the office.', '2026-10-14T17:00:00Z', { threadId: 'thr_sales_02', replyCount: 2 }),
        cm('cm_s2a', 'conv_slack_sales', 'Priya Menon', false, 'The lakeside one has the best room for the whole team.', '2026-10-14T17:10:00Z'),
        cm('cm_s2b', 'conv_slack_sales', 'You', true, 'Agreed. Let us hold that one and check dates.', '2026-10-14T17:20:00Z'),
      ],
    },
  };
}

// Sarah is the CRO. Her data is her own: pipeline, renewals and the revenue forecast, with her own people and channels.
const d = (summary, h, src, c) => ({ summary, h, src, c });
const SARAH_NODES = [
  { id: 'you', type: 'you', label: 'You', weight: 1, d: d('The person Sarah works for. Everything here is learned from you or for you.', 400, ['import', null, 'Set up when you started'], 1) },
  { id: 'per_01', type: 'person', label: 'Dana', weight: 0.9, d: d('Runs the company. Wants the forecast on Thursday.', 60, ['message', 'msg_01', 'A voice note from you'], 0.92) },
  { id: 'per_02', type: 'person', label: 'Arjun', weight: 0.7, d: d('Account executive on the enterprise team. Reports the pipeline on Mondays.', 90, ['action', 'act_01', 'Flag stalled deals'], 0.85) },
  { id: 'per_03', type: 'person', label: 'Lena', weight: 0.5, d: d('Finance partner. Needs renewal numbers thirty days out.', 200, ['import', null, 'Calendar contacts'], 0.8) },
  { id: 'per_04', type: 'person', label: 'Priya', weight: 0.45, d: d('Sales operations. Keeps the CRM clean.', 150, ['import', null, 'Calendar contacts'], 0.78) },
  { id: 'fact_01', type: 'fact', label: 'Targets are set quarterly', weight: 0.5, d: d('Quarterly targets are set in the first week of each quarter.', 300, ['import', null, 'Set up when you started'], 0.97) },
  { id: 'fact_02', type: 'fact', label: 'Renewals need thirty days notice', weight: 0.55, d: d('Renewals need thirty days notice before the end date.', 120, ['action', 'act_02', 'Check renewals due this month'], 0.9) },
  { id: 'fact_03', type: 'fact', label: 'Forecast reviewed on Thursdays', weight: 0.4, d: d('The forecast is reviewed on Thursdays before it goes to Dana.', 70, ['run', 'run_02', 'Weekly forecast update'], 0.93) },
  { id: 'fact_04', type: 'fact', label: 'Acme may slip a quarter', weight: 0.6, d: d('Acme is likely to slip a quarter, waiting on budget sign-off.', 26, ['action', 'act_08', 'Warn about deals slipping'], 0.82) },
  { id: 'fact_05', type: 'fact', label: 'Pacific time', weight: 0.3, d: d('Your day is in Pacific time.', 400, ['import', null, 'Set up when you started'], 1) },
  { id: 'mis_01', type: 'mission', label: 'Pipeline reviews', weight: 0.7, d: d('Keeps every open deal moving and flags the ones going quiet.', 300, ['import', null, 'Set up with the mission'], 1) },
  { id: 'mis_02', type: 'mission', label: 'Renewals', weight: 0.65, d: d('Watches renewals and warns before one is at risk.', 300, ['import', null, 'Set up with the mission'], 1) },
  { id: 'mis_03', type: 'mission', label: 'Revenue forecast', weight: 0.7, d: d('Builds the revenue forecast each week and explains changes.', 300, ['import', null, 'Set up with the mission'], 1) },
];
const SARAH_EDGES = [
  ['you', 'per_01', 'works with'], ['you', 'per_02', 'works with'], ['you', 'per_03', 'works with'], ['you', 'per_04', 'works with'],
  ['you', 'fact_05', 'lives by'], ['per_01', 'fact_01', 'sets'], ['per_03', 'fact_02', 'needs'], ['per_04', 'fact_03', 'holds'],
  ['per_02', 'fact_04', 'reports on'], ['mis_01', 'per_02', 'involves'], ['mis_01', 'fact_04', 'uses'],
  ['mis_02', 'per_03', 'involves'], ['mis_02', 'fact_02', 'uses'], ['mis_03', 'per_01', 'involves'], ['mis_03', 'fact_01', 'uses'], ['mis_03', 'fact_03', 'uses'],
  ['you', 'mis_01', 'owns'], ['you', 'mis_02', 'owns'], ['you', 'mis_03', 'owns'],
];

function seedSarah() {
  const home = 'chat_sarah_home';
  return {
    teammate: { name: 'Sarah', role: 'CRO', status: 'idle', statusLine: 'Ready when you are', activity: null,
      identity: {
        brief: 'I watch the pipeline closely and tell you when a deal needs you. I would rather flag a risk early than report it late. I keep the forecast honest.',
        cultureCode: ['Numbers first', 'Plain spoken', 'Flags risk early', 'Asks before committing', 'Keeps the forecast honest'],
      } },
    chats: [
      chat(home, 'home', 'Home', '2026-10-01T09:00:00Z', '2026-10-15T13:02:20Z'),
      chat('chat_sarah_11', 'side', 'Forecast review', '2026-10-14T16:00:00Z', '2026-10-15T10:30:00Z'),
      chat('chat_sarah_12', 'side', 'Renewal strategy', '2026-10-13T09:00:00Z', '2026-10-13T09:40:00Z'),
    ],
    chatMessages: {
      [home]: [
        voiceMessage(home, 'user', 'Send me the quarter forecast by Thursday.', 7000, '2026-10-15T13:02:00Z', [{ emoji: '✅', author: 'teammate' }], 'msg_01'),
        voiceMessage(home, 'teammate', 'Got it. I will build the forecast from the pipeline and check it with you before it goes anywhere.', 8000, '2026-10-15T13:02:20Z', [{ emoji: '👍', author: 'user' }], 'msg_02'),
      ],
      chat_sarah_11: [
        textMessage('chat_sarah_11', 'user', 'Let us review the forecast before it goes to Dana.', '2026-10-15T10:28:00Z', [{ emoji: '👍', author: 'teammate' }], 'msg_s11'),
        textMessage('chat_sarah_11', 'teammate', 'Noted. I will pull the three deals most likely to move.', '2026-10-15T10:29:00Z', [], 'msg_s12'),
      ],
      chat_sarah_12: [
        textMessage('chat_sarah_12', 'user', 'Set up a plan for the renewals due next quarter.', '2026-10-13T09:00:00Z', [], 'msg_s13'),
      ],
    },
    missions: [
      { id: 'mis_01', title: 'Pipeline reviews', icon: 'sales', summary: 'Keeps every open deal moving and flags the ones going quiet.', updatedAt: '2026-10-15T09:00:00Z' },
      { id: 'mis_02', title: 'Renewals', icon: 'support', summary: 'Watches renewals and warns before one is at risk.', updatedAt: '2026-10-15T07:00:00Z' },
      { id: 'mis_03', title: 'Revenue forecast', icon: 'finance', summary: 'Builds the forecast each week and explains what changed.', updatedAt: '2026-10-14T08:00:00Z' },
    ],
    actions: [
      action('act_01', 'mis_01', null, 'proactive', 'Flag stalled deals', 'Finds deals with no movement for ten days and lists them for you.', weekly('0 8 * * 1'), '2026-10-14T08:00:00Z'),
      action('act_03', 'mis_01', null, 'reactive', 'Answer a pipeline question', 'Pulls the pipeline when you ask and replies in voice.', null, '2026-10-15T13:02:00Z'),
      action('act_09', 'mis_01', null, 'proactive', 'Reply to a new inbound lead', 'Drafts a reply to a new lead and waits for your OK.', onEvent('email.received'), '2026-10-14T08:00:00Z'),
      action('act_02', 'mis_02', null, 'proactive', 'Check renewals due this month', 'Reads renewals due in the next sixty days every weekday morning.', weekly('0 9 * * 1-5'), '2026-10-15T09:00:00Z'),
      action('act_04', 'mis_02', 'act_02', 'proactive', 'Flag a renewal at risk', "Starts when a customer's usage drops.", onEvent('usage.dropped'), '2026-10-15T09:00:00Z'),
      action('act_05', 'mis_02', null, 'reactive', 'Answer a question about a renewal', 'Looks up the account and replies in voice.', null, '2026-10-15T09:00:00Z'),
      action('act_06', 'mis_03', null, 'proactive', 'Update the forecast', 'Rebuilds the forecast every Monday morning.', weekly('0 7 * * 1'), '2026-10-15T07:00:00Z'),
      action('act_07', 'mis_03', null, 'reactive', 'Explain a forecast change', 'Says what moved the number and waits for your questions.', null, '2026-10-15T07:00:00Z'),
      action('act_08', 'mis_03', null, 'proactive', 'Warn about deals slipping', 'Starts when a deal moves to a later close date.', onEvent('deal.stage.changed'), '2026-10-14T08:00:00Z'),
    ],
    children: {
      act_01: ['stp_01', 'stp_02', 'stp_03'], act_02: ['stp_04', 'stp_05', 'act_04', 'stp_06'], act_03: ['stp_09', 'stp_10'],
      act_04: ['stp_07', 'stp_08'], act_05: ['stp_15'], act_06: ['stp_11', 'stp_12', 'stp_13'], act_07: ['stp_14', 'stp_15'], act_08: ['stp_16', 'stp_17'], act_09: ['stp_03'],
    },
    steps: [
      step('stp_01', 'Find deals with no movement for ten days'), step('stp_02', 'Sort them by amount'), step('stp_03', 'List them for your review', 'Nothing is changed in the CRM without your OK.'),
      step('stp_04', 'Pull renewals due in sixty days'), step('stp_05', 'Check usage against the last quarter'), step('stp_06', 'Draft a renewal note for Lena', 'Sent only after you approve.'),
      step('stp_07', 'Read the usage drop'), step('stp_08', 'Flag the account for a call'),
      step('stp_09', 'Pull the open pipeline'), step('stp_10', 'Reply in voice'),
      step('stp_11', "Pull this week's deals"), step('stp_12', 'Update the forecast'), step('stp_13', 'Write a short note for Thursday', 'Sent as a voice note.'),
      step('stp_14', 'Explain what changed'), step('stp_15', 'Reply in voice'),
      step('stp_16', "Check the deal's stage history"), step('stp_17', 'Warn you if it slips a quarter'),
    ],
    runs: [
      run('run_01', 'act_03', 'Pipeline numbers for Thursday', 'Draft is ready for your review.', ['per_01', 'fact_03', 'mis_01'], [], '2026-10-15T13:02:20Z', '2026-10-15T13:05:00Z'),
      run('run_02', 'act_06', 'Weekly forecast update', 'Forecast rebuilt. One deal moved a quarter.', ['fact_03', 'fact_04', 'mis_03'], ['fact_04'], ago(5.1), ago(5)),
      run('run_03', 'act_02', 'Renewals check', 'Read nine renewals due. One needs a call.', ['per_03', 'fact_02', 'mis_02'], [], ago(7.1), ago(7)),
    ],
    brain: brainFrom(SARAH_NODES, SARAH_EDGES),
    channelTypes: CHANNEL_TYPES.map((t) => ({ ...t })),
    channels: CHANNELS.map((c) => ({ ...c })),
    conversations: [
      { id: 'conv_text_dana', channelId: 'chn_text', type: 'text_thread', title: 'Dana Ortiz', threaded: false, updatedAt: '2026-10-15T12:55:00Z' },
      { id: 'conv_slack_revenue', channelId: 'chn_slack', type: 'slack_channel', title: '#revenue', threaded: true, updatedAt: '2026-10-15T12:40:00Z' },
      { id: 'conv_email_brightline', channelId: 'chn_email', type: 'email_thread', title: 'Renewal terms for Brightline', threaded: false, updatedAt: '2026-10-15T11:15:00Z' },
    ],
    threads: [
      { id: 'thr_rev_01', conversationId: 'conv_slack_revenue', title: 'Q3 bookings numbers', replyCount: 2, updatedAt: '2026-10-15T12:40:00Z' },
    ],
    channelMessages: {
      conv_text_dana: [
        cm('cm_dt1', 'conv_text_dana', 'Dana Ortiz', false, 'Can you send the forecast before the board call?', '2026-10-15T12:31:00Z'),
        cm('cm_dt2', 'conv_text_dana', 'You', true, 'Yes, I will have it by Thursday morning', '2026-10-15T12:55:00Z'),
      ],
      conv_slack_revenue: [
        cm('cm_rv1', 'conv_slack_revenue', 'Arjun Nair', false, 'Bookings for Q3 are in the sheet. Two deals are waiting on budget sign-off.', '2026-10-15T12:10:00Z', { threadId: 'thr_rev_01', replyCount: 2 }),
        cm('cm_rv2', 'conv_slack_revenue', 'You', true, 'Thanks. I will fold them into the forecast on Monday.', '2026-10-15T12:40:00Z'),
      ],
      conv_email_brightline: [
        cm('cm_bl1', 'conv_email_brightline', 'Hannah Cole', false, 'Hi, our renewal is due in five weeks. Could you confirm the price for the same seats, and whether the annual rate still applies?', '2026-10-15T11:15:00Z'),
      ],
    },
    threadMessages: {
      thr_rev_01: [
        cm('cm_rv1', 'conv_slack_revenue', 'Arjun Nair', false, 'Bookings for Q3 are in the sheet. Two deals are waiting on budget sign-off.', '2026-10-15T12:10:00Z', { threadId: 'thr_rev_01', replyCount: 2 }),
        cm('cm_rv1a', 'conv_slack_revenue', 'Priya Menon', false, 'Which two?', '2026-10-15T12:20:00Z'),
        cm('cm_rv1b', 'conv_slack_revenue', 'Arjun Nair', false, 'Acme and Brightline. Both should close this quarter if the budgets come through.', '2026-10-15T12:40:00Z'),
      ],
    },
  };
}

// Megan begins as a copy of Sarah, with separate seed data for future edits.
const MEGAN_NODES = [
  { id: 'you', type: 'you', label: 'You', weight: 1, d: d('The person Megan works for. Everything here is learned from you or for you.', 400, ['import', null, 'Set up when you started'], 1) },
  { id: 'per_01', type: 'person', label: 'Claire Miller', weight: 0.9, d: d('Operations director. Reviews open issues with community teams.', 60, ['message', 'msg_01', 'A voice note from you'], 0.92) },
  { id: 'per_02', type: 'person', label: 'Henry Bauer', weight: 0.7, d: d('Community manager. Helps resolve open billing discrepancies.', 90, ['action', 'act_01', 'Review aging billing issues'], 0.85) },
  { id: 'per_03', type: 'person', label: 'Emily Weber', weight: 0.5, d: d('Billing partner. Reviews corrections and supporting records.', 200, ['import', null, 'Calendar contacts'], 0.8) },
  { id: 'per_04', type: 'person', label: 'Marie Lambert', weight: 0.45, d: d('Care coordinator. Tracks missing and upcoming assessments.', 150, ['import', null, 'Calendar contacts'], 0.78) },
  { id: 'fact_01', type: 'fact', label: 'Billing records are reviewed weekly', weight: 0.5, d: d('Billing records are reviewed with community teams each week.', 300, ['import', null, 'Set up when you started'], 0.97) },
  { id: 'fact_02', type: 'fact', label: 'Assessments need timely review', weight: 0.55, d: d('Care plans should be reviewed when resident needs change; the demo uses a seven-day management target.', 120, ['action', 'act_02', 'Review assessment deadlines'], 0.9) },
  { id: 'fact_03', type: 'fact', label: 'Open issues reviewed on Thursdays', weight: 0.4, d: d('Open billing issues are reviewed with Claire on Thursdays.', 70, ['run', 'run_02', 'Weekly operations summary'], 0.93) },
  { id: 'fact_04', type: 'fact', label: 'Eight billing items are over 30 days old', weight: 0.6, d: d('As of September 30, eight potential billing mismatches were over 30 days old; five were at Oak Terrace.', 26, ['action', 'act_08', 'Flag a change in billing records'], 0.82) },
  { id: 'fact_05', type: 'fact', label: 'Pacific time', weight: 0.3, d: d('Your day is in Pacific time.', 400, ['import', null, 'Set up when you started'], 1) },
  { id: 'mis_01', type: 'mission', label: 'Billing reconciliation', weight: 0.7, d: d('Tracks billing discrepancies and flags items that need review.', 300, ['import', null, 'Set up with the mission'], 1) },
  { id: 'mis_02', type: 'mission', label: 'Care assessments', weight: 0.65, d: d('Tracks overdue and upcoming assessments for staff review.', 300, ['import', null, 'Set up with the mission'], 1) },
  { id: 'mis_03', type: 'mission', label: 'Operations overview', weight: 0.7, d: d('Summarizes open issues and progress across communities.', 300, ['import', null, 'Set up with the mission'], 1) },
];
const MEGAN_EDGES = [
  ['you', 'per_01', 'works with'], ['you', 'per_02', 'works with'], ['you', 'per_03', 'works with'], ['you', 'per_04', 'works with'],
  ['you', 'fact_05', 'lives by'], ['per_01', 'fact_01', 'sets'], ['per_03', 'fact_02', 'needs'], ['per_04', 'fact_03', 'holds'],
  ['per_02', 'fact_04', 'reports on'], ['mis_01', 'per_02', 'involves'], ['mis_01', 'fact_04', 'uses'],
  ['mis_02', 'per_03', 'involves'], ['mis_02', 'fact_02', 'uses'], ['mis_03', 'per_01', 'involves'], ['mis_03', 'fact_01', 'uses'], ['mis_03', 'fact_03', 'uses'],
  ['you', 'mis_01', 'owns'], ['you', 'mis_02', 'owns'], ['you', 'mis_03', 'owns'],
];

function seedMegan() {
  const home = 'chat_megan_home';
  return {
    teammate: { name: 'Megan', role: 'Healthcare operations', status: 'idle', statusLine: 'Ready when you are', activity: null,
      identity: {
        brief: 'I help you keep care operations and billing on track. I surface discrepancies, show what needs attention, and make it easier to follow through.',
        cultureCode: ['People first', 'Clear and practical', 'Flags issues early', 'Shows the evidence', 'Asks before acting'],
      } },
    chats: [
      chat(home, 'home', 'Home', '2026-10-01T09:00:00Z', '2026-10-15T13:02:20Z'),
      chat('chat_megan_11', 'side', 'Billing discrepancies', '2026-10-14T16:00:00Z', '2026-10-15T10:30:00Z'),
      chat('chat_megan_12', 'side', 'Care-plan follow-up', '2026-10-13T09:00:00Z', '2026-10-13T09:40:00Z'),
    ],
    chatMessages: {
      [home]: [],
      chat_megan_11: [
        textMessage('chat_megan_11', 'user', 'Which billing issues should we review first?', '2026-10-15T10:28:00Z', [{ emoji: '👍', author: 'teammate' }], 'msg_s11'),
        textMessage('chat_megan_11', 'teammate', 'As of September 30, there were 12 potential care-and-billing mismatches. Eight were over 30 days old, including five at Oak Terrace. I would start there, checking service plans, agreements and charges. The amounts are estimates, not confirmed corrections.', '2026-10-15T10:29:00Z', [], 'msg_s12'),
      ],
      chat_megan_12: [
        textMessage('chat_megan_12', 'user', 'How quickly are care plans reviewed after a change in needs?', '2026-10-13T09:00:00Z', [], 'msg_s13'),
        textMessage('chat_megan_12', 'teammate', 'Of 58 changes in needs recorded in September, 39 had a plan review within the seven-day target. Nine of the 19 outside that window were at Cedar Point. That includes reviews completed late as well as ones still open; the report does not say which assessments are currently due.', '2026-10-13T09:01:00Z', [], 'msg_s14'),
      ],
    },
    missions: [
      { id: 'mis_01', title: 'Billing reconciliation', icon: 'finance', summary: 'Tracks billing discrepancies and flags items that need review.', updatedAt: '2026-10-15T09:00:00Z' },
      { id: 'mis_02', title: 'Care assessments', icon: 'support', summary: 'Tracks overdue and upcoming assessments for staff review.', updatedAt: '2026-10-15T07:00:00Z' },
      { id: 'mis_03', title: 'Operations overview', icon: 'finance', summary: 'Summarizes open issues and progress across communities.', updatedAt: '2026-10-14T08:00:00Z' },
    ],
    actions: [
      action('act_01', 'mis_01', null, 'proactive', 'Review aging billing issues', 'Lists open discrepancies by age and community for review.', weekly('0 8 * * 1'), '2026-10-14T08:00:00Z'),
      action('act_03', 'mis_01', null, 'reactive', 'Summarize billing issues', 'Summarizes open billing issues when you ask.', null, '2026-10-15T13:02:00Z'),
      action('act_09', 'mis_01', null, 'proactive', 'Review a billing inquiry', 'Prepares a draft response for review when a billing question arrives.', onEvent('email.received'), '2026-10-14T08:00:00Z'),
      action('act_02', 'mis_02', null, 'proactive', 'Review assessment deadlines', 'Reviews upcoming and overdue assessments each weekday.', weekly('0 9 * * 1-5'), '2026-10-15T09:00:00Z'),
      action('act_04', 'mis_02', 'act_02', 'proactive', 'Flag an overdue assessment', "Starts when an assessment is overdue.", onEvent('assessment.overdue'), '2026-10-15T09:00:00Z'),
      action('act_05', 'mis_02', null, 'reactive', 'Summarize assessment status', 'Summarizes assessment status for the care team.', null, '2026-10-15T09:00:00Z'),
      action('act_06', 'mis_03', null, 'proactive', 'Update the operations summary', 'Summarizes open issues and changes every Monday morning.', weekly('0 7 * * 1'), '2026-10-15T07:00:00Z'),
      action('act_07', 'mis_03', null, 'reactive', 'Explain a change in open issues', 'Explains what changed and identifies items to review.', null, '2026-10-15T07:00:00Z'),
      action('act_08', 'mis_03', null, 'proactive', 'Flag a change in billing records', 'Flags a change in billing records for review.', onEvent('billing.record.changed'), '2026-10-14T08:00:00Z'),
    ],
    children: {
      act_01: ['stp_01', 'stp_02', 'stp_03'], act_02: ['stp_04', 'stp_05', 'act_04', 'stp_06'], act_03: ['stp_09', 'stp_10'],
      act_04: ['stp_07', 'stp_08'], act_05: ['stp_15'], act_06: ['stp_11', 'stp_12', 'stp_13'], act_07: ['stp_14', 'stp_15'], act_08: ['stp_16', 'stp_17'], act_09: ['stp_03'],
    },
    steps: [
      step('stp_01', 'Find billing issues that remain open'), step('stp_02', 'Sort issues by age and estimated amount'), step('stp_03', 'List them for your review', 'No billing records are changed without your review.'),
      step('stp_04', 'Find assessments coming due'), step('stp_05', 'Check status against the care schedule'), step('stp_06', 'Prepare a follow-up for the care team', 'Sent only after you approve.'),
      step('stp_07', 'Review the overdue assessment'), step('stp_08', 'Flag it for a staff follow-up'),
      step('stp_09', 'Gather the open billing issues'), step('stp_10', 'Reply in voice'),
      step('stp_11', "Gather this week's open issues"), step('stp_12', 'Update the operations summary'), step('stp_13', 'Prepare a short summary for Thursday', 'Sent as a voice note.'),
      step('stp_14', 'Explain changes in open issues'), step('stp_15', 'Reply in voice'),
      step('stp_16', "Check the billing record history"), step('stp_17', 'Flag changes that need review'),
    ],
    runs: [
      run('run_01', 'act_03', 'Billing issues for review', 'Draft is ready for your review.', ['per_01', 'fact_03', 'mis_01'], [], '2026-10-15T13:02:20Z', '2026-10-15T13:05:00Z'),
      run('run_02', 'act_06', 'Weekly operations summary', 'September review: eight potential billing mismatches were over 30 days old, including five at Oak Terrace.', ['fact_03', 'fact_04', 'mis_03'], ['fact_04'], ago(5.1), ago(5)),
      run('run_03', 'act_02', 'Care assessments check', 'September review: 39 of 58 changes in needs had a plan review within seven days.', ['per_03', 'fact_02', 'mis_02'], [], ago(7.1), ago(7)),
    ],
    brain: brainFrom(MEGAN_NODES, MEGAN_EDGES),
    channelTypes: [],
    channels: [],
    conversations: [],
    threads: [],
    channelMessages: {},
    threadMessages: {},
  };
}

// Claire is the revenue operations demo teammate for the same fictional organisation as Megan. All figures are
// fictional and match the local sales and marketing report (scripts/demo/build-claire-report.mjs).
const CLAIRE_NODES = [
  { id: 'you', type: 'you', label: 'You', weight: 1, d: d('The person Claire works for. Everything here is learned from you or for you.', 400, ['import', null, 'Set up when you started'], 1) },
  { id: 'per_01', type: 'person', label: 'Dana Whitfield', weight: 0.9, d: d('Regional sales director. Reviews lead follow-up with community teams.', 60, ['message', 'msg_01', 'A voice note from you'], 0.92) },
  { id: 'per_02', type: 'person', label: 'Marcus Reed', weight: 0.7, d: d('Marketing manager. Owns the agency relationship and the website.', 90, ['action', 'act_01', 'Review the lead mix'], 0.85) },
  { id: 'per_03', type: 'person', label: 'Elena Park', weight: 0.5, d: d('Executive director at Pine Harbor. Reviews new lead assignment.', 200, ['import', null, 'Calendar contacts'], 0.8) },
  { id: 'per_04', type: 'person', label: 'Tom Ellis', weight: 0.45, d: d('Executive director at Meadow Lane. Reviews referrer visits.', 150, ['import', null, 'Calendar contacts'], 0.78) },
  { id: 'fact_01', type: 'fact', label: 'Lead reports are reviewed weekly', weight: 0.5, d: d('Lead source reports are reviewed with community teams each week.', 300, ['import', null, 'Set up when you started'], 0.97) },
  { id: 'fact_02', type: 'fact', label: 'Agency share rose from 26% to 38%', weight: 0.6, d: d('Agency referrals were 26 percent of new leads in July and 38 percent in September. New leads stayed near 307 a month.', 26, ['action', 'act_01', 'Review the lead mix'], 0.88) },
  { id: 'fact_03', type: 'fact', label: 'Signage converts best', weight: 0.4, d: d('Signage and drive-by leads fell from 17 in July to 10 in September, and 6 of 40 moved in. The counts are small.', 26, ['run', 'run_02', 'Weekly lead mix review'], 0.8) },
  { id: 'fact_04', type: 'fact', label: 'First contact within a day tours more', weight: 0.5, d: d('New leads contacted within a day toured at 21.5 percent. Those contacted after four days or more toured at 7.3 percent.', 26, ['action', 'act_02', 'Review first contact speed'], 0.82) },
  { id: 'fact_05', type: 'fact', label: 'Pacific time', weight: 0.3, d: d('Your day is in Pacific time.', 400, ['import', null, 'Set up when you started'], 1) },
  { id: 'mis_01', type: 'mission', label: 'Lead source performance', weight: 0.7, d: d('Tracks where new leads come from and which sources reach a move-in.', 300, ['import', null, 'Set up with the mission'], 1) },
  { id: 'mis_02', type: 'mission', label: 'First contact and follow-up', weight: 0.65, d: d('Tracks how fast new leads are contacted and which open leads have gone quiet.', 300, ['import', null, 'Set up with the mission'], 1) },
  { id: 'mis_03', type: 'mission', label: 'Referrer outreach', weight: 0.7, d: d('Tracks visits to local referrers and whether each visit ends with a next step.', 300, ['import', null, 'Set up with the mission'], 1) },
];
const CLAIRE_EDGES = [
  ['you', 'per_01', 'works with'], ['you', 'per_02', 'works with'], ['you', 'per_03', 'works with'], ['you', 'per_04', 'works with'],
  ['you', 'fact_05', 'lives by'], ['per_01', 'fact_01', 'sets'], ['per_02', 'fact_02', 'reports on'], ['per_03', 'fact_04', 'needs'],
  ['per_04', 'fact_03', 'asks about'], ['mis_01', 'per_02', 'involves'], ['mis_01', 'fact_02', 'uses'], ['mis_01', 'fact_03', 'uses'],
  ['mis_02', 'per_03', 'involves'], ['mis_02', 'fact_04', 'uses'], ['mis_03', 'per_04', 'involves'], ['mis_03', 'per_01', 'involves'], ['mis_03', 'fact_01', 'uses'],
  ['you', 'mis_01', 'owns'], ['you', 'mis_02', 'owns'], ['you', 'mis_03', 'owns'],
];

function seedClaire() {
  const home = 'chat_claire_home';
  return {
    teammate: { name: 'Claire', role: 'Revenue operations', status: 'idle', statusLine: 'Ready when you are', activity: null,
      identity: {
        brief: 'I connect lead sources, follow-up, tours and move-ins so you can see what is changing and where to look first. I show the evidence and say what I cannot tell.',
        cultureCode: ['Connects the dots', 'Clear and practical', 'Separates pattern from cause', 'Shows the evidence', 'Asks before acting'],
      } },
    chats: [
      chat(home, 'home', 'Home', '2026-10-01T09:00:00Z', '2026-10-15T13:02:20Z'),
      chat('chat_claire_11', 'side', 'Lead sources', '2026-10-14T16:00:00Z', '2026-10-15T10:30:00Z'),
      chat('chat_claire_12', 'side', 'Web lead quality', '2026-10-13T09:00:00Z', '2026-10-13T09:40:00Z'),
    ],
    chatMessages: {
      [home]: [],
      chat_claire_11: [
        textMessage('chat_claire_11', 'user', 'Which sources bring us the best families?', '2026-10-15T10:28:00Z', [{ emoji: '👍', author: 'teammate' }], 'msg_s11'),
        textMessage('chat_claire_11', 'teammate', 'Signage and drive-by converts best: 17 of 40 leads toured and 6 moved in. Local referrers and family and friends also move in at about 10 and 9 percent. Agency referrals are the largest source and move in at 2.8 percent. Small sources have wide margins, so I would not scale spend on them yet.', '2026-10-15T10:29:00Z', [], 'msg_s12'),
      ],
      chat_claire_12: [
        textMessage('chat_claire_12', 'user', 'Are web leads a problem?', '2026-10-13T09:00:00Z', [], 'msg_s13'),
        textMessage('chat_claire_12', 'teammate', 'Mostly for the count, not for the sales team. Of 211 web inquiries this quarter, 95 were vendors, job seekers or spam, and were rejected. Search ads produced 52 new leads and none toured. I do not have ad spend, so I cannot say what that cost.', '2026-10-13T09:01:00Z', [], 'msg_s14'),
      ],
    },
    missions: [
      { id: 'mis_01', title: 'Lead source performance', icon: 'finance', summary: 'Tracks where new leads come from and which sources reach a move-in.', updatedAt: '2026-10-15T09:00:00Z' },
      { id: 'mis_02', title: 'First contact and follow-up', icon: 'support', summary: 'Tracks how fast new leads are contacted and which open leads have gone quiet.', updatedAt: '2026-10-15T07:00:00Z' },
      { id: 'mis_03', title: 'Referrer outreach', icon: 'finance', summary: 'Tracks visits to local referrers and whether each visit ends with a next step.', updatedAt: '2026-10-14T08:00:00Z' },
    ],
    actions: [
      action('act_01', 'mis_01', null, 'proactive', 'Review the lead mix', 'Compares new leads, tours and move-ins by source and community each Monday.', weekly('0 8 * * 1'), '2026-10-14T08:00:00Z'),
      action('act_03', 'mis_01', null, 'reactive', 'Explain a change in lead sources', 'Explains what changed in lead sources when you ask.', null, '2026-10-15T13:02:00Z'),
      action('act_09', 'mis_01', null, 'proactive', 'Review an agency report', 'Prepares a summary for review when an agency report arrives.', onEvent('email.received'), '2026-10-14T08:00:00Z'),
      action('act_02', 'mis_02', null, 'proactive', 'Review first contact speed', 'Reviews days to first contact and quiet open leads each weekday.', weekly('0 9 * * 1-5'), '2026-10-15T09:00:00Z'),
      action('act_04', 'mis_02', 'act_02', 'proactive', 'Flag a quiet hot lead', 'Starts when a hot lead has had no contact for a week.', onEvent('lead.quiet'), '2026-10-15T09:00:00Z'),
      action('act_05', 'mis_02', null, 'reactive', 'Summarize follow-up status', 'Summarizes follow-up status for the sales team.', null, '2026-10-15T09:00:00Z'),
      action('act_06', 'mis_03', null, 'proactive', 'Update the referrer summary', 'Summarizes referrer visits and leads every Monday morning.', weekly('0 7 * * 1'), '2026-10-15T07:00:00Z'),
      action('act_07', 'mis_03', null, 'reactive', 'Explain a change in referrer leads', 'Explains what changed in leads from local referrers.', null, '2026-10-15T07:00:00Z'),
      action('act_08', 'mis_03', null, 'proactive', 'Flag a visit with no next step', 'Flags a referrer visit that ended without a booked next step.', onEvent('visit.logged'), '2026-10-14T08:00:00Z'),
    ],
    children: {
      act_01: ['stp_01', 'stp_02', 'stp_03'], act_02: ['stp_04', 'stp_05', 'act_04', 'stp_06'], act_03: ['stp_09', 'stp_10'],
      act_04: ['stp_07', 'stp_08'], act_05: ['stp_15'], act_06: ['stp_11', 'stp_12', 'stp_13'], act_07: ['stp_14', 'stp_15'], act_08: ['stp_16', 'stp_17'], act_09: ['stp_03'],
    },
    steps: [
      step('stp_01', 'Count new leads by source and community'), step('stp_02', 'Compare tours and move-ins with earlier months'), step('stp_03', 'List what changed for your review', 'Nothing is changed in the CRM without your review.'),
      step('stp_04', 'Find new leads without a first contact'), step('stp_05', 'Check days to first contact by community'), step('stp_06', 'Prepare a follow-up for the sales team', 'Sent only after you approve.'),
      step('stp_07', 'Review the quiet hot lead'), step('stp_08', 'Flag it for a same-day call'),
      step('stp_09', 'Gather the lead source figures'), step('stp_10', 'Reply in voice'),
      step('stp_11', "Gather this week's referrer visits"), step('stp_12', 'Update the referrer summary'), step('stp_13', 'Prepare a short summary for Thursday', 'Sent as a voice note.'),
      step('stp_14', 'Explain changes in referrer leads'), step('stp_15', 'Reply in voice'),
      step('stp_16', 'Check the visit record'), step('stp_17', 'Flag visits that need a next step'),
    ],
    runs: [
      run('run_01', 'act_03', 'Lead source change', 'Draft is ready for your review.', ['per_01', 'fact_01', 'mis_01'], [], '2026-10-15T13:02:20Z', '2026-10-15T13:05:00Z'),
      run('run_02', 'act_01', 'Weekly lead mix review', 'September review: agency referrals were 38 percent of new leads, up from 26 percent in July.', ['fact_01', 'fact_02', 'mis_01'], ['fact_02'], ago(5.1), ago(5)),
      run('run_03', 'act_02', 'First contact check', 'September review: 520 of 930 new leads were contacted within one day.', ['per_03', 'fact_04', 'mis_02'], [], ago(7.1), ago(7)),
    ],
    brain: brainFrom(CLAIRE_NODES, CLAIRE_EDGES),
    channelTypes: [],
    channels: [],
    conversations: [],
    threads: [],
    channelMessages: {},
    threadMessages: {},
  };
}

// The users who sign in, and the teammates each one manages. Mock only: the password is the part of the email before
// the @. The real auth service keeps hashed passwords (see docs/handoff/auth-service.draft.yaml).
export const USERS = [
  { id: 'usr_01', name: 'Samay', email: 'ksamay@example.com', password: 'ksamay', teammateIds: ['tm_sam'] },
  { id: 'usr_02', name: 'Gokul', email: 'gokul@example.com', password: 'gokul', teammateIds: ['tm_megan', 'tm_claire', 'tm_sarah'] },
];
// avatarKey is the file name prefix of the teammate's pictures in assets/avatars.
export const TEAMMATES = [
  { id: 'tm_sam', avatarKey: 'sam', seed: seedSam },
  { id: 'tm_sarah', avatarKey: 'sarah', seed: seedSarah },
  { id: 'tm_megan', avatarKey: 'sarah', seed: seedMegan },
  { id: 'tm_claire', avatarKey: 'sam', seed: seedClaire },
];
const stores = Object.fromEntries(TEAMMATES.map((t) => [t.id, t.seed()]));
// Uploaded assets are the user's, not a teammate's: assetId -> { userId, purpose, contentType, sizeBytes, bytes }.
export const uploads = new Map();

// The mock serves one teammate at a time: every request activates the teammate in its path, and events go to that
// teammate's listeners. Timed scenario steps write to whichever teammate is active when they fire, so the mock is
// not safe for two people driving different teammates at the same instant.
export let activeId = 'tm_sam';
export let store = stores.tm_sam;
export function activate(id) {
  activeId = id;
  store = stores[id];
}
export const teammateById = (id) => TEAMMATES.find((t) => t.id === id) ?? null;
export const userByEmail = (email) => USERS.find((u) => u.email === email.trim().toLowerCase()) ?? null;
export const userById = (id) => USERS.find((u) => u.id === id) ?? null;
export const userView = (u) => ({ id: u.id, name: u.name, email: u.email });

// The teammate as the API shows it: its profile plus the URL of each avatar state.
export function teammateView(id) {
  const t = teammateById(id);
  const s = stores[id];
  const url = (file) => `${PUBLIC}/assets/avatars/${t.avatarKey}-${file}`;
  return { id, ...s.teammate, avatar: { idle: url('idle.png'), working: url('working.gif'), asleep: url('asleep.gif') } };
}

// Access tokens from the stand-in auth endpoints: token -> { userId, expiresAt }. They live in memory.
const sessions = new Map();
const TOKEN_TTL_MS = 12 * 3600 * 1000;
export function startSession(userId) {
  const token = `tok_${randomUUID()}`;
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  sessions.set(token, { userId, expiresAt });
  return { token, expiresAt };
}
export function sessionUser(token) {
  const s = sessions.get(token);
  if (!s || s.expiresAt < now()) return null;
  return userById(s.userId);
}
export const endSession = (token) => sessions.delete(token);

export function reset() {
  learnCount = 0;
  nameCount = 0;
  unnamedChats.clear();
  uploads.clear();
  // A demo story is put back in the home chat on the next request, so the follow-up said after it goes too.
  for (const t of TEAMMATES) Object.assign(stores[t.id], t.seed(), { storyKey: null });
}

// Sends one event to the sockets of every user who manages the active teammate. Envelope follows the contract.
export function emit(type, data) {
  const event = { id: newId('evt'), type, createdAt: now(), teammateId: activeId, data };
  const payload = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === 1 && userById(ws.userId)?.teammateIds.includes(activeId)) ws.send(payload);
  }
  return event;
}

export function setTeammate(status, statusLine, activity = null) {
  store.teammate = { ...store.teammate, status, statusLine, activity };
  emit('teammate.status.changed', { status, statusLine, activity });
}

// Chats. `home` in a path is an alias for the teammate's home chat.
export const homeChat = () => store.chats.find((c) => c.type === 'home');
export const findChat = (id) => (id === 'home' ? homeChat() : store.chats.find((c) => c.id === id)) ?? null;
export function addMessage(message) {
  store.chatMessages[message.chatId].push(message);
  const c = findChat(message.chatId);
  if (c) c.updatedAt = message.createdAt;
  emit('message.created', { message });
  return message;
}
export const findMessage = (chatId, messageId) => (store.chatMessages[chatId] ?? []).find((m) => m.id === messageId) ?? null;

// One reaction per author per message: the user's and the teammate's.
export function setReaction(message, author, emoji) {
  message.reactions = message.reactions.filter((r) => r.author !== author);
  if (emoji) message.reactions.push({ emoji, author });
  emit('message.reactions.changed', { chatId: message.chatId, messageId: message.id, reactions: message.reactions });
  return message;
}

export function upsertRun(r) {
  r.updatedAt = now();
  const i = store.runs.findIndex((x) => x.id === r.id);
  if (i >= 0) store.runs[i] = r;
  else store.runs.unshift(r);
  emit('run.updated', { run: r });
  return r;
}

// What a request teaches the teammate, one fact each, in order. Each hangs off a person or a mission.
const LEARNABLE = [
  ['Likes Friday summaries', 'per_01', 'likes'], ['Dislikes long emails', 'per_06', 'dislikes'], ['Prefers morning calls', 'per_02', 'prefers'],
  ['Budget review is monthly', 'per_05', 'runs'], ['Uses the blue deck template', 'mis_03', 'uses'], ['Design review on Wednesday', 'per_03', 'holds'],
  ['Hates double bookings', 'mis_02', 'avoids'], ['Weekly check-in is optional', 'mis_01', 'notes'],
];
let learnCount = 0;
export function learnSomething(r) {
  const [label, toRaw, edgeLabel] = LEARNABLE[learnCount % LEARNABLE.length];
  // Sarah has no per_05 or per_06; fall back to the user node so the edge always lands on an existing node.
  const to = store.brain.nodes.some((n) => n.id === bn(toRaw)) ? bn(toRaw) : 'bn_user';
  const id = `bn_fact_${20 + learnCount}`;
  learnCount += 1;
  const node = { id, type: 'fact', label: learnCount > LEARNABLE.length ? `${label} (${learnCount})` : label, weight: 0.35, ref: null };
  const edges = [{ fromId: to, toId: id, label: edgeLabel }];
  store.brain.nodes.push(node);
  store.brain.edges.push(...edges);
  store.brain.details[id] = { summary: `${store.teammate.name} picked this up while working on "${r.title}".`, learnedAt: now(), provenance: { type: 'run', id: r.id, label: 'Your latest note' }, confidence: 0.7 };
  r.learnedNodeIds = [...r.learnedNodeIds, id];
  r.usedNodeIds = [...new Set([...r.usedNodeIds, to, id])];
  emit('brain.node.learned', { runId: r.id, node, edges });
}

// Side chats that still have the placeholder title. The teammate names them once, after the first message.
export const unnamedChats = new Set();
const NAMES = ['Planning the week', 'Quick question', 'Ideas to try', 'Follow-ups', 'Thinking out loud', 'Next steps'];
let nameCount = 0;
export function nameFor(message) {
  if (message.type === 'text') {
    const words = message.text.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim().split(/\s+/).slice(0, 5).join(' ');
    if (words.length >= 4) return words.charAt(0).toUpperCase() + words.slice(1);
  }
  const n = NAMES[nameCount % NAMES.length];
  nameCount += 1;
  return n;
}
