// Locale-bound formatters — created once at module load (not per-render).
const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const COMPACT = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

export const formatUsd = (n: number): string => USD.format(n || 0);
export const formatInt = (n: number): string => NUM.format(n || 0);
export const formatCompact = (n: number): string => COMPACT.format(n || 0);

/** Clamp roi to two decimals and append %. Handles negatives + NaN. */
export const formatPercent = (n: number): string => {
  if (!Number.isFinite(n)) return '0.00%';
  return `${n.toFixed(2)}%`;
};
