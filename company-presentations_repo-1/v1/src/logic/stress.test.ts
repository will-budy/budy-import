import { describe, it, expect } from 'vitest';
import { calculateSales } from './sales';
import { money, moneyShort, toPercent } from '../format';

// Small seeded random generator so failures are repeatable.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const between = (r: () => number, lo: number, hi: number) => lo + r() * (hi - lo);
const allFinite = (o: unknown): boolean =>
  typeof o === 'number'
    ? Number.isFinite(o)
    : Array.isArray(o)
      ? o.every(allFinite)
      : o && typeof o === 'object'
        ? Object.values(o).every(allFinite)
        : true;

describe('Sales: 20,000 random realistic inputs', () => {
  it('stays sane, whole numbers add up, parts add up to the total', () => {
    const r = rng(42);
    for (let n = 0; n < 20000; n++) {
      const input = {
        coldLeads: Math.round(between(r, 1, 200000)),
        avgMonthlyRent: Math.round(between(r, 500, 30000)),
        avgStayMonths: Math.round(between(r, 1, 120)),
        depositToMoveIn: r(),
        currentClickRate: r(),
        currentOpenRate: r(),
      };
      const res = calculateSales(input);
      if (!res.applicable) throw new Error('should apply: ' + JSON.stringify(input));
      expect(allFinite(res), JSON.stringify(input)).toBe(true);

      const w = res.wholeMoveIns;
      for (const v of [w.total, w.won, w.future, w.lift]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(w.won + w.future + w.lift).toBe(w.total);
      expect(res.sections.sales.moveIns + res.sections.marketing.moveIns).toBe(w.total);
      expect(Math.abs(w.total - res.headline.moveIns)).toBeLessThan(1);

      // dollars of the two parts add back to the headline (each rounded to $1,000)
      expect(Math.abs(res.sections.sales.revenue + res.sections.marketing.revenue - res.headline.revenue)).toBeLessThanOrEqual(1000);
      expect(Math.abs(res.sections.sales.noi + res.sections.marketing.noi - res.headline.noi)).toBeLessThanOrEqual(1000);

      // email lift never goes down, never above the limits
      expect(res.emailLift.click.to).toBeGreaterThanOrEqual(Math.round(res.emailLift.click.from * 1000) / 1000);
      expect(res.emailLift.click.to).toBeLessThanOrEqual(Math.max(res.emailLift.click.from, 0.5) + 0.0006);
      expect(res.emailLift.open.to).toBeLessThanOrEqual(1);
      expect(res.emailLift.extraEngagedLeads).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Nonsense inputs never crash or show NaN', () => {
  const junk = [NaN, -1, -1000, 0, Infinity, -Infinity, 1e15, 0.0001];
  it('sales', () => {
    for (const a of junk)
      for (const b of junk) {
        const res = calculateSales({ coldLeads: a, avgMonthlyRent: b });
        if (res.applicable) expect(allFinite(res), `${a}, ${b}`).toBe(true);
      }
    for (const v of junk) {
      const res = calculateSales({ coldLeads: 1000, avgMonthlyRent: 5000, avgStayMonths: v, depositToMoveIn: v, currentClickRate: v, currentOpenRate: v });
      if (res.applicable) expect(allFinite(res), String(v)).toBe(true);
    }
  });
});

describe('Number formatting', () => {
  it('money formats', () => {
    expect(money(9600)).toBe('$9,600');
    expect(moneyShort(362000)).toBe('$362K');
    expect(moneyShort(4181000)).toBe('$4.18M');
    expect(moneyShort(9600)).toBe('$9,600');
    expect(toPercent(0.099)).toBe(9.9);
  });
  it('huge amounts stay readable', () => {
    // billions should not be printed as something like "$4180000.00M"
    expect(moneyShort(4_180_000_000)).toBe('$4.18B');
    expect(moneyShort(4_545_570_000_000)).toBe('$4,545.57B');
  });
});
