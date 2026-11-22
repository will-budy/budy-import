"""Slide content for the BudyII executive summary deck.

Source of truth: v2/ref/deck-proposition-alignment.md, which itself traces every
figure to company-presentations_repo-1/v1/src/settings.ts.

Rules:
  * No figure appears here that is not in the alignment doc (Appendix A).
  * Every number needs sign-off from the business owner of the numbers before
    external use; slide 1 carries that caveat.
  * Text is deliberately terse: this is a slide deck, not the doc.

Each entry is a dict with ``kind`` naming a layout in layouts.py.
"""

from __future__ import annotations

SLIDES: list[dict] = []


# --- 1. Executive summary -------------------------------------------------

SLIDES.append(
    {
        "kind": "verdict",
        "section": "00 / EXECUTIVE SUMMARY",
        "title": "The demo decks prove the operating model, not yet the platform",
        "lead": (
            "Three senior-living decks hold the company's strongest evidence for BudyII's "
            "operating-mission claim. They are not yet a BudyII product story."
        ),
        "rows": [
            ("Operating model is real and repeatable in a vertical", "Strong", "supported"),
            ("Evidence for the operating-mission scope of delegation", "Strong", "supported"),
            ("The model transfers across functions", "Partial", "partial"),
            ("Platform claim: agnostic, teachable, legible", "Absent", "gap"),
            ("BudyII commercial story", "Contradicts", "contradicts"),
            ("Proof point against Lindy, Microsoft, Relevance AI", "Partial", "partial"),
        ],
        "row_headers": ("Judgement", "Position", ""),
        "quote": "Senior living is where Budy proved the operating model. BudyII is that model without the vertical.",
        "footnote": (
            "Figures cited in this deck require sign-off from the business owner of the numbers "
            "before external use. Detail: v2/ref/deck-proposition-alignment.md"
        ),
    }
)


# --- 2. Five claims -------------------------------------------------------

SLIDES.append(
    {
        "kind": "columns",
        "section": "01 / THE PROPOSITION",
        "title": "The evolved proposition, in five claims",
        "lead": "Each claim becomes a test. The decks are scored against these five for the rest of the deck.",
        "columns": [
            ("01", "Category", "A Digital Teammate: a new kind of personal computer for work. An agnostic platform, not a vertical agent, a chatbot, or an assistant feature."),
            ("02", "Buyer", "The high-agency, non-technical builder, defined by disposition rather than industry, job title, or team size."),
            ("03", "Unit of value", "Business outcomes, not tasks or tokens: compute, output, execution, operational result, business outcome."),
            ("04", "Delegation discipline", "Understanding, ownership, continuity, control, run as a mission lifecycle across task, workflow and operating-mission scopes."),
            ("05", "Transfer", "The reusable operating model carries across businesses. Domain context does not."),
        ],
        "test_rows": [
            ("1. Category", "Does the deck sell a platform or a vertical?", "Vertical in all three, so contradicted"),
            ("2. Buyer", "Is the buyer a builder, or a recipient?", "Operator profile, not the builder"),
            ("3. Unit of value", "Outcome, or activity and outputs?", "Outcome in Ops and Sales"),
            ("4. Delegation", "Is authority, continuity and review visible?", "Strong in Ops and Sales"),
            ("5. Transfer", "Does the operating model survive a new domain?", "Yes: the loop is generic"),
        ],
        "test_headers": ["Claim", "The test applied to each deck", "Result"],
    }
)


# --- 3. Qualification matrix ---------------------------------------------

SLIDES.append(
    {
        "kind": "matrix",
        "section": "02 / QUALIFICATION",
        "title": "How the three decks score against the five claims",
        "lead": "Supported means the deck evidences the claim directly. Contradicts means it works against it.",
        "col_headers": ["Claim", "Ops", "Sales", "Integrated"],
        "col_sub": ["", "care / billing", "pipeline", "26 missions"],
        "rows": [
            ("1. Agnostic platform, not a vertical agent", "contradicts", "contradicts", "contradicts"),
            ("2. Buyer: high-agency, non-technical builder", "partial", "partial", "partial"),
            ("3. Unit of value: outcome over task", "supported", "supported", "partial"),
            ("4. Delegation discipline", "supported", "supported", "partial"),
            ("5. Transfer of the operating model", "supported", "supported", "supported"),
        ],
        "legend": [
            ("supported", "Supported"),
            ("partial", "Partial"),
            ("gap", "Gap"),
            ("contradicts", "Contradicts"),
        ],
        "note": (
            "Every deck is senior-living first, so claim 1 is contradicted by framing in all three. "
            "Integrated carries the most BudyII-shaped structure and is the only deck built around missions."
        ),
    }
)


# --- 4. Ops ---------------------------------------------------------------

