# Budy 2 proposition alignment: the Sales, Ops and Integrated decks

|                  |                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Document**     | Budy 2 proposition alignment: how the Sales, Ops and Integrated demo decks qualify and support the broader BudyII proposition                            |
| **Version**      | 1.0                                                                                                                                                      |
| **Status**       | Review draft                                                                                                                                             |
| **Audience**     | GTM leads, product marketing, founder/owner reviewing Budy 2 positioning                                                                                 |
| **Purpose**      | Show, deck by deck and pillar by pillar, where the existing senior-living demo content qualifies as evidence for Budy 2, where it only supports part of the claim, and what must change before reuse |
| **Last Updated** | November 2026                                                                                                                                            |
| **Sources**      | `BudyII-strategy_positioning_WO-11.6.26.pdf`, `BudyII-workflows_competition_WO-11.11.26.pdf`, [Budy 2 Product Vision](../vision/ProductVision-Roadmap-Budy-2.md), [Budy 2 Press Release](../vision/Budy-2-Press-Release.md), [Budy 2 FAQ](../vision/Budy-2-FAQ.md), the deck folders under `company-presentations_repo-1/v1/src/decks/events/slif-nov-2026/` |

---

## 1. The question this document answers

The company presentation decks were built for a senior-living booth in November 2026. The Budy 2 narrative was written in August 2026 and has since broadened: from a vertical product with a named customer base to an **agnostic platform for delegation**, where senior living is the initial vertical that proves the operating model rather than the product itself.

This document asks one question of each deck: **if a buyer reads this deck and then reads the Budy 2 vision, does the deck support the broader claim, partially support it, or contradict it?**

The answer in brief: the decks are the strongest proof asset the company has for the *operating-mission* tier of delegation and for *transferability of the operating model*. They are not yet a Budy 2 product story, because they sell a vertical, rep-led, pilot-priced Budy 1 and never show the Budy 2 workspace.

---

## 2. Verdict in brief

| Judgement | Position | Strength |
| --- | --- | --- |
| As evidence the operating model is real and repeatable in a vertical | The three decks are the best available artifact: measured recovery, measured funnel conversion, and a live teammate answering a real operator question | Strong |
| As evidence for the *operating mission* scope of delegation | Ops is a near-literal rendering of the workflows PDF's billing-leakage mission | Strong |
| As evidence the model transfers across functions | Integrated lists distinct missions across sales, marketing, ICP and SEO, but all inside one vertical | Partial |
| As evidence for the platform claim (agnostic, teachable, legible) | Absent. No workspace, no mission record, no permission surface, no teaching moment | Gap |
| As a Budy 2 commercial story | Contradictory: vertical framing, rep-led pilot, Small/Medium/Large pricing | Gap |
| As a competitive proof point against Lindy, Microsoft, Relevance AI | Indirectly useful; the decks show outcome ownership that those offers only partially document | Partial |

**One-line framing for reuse:** *senior living is where Budy proved the operating model; BudyII is that model without the vertical.*

---

## 3. The evolved proposition, in five claims

The vision documents make five claims. Each is used later as a scoring pillar.

1. **Category.** Budy 2 is a Digital Teammate, "a new kind of personal computer for work" — an agnostic platform, explicitly not a vertical agent, not a chatbot, not an assistant feature.
2. **Buyer.** The high-agency, non-technical builder, defined by disposition rather than industry or title.
3. **Unit of value.** Business outcomes, not tasks or tokens. The strategy PDF ladder: compute → output → execution → operational result → business outcome, measured as *verified progress per unit of human supervision*.
4. **Delegation discipline.** Four-part value (understanding, ownership, continuity, control), an agreed mission lifecycle (agree → pilot → run → verify → refine), and three delegation scopes (task, workflow, operating mission).
5. **Transfer.** The reusable operating model (define success, prioritize within capacity, advance and follow up, review and escalate) carries across businesses; domain context does not.

---

## 4. Deck inventory and evidence base

All three decks live in one event namespace and share a common opening: a four-slide build ("Uncover issues" → "Drive execution") followed by a live phone demo.

