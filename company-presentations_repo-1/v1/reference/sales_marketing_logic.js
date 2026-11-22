/**
 * Sales & Marketing ROI — "Gold in the Cold" + marketing lift (v0.3)
 *
 * v0.2: email lift is a MULTIPLIER of the attendee's own rate (clicks x4, opens x2).
 * v0.3: click rate capped at 50%; all rates clamped to 0-100%.
 *
 * Calibrated on the SMASH 2026 All Seasons (Beztak / "Joy") deck.
 * Past-data funnel: 1,482 cold leads -> 340 progressed -> 94 tours -> 41 deposits -> 27 move-ins.
 * Still in play: 393 open, 246 progressed (no tour), 53 at tour, 14 at deposit.
 *
 * Tags:  OBSERVED = from the deck / Slack
 *        AGREED   = decided with the business owner
 *        ASSUMED  = my assumption, confirm before showing a prospect
 */

// ---------------------------------------------------------------------------
// 1. PAST DATA (All Seasons)
// ---------------------------------------------------------------------------
const OBSERVED = {
  coldLeads: 1482,        // OBSERVED
  progressed: 340,        // OBSERVED
  tours: 94,              // OBSERVED
  deposits: 41,           // OBSERVED
  moveIns: 27,            // OBSERVED (deck treats all 41 deposits as moving in: deposit->move-in = 100% for this client)
  // Still in play (not yet won or lost)
  inPlay: { open: 393, progressedNoTour: 246, tour: 53, deposit: 14 }, // OBSERVED (sums to 706)
  // Email performance, standard vs with Joy
  clickStandard: 0.025,   // OBSERVED
  clickWithBudy: 0.099,   // OBSERVED  -> 9.9 / 2.5 = 3.96x, rounded to 4x
  openStandard: 0.19,     // OBSERVED (18-20%, midpoint)
  openWithBudy: 0.37,     // OBSERVED  -> 37 / 19 = 1.95x, rounded to 2x
};

// Multipliers (AGREED): improvement is "x times their current rate", so it scales
// with whatever click / open rate the attendee starts from.
const MULTIPLIERS = {
  click: 4,               // from 3.96x
  open: 2,                // from 1.95x; DISPLAY ONLY (clicks come from opens, so counting both would double count)
  maxClickRate: 0.50,     // AGREED ceiling (business owner). Note: Budy's best observed is 9.9%; no benchmark exists above that
  maxOpenRate: 1.0,       // hard limit: a rate can't exceed 100%
};

// Share of past leads that reached a deposit: 41 / 1,482 = 2.8%
const DERIVED = {
  coldToDeposit: OBSERVED.deposits / OBSERVED.coldLeads,
};

// ---------------------------------------------------------------------------
// 2. AGREED CONSTANTS
// ---------------------------------------------------------------------------
const AGREED = {
  noiMargin: 0.38,            // industry average; operators won't share actuals
  budyCostPerYear: 60000,     // $5,000 / month
  horizonMonths: 12,
  // Value per assisted move-in:
  //   25% are won back from a competitor  -> full stay
  //   75% stay 3 months longer + moved in 3 months sooner -> 6 months
  shareWonBack: 0.25,
  monthsForTheRest: 6,
  // Future pipeline: original round rates (40 / 10 / 3, deposit 100%) HALVED to be conservative.
  // Only deposits and tours count; earlier stages are upside we do not claim.
  futureRates: { deposit: 0.5, tour: 0.2 },   // = 100% x 0.5 and 40% x 0.5
  // Marketing lift: extra engaged leads enter at "progressed" and convert at the halved
  // progressed->move-in rate (10% x 0.5).
  liftProgressedToMoveIn: 0.05,
};

