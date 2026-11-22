/**
 * ============================================================================
 *  BUDY PRESENTATION: SETTINGS FILE
 * ============================================================================
 *  Every number, rate and sentence the presentation uses lives in THIS file.
 *  To change an assumption, edit it here. Nothing else needs to change.
 *
 *  These are business decisions. Do not change a number without checking first.
 *  The sales formula matches /reference/sales_marketing_logic.js exactly (a test checks it).
 *
 *  Tags:
 *    OBSERVED    = taken directly from a customer report or deck
 *    AGREED      = decided by the business owner
 *    PLACEHOLDER = a guess; confirm before showing it to a prospect
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// WORDING: should customer names appear on screen?
// ---------------------------------------------------------------------------
// false = say "one operator" (safe default for a public booth)
// true  = name the customers (Sunny Hills, All Seasons / Beztak)
export const SHOW_CUSTOMER_NAMES = false;


// ---------------------------------------------------------------------------
// BOOTH BEHAVIOUR
// ---------------------------------------------------------------------------
// If nobody touches the screen for this many seconds, it clears everything the
// last visitor typed and goes back to the attract screen. 0 = never reset.
export const IDLE_RESET_SECONDS = 3600;


// ===========================================================================
//  MODULE 1: BILLING AND CARE-LEVEL RECOVERY
//  Source: Jamie weekly report, week of Oct 22 2026 (Sunny Hills: 3 California
//  assisted-living communities, 655 residents) + Slack summary of Sep 18.
// ===========================================================================
export const BILLING_OBSERVED = {
  residents: 655,                  // OBSERVED (3 communities, rent roll 21 Oct)
  communities: 3,                  // OBSERVED
  recoveredSinceLaunch: 31019,     // OBSERVED $/month, 31 cases
  recoveredSinceLaunchCases: 31,   // OBSERVED
  recovered30d: 20592,             // OBSERVED $/month, 20 cases in window
  recovered30dCases: 20,           // OBSERVED
  openLeak: 39106,                 // OBSERVED $/month still leaking (26 priced open cases)
  openPricedCases: 26,             // OBSERVED
  costOfDelay: 43730,              // OBSERVED (gap x days open / 30)
  // Care-plan reassessment gaps from the Oct 16 reviews ($/month). Only 3 samples.
  reassessmentGapSamples: [445, 1070, 1580], // OBSERVED (thin)
};


// ===========================================================================
//  MODULE 2: SALES AND MARKETING ("Gold in the Cold" + marketing lift)
//  Source: SMASH 2026 All Seasons (Beztak / "Joy") deck.
//  Past funnel: 1,482 cold leads -> 340 progressed -> 94 tours -> 41 deposits -> 27 move-ins.
// ===========================================================================
export const SALES_OBSERVED = {
  coldLeads: 1482,   // OBSERVED
  progressed: 340,   // OBSERVED
  tours: 94,         // OBSERVED
  deposits: 41,      // OBSERVED
  moveIns: 27,       // OBSERVED (deck treats all 41 deposits as moving in)
  // Still in play (not yet won or lost). Sums to 706.
  inPlay: { open: 393, progressedNoTour: 246, tour: 53, deposit: 14 }, // OBSERVED
  // Email performance: standard vs with Budy
  clickStandard: 0.025,  // OBSERVED
  clickWithBudy: 0.099,  // OBSERVED (9.9 / 2.5 = 3.96x, rounded to 4x)
  openStandard: 0.19,    // OBSERVED (18-20%, midpoint)
  openWithBudy: 0.37,    // OBSERVED (37 / 19 = 1.95x, rounded to 2x)
};

// Email improvement is "x times THEIR current rate", so it scales from any start.
export const SALES_MULTIPLIERS = {
  click: 4,             // AGREED (from 3.96x)
  open: 2,              // AGREED (from 1.95x). DISPLAY ONLY; counting both clicks and opens would double count
  maxClickRate: 0.5,    // AGREED ceiling (business owner). Budy's best observed is 9.9%
  maxOpenRate: 1.0,     // hard limit: a rate cannot exceed 100%
};

export const SALES_AGREED = {
  noiMargin: 0.38,         // industry average; operators won't share actuals
  budyCostPerYear: 60000,  // $5,000 / month
  horizonMonths: 12,
  // Value of one assisted move-in:
  //   25% are won back from a competitor        -> full stay
  //   75% stay 3 months longer + move in 3 months sooner -> 6 months
  shareWonBack: 0.25,
  monthsForTheRest: 6,
  // Pipeline still to close: original rates (100% / 40%) HALVED to be conservative.
  futureRates: { deposit: 0.5, tour: 0.2 },
  // Marketing lift: extra engaged leads convert at the halved progressed->move-in rate (10% x 0.5)
  liftProgressedToMoveIn: 0.05,
};

// Starting values shown in the sales form
export const SALES_FORM_DEFAULTS = {
  coldLeads: 0,
  avgMonthlyRent: 0,
  avgStayMonths: 24,
  depositToMoveIn: 1.0,
  currentClickRate: SALES_OBSERVED.clickStandard,
  currentOpenRate: 0.2, // starting open rate on screen (2026-10-22). Display only: not used in the dollars.
};

// The simple Sales calculator (deck slide 10). Approved 2026-10-31.
//   back in conversation = leads x 20%
//   deposits & move-ins  = leads x 41 / 1,482 (the live rate from the deck), whole number
//   revenue a month      = deposits & move-ins x monthly rent;  a year = a month x 12
// The pipeline still to close is NOT added here. The starting values are the deck's.
export const SALES_SIMPLE = {
  reactivated: 0.2,
  depositRate: SALES_OBSERVED.deposits / SALES_OBSERVED.coldLeads,
  defaultLeads: 2000,
  defaultRent: 5000,
};

// Sales disclaimers shown with the number
export const SALES_TEXT = {
  largeListThreshold: 10000, // leads
  baseWarningNamed: 'Based on one operator (All Seasons / Beztak); results vary by community.',
  baseWarningAnonymous: 'Based on one operator; results vary by community.',
  overlapWarning: 'Marketing lift and Gold in the Cold can overlap; lift uses halved conversion rates to stay conservative.',
  largeListWarning: 'Very large lead list; extrapolated well beyond the 1,482 leads we measured.',
  missingInput: 'Enter cold leads and average monthly rent.',
  missingStay: 'Enter the average stay in months.',
  // Row names on the results screen (wording only, no numbers)
  rowWon: 'Won from cold leads',
  rowFuture: 'Likely wins in the pipeline',
  // Legend under the split bar on the Sales card (after the number)
  legendWon: 'won from cold leads',
  legendPipeline: 'likely wins in the pipeline',
  rowLift: 'Marketing lift: higher click-through',
};

// ============================================================================
//  CASE STUDIES (added 2026-10-23)
// ============================================================================
//  Two customer stories that visitors can open from the first screen or from the
//  results. All numbers and words for them live here. Derived figures (a year, the NOI,
//  the multiple) are calculated from the facts below in src/logic/caseStudy.ts, so
//  nothing is typed twice.
//
//  Tags: OBSERVED = from the customer's reports or deck. AGREED = decided by the business owner.
//        PLACEHOLDER = to be replaced before it is shown for real.
// ============================================================================


// ===========================================================================
//  NEW FLOW (SALES / OPS), from the boss-meeting wireframe decks, 2026-10-28
// ===========================================================================

// OPS rule (approved 2026-10-28): care bumps = residents x (cases / residents) seen at Jamie.
// Dollars per month = care bumps x the average care bump the rep types.
export const CARE_BUMP = {
  casesObserved: BILLING_OBSERVED.recoveredSinceLaunchCases, // 31 OBSERVED (Jamie, Sunny Hills)
  residentsObserved: BILLING_OBSERVED.residents, // 655 OBSERVED
  defaultBump: 1000, // $ per care bump, starting value (deck sample; observed average is about $1,000)
  defaultResidents: 900, // deck sample, used only for tests
};

// Starting values for the SALES / OPS "About" chapters (the rest come from the Start screen)
export const FLOW_DEFAULTS = {
  occupancy: 90, // whole percent
  rent: 6200, // $ per month (deck sample)
  coldLeads: 3000, // deck sample
  stayMonths: SALES_FORM_DEFAULTS.avgStayMonths,
  careBump: CARE_BUMP.defaultBump,
};


export const FOCUS_TEXT = {
  title: 'What are your goals?',
  sales: { title: 'Sales & Marketing', kicker: 'Working the database', body: 'Budy keeps working your prospect list. It re-engages cold and closed prospects bringing them back into the pipeline.', cta: 'Start with sales' },
  care: { title: 'Care and compliance', kicker: 'Bill the care you provide', body: 'Budy checks care plans and compliance. It finds care that residents receive but you do not bill.', cta: 'Start with care' },
};


export const EMAIL_TEXT = {
  title: 'What Budy sends you',
  from: 'Jamie · Weekly care plan review',
  scrollHint: 'Scroll to read',
  placeholder: 'An example email will go here.',
};


export const PRICING = {
  title: 'Simple to start. Fast to show results.',
  pilot: { label: '3-month pilot', price: '$5,000', per: '/ month' },
  steps: [
    { n: 1, name: 'Month 1', note: 'Budy trains your teammate on your first 2–3 missions and connects your systems.' },
    { n: 2, name: 'Months 2–3', note: 'The teammate runs live. Your team executes, you see the results and ROI.' },
  ],
  after: 'After the pilot · billed annually',
  plans: [
    { name: 'Small', price: '$5,000', note: 'A few communities or a small team (5–10), 2–3 missions' },
    { name: 'Medium', price: '$10,000', note: 'Mid-size portfolio or medium team (11–25)' },
    { name: 'Large', price: '$20,000', note: 'Large operator or team (25+). Custom capacity available' },
  ],
};


// OPS Results page (design S4c with the dots, chosen 2026-10-29)
export const OPS_RESULTS_TEXT = {
  label: 'Results · for your communities',
  lead: 'Based on your data, Budy could recover',
  aYear: 'a year in your billing',
  careBumps: 'care bumps found',
  aMonth: 'a month, all communities',
  perCommunity: 'per community, monthly',
  before: 'Before',
  after: 'After',
  beforeLine: (residents: string) => `${residents} residents · 0 billed`,
  afterLine: (bumps: string) => `${bumps} care bumps found`,
  plusYear: (m: string) => `+ ${m} a year`,
  needAnswers: 'Answer the questions on the previous screen to see the result.',
  goToQuestions: 'Go to the questions',
  maxDots: 900, // one dot per resident, up to this many dots (bigger portfolios are drawn to scale)
};

export const OPS_ABOUT_TEXT = {
  title: 'Let’s find out what Budy can do for you.',
  group: 'Assisted living and memory care',
  payQuestion: 'How do your residents pay?',
  payHint: 'Tap to untick.',
};

// SALES About and Results pages (mock ups chosen 2026-10-29)
export const SALES_ABOUT_TEXT = {
  title: 'Let’s find out what Budy can do for you.',
  il: 'Independent living',
  db: 'Work your database',
  fineOpen: 'Fine-tune conversion details',
  fineClose: 'Hide conversion details',
  emailChange: 'Change',
  emailDone: 'Done',
};

export const SALES_RESULTS_TEXT = {
  label: 'Results · Budy works your database',
  lead: 'Based on your data, Budy could add',
  unit: 'extra move-ins',
  annualRevenue: 'extra revenue a year',
  before: 'Before',
  after: 'With Budy',
  revenueMonthly: 'Extra rent revenue per month',
  revenuePerCommunityStay: 'Extra revenue per community over the average stay',
  perMonth: 'Extra move-ins per community, per month',
  perYear: 'Extra move-ins per community over 12 months',
  beforeLine: (leads: string) => `${leads} leads`,
  afterLine: (leads: string, n: string) => `${leads} leads`,
  beforeEnd: '0 move-ins',
  afterEnd: (n: string) => `${n} extra move-ins`,
  homesFilled: (n: string) => `${n} homes filled from your own database`,
  basis: (leads: string, n: string) => `From what Budy has learned so far, ${leads} leads should yield about ${n} extra move-ins.`,
  needAnswers: 'Answer the questions on the previous screen to see the result.',
  goToQuestions: 'Go to the questions',
  maxTrayDots: 130, // the lit tray shows at most this many dots (bigger results are drawn to scale)
};

// The "Budy is working" screen shown after the About questions, before the results (2026-10-29).
export const CALC_TEXT = {
  ms: 3600, // how long it lasts in total
  reducedMotionMs: 500, // when the visitor's device asks for less motion
  title: 'Budy is working on your numbers.',
  ops: ['Reading your numbers', 'Comparing care levels with billing', 'Counting the care bumps', 'Adding it up'],
  sales: ['Reading your numbers', 'Waking up your database', 'Counting the extra move-ins', 'Adding it up'],
};

// The big action button under the About questions (2026-10-29)
export const RUN_TEXT = {
  button: 'Let Budy run the numbers',
  missing: 'Fill in all the numbers to continue.',
};
