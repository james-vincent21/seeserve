import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectAnomalies, fitTrendSeasonal, forecast, pearson, type DailyPoint } from '../apps/api/src/domain/analytics/forecast.js';
import { generateHistory } from '../apps/api/src/infrastructure/seed/synthetic.js';

function series(days: number, fn: (index: number, weekday: number) => number): DailyPoint[] {
  const start = Date.UTC(2026, 8, 1);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start + index * 86_400_000);
    return { day: date.toISOString().slice(0, 10), value: fn(index, date.getUTCDay()) };
  });
}

describe('Forecasting and anomalies', () => {
  it('recovers a linear trend and a weekly pattern', () => {
    const points = series(56, (index, weekday) => 100 + 2 * index + (weekday === 5 ? 40 : 0));
    const model = fitTrendSeasonal(points);
    assert.ok(Math.abs(model.slopePerDay - 2) < 0.2);
    assert.ok(model.weekday[5] > model.weekday[2] + 30);
  });

  it('forecasts the next week with the seasonal bump on Friday', () => {
    const points = series(56, (index, weekday) => 100 + (weekday === 5 ? 40 : 0));
    const next = forecast(points, 7);
    const friday = next.find((point) => new Date(`${point.day}T00:00:00Z`).getUTCDay() === 5)!;
    const tuesday = next.find((point) => new Date(`${point.day}T00:00:00Z`).getUTCDay() === 2)!;
    assert.equal(next.length, 7);
    assert.ok(friday.value - tuesday.value > 30);
  });

  it('flags an obvious outlier day', () => {
    const points = series(42, (index) => 100 + (index % 3));
    points[30] = { ...points[30], value: 300 };
    const anomalies = detectAnomalies(points);
    assert.equal(anomalies.length, 1);
    assert.equal(anomalies[0].day, points[30].day);
  });

  it('computes Pearson correlation', () => {
    assert.ok(Math.abs((pearson([1, 2, 3, 4], [2, 4, 6, 8]) ?? 0) - 1) < 1e-9);
    assert.equal(pearson([1, 1, 1], [1, 2, 3]), null);
  });
});

describe('Synthetic history', () => {
  it('is deterministic and labelled with the built-in patterns', () => {
    const endDay = new Date(Date.UTC(2026, 10, 21));
    const a = generateHistory({ endDay, days: 28, seed: 7 });
    const b = generateHistory({ endDay, days: 28, seed: 7 });
    assert.equal(a.orders.length, b.orders.length);
    assert.deepEqual(a.items.slice(0, 5).map((i) => i.menuItemId), b.items.slice(0, 5).map((i) => i.menuItemId));
    assert.ok(a.orders.every((order) => order.paidAt > order.createdAt));
    assert.ok(a.items.every((item) => item.readyAt >= item.placedAt && item.servedAt >= item.readyAt));
  });
});
