const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** $70,100 */
export const money = (n: number) => usd.format(n);

/** $4.18B for billions, $4.18M for millions, $362K for tens and hundreds of thousands, otherwise full dollars */
export const moneyShort = (n: number) =>
  Math.abs(n) >= 1_000_000_000
    ? `$${(n / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}B`
    : Math.abs(n) >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : Math.abs(n) >= 10_000
      ? `$${Math.round(n / 1000)}K`
      : usd.format(n);

/** 0.025 -> 2.5 (for showing rates as whole percentages in forms) */
export const toPercent = (rate: number) => Math.round(rate * 1000) / 10;

/** $7.1K or $14.2K for 1,000 to 99,999 (one decimal), otherwise the same as moneyShort. */
export const moneyK = (n: number) =>
  Math.abs(n) >= 1000 && Math.abs(n) < 100_000 ? `$${(n / 1000).toFixed(1)}K` : moneyShort(n);
