import type { MenuItem } from '../../domain/hub/types.js';
import type { AnalyticsStore } from '../analytics/analytics-service.js';
import { knowledgeDocs } from '../../infrastructure/seed/knowledge.js';
import type { IngestReport, RagService } from './rag-service.js';

const bdt = (value: number) => `৳${Math.round(value).toLocaleString('en-US')}`;

export function menuDocument(menu: MenuItem[]): string {
  const byCategory = new Map<string, MenuItem[]>();
  for (const item of menu) byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
  return [...byCategory.entries()]
    .map(([category, items]) => `# ${category}\n\n${items
      .map((item) => `${item.name} (${bdt(item.price)}): ${item.description}${item.tags.length ? ` Tags: ${item.tags.join(', ')}.` : ''}`)
      .join('\n\n')}`)
    .join('\n\n');
}

/** Turns per-day aggregates into short weekly notes per branch, so retrieval can answer "what happened". */
export function weeklyNotes(notes: Awaited<ReturnType<AnalyticsStore['dailyNotes']>>) {
  const groups = new Map<string, typeof notes>();
  for (const note of notes) {
    const monday = new Date(`${note.day}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const key = `${note.branchId}|${monday.toISOString().slice(0, 10)}`;
    groups.set(key, [...(groups.get(key) ?? []), note]);
  }
  return [...groups.entries()].map(([key, days]) => {
    const [, weekOf] = key.split('|');
    const branch = days[0].branch;
    const lines = days.map((day) =>
      `${day.weekday} ${day.day}: ${day.orders} orders, ${day.covers} covers, revenue ${bdt(day.revenue)}`
      + `${day.precipitationMm > 1 ? `, rain ${day.precipitationMm} mm` : ', dry'}${day.topItem ? `, top item ${day.topItem}` : ''}.`);
    return {
      title: `Daily log · ${branch} · week of ${weekOf}`,
      body: `# ${branch}, week of ${weekOf} (synthetic demo data)\n\n${lines.join('\n')}`,
    };
  });
}

/** (Re)builds the retrieval corpus: house documents, the live menu and recent daily logs. */
export async function buildCorpus(rag: RagService, sources: { menu: MenuItem[]; analytics: AnalyticsStore; days?: number }): Promise<IngestReport[]> {
  const reports: IngestReport[] = [];
  for (const doc of knowledgeDocs) reports.push(await rag.ingest({ ...doc, replaceByTitle: true }));
  reports.push(await rag.ingest({ sourceType: 'menu', title: 'Menu', body: menuDocument(sources.menu), replaceByTitle: true }));
  for (const note of weeklyNotes(await sources.analytics.dailyNotes(sources.days ?? 63))) {
    reports.push(await rag.ingest({ sourceType: 'daily_summary', title: note.title, body: note.body, replaceByTitle: true }));
  }
  return reports;
}
