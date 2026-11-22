import { describe, it, expect } from 'vitest';
import { calculateOps } from './ops';
import { moneyK } from '../format';

describe('OPS care bumps', () => {
  it('deck sample: 900 residents, $1,000 bump, 6 communities -> 43 bumps and $7.1K a month per community', () => {
    const r = calculateOps({ residents: 900, careBump: 1000, communities: 6 });
    expect(r.applicable).toBe(true);
    if (!r.applicable) return;
    expect(r.bumps).toBe(43);
    expect(Math.round(r.monthly)).toBe(42595);
    expect(r.perCommunityMonthly).not.toBeNull();
    expect(Math.round((r.perCommunityMonthly as number) / 100) / 10).toBe(7.1);
    expect(moneyK(r.perCommunityMonthly as number)).toBe('$7.1K');
  });
  it('Jamie itself: 655 residents give exactly 31 cases', () => {
    const r = calculateOps({ residents: 655, careBump: 1000, communities: 3 });
    expect(r.applicable && r.bumps).toBe(31);
    expect(r.applicable && Math.round(r.monthly)).toBe(31000);
  });
  it('rejects junk', () => {
    expect(calculateOps({ residents: 0, careBump: 1000, communities: 6 }).applicable).toBe(false);
    expect(calculateOps({ residents: NaN, careBump: 1000, communities: 6 }).applicable).toBe(false);
  });
  it('no communities: no per-community figure', () => {
    const r = calculateOps({ residents: 900, careBump: 1000, communities: 0 });
    expect(r.applicable && r.perCommunityMonthly).toBeNull();
  });
});
