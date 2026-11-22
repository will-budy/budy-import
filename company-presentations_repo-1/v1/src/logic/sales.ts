/**
 * Sales & marketing: "Gold in the Cold" + marketing lift.
 * Same formulas as docs/sales_marketing_logic (1).js. All numbers come from settings.ts.
 */
import {
  SALES_OBSERVED as OBS,
  SALES_MULTIPLIERS as MULT,
  SALES_AGREED as AGREED,
  SALES_FORM_DEFAULTS,
  SALES_TEXT,
  SHOW_CUSTOMER_NAMES,
} from '../settings';

export type SalesInput = Partial<typeof SALES_FORM_DEFAULTS>;

export interface SalesRow {
  id: 'won' | 'future' | 'lift';
  label: string;
  moveIns: number;
  revenue: number;
  noi: number;
  highlight?: boolean;
}

export type SalesResult =
  | { applicable: false; message: string }
  | {
      applicable: true;
      emailLift: {
        open: { from: number; to: number; multiplier: number };
        click: { from: number; to: number; multiplier: number };
        extraEngagedLeads: number;
      };
      perMoveIn: { monthsGained: number; revenue: number; noi: number };
      /** Move-ins as whole people (a move-in can't be a fraction). Rows add up to the total. */
      wholeMoveIns: { total: number; won: number; future: number; lift: number };
      /** The two parts shown separately: Sales (Gold in the Cold) and Marketing (lift). */
      sections: {
        sales: { moveIns: number; revenue: number; noi: number };
        marketing: { moveIns: number; revenue: number; noi: number };
      };
      rows: SalesRow[];
      headline: {
        moveIns: number;
        revenue: number;
        noi: number;
        cost: number;
        netNoi: number;
        roiMultiple: number;
      };
      warnings: string[];
    };

/** Share of past leads that reached a deposit: 41 / 1,482 = 2.8%. */
export const coldToDeposit = OBS.deposits / OBS.coldLeads;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round100 = (n: number) => Math.round(n / 100) * 100;
const round1000 = (n: number) => Math.round(n / 1000) * 1000;
/** Keep a rate between 0 and 1. Blank or non-numeric counts as 0. */
const clamp01 = (x: number) => (x >= 1 ? 1 : x > 0 ? x : 0);

/**
 * Round a list to whole numbers so the parts still add up to the rounded total
 * (largest-remainder rounding). Example: 41 + 17.6 + 5.56 = 64.2 -> 41 + 18 + 5 = 64.
 */
export function roundToWhole(values: number[]): number[] {
  const v = values.map((x) => Math.round(x * 1e6) / 1e6); // shake off floating-point dust
  const floors = v.map(Math.floor);
  let left = Math.round(v.reduce((a, b) => a + b, 0)) - floors.reduce((a, b) => a + b, 0);
  const out = [...floors];
  v.map((x, idx) => ({ idx, rest: x - Math.floor(x) }))
    .sort((a, b) => b.rest - a.rest)
    .forEach(({ idx }) => {
      if (left > 0) {
        out[idx] += 1;
        left -= 1;
      }
    });
  return out;
}