// ---------------------------------------------------------------------------
// 3. THE ENGINE
// ---------------------------------------------------------------------------
function calculate(input) {
  const i = {
    coldLeads: 0,
    avgMonthlyRent: 0,
    avgStayMonths: 24,
    depositToMoveIn: 1.0,                  // attendee can change; this client = 100%
    currentClickRate: OBSERVED.clickStandard,
    currentOpenRate: 0.20,                 // default 20% (2026-10-22); observed standard above stays 19%
    ...input,
  };
  const warnings = [];
  // Rates are percentages: keep every rate between 0 and 100%
  const clamp01 = x => Math.min(1, Math.max(0, x));
  i.currentClickRate = clamp01(i.currentClickRate);
  i.currentOpenRate = clamp01(i.currentOpenRate);
  i.depositToMoveIn = clamp01(i.depositToMoveIn);
  if (!(i.coldLeads > 0) || !(i.avgMonthlyRent > 0)) {
    return { applicable: false, message: 'Enter cold leads and average monthly rent.' };
  }

  const scale = i.coldLeads / OBSERVED.coldLeads;   // how big is this attendee vs All Seasons

  // Value of ONE assisted move-in
  const monthsGained = AGREED.shareWonBack * i.avgStayMonths
                     + (1 - AGREED.shareWonBack) * AGREED.monthsForTheRest;
  const revenuePerMoveIn = monthsGained * i.avgMonthlyRent;
  const noiPerMoveIn = revenuePerMoveIn * AGREED.noiMargin;

  // A) Gold in the Cold: results so far (deposits x deposit->move-in)
  const wonMoveIns = i.coldLeads * DERIVED.coldToDeposit * i.depositToMoveIn;

  // B) Gold in the Cold: pipeline still to come (deposits + tours, halved rates)
  const futureMoveIns = scale * (
      OBSERVED.inPlay.deposit * AGREED.futureRates.deposit * i.depositToMoveIn
    + OBSERVED.inPlay.tour    * AGREED.futureRates.tour);

  // C) Marketing lift: click-through = their rate x 4 (capped at 50%, never above 100%)
  // (if they already click above the cap, we claim no lift rather than a drop)
  const clickWithBudy = Math.max(i.currentClickRate,
    Math.min(i.currentClickRate * MULTIPLIERS.click, MULTIPLIERS.maxClickRate));
  const clickGain = Math.max(0, clickWithBudy - i.currentClickRate);
  const extraEngaged = i.coldLeads * clickGain;
  const openWithBudy = Math.min(i.currentOpenRate * MULTIPLIERS.open, MULTIPLIERS.maxOpenRate);   // display only
  const liftMoveIns = extraEngaged * AGREED.liftProgressedToMoveIn;

  const rows = [
    { id: 'won',    label: 'Gold in the Cold: move-ins won back', moveIns: wonMoveIns },
    { id: 'future', label: 'Gold in the Cold: pipeline still to close', moveIns: futureMoveIns },
    { id: 'lift',   label: 'Marketing lift: higher click-through', moveIns: liftMoveIns, highlight: true },
  ].map(r => ({ ...r, revenue: r.moveIns * revenuePerMoveIn, noi: r.moveIns * noiPerMoveIn }));

  const totalMoveIns = rows.reduce((a, r) => a + r.moveIns, 0);
  const revenue = totalMoveIns * revenuePerMoveIn;
  const noi = totalMoveIns * noiPerMoveIn;
  const cost = AGREED.budyCostPerYear;

  warnings.push('Based on one operator (All Seasons / Beztak); results vary by community.');
  warnings.push('Marketing lift and Gold in the Cold can overlap; lift uses halved conversion rates to stay conservative.');
  if (i.coldLeads > 10000) warnings.push('Very large lead list; extrapolated well beyond the 1,482 leads we measured.');

  return {
    applicable: true,
    emailLift: {   // shown on screen; only clicks drive the dollars
      open:  { from: i.currentOpenRate,  to: round3(openWithBudy),  multiplier: MULTIPLIERS.open },
      click: { from: i.currentClickRate, to: round3(clickWithBudy), multiplier: MULTIPLIERS.click },
      extraEngagedLeads: Math.round(extraEngaged),
    },
    perMoveIn: { monthsGained, revenue: round100(revenuePerMoveIn), noi: round100(noiPerMoveIn) },
    rows: rows.map(r => ({ ...r, moveIns: round1(r.moveIns), revenue: round1000(r.revenue), noi: round1000(r.noi) })),
    headline: {
      moveIns: round1(totalMoveIns),
      revenue: round1000(revenue),
      noi: round1000(noi),
      cost,
      netNoi: round1000(noi - cost),
      roiMultiple: round1(noi / cost),       // NOI per $1 spent
    },
    warnings,
  };
}

function round3(n) { return Math.round(n * 1000) / 1000; }
function round1(n) { return Math.round(n * 10) / 10; }
function round100(n) { return Math.round(n / 100) * 100; }
function round1000(n) { return Math.round(n / 1000) * 1000; }

module.exports = { OBSERVED, DERIVED, AGREED, MULTIPLIERS, calculate };

// ---------------------------------------------------------------------------
// 4. SELF-TEST  (node sales_marketing_logic.js)
// ---------------------------------------------------------------------------
if (require.main === module) {
  const show = (n, o) => console.log(`\n=== ${n} ===\n` + JSON.stringify(o, null, 2));
  show('All Seasons check (1,482 leads, $6,207, 24-month stay)',
    calculate({ coldLeads: 1482, avgMonthlyRent: 6207, avgStayMonths: 24 }));
  show('Smaller operator (600 leads, $5,000, 28-month stay, 80% deposit->move-in, 4% click now)',
    calculate({ coldLeads: 600, avgMonthlyRent: 5000, avgStayMonths: 28, depositToMoveIn: 0.8, currentClickRate: 0.04 }));
  show('Missing input', calculate({ coldLeads: 0, avgMonthlyRent: 5000 }));
}