SLIDES.append(
    {
        "kind": "steps",
        "section": "03 / OPS",
        "title": "Ops: the operating mission, executed",
        "lead": "The strategy deck's own billing-leakage example, run against three communities with measured results.",
        "steps": [
            ("01", "Find the gap", "Compare service records with billing."),
            ("02", "Establish the facts", "Resolve evidence gaps, identify the responsible owner."),
            ("03", "Act within authority", "Route the correction for the required review."),
            ("04", "Verify progress", "Track reviewed, corrected, billed and collected."),
        ],
        "kpis": [
            ("$31,019", "per month recovered", "31 cases since launch"),
            ("$20,592", "per month, last 30 days", "20 cases in window"),
            ("$39,106", "per month still leaking", "26 priced open cases"),
            ("$43,730", "cost of delay", "gap x days open / 30"),
        ],
        "caption": "In scope: 3 California assisted-living communities, 655 residents.",
        "role": (
            "Rendering of the delegation value model: understanding, ownership, continuity, control - "
            "with verified progress per unit of human supervision on screen."
        ),
    }
)


# --- 5. Sales -------------------------------------------------------------

SLIDES.append(
    {
        "kind": "funnel",
        "section": "04 / SALES",
        "title": "Sales: follow-through measured in move-ins",
        "lead": "One operator's funnel, from a dead database to closed move-ins, with the lift that got it there.",
        "funnel": [
            ("Cold leads", "1,482"),
            ("Progressed", "340"),
            ("Tours", "94"),
            ("Deposits", "41"),
            ("Move-ins", "27"),
        ],
        "lift": [
            ("Click-through", "2.5%", "9.9%", "4x"),
            ("Open rate", "19%", "37%", "2x"),
        ],
        "aside": [
            ("706", "leads still in play, not yet won or lost"),
            ("4x / 2x", "lift over their own current rate, so it scales from any start"),
        ],
        "role": (
            "Passes the vision's own test: task volume is not presented as value. "
            "Regional coaching shows a manager's mission reaching counselors without making them AI operators."
        ),
    }
)


# --- 6. Integrated --------------------------------------------------------

SLIDES.append(
    {
        "kind": "catalogue",
        "section": "05 / INTEGRATED",
        "title": "Integrated: twelve missions on one teammate",
        "lead": "The only deck built as a mission menu, and the closest existing artifact to the BudyII promise.",
        "groups": [
            ("Prioritized action", ["Gold in the Cold", "Task Enrichment", "Tour Follow-up: 3 in 3"]),
            ("Team and handoffs", ["Regional Coaching", "Ambassador Matching", "Task Assignment"]),
            ("Cross-system actions", ["Revenue Management", "Smart Campaign Matching", "Personalized nurture"]),
            ("Context synthesis", ["On-Demand ICP Builder", "Three move-in profiles from 86 residents"]),
            ("Horizontally distinct", ["SEO keywords and GEO / AEO", "Where families find the community"]),
            ("Authority and scope", ["Pick the missions that matter", "Drive execution"]),
        ],
        "aside": [
            ("12", "mission families, one teammate"),
            ("Hidden", "listed: false - reps open it by address"),
        ],
        "note": "Breadth here is functional, not vertical. That is what makes it the right bridge asset and the wrong final story.",
        "behaviours": [
            ("Persistent context", "Three move-in profiles built from 86 residents"),
            ("Prioritized action", "Gold in the Cold, Tour Follow-up: 3 in 3"),
            ("Team follow-through", "Regional Coaching, Ambassador Matching"),
            ("Cross-system action", "Revenue Management, Smart Campaign Matching"),
        ],
        "behaviours_title": "The BudyII behaviours already visible on screen",
    }
)


# --- 7. Pillar support ----------------------------------------------------

SLIDES.append(
    {
        "kind": "pillars",
        "section": "06 / PILLARS",
        "title": "How the evidence supports each BudyII pillar",
        "lead": "Six pillars, each with the deck artifact that carries it and the strength of that support.",
        "rows": [
            ("Delegation value", "Understanding, ownership, continuity, control", "Scope confirmation, unattended six-hour mission, open leak measured monthly, approved correction path", "Strong"),
            ("Mission lifecycle", "Agree, pilot, run, verify, refine", "Agree and verify on screen; refine only implied by cadence", "Partial"),
            ("Three scopes", "Task, workflow, operating mission", "Ops sits at operating-mission level, the highest of the three", "Strong"),
            ("Unit of value", "Compute to business outcome", "27 move-ins from 1,482 leads; $31,019 per month recovered", "Strong"),
            ("Transfer", "Operating model vs domain context", "The loop is generic; reimbursement rules and local authority are not", "Strong"),
            ("Competition", "Lindy, Microsoft, Relevance AI", "Follow-through, time to value, operator simplicity", "Partial"),
        ],
        "col_headers": ["Pillar", "What it claims", "Deck evidence", "Strength"],
        "col_w": [0.15, 0.20, 0.52, 0.13],
    }
)


# --- 8. Pillars deep dive -------------------------------------------------