| Deck | Slides | Listed on `/v1/home` | Stated frame | Live teammate | Primary claim |
| --- | ---: | --- | --- | --- | --- |
| **Ops** | 12 | yes (order 1) | "Care deck: how Budy AI teammates uncover issues and drive execution in senior living operations" | Megan | Recover care revenue that is delivered but not billed |
| **Sales** | 13 | yes (order 2) | "Sales deck: how Budy AI teammates find move-ins in cold leads and follow up on tours" | Claire | Reactivate a dead prospect database and close the tour follow-up gap |
| **Integrated** | 26 | no (`listed: false`, order 3) | "Integrated Solutions demo deck… Reps open it by address" | Claire ("Coming in 2027") | A menu of missions across sales, marketing and growth |

### 4.1 Measured evidence behind the decks

These figures are what make the decks citable as proof. They live in `v1/src/settings.ts` and are tagged OBSERVED, AGREED or PLACEHOLDER.

| Evidence | Figure | Source label |
| --- | --- | --- |
| Ops: communities / residents in scope | 3 California AL communities, 655 residents | OBSERVED (Sunny Hills rent roll, Oct 2026) |
| Ops: billing recovered since launch | $31,019 per month, 31 cases | OBSERVED |
| Ops: billing recovered in the last 30 days | $20,592 per month, 20 cases | OBSERVED |
| Ops: leakage still open | $39,106 per month, 26 priced cases | OBSERVED |
| Ops: cost of delay | $43,730 | OBSERVED (gap × days open ÷ 30) |
| Sales: funnel | 1,482 cold leads → 340 progressed → 94 tours → 41 deposits → 27 move-ins | OBSERVED (SMASH 2026, All Seasons / Beztak) |
| Sales: email lift | click-through 2.5% → 9.9%; open 19% → 37% | OBSERVED |
| Sales: applied multipliers | 4× click, 2× open; NOI margin 38%; part-time Budy cost $60k/yr | AGREED |

### 4.2 What the live demo actually shows

The live slide is the Budy 1 phone app (`vendor/demo-app`, source `app-demo-mockup-v1`, built 2026-10-31), with two scripted stories:

| Story | Question asked | Behaviour shown | Result |
| --- | --- | --- | --- |
| **Claire** (sales) | Every family that toured in 45 days with no completed follow-up, no dated next step and no second decision-maker engaged; plus patterns by salesperson, community, source and stage | Acknowledges scope, restates the query, works for six hours, sends a report | 34 stalled families; 24 of 34 had three or more interactions; 23 named another decision-maker whom nobody contacted; Pine Harbor 11 of 21; agency referrals 15 of 27; none booked a second visit |
| **Megan** (ops) | What to pay attention to in care operations, trending wrong or out of line with other communities, and what to raise first | Asks one clarifying question, confirms the refined scope back, works six hours, sends a report | Cedar Point evening shift understaffed 19 of 30 evenings (4 in July); 17 falls in the month, 14 on understaffed evenings vs 3 on the 11 fully staffed evenings; call-outs after 1pm unfilled 4 times in 5 |

Both stories are *analytical* missions that end in a report and a recommended escalation. Neither ends in a system write. That distinction matters in section 8.

---

## 5. Qualification matrix

Scored against the five claims in section 3. **Supported** = the deck evidences the claim directly. **Partial** = evidences an adjacent or narrower version. **Gap** = the deck neither evidences nor contradicts. **Contradicts** = the deck works against the claim.

| Claim | Ops | Sales | Integrated |
| --- | --- | --- | --- |
| 1. Category: agnostic platform, not a vertical agent | Contradicts (vertical throughout) | Contradicts (vertical throughout) | Contradicts (frame), but the mission menu hints at width |
| 2. Buyer: high-agency, non-technical builder | Partial — the buyer is an operator, not the builder | Partial — same | Partial — its 26 missions are a builder's idea of breadth |
| 3. Unit of value: business outcome over task | Supported — dollars recovered per month, cost of delay | Supported — move-ins, not leads worked | Partial — mixed outcome and activity framing |
| 4. Delegation discipline | Supported, strongly | Supported, strongly | Partial — shows missions but not authority or review |
| 5. Transfer of the operating model | Supported — domain context is visibly separable from the loop | Supported — the loop is generic, the funnel is not | Supported as a catalogue, not as a proof of repeated outcomes |

---

## 6. How each deck qualifies

### 6.1 Ops — the operating-mission proof

The Ops deck is the closest thing in the company to a worked example of the workflows PDF's §06 vertical operating loop, "reduce service revenue leakage".

