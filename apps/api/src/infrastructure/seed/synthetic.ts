import { randomUUID } from 'node:crypto';
import { branches, menu, monthlyOverheads, tables } from './catalog.js';

/**
 * Deterministic synthetic history for the demo. Every row is tagged source='synthetic'
 * and the dashboard labels it as such. Patterns are built in on purpose so analytics
 * have something to find: Gulshan grows, Uttara shrinks, Tuesdays are slow,
 * weekends (Fri/Sat in Bangladesh) are busy, rain cuts covers and lifts khichuri sales.
 */
export interface SyntheticHistory {
  sessions: Array<{ id: string; branchId: string; tableId: string; partySize: number; seatedAt: Date; vacatedAt: Date }>;
  orders: Array<{ id: string; branchId: string; tableId: string; sessionId: string; covers: number; total: number; createdAt: Date; paidAt: Date; paymentMethod: 'cash' | 'card' | 'online' }>;
  items: Array<{ orderId: string; menuItemId: string; quantity: number; unitPrice: number; unitCost: number; placedAt: Date; readyAt: Date; servedAt: Date }>;
  weather: Array<{ branchId: string; day: string; tempMaxC: number; precipitationMm: number }>;
  expenses: Array<{ branchId: string; category: string; amount: number; incurredOn: string }>;
}

const DHAKA_OFFSET_MINUTES = 6 * 60;
const branchProfile: Record<string, { base: number; dailyGrowth: number }> = {
  gulshan: { base: 46, dailyGrowth: 0.0035 },
  dhanmondi: { base: 38, dailyGrowth: 0 },
  uttara: { base: 30, dailyGrowth: -0.003 },
};
/** Index = Date.getUTCDay() of the Dhaka-local day (0 = Sunday). */
const weekdayFactor = [0.95, 0.9, 0.72, 0.85, 1.1, 1.35, 1.25];

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A Dhaka-local wall-clock time as a UTC Date. */
function dhakaTime(day: Date, hour: number, minute: number): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute) - DHAKA_OFFSET_MINUTES * 60_000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function generateHistory(options: { endDay: Date; days: number; seed?: number }): SyntheticHistory {
  const random = mulberry32(options.seed ?? 20261121);
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
  const history: SyntheticHistory = { sessions: [], orders: [], items: [], weather: [], expenses: [] };

  for (let offset = options.days - 1; offset >= 0; offset -= 1) {
    const day = new Date(Date.UTC(options.endDay.getUTCFullYear(), options.endDay.getUTCMonth(), options.endDay.getUTCDate() - offset));
    const dayIndex = options.days - 1 - offset;
    const rainy = random() < 0.12;
    const weekday = day.getUTCDay();

    for (const branch of branches) {
      const profile = branchProfile[branch.id];
      history.weather.push({
        branchId: branch.id,
        day: isoDay(day),
        tempMaxC: Math.round((27 + random() * 5 - (rainy ? 3 : 0)) * 10) / 10,
        precipitationMm: rainy ? Math.round((8 + random() * 30) * 10) / 10 : 0,
      });
      if (day.getUTCDate() === 1 || dayIndex === 0) {
        for (const overhead of monthlyOverheads[branch.id]) {
          history.expenses.push({ branchId: branch.id, category: overhead.category, amount: overhead.amount, incurredOn: isoDay(day) });
        }
      }

      const expected = profile.base * (1 + profile.dailyGrowth * dayIndex) * weekdayFactor[weekday] * (rainy ? 0.75 : 1);
      const orderCount = Math.max(0, Math.round(expected * (0.9 + random() * 0.2)));
      const branchTables = tables.filter((table) => table.branchId === branch.id);
      const weights = menu.map((item) => item.weight * (rainy && item.tags.includes('rainy-day') ? 3 : 1));
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      const pickMenuItem = () => {
        let roll = random() * totalWeight;
        for (let index = 0; index < menu.length; index += 1) {
          roll -= weights[index];
          if (roll <= 0) return menu[index];
        }
        return menu[menu.length - 1];
      };

      for (let n = 0; n < orderCount; n += 1) {
        const dinner = random() < 0.6;
        const hour = dinner ? 19 + Math.floor(random() * 3) : 12 + Math.floor(random() * 3);
        const covers = 1 + Math.floor(random() * random() * 6);
        const suitable = branchTables.filter((table) => table.capacity >= covers);
        const table = pick(suitable.length ? suitable : branchTables);
        const seatedAt = dhakaTime(day, hour, Math.floor(random() * 60));
        const placedAt = addMinutes(seatedAt, 4 + random() * 6);
        const sessionId = randomUUID();
        const orderId = randomUUID();

        const lineCount = Math.max(1, Math.round(covers * (1.3 + random() * 0.8)));
        const lines = new Map<string, number>();
        for (let line = 0; line < lineCount; line += 1) {
          const item = pickMenuItem();
          lines.set(item.id, (lines.get(item.id) ?? 0) + 1);
        }

        let total = 0;
        let lastServed = placedAt;
        for (const [menuItemId, quantity] of lines) {
          const item = menu.find((entry) => entry.id === menuItemId)!;
          const kitchenLoad = dinner ? 1.25 : 1;
          const readyAt = addMinutes(placedAt, item.prep * kitchenLoad * (0.8 + random() * 0.7));
          const servedAt = addMinutes(readyAt, 1 + random() * 3);
          if (servedAt > lastServed) lastServed = servedAt;
          total += item.price * quantity;
          history.items.push({ orderId, menuItemId, quantity, unitPrice: item.price, unitCost: item.cost, placedAt, readyAt, servedAt });
        }

        const vacatedAt = addMinutes(lastServed, 25 + covers * 6 + random() * 20);
        const paymentRoll = random();
        history.sessions.push({ id: sessionId, branchId: branch.id, tableId: table.id, partySize: covers, seatedAt, vacatedAt });
        history.orders.push({
          id: orderId,
          branchId: branch.id,
          tableId: table.id,
          sessionId,
          covers,
          total,
          createdAt: placedAt,
          paidAt: addMinutes(vacatedAt, -3),
          paymentMethod: paymentRoll < 0.6 ? 'cash' : paymentRoll < 0.9 ? 'card' : 'online',
        });
      }
    }
  }
  return history;
}
