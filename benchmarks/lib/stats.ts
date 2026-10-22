export interface Distribution {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly median: number;
  readonly p95: number;
  readonly p99: number;
  readonly stddev: number;
}

/** Nearest-rank percentile on a sorted copy. Values are milliseconds or rates; never money. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    return Number.NaN;
  }
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] as number;
}

export function distribution(values: readonly number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const mean = sorted.reduce((sum, v) => sum + v, 0) / count;
  const variance = count > 1 ? sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (count - 1) : 0;
  return {
    count,
    min: sorted[0] ?? Number.NaN,
    max: sorted[count - 1] ?? Number.NaN,
    mean,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    stddev: Math.sqrt(variance),
  };
}

/** For lower-is-better measures (latency, duration). */
export function improvementPercent(baseline: number, improved: number): number {
  return ((baseline - improved) / baseline) * 100;
}

/** For higher-is-better measures (throughput). */
export function throughputIncreasePercent(baseline: number, improved: number): number {
  return ((improved - baseline) / baseline) * 100;
}

export function round(value: number, places = 3): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