| Deck slide | Content | Proposition role |
| --- | --- | --- |
| 1 | Building AI Teammates for Senior Living | Category claim, vertical-first (see section 8) |
| 2 | How it connects: works with your existing systems | Delegation requires acting in the owner's systems, not beside them |
| 3–6 | Uncover issues (box 1 → boxes 1–3 with Drive execution) → Uncover issues. Drive execution. | The progression from finding a gap to acting on it; the "execution" rung of the value ladder |
| 7 | Live: Megan, "the care teammate one operator already works with, live on a real community" | Continuity and ownership: the teammate already has a role and history |
| 8 | Private pay: one resident | The unit of verification is one resident, one case — not a dashboard |
| 9 | Medi-Cal / ALW: one resident | Domain context: reimbursement rules are local and must be re-established per vertical |
| 10 | What it's worth | Business outcome: dollars, per resident and per month |
| 11–12 | What would you like us to demo? / Getting started | The owner chooses direction; the next step is a scoped mission |

**Why it qualifies.**
It demonstrates all four scopes of the delegation value model at once: *understanding* (what the community bills against what it delivers), *ownership* (the retrieval of $31,019 per month in 31 cases without the owner chasing 31 threads), *continuity* (weekly cadence against an open leak that persists), and *control* (the money moves only through the approved correction path).

It also lands the strategy PDF's central measurement claim — "verified progress per unit of human supervision" — with real denominators: 3 communities, 655 residents, 31 cases, 26 still open. That is the single most persuasive asset for a prospect asking whether the outcome figure is real.

### 6.2 Sales — the follow-through proof

The Sales deck proves the other half of the operating model: prioritization within capacity, and follow-up that does not depend on a person remembering.

| Deck slide | Content | Proposition role |
| --- | --- | --- |
| 1–6 | Shared opening and build | Same loop, different domain |
| 7 | Live: Claire, "the sales teammate counselors already work with, live in a real CRM" | Acting inside an existing system of record |
| 8 | Gold in the cold | Prioritized actions against a stalled pipeline |
| 9 | Regional coaching and tour follow-up | Manager-level follow-through, not individual deliverable production |
| 10 | Revenue management | A second mission type on the same teammate |
| 11 | What it's worth | Outcome measured in move-ins |
| 12–13 | Demo choice / Getting started | Owner-directed next mission |

**Why it qualifies.**
The 1,482 → 340 → 94 → 41 → 27 funnel is the value ladder with real denominators, and it is exactly the "business outcome" rung rather than the "task completion" rung. The vision warns against confusing task volume with value; the Sales deck passes that test because its headline is move-ins and revenue, not emails sent.

It also supports the *team* dimension in the vision's "Will Budy work with a team?" answer: regional coaching is a manager's mission that reaches counselors without requiring those counselors to become AI operators — the "familiar model of a teammate" argument, demonstrated.

### 6.3 Integrated — the breadth proof, and the most Budy-2-shaped deck

Integrated is the only deck that already speaks in missions rather than in a single funnel, and it is the only one whose live slide says "Coming in 2027" — a forward-looking frame that sits closer to BudyII than to Budy 1.

| Deck slides | Mission family | Proposition role |
| --- | --- | --- |
| 1–4 | "More move-ins. Higher NOI. Less guesswork. The same team." / "A teammate, not a chatbot" / "Works with your existing systems" / "Pick the missions that matter to your team" | The category and scope-choice story, in roughly the vision's own words |
| 5–9 | Gold in the Cold, Task Enrichment, Tour Follow-up: 3 in 3 | Prioritized action and exception handling |
| 10–14 | Regional Coaching, Ambassador Matching, Task Assignment | Team tasks and human handoffs |
| 15–18 | Revenue Management, Smart Campaign Matching, personalized nurture | Cross-system business actions with measured lift |
| 19–21 | On-Demand ICP Builder, "three profiles of who actually moves in, from 86 residents" | Context synthesis — the persistent-context claim |
| 22–23 | SEO Keywords and GEO / AEO, "what families asked, and where the community shows up" | Horizontally distinct work on the same teammate |
| 24 | Live: Claire | The teammate as the constant across missions |
| 25–26 | "Drive execution." / "Simple to start. Fast to show results." | The implementation-gap promise from the vision |

