import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { calculateSales, roundToWhole } from './sales';

// The original sales formula file in /reference is the answer key. The new code must match it exactly.
const require = createRequire(import.meta.url);
const originalSales = require('../../reference/sales_marketing_logic.js');

describe('README examples (must reproduce exactly)', () => {
  it('Sales & marketing: 1,482 leads, $6,207 rent, 24-month stay', () => {
    const r = calculateSales({ coldLeads: 1482, avgMonthlyRent: 6207, avgStayMonths: 24 });
    if (!r.applicable) throw new Error('should apply');
    expect(r.rows.map((x) => x.moveIns)).toEqual([41, 17.6, 0]); // won, pipeline, lift (lift is not counted)
    expect(r.headline.moveIns).toBe(58.6);
    expect(r.headline.revenue).toBe(3819000); // shows as $3.82M
    expect(r.headline.noi).toBe(1451000); // shows as $1.45M
    expect(r.headline.roiMultiple).toBe(24.2);
  });
});

describe('Whole move-ins (display)', () => {
  it('README example shows 59 total as 41 + 18 + 0', () => {
    const r = calculateSales({ coldLeads: 1482, avgMonthlyRent: 6207, avgStayMonths: 24 });
    if (!r.applicable) throw new Error('should apply');
    expect(r.wholeMoveIns).toEqual({ total: 59, won: 41, future: 18, lift: 0 });
  });
  it('rows always add up to the total, and are whole numbers', () => {
    for (const coldLeads of [150, 480, 1000, 1482, 2750, 5000, 9999])
      for (const click of [0.01, 0.025, 0.04, 0.1]) {
        const r = calculateSales({ coldLeads, avgMonthlyRent: 5200, currentClickRate: click });
        if (!r.applicable) throw new Error('should apply');
        const w = r.wholeMoveIns;
        expect(Number.isInteger(w.total)).toBe(true);
        expect(w.won + w.future + w.lift).toBe(w.total);
        expect(Math.abs(w.total - r.headline.moveIns)).toBeLessThan(1);
      }
  });
  it('rounds a single number normally', () => {
    expect(roundToWhole([129.9])).toEqual([130]);
  });
});

describe('Sales and marketing split into two sections', () => {
  it('README example: Sales 59 (41 + 18), Marketing 0, together 59', () => {
    const r = calculateSales({ coldLeads: 1482, avgMonthlyRent: 6207, avgStayMonths: 24 });
    if (!r.applicable) throw new Error('should apply');
    expect(r.sections.sales.moveIns).toBe(59);
    expect(r.sections.marketing.moveIns).toBe(0);
    expect(r.sections.sales.moveIns + r.sections.marketing.moveIns).toBe(r.wholeMoveIns.total);
    // the two parts add back up to the combined dollars (within rounding)
    expect(Math.abs(r.sections.sales.revenue + r.sections.marketing.revenue - r.headline.revenue)).toBeLessThanOrEqual(1000);
    expect(Math.abs(r.sections.sales.noi + r.sections.marketing.noi - r.headline.noi)).toBeLessThanOrEqual(1000);
  });
});

describe('Edge cases', () => {
  it('Sales: missing inputs', () => {
    expect(calculateSales({ coldLeads: 0, avgMonthlyRent: 5000 }).applicable).toBe(false);
  });
  it('Sales: no lift when click rate is already above the cap', () => {
    const r = calculateSales({ coldLeads: 1000, avgMonthlyRent: 5000, currentClickRate: 0.6 });
    if (!r.applicable) throw new Error('should apply');
    expect(r.rows.find((x) => x.id === 'lift')?.moveIns).toBe(0);
  });
});

// The marketing lift is no longer counted (2026-10-29). The original file still has it.
// A click rate of 60% or more gives the original no lift, so the original with 60% is the answer key.
describe('Matches the original docs files (without the marketing lift) on many inputs', () => {
  it('Sales & marketing', () => {
    for (const coldLeads of [200, 600, 1482, 5000])
      for (const avgMonthlyRent of [3500, 5000, 6207, 8000])
        for (const avgStayMonths of [12, 24, 28])
          for (const depositToMoveIn of [0.5, 0.8, 1])
            for (const currentClickRate of [0.01, 0.025, 0.04, 0.12, 0.6])
              for (const currentOpenRate of [0.1, 0.19, 0.6]) {
                const input = { coldLeads, avgMonthlyRent, avgStayMonths, depositToMoveIn, currentClickRate, currentOpenRate };
                const mine = calculateSales(input);
                const orig = originalSales.calculate({ ...input, currentClickRate: 0.6 });
                if (!mine.applicable || !orig.applicable) throw new Error('should apply');
                expect(mine.headline).toEqual(orig.headline);
                // labels were reworded on purpose, so compare the numbers only
                const numbersOnly = (rows: { label: string }[]) => rows.map(({ label, ...rest }) => rest);
                expect(numbersOnly(mine.rows)).toEqual(numbersOnly(orig.rows));
                expect(mine.perMoveIn).toEqual(orig.perMoveIn);
              }
  });
});