SLIDES.append(
    {
        "kind": "pillars_deep",
        "section": "07 / PILLARS DEEP DIVE",
        "title": "Messaging and activation, pillar by pillar",
        "lead": "For each pillar: the message the evidence earns, and the tactical activation it supports.",
        "rows": [
            (
                "Delegation value",
                "A teammate that owns the outcome, not a tool that answers.",
                "Lead with the open leak that stays open, not the dollars already recovered.",
                "Proof: Before / after community comparison",
            ),
            (
                "Mission lifecycle",
                "You agree the mission once; progress reports itself.",
                "Name the five stages and show the refine cycle, which the decks never display.",
                "Asset: one slide showing the cycle adjusting",
            ),
            (
                "Three scopes",
                "Most tools stop at tasks. This one runs objectives.",
                "Position against task-level demos from Lindy and Microsoft.",
                "Demo: one mission, one baseline, weekly progress",
            ),
            (
                "Unit of value",
                "Verified progress per unit of human supervision.",
                "Show the denominators: 3 communities, 655 residents, 31 cases.",
                "Retire: ROI calculator as the headline",
            ),
            (
                "Transfer",
                "Senior living is where it was proven. Not what it is.",
                "Pair one vertical proof with one non-vertical mission menu.",
                "Seeding: adjacent-function missions",
            ),
            (
                "Legibility",
                "You can see the plan, the sources, the actions, the approvals.",
                "Add the mission record to every live demo.",
                "Product: workspace pane in the demo",
            ),
        ],
        "col_headers": ["Pillar", "Message the evidence earns", "Activation tactic", "Asset or change"],
        "col_w": [0.15, 0.30, 0.33, 0.22],
    }
)


# --- 9. Recommendations ---------------------------------------------------

SLIDES.append(
    {
        "kind": "connections",
        "section": "08 / RECOMMENDATIONS",
        "title": "Three connections from BudyI to BudyII",
        "lead": "The vertical proof converts into an agnostic claim through these three bridges. Each is already visible on screen.",
        "connections": [
            (
                "01",
                "Mission, not workflow",
                "Ops runs a recurring business objective with a baseline and reported progress - the highest of the three delegation scopes.",
                "Becomes: BudyII's differentiator against task-level and workflow-level rivals.",
            ),
            (
                "02",
                "Operating model travels, context does not",
                "The same four-box loop produces billing recovery, pipeline follow-through and twelve other missions.",
                "Becomes: the transfer claim, evidenced rather than asserted.",
            ),
            (
                "03",
                "Outcome denominators, not output volume",
                "31 cases, 655 residents, 1,482 leads, 27 move-ins - a funnel with real denominators behind each outcome.",
                "Becomes: the reliability argument the premium price rests on.",
            ),
        ],
        "effort_headers": ["Concrete change", "Effort", "Payoff"],
        "effort": [
            ("Framing slide: senior living is the proving vertical", "Low", "Resolves the largest contradiction"),
            ("Replace the pricing block with the authority model", "Low", "Removes the sharpest BudyII mismatch"),
            ("Add a mission-record view to the live demo", "Medium", "Turns proof into product"),
            ("Add one approved write with an approval step", "Medium", "Shows authority, not just analysis"),
            ("List Integrated on the home page", "Low", "Unhides the most BudyII-shaped deck"),
        ],
    }
)


# --- 10. Value and relevancy translation ---------------------------------

SLIDES.append(
    {
        "kind": "translation",
        "section": "09 / TRANSLATION",
        "title": "From deck evidence to product marketing and demand gen",
        "lead": "What to leverage, what to retire, and what the marketing and demand-gen teams still need decided.",
        "left_title": "Leverage this connection",
        "left": [
            ("Category claim", "Delegation, not assistance. A teammate with an enduring role."),
            ("Buyer definition", "The high-agency, non-technical builder, drawn from an operator profile already in the decks."),
            ("Proof assets", "Operating mission with measured recovery; funnel with real denominators."),
            ("Message hierarchy", "Outcome, then control, then capability. Not capability first."),
            ("Demand-gen hook", "The open leak that stays open: a live problem, not a case study."),
        ],
        "right_title": "Retire or reframe",
        "right": [
            ("Vertical first framing", "Reframe senior living as the proving vertical, not the offer."),
            ("Rep-led pilot", "Replace with Budy-led activation; the vision rejects the consulting motion."),
            ("Small / Medium / Large", "Replace with Explore, Part-Time, Full-Time, Heavy / Max."),
            ("ROI calculator as centrepiece", "Keep as a worked example, not the value proposition."),
            ("Named vertical personas", "Present Claire and Megan as taught teammates, not SKUs."),
        ],
        "asks_title": "Decisions needed",
        "asks": [
            "Who owns the line \"senior living is the proving vertical, not the product\"?",
            "Does any price appear in BudyII material, given the product-led posture?",
            "Do proof assets name customers, or stay anonymous as they do today?",
            "Is a report-only demo acceptable, or must an approved write appear live?",
        ],
        "flow_title": "How the reuse arc runs, from demand gen to proof",
        "flow": [
            ("Hook", "The gap after the wow: impressive output that never becomes work."),
            ("Proof", "Ops as a worked operating mission, with the baseline on screen."),
            ("Transfer", "The same model applied to new work, via the mission menu."),
            ("Ask", "Delegate the mission, keep the authority, see the record."),
        ],
    }
)
