import { detectAnomalies, forecast, pearson } from '../../domain/analytics/forecast.js';
import type { AnalyticsRepository, PeriodFilter } from '../../infrastructure/repositories/analytics.repository.js';

export type AnalyticsStore = Pick<AnalyticsRepository, keyof AnalyticsRepository>;

/** Combines SQL aggregates with the forecasting/anomaly methods for dashboards and the owner assistant. */
export class AnalyticsService {
  constructor(private readonly store: AnalyticsStore) {}

  summary(filter: PeriodFilter) {
    return this.store.summary(filter);
  }

  items(filter: PeriodFilter & { by: 'revenue' | 'quantity' | 'margin'; direction: 'best' | 'worst'; limit: number }) {
    return this.store.itemPerformance(filter);
  }

  weekdays(filter: PeriodFilter) {
    return this.store.weekdayPattern(filter);
  }

  hours(filter: PeriodFilter) {
    return this.store.hourlyPattern(filter);
  }

  profitAndLoss(filter: PeriodFilter) {
    return this.store.profitAndLoss(filter);
  }

  prepTimes(filter: PeriodFilter) {
    return this.store.prepTimes(filter);
  }

  turnAndSpend(filter: PeriodFilter) {
    return this.store.turnAndSpend(filter);
  }

  /** Daily revenue with a 7-day forecast and flagged anomaly days. */
  async trend(filter: PeriodFilter & { horizonDays?: number }) {
    const series = await this.store.dailySeries(filter);
    // Today is still in progress; exclude it from model fitting.
    const today = new Date(Date.now() + 6 * 3_600_000).toISOString().slice(0, 10);
    const complete = series.filter((point) => point.day < today);
    const points = complete.map((point) => ({ day: point.day, value: point.revenue }));
    const enough = points.length >= 14;
    return {
      series,
      forecast: enough ? forecast(points, filter.horizonDays ?? 7).map((p) => ({ ...p, value: Math.round(p.value), low: Math.round(p.low), high: Math.round(p.high) })) : [],
      anomalies: enough ? detectAnomalies(points).map((a) => ({ day: a.day, revenue: a.value, expected: Math.round(a.expected), zScore: Math.round(a.zScore * 10) / 10 })) : [],
      method: 'Linear trend + day-of-week seasonality; anomalies are residuals beyond 2.5 standard deviations.',
    };
  }

  async weatherCorrelation(filter: PeriodFilter) {
    const rows = await this.store.weatherJoined(filter);
    const rainy = rows.filter((row) => row.precipitationMm > 1);
    const dry = rows.filter((row) => row.precipitationMm <= 1);
    const average = (list: typeof rows) => (list.length ? Math.round(list.reduce((sum, row) => sum + row.covers, 0) / list.length) : null);
    const correlation = pearson(rows.map((row) => row.precipitationMm), rows.map((row) => row.covers));
    return {
      days: filter.days,
      observations: rows.length,
      correlationRainVsCovers: correlation === null ? null : Math.round(correlation * 100) / 100,
      avgCoversRainyDay: average(rainy),
      avgCoversDryDay: average(dry),
      rainyDays: rainy.length,
      itemsThatSellMoreWhenRaining: await this.store.rainyDayItemLift(filter),
      weatherSource: [...new Set(rows.map((row) => row.source))],
      caveat: rows.some((row) => row.source === 'synthetic')
        ? 'Weather and sales history are synthetic demo data, so this correlation was built in, not discovered.'
        : null,
    };
  }
}