**Why it qualifies.** The deck's structure is the argument the strategy PDF makes in §07: a fixed operating model (prioritize, advance, follow up, escalate) applied to a growing list of missions. Twelve distinct missions on one teammate is the most direct on-screen evidence that Budy is a platform for work rather than a single workflow.

**Where it falls short.** Every mission is senior-living sales and marketing. The breadth is *functional*, not *vertical* — which is precisely what makes it the right bridge artifact and the wrong final Budy 2 story.

---

## 7. Pillar-by-pillar support for the broader proposition

### 7.1 Delegation value: understanding, ownership, continuity, control

The strategy PDF's four-part value model is the deck's strongest alignment. Each element has an on-screen artifact.

| Delegation element | Deck evidence | Slide |
| --- | --- | --- |
| **Understanding** — establishes what success means, carries business context | Restating the query and confirming scope back to the owner (Megan: "Resident safety, and things we can fix quickly") | Ops 7, Sales 7, Integrated 24 |
| **Ownership** — plans the assignment, advances the next step | Six hours of unattended work ending in a sent report | Live demo |
| **Continuity** — keeps approved recurring work running | Care-plan reassessment gaps and an open leak measured monthly; weekly coaching play per counselor | Ops 10, Integrated 11 |
| **Control** — acts within authority, keeps work inspectable | "Acts only on approved corrections"; the report as the inspection surface | Ops 3–6, PDF §06 step 3 |

### 7.2 Mission lifecycle

The workflows PDF defines five stages. The decks render three of them explicitly and two implicitly.

| Stage | PDF | Deck rendering |
| --- | --- | --- |
| Agree the mission | Set baseline, target and authority | Megan's clarifying question and scope confirmation |
| Pilot and approve | Test on limited scope | "Getting started" / "Pick the missions that matter" |
| Run and escalate | Execute, escalate | "Drive execution" build slides |
| Verify | Check source records | The per-resident and per-case verification in Ops 8–9 |
| Refine | Adjust the next cycle | Weekly cadence implied by the reassessment-gap samples; not shown as an explicit loop |

**Gap to close:** the deck never *shows* refine. It asserts a cadence but does not display the cycle adjusting.

### 7.3 Three scopes of delegation

The workflows PDF distinguishes task, workflow and operating mission. The decks are unusual — and unusually well positioned — because they consistently sit at the **operating mission** level, the highest of the three.

| Scope | PDF definition | Deck equivalent | Which deck |
| --- | --- | --- | --- |
| Task | One deliverable | "Summarize last week's billing exceptions" | Not demonstrated deliberately |
| Workflow | A repeatable process | Match service records to invoices, route discrepancies | The Ops build slides |
| **Operating mission** | A recurring business objective with a baseline and reported progress | "Reduce missed charges across sites; confirm approved corrections post and report against baseline" | **Ops as a whole**, Sales (pipeline), Integrated (portfolio of missions) |

This matters for the broader proposition: most competitors' demos stop at task or workflow. A deck already operating at mission scope is the clearest available proof that BudyII's claimed differentiation is not aspirational.

### 7.4 Unit of value

The ladder is fully represented, which is rare in demo material.

| Rung | Deck evidence |
| --- | --- |
| Compute — tokens, tool calls | Not shown (correctly; the vision warns against this as a success measure) |
| Output — a follow-up is drafted | Reports and drafted nurture |
| Execution — a counselor contacts the lead | "Drive execution"; reminder and outreach missions |
| Operational result — the prospect re-engages | Tour follow-up completion, care-plan correction routed |
| **Business outcome — incremental move-ins** | 27 move-ins from 1,482 leads; $31,019 per month recovered |

### 7.5 Vertical operating loop

Ops is the loop, nearly clause for clause: find the gap (compare service records with billing) → establish the facts (evidence gaps, responsible owner) → act within authority (route the correction for review) → verify progress (reviewed, corrected, billed, collected). The PDF uses this exact example as its illustration; the deck is the executed version with real numbers.

### 7.6 Transfer

The strategy PDF separates what carries forward from what must be re-established. The decks let you show the split on one screen.

