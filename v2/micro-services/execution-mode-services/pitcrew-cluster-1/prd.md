---
name: Pit Crew Cluster — PRD
code: pitcrew-cluster-1-prd
version: 0.1
status: draft
last_updated: 2026-11-10
---

# Pit Crew Cluster — Product Requirements

> **Draft.** Targets marked *proposed* are starting points to confirm with Agent Success. Anything the owner has decided is recorded in the HLD Design Decisions Log, not here.

## Why This Exists

Agent Success staff approve and resolve work that Digital Teammates (DTs) and platform services cannot, or should not, finish alone: a drafted customer message, a new skill or tool, an error in a consulting engagement, a client email that needs a human decision. Today these requests are spread across Jira Service Desk tickets, email and cluster-specific screens. No single place shows what is waiting, who owns it or what was decided. Without one queue, work waits unseen, decisions are recorded in different shapes (or not at all), and every new kind of approval means another one-off tool.

## What It Does

Any platform service can hand Pit Crew a request for review, called a ticket, under a named procedure (an SOP). Pit Crew checks the request immediately and either accepts it or rejects it with a reason. An accepted ticket then moves through the steps its procedure defines: an AI reviewer may try first, a person may decide, or both, in the order the procedure says. Agent Success staff work from one console that shows every open ticket, what happens next and the full history. When the ticket is resolved, the requesting service gets the outcome back.

## Phase 1 Scope

### Request types

Which procedure handles a request is decided by the requester naming it. The list below is what the first procedures are expected to cover.

| Request type | Example | Typical outcome |
| --- | --- | --- |
| Communication and content approvals | A DT's drafted message or report change waiting for review before it reaches a customer | Approve, send back with feedback, or reject |
| Context-change approvals | A proposed change to stored context that must pass the review gate | Approve or reject |
| Platform approvals | A DT creating a new skill or tool, which must follow the platform's internal schemas | Approve, or request changes |
| Engineering escalations | The DT consulting service reports an error or a code error it cannot resolve | Guidance to retry, a fix, or a hand-off to engineering |
| PR reviews and code feedback | Review status and feedback on a proposed code change | Approve, or send feedback |
| Client emails to a DT | A client's email that the DT should not answer alone | Reply approved, edited, or escalated |

### Intake Responsibilities

- Accept a request from an authenticated platform service and answer right away: accepted (with a ticket reference) or rejected (with the reason).
- Reject a request that names an unknown, retired or deprecated procedure, or whose content does not match what the procedure expects.
- Treat a repeated submission of the same request as the same ticket.
- Let the requester wait for the final outcome, or collect it later.

### Procedure Responsibilities

- Run each ticket under exactly one named procedure version for its whole life.
- Let a procedure say, for each step, whether an AI reviewer, a person or an automated action acts, what the person may do, how long it may take and where each outcome leads.
- Make a new procedure version available without disturbing tickets already open.

### Work Responsibilities

- Run the AI reviewer where the procedure says, record what it decided and why, and fall back to a person as the procedure directs.
- Put tickets that need a person into a queue, show who owns the next action and track the time limit.
- Escalate when a time limit is missed, and notify the Agent Success channel.
- Give staff the actions the procedure allows, such as approve, reject, edit and approve, send back, or update the input.

### Console Responsibilities

- Show every open ticket in one queue, filterable by request type, owner, state and due time, without showing customer content.
- Require a deliberate step to open a ticket's content, and record who opened what and when.
- Show each ticket's full history: every step, actor, decision and procedure version.
- Let staff act on a ticket only through the actions its current step allows.

## What Pit Crew Is NOT Responsible For