export function calculateSales(input: SalesInput = {}): SalesResult {
  const i = { ...SALES_FORM_DEFAULTS, ...input };
  i.currentClickRate = clamp01(i.currentClickRate);
  i.currentOpenRate = clamp01(i.currentOpenRate);
  i.depositToMoveIn = clamp01(i.depositToMoveIn);

  if (!(Number.isFinite(i.coldLeads) && i.coldLeads > 0) || !(Number.isFinite(i.avgMonthlyRent) && i.avgMonthlyRent > 0)) {
    return { applicable: false, message: SALES_TEXT.missingInput };
  }
  if (!Number.isFinite(i.avgStayMonths)) {
    return { applicable: false, message: SALES_TEXT.missingStay };
  }

  const scale = i.coldLeads / OBS.coldLeads; // size vs the operator we measured

  // Value of ONE assisted move-in
  const monthsGained =
    AGREED.shareWonBack * i.avgStayMonths + (1 - AGREED.shareWonBack) * AGREED.monthsForTheRest;
  const revenuePerMoveIn = monthsGained * i.avgMonthlyRent;
  const noiPerMoveIn = revenuePerMoveIn * AGREED.noiMargin;

  // A) Gold in the Cold: won back so far
  const wonMoveIns = i.coldLeads * coldToDeposit * i.depositToMoveIn;

  // B) Gold in the Cold: pipeline still to close (deposits + tours, halved rates)
  const futureMoveIns =
    scale *
    (OBS.inPlay.deposit * AGREED.futureRates.deposit * i.depositToMoveIn +
      OBS.inPlay.tour * AGREED.futureRates.tour);

  // C) Marketing lift: click rate x4, capped at 50%. Above the cap we claim no lift, never a drop.
  const clickWithBudy = Math.max(
    i.currentClickRate,
    Math.min(i.currentClickRate * MULT.click, MULT.maxClickRate),
  );
  const clickGain = Math.max(0, clickWithBudy - i.currentClickRate);
  const extraEngaged = i.coldLeads * clickGain;
  const openWithBudy = Math.min(i.currentOpenRate * MULT.open, MULT.maxOpenRate); // display only
  // The marketing lift is NOT counted in the move-ins (2026-10-29). The email numbers are still shown on screen.
  const liftMoveIns = 0;

  const rawRows: Omit<SalesRow, 'revenue' | 'noi'>[] = [
    { id: 'won', label: SALES_TEXT.rowWon, moveIns: wonMoveIns },
    { id: 'future', label: SALES_TEXT.rowFuture, moveIns: futureMoveIns },
    { id: 'lift', label: SALES_TEXT.rowLift, moveIns: liftMoveIns, highlight: true },
  ];
  const rows = rawRows.map((r) => ({
    ...r,
    revenue: r.moveIns * revenuePerMoveIn,
    noi: r.moveIns * noiPerMoveIn,
  }));

  const totalMoveIns = rows.reduce((a, r) => a + r.moveIns, 0);
  const [wonWhole, futureWhole, liftWhole] = roundToWhole(rows.map((r) => r.moveIns));
  const revenue = totalMoveIns * revenuePerMoveIn;
  const noi = totalMoveIns * noiPerMoveIn;
  const cost = AGREED.budyCostPerYear;

  const warnings = [
    SHOW_CUSTOMER_NAMES ? SALES_TEXT.baseWarningNamed : SALES_TEXT.baseWarningAnonymous,
    SALES_TEXT.overlapWarning,
  ];
  if (i.coldLeads > SALES_TEXT.largeListThreshold) warnings.push(SALES_TEXT.largeListWarning);

  return {
    applicable: true,
    emailLift: {
      open: { from: i.currentOpenRate, to: round3(openWithBudy), multiplier: MULT.open },
      click: { from: i.currentClickRate, to: round3(clickWithBudy), multiplier: MULT.click },
      extraEngagedLeads: Math.round(extraEngaged),
    },
    perMoveIn: { monthsGained, revenue: round100(revenuePerMoveIn), noi: round100(noiPerMoveIn) },
    wholeMoveIns: {
      total: wonWhole + futureWhole + liftWhole,
      won: wonWhole,
      future: futureWhole,
      lift: liftWhole,
    },
    sections: {
      sales: {
        moveIns: wonWhole + futureWhole,
        revenue: round1000((wonMoveIns + futureMoveIns) * revenuePerMoveIn),
        noi: round1000((wonMoveIns + futureMoveIns) * noiPerMoveIn),
      },
      marketing: {
        moveIns: liftWhole,
        revenue: round1000(liftMoveIns * revenuePerMoveIn),
        noi: round1000(liftMoveIns * noiPerMoveIn),
      },
    },
    rows: rows.map((r) => ({
      ...r,
      moveIns: round1(r.moveIns),
      revenue: round1000(r.revenue),
      noi: round1000(r.noi),
    })),
    headline: {
      moveIns: round1(totalMoveIns),
      revenue: round1000(revenue),
      noi: round1000(noi),
      cost,
      netNoi: round1000(noi - cost),
      roiMultiple: round1(noi / cost),
    },
    warnings,
  };
}