| Carries forward (reusable operating model) | Must be re-established (domain context) |
| --- | --- |
| Define the mission and success — seen in the demo's scope confirmation | Care and service definitions — Ops 8–9 |
| Prioritize within capacity — "about five prioritized tasks per person per week" | Billing and reimbursement rules — private pay vs. Medi-Cal / ALW |
| Advance execution and follow up — Gold in the Cold, tour follow-up | Local roles and authority — who approves a care-level change |
| Review and escalate — the report with a recommendation | Community and portfolio structure — 3 communities, 655 residents |

Integrated then shows the same reusable model producing twelve different missions, which is the "proof of transfer" argument in miniature.

### 7.7 Competitive differentiation

Against the three head-to-heads in the strategy PDF:

| Competitor | Comparison to win | How the decks help |
| --- | --- | --- |
| **Lindy** (teammate alternative) | Team follow-through | Sales proves follow-through across a counseling team; Claire's story proves a manager can be told what is stalling, by whom, and where — the "manager burden" measure the PDF proposes |
| **Microsoft** (platform alternative) | Total operating effort, time to value | The decks show an outcome with no build step on the customer side — the "time to a useful outcome" measure |
| **Relevance AI** (process alternative) | Simplicity for the operator | The operator states a business objective in a sentence; no playbook mapping appears anywhere in the deck |

### 7.8 Product principles

| Vision principle | Deck support |
| --- | --- |
| Persistent, personal, long-running | "The teammate counselors already work with"; a six-hour unattended mission |
| Tools for builders, not prescriptions | Weakest fit — the decks prescribe missions rather than showing the owner inventing one |
| Powerful but legible | Partial — a report is inspectable, but there is no workspace with decisions, permissions and pending questions |
| Reliability is the product | Strong — measured recovery and measured funnel, with conservative halving of future conversion rates |
| Safe, scoped, accountable | Implicit — approved corrections, before-and-after community comparisons |
| AI-delivered white-glove | Not shown; onboarding is presented as a rep-led month one |
| Inspire, then compound | Partial — the demo inspires; nothing shows the next taught preference |
| Premium by design | Neutral — the price is premium, the packaging is not Budy 2's |
| Adoption feels natural | Strong — "a teammate, not a chatbot", and the phone as a familiar surface for non-AI-operators |

---

## 8. Where the decks work against Budy 2

These are the items that must be resolved before the decks are used as Budy 2 material. Each is a *composition* problem, not a data problem — the evidence survives.

| # | Deck reality | Budy 2 position | Remedy |
| --- | --- | --- | --- |
| 1 | Senior-living vertical framing throughout ("Building AI Teammates for Senior Living") | FAQ: "an agnostic platform, not an AI feature built for a single vertical" | Add an explicit framing slide: senior living as the proving vertical; keep the vertical content as evidence, not as the offer |
| 2 | Pricing: 3-month pilot at $5k, then Small / Medium / Large at $5k / $10k / $20k, billed annually | Explore $200–500, Part-Time $5k, Full-Time $10k, Heavy / Max $20k+; "Part-Time is the starting point for owning Budy, not merely an Explore upgrade" | Re-tier on slide 11/13 to the vision's names, or hold price out of any Budy 2 deck |
| 3 | Month 1 "Budy trains your teammate on your first 2–3 missions and connects your systems" | "not a consulting-led service"; product-led activation | Present as Budy-led onboarding, not an engagement |
| 4 | Delivered by reps from a booth; the deck *is* the sales asset | "The product — not a salesperson, consultant, or human operator — is responsible for making the promise real" | Split the asset: proof deck for conversations, product-led path for self-serve |
| 5 | ROI calculator as centerpiece (care bumps, extra move-ins) | "We will not confuse task volume, generic engagement, or a neatly calculated ROI claim with success" | Keep the calculator, but present it as a worked example of verified progress, not as the value proposition |
| 6 | Named personas Claire and Megan presented as ready-made vertical teammates | "not a pre-packaged vertical agent" | Frame personas as one owner's taught teammate, not as SKUs |
| 7 | No workspace, no mission record, no permission surface, no approval trail on screen | Principle 3: work, context, activity, decisions, access and progress must be visible | Highest-value addition: one new slide (or live pane) showing the mission record — plan, sources, actions, approvals — as the strategy PDF describes it |
| 8 | Live missions end in a report, never in a system write | Delegation includes "cross-app business actions" and "acts within authority" | Add one small demonstrated write with an approval step, or state clearly that writes follow the report |

---

## 9. Recommended framing for reuse

