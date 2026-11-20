/**
 * Small, explainable time-series methods for daily revenue/covers. No external ML dependency:
 * a linear trend plus a day-of-week seasonal component, and z-score anomalies on the residuals.
 */
export interface DailyPoint {
  day: string; // YYYY-MM-DD
  value: number;
}

export interface TrendModel {
  intercept: number;
  slopePerDay: number;
  /** Additive seasonal offset per weekday, index 0 = Sunday. */
  weekday: number[];
  residualStd: number;
}

const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

export function fitTrendSeasonal(points: DailyPoint[]): TrendModel {
  const n = points.length;
  if (n < 14) throw new Error('Need at least 14 days of history to fit a weekly model');
  const xs = points.map((_, index) => index);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.value, 0) / n;
  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < n; i += 1) {
    covariance += (xs[i] - meanX) * (points[i].value - meanY);
    variance += (xs[i] - meanX) ** 2;
  }
  const slopePerDay = variance === 0 ? 0 : covariance / variance;
  const intercept = meanY - slopePerDay * meanX;

  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);
  points.forEach((point, index) => {
    const weekday = weekdayOf(point.day);
    sums[weekday] += point.value - (intercept + slopePerDay * index);
    counts[weekday] += 1;
  });
  const weekday = sums.map((sum, index) => (counts[index] ? sum / counts[index] : 0));

  const residuals = points.map((point, index) => point.value - (intercept + slopePerDay * index + weekday[weekdayOf(point.day)]));
  const residualStd = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / Math.max(1, n - 2));
  return { intercept, slopePerDay, weekday, residualStd };
}

export function forecast(points: DailyPoint[], horizonDays: number): Array<DailyPoint & { low: number; high: number }> {
  const model = fitTrendSeasonal(points);
  const lastDay = new Date(`${points[points.length - 1].day}T00:00:00Z`);
  return Array.from({ length: horizonDays }, (_, step) => {
    const date = new Date(lastDay.getTime() + (step + 1) * 86_400_000);
    const day = date.toISOString().slice(0, 10);
    const value = model.intercept + model.slopePerDay * (points.length + step) + model.weekday[date.getUTCDay()];
    const band = 1.96 * model.residualStd;
    return { day, value: Math.max(0, value), low: Math.max(0, value - band), high: value + band };
  });
}

export function detectAnomalies(points: DailyPoint[], threshold = 2.5): Array<DailyPoint & { expected: number; zScore: number }> {
  const model = fitTrendSeasonal(points);
  if (model.residualStd === 0) return [];
  return points.flatMap((point, index) => {
    const expected = model.intercept + model.slopePerDay * index + model.weekday[weekdayOf(point.day)];
    const zScore = (point.value - expected) / model.residualStd;
    return Math.abs(zScore) >= threshold ? [{ ...point, expected, zScore }] : [];
  });
}

/** Pearson correlation; returns null when either series has no variance. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}