- **The decision logic of the originating system**: the DT, the DT reviewer, the consulting service and the PR host own what they ask for and what they do with the answer.
- **Who a person is and what they may do**: the auth cluster owns identity, roles and permissions. Pit Crew uses them.
- **Delivering messages to customers**: the communications services deliver, after Pit Crew has approved.
- **Manager approval of report changes**: managers still approve their own report changes. Pit Crew covers the Agent Success review step.
- **Live conversation between a DT and staff**: tickets are asynchronous in Phase 1.
- **Long-running customer cases**: a ticket is one decision. Threads that span many exchanges are Phase 2.

## Success Criteria

All targets are *proposed*.

| Metric | Target |
| --- | --- |
| Accept or reject answer to a requester | p50 under 1 second, p99 under 5 seconds |
| Tickets reaching a final state within 24 hours | At least 95% |
| Tickets reaching a final state within 72 hours | 100% (an unresolved ticket ends as expired and escalated, never silently open) |
| Tickets lost or decided twice because of a restart or failure | 0 |
| Automated decisions that record the procedure version, prompt version and reasoning | 100% |
| Views of customer content that are recorded with who, when and which customer | 100% |
| Console queue load with 500 open tickets | p95 under 1.5 seconds |

## Phase 1 UAT Acceptance Criteria

| # | Scenario | Pass condition |
| --- | --- | --- |
| 1 | A service submits a valid request under an active procedure | It gets an acceptance with a ticket reference within the target time, and the ticket appears in the console queue |
| 2 | A service submits a request naming an unknown procedure | The request is rejected with a clear reason and no ticket exists |
| 3 | A service submits a request under a deprecated procedure version | It is rejected for the new ticket; tickets already open under that version carry on |
| 4 | A service submits content that does not match what the procedure expects | It is rejected with the offending fields named and no ticket exists |
| 5 | A service submits the same request twice (same request key) | Both calls return the same ticket and only one ticket exists |
| 6 | The procedure has the AI reviewer decide first and it approves | The ticket resolves without a person, the decision, reasoning and prompt version are on the ticket, and the requester receives the outcome |
| 7 | The AI reviewer fails or is unsure | The ticket moves to the person queue the procedure names, and the staff member sees the AI's recommendation |
| 8 | A staff member approves a ticket | The requester receives the outcome, and the history shows who, when and under which procedure version |
| 9 | A staff member edits and approves, or sends a ticket back with feedback | The ticket goes to the step the procedure names, the revision is counted and the edit is in the history |
| 10 | Two staff members act on the same ticket at once | The first action counts, the second is told the ticket was already handled, and no action is applied twice |
| 11 | A staff member opens a ticket's content | An explicit access step is required, and the history records who opened content of which customer and when |
| 12 | A person without the Agent Success role tries to use the console | They cannot see the queue or any ticket |
| 13 | The queue is open | It shows ticket summaries only, with no customer content, until a ticket is deliberately opened |
| 14 | A step's time limit is missed | The ticket is flagged and escalated as the procedure says, the Agent Success channel is notified, and the console shows the breach |
| 15 | A ticket reaches its maximum age without resolution | It ends as expired, is escalated and stays visible in history |
| 16 | A new procedure version is published while tickets are open | Open tickets finish under their original version and new tickets use the new one |
| 17 | The service restarts while tickets are mid-step | No ticket is lost, and no decision is recorded twice |
| 18 | A requester waits for the outcome, or comes back later | A waiting requester is told when the ticket finishes; a returning requester can fetch the outcome |

## Phase 2 / Deferred Scope

- **Customer support threads and cases**: tickets that come back and forth with a customer need a case that groups many tickets. Deferred until Agent Success decides to take customer support.
- **Procedures inside procedures**: a step that runs another procedure. Phase 1 procedures are flat, with shared step templates.
- **A procedure editor in the console**: procedures are written and reviewed as code in Phase 1.
- **Importing Jira history**: new tickets start in Pit Crew. Whether old ones are migrated is open.
- **Several AI reviewers working on one ticket**: Phase 1 has at most one AI actor per step.
- **Reporting beyond the console**: queue and flow dashboards are in scope; deeper analytics are not.