A four-beat arc that keeps the evidence and drops the vertical claim:

1. **The gap after the wow.** The vision's implementation-gap argument, one slide, in sales terms.
2. **A mission, not a prompt.** Ops as the worked operating mission: baseline, authority, corrections, verified dollars. This is the proof, and it is senior living on purpose.
3. **The same model, different work.** Integrated's mission menu as evidence of a reusable operating model applied to new work — the transfer argument.
4. **What you delegate, and what you keep.** The four-part value model and the mission record: understanding, ownership, continuity, control. Close on the workspace, not on a price sheet.

Concretely, per deck:

| Change | Effort | Payoff |
| --- | --- | --- |
| Add a framing slide ("senior living is the proving vertical") | Low | Resolves the single largest contradiction |
| Replace the pricing block with the capability/authority model | Low | Removes the sharpest Budy 2 mismatch |
| Relabel slide 1 from vertical claim to mission claim | Low | Removes vertical-first positioning |
| Add a mission-record / workspace visual | Medium | Closes the legibility gap that separates proof from product |
| Add one approved write with an approval step in the live demo | Medium | Shows authority, not just analysis |
| List Integrated on `/v1/home` (currently `listed: false`) | Low | It is the most Budy-2-shaped deck and is currently hidden |

---

## 10. Open questions and approvals

1. **Framing ownership.** Who owns the sentence "senior living is the proving vertical, not the product"? It appears in the strategy PDF §04 but in no customer-facing asset.
2. **Pricing exposure.** Do the decks keep any price at all in Budy 2 usage, given the vision's product-led posture?
3. **Customer names.** `SHOW_CUSTOMER_NAMES` is `false` by default, so decks say "one operator". The vision's press release uses a senior-living CMO quote pending approval; decide whether proof decks name customers or stay anonymous.
4. **Numeric ownership.** Every figure in the decks needs sign-off from the business owner of the numbers before reuse; this document cites them but does not approve them.
5. **Report-only vs. write.** Is a report-only demo acceptable for Budy 2, or must an approved write appear live?

---

## Appendix A: evidence constants in use

All figures below are declared in `company-presentations_repo-1/v1/src/settings.ts` and must not be changed without approval from the business owner of the numbers.

| Constant | Value |
| --- | --- |
| `BILLING_OBSERVED.recoveredSinceLaunch` | $31,019 / month, 31 cases |
| `BILLING_OBSERVED.recovered30d` | $20,592 / month, 20 cases |
| `BILLING_OBSERVED.openLeak` | $39,106 / month, 26 priced cases |
| `BILLING_OBSERVED.costOfDelay` | $43,730 |
| `BILLING_OBSERVED.reassessmentGapSamples` | $445, $1,070, $1,580 (three samples) |
| `SALES_OBSERVED` | 1,482 → 340 → 94 → 41 → 27; 706 still in play |
| `SALES_OBSERVED.clickWithBudy` | 9.9% (standard 2.5%) |
| `SALES_MULTIPLIERS` | click 4×, open 2× |
| `SALES_AGREED.futureRates` | deposit 0.5, tour 0.2 (halved for conservatism) |
| `CARE_BUMP` | 31 cases per 655 residents; $1,000 default bump |
| `PRICING` | pilot $5,000 / month; Small $5,000, Medium $10,000, Large $20,000 |

## Appendix B: file references

| Item | Path |
| --- | --- |
| Deck manifests | `company-presentations_repo-1/v1/src/decks/events/slif-nov-2026/{ops,sales,integrated}/deck.json` |
| Slide pictures | Same folders, `01.png` … `26.png`, with the live slide omitted |
| Evidence constants | `company-presentations_repo-1/v1/src/settings.ts` |
| Live demo stories | `company-presentations_repo-1/v1/vendor/demo-app/demo/stories/{claire/stalled-tours,megan/falls}/story.json` |
| Demo build provenance | `company-presentations_repo-1/v1/vendor/demo-app/SOURCE.md` |
| Vision | [Product Vision](../vision/ProductVision-Roadmap-Budy-2.md), [Press Release](../vision/Budy-2-Press-Release.md), [FAQ](../vision/Budy-2-FAQ.md) |
| Mission and connection services referenced by the proposition | [Execution Mode Services](../micro-services/execution-mode-services/info.md) |
