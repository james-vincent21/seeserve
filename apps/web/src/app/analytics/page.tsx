'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import ui from '@/features/shell/platform.module.css';
import { BranchPicker, PageShell } from '@/features/shell/page-shell';
import { api, formatBdt } from '@/shared/api/hub';

interface Summary { revenue: number; orders: number; covers: number; revenuePerCover: number; averageOrderValue: number; revenueGrowthPct: number | null }
interface Trend { series: Array<{ day: string; revenue: number }>; forecast: Array<{ day: string; value: number; low: number; high: number }>; anomalies: Array<{ day: string; revenue: number; expected: number; zScore: number }>; method: string }
interface Item { name: string; quantity: number; revenue: number; grossMargin: number; marginPct: number }
interface Weekday { weekday: string; avgRevenue: number; avgOrders: number }
interface Hour { hour: number; orders: number }
interface Pnl { branch: string; revenue: number; cogs: number; overheads: number; netProfit: number; netMarginPct: number | null; status: 'profit' | 'loss' }
interface Prep { item: string; avgPrepMinutes: number; p90PrepMinutes: number; targetMinutes: number; samples: number }
interface Weather { correlationRainVsCovers: number | null; rainyDayCoverChangePct: number | null; method: string; avgCoversRainyDay: number | null; avgCoversDryDay: number | null; rainyDays: number; itemsThatSellMoreWhenRaining: Array<{ item: string; rainyDaySharePct: number; dryDaySharePct: number }>; caveat: string | null }
interface Turn { branch: string; avgTurnMinutes: number; revenuePerCover: number }

const INK = '#24342a';
const ACCENT = '#8ca343';
const MUTED = '#b9c0b4';
const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const compact = (value: number) => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1000 ? `${Math.round(value / 1000)}k` : String(value));

function AnalyticsView() {
  const [branch, setBranch] = useState('');
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');
  const [data, setData] = useState<{
    summary: Summary; trend: Trend; best: Item[]; worst: Item[]; weekdays: Weekday[]; hours: Hour[]; pnl: Pnl[]; prep: Prep[]; weather: Weather; turn: Turn[];
  } | null>(null);

  useEffect(() => {
    const query = `days=${days}${branch ? `&branch=${branch}` : ''}`;
    let cancelled = false;
    Promise.all([
      api<Summary>(`/staff/analytics/summary?${query}`),
      api<Trend>(`/staff/analytics/trend?days=${Math.max(days, 60)}${branch ? `&branch=${branch}` : ''}`),
      api<Item[]>(`/staff/analytics/items?${query}&by=revenue&direction=best`),
      api<Item[]>(`/staff/analytics/items?${query}&by=margin&direction=worst`),
      api<Weekday[]>(`/staff/analytics/weekdays?${query}`),
      api<Hour[]>(`/staff/analytics/hours?${query}`),
      api<Pnl[]>(`/staff/analytics/pnl?${query}`),
      api<Prep[]>(`/staff/analytics/prep?${query}`),
      api<Weather>(`/staff/analytics/weather?days=90${branch ? `&branch=${branch}` : ''}`),
      api<Turn[]>(`/staff/analytics/turn?${query}`),
    ])
      .then(([summary, trend, best, worst, weekdays, hours, pnl, prep, weather, turn]) => {
        if (!cancelled) {
          setData({ summary, trend, best, worst, weekdays, hours, pnl, prep, weather, turn });
          setError('');
        }
      })
      .catch((caught) => !cancelled && setError(caught instanceof Error ? caught.message : 'Could not load analytics'));
    return () => {
      cancelled = true;
    };
  }, [branch, days]);

  const trendRows = data ? [
    ...data.trend.series.slice(-45).map((point) => ({ day: shortDay(point.day), revenue: point.revenue, forecast: null as number | null })),
    ...data.trend.forecast.map((point) => ({ day: shortDay(point.day), revenue: null as number | null, forecast: point.value })),
  ] : [];
  const growth = data?.summary.revenueGrowthPct ?? null;

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <BranchPicker value={branch} onChange={setBranch} includeAll />
        <label className={ui.picker}><span>Window</span>
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </select>
        </label>
        <span className={`${ui.badge} ${ui.badgeWarn}`}>Synthetic demo history</span>
      </div>
      {error && <p className={ui.error}>{error}</p>}
      {!data && !error && <div className={ui.loading}>Loading analytics…</div>}
      {data && <>
        <section className={ui.kpis}>
          <div className={ui.kpi}><span>Revenue</span><strong>{formatBdt(data.summary.revenue)}</strong>
            <small className={growth === null ? '' : growth >= 0 ? ui.up : ui.down}>{growth === null ? 'no previous window' : `${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth)}% vs previous ${days} days`}</small></div>
          <div className={ui.kpi}><span>Orders · covers</span><strong>{data.summary.orders.toLocaleString()} · {data.summary.covers.toLocaleString()}</strong><small>guests served</small></div>
          <div className={ui.kpi}><span>Revenue per customer</span><strong>{formatBdt(data.summary.revenuePerCover)}</strong><small>average order {formatBdt(data.summary.averageOrderValue)}</small></div>
          <div className={ui.kpi}><span>Net result</span><strong className={data.pnl.reduce((s, p) => s + p.netProfit, 0) >= 0 ? ui.up : ui.down}>{formatBdt(data.pnl.reduce((s, p) => s + p.netProfit, 0))}</strong><small>after ingredients and overheads</small></div>
        </section>

        <section className={ui.card} style={{ marginBottom: 12 }}>
          <div className={ui.cardHead}><div><small>TREND</small><h2>Daily revenue and 7-day forecast</h2></div><span className={ui.muted}>{data.trend.anomalies.length} unusual day(s) flagged</span></div>
          <div className={`${ui.cardBody} ${ui.chartTall}`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendRows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#eef0e8" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#8d958b' }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: '#8d958b' }} width={44} />
                <Tooltip formatter={(value) => formatBdt(Number(value))} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke={INK} strokeWidth={2} dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="forecast" name="Forecast" stroke={ACCENT} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className={ui.cardBody}><p className={ui.muted}>{data.trend.method}</p></div>
        </section>

        <div className={ui.grid2} style={{ marginBottom: 12 }}>
          <section className={ui.card}>
            <div className={ui.cardHead}><div><small>MENU</small><h2>Best sellers by revenue</h2></div></div>
            <div className={`${ui.cardBody} ${ui.chart}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.best} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 10, fill: '#8d958b' }} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10, fill: '#3d4a41' }} />
                  <Tooltip formatter={(value) => formatBdt(Number(value))} />
                  <Bar dataKey="revenue" name="Revenue" fill={INK} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className={ui.card}>
            <div className={ui.cardHead}><div><small>MENU</small><h2>Weakest items by gross margin</h2></div></div>
            <div className={ui.cardBody}>
              <table className={ui.table}>
                <thead><tr><th>Item</th><th className={ui.num}>Sold</th><th className={ui.num}>Revenue</th><th className={ui.num}>Margin</th><th className={ui.num}>Margin %</th></tr></thead>
                <tbody>{data.worst.map((item) => (
                  <tr key={item.name}><td>{item.name}</td><td className={ui.num}>{item.quantity}</td><td className={ui.num}>{formatBdt(item.revenue)}</td><td className={ui.num}>{formatBdt(item.grossMargin)}</td><td className={ui.num}>{item.marginPct}%</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        </div>

        <div className={ui.grid2} style={{ marginBottom: 12 }}>
          <section className={ui.card}>
            <div className={ui.cardHead}><div><small>DEMAND</small><h2>Average revenue by weekday</h2></div></div>
            <div className={`${ui.cardBody} ${ui.chart}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weekdays} margin={{ right: 8 }}>
                  <CartesianGrid stroke="#eef0e8" vertical={false} />
                  <XAxis dataKey="weekday" tickFormatter={(value: string) => value.slice(0, 3)} tick={{ fontSize: 10, fill: '#8d958b' }} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: '#8d958b' }} width={44} />
                  <Tooltip formatter={(value) => formatBdt(Number(value))} />
                  <Bar dataKey="avgRevenue" name="Avg revenue" radius={[4, 4, 0, 0]} fill={ACCENT} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className={ui.card}>
            <div className={ui.cardHead}><div><small>DEMAND</small><h2>Orders by hour (Dhaka)</h2></div></div>
            <div className={`${ui.cardBody} ${ui.chart}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.hours} margin={{ right: 8 }}>
                  <CartesianGrid stroke="#eef0e8" vertical={false} />
                  <XAxis dataKey="hour" tickFormatter={(hour: number) => `${hour}:00`} tick={{ fontSize: 10, fill: '#8d958b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#8d958b' }} width={36} />
                  <Tooltip />
                  <Bar dataKey="orders" name="Orders" radius={[4, 4, 0, 0]} fill={MUTED} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        <div className={ui.grid2} style={{ marginBottom: 12 }}>
          <section className={ui.card}>
            <div className={ui.cardHead}><div><small>FINANCE</small><h2>Profit and loss by branch</h2></div></div>
            <div className={ui.cardBody}>
              <table className={ui.table}>
                <thead><tr><th>Branch</th><th className={ui.num}>Revenue</th><th className={ui.num}>Ingredients</th><th className={ui.num}>Overheads</th><th className={ui.num}>Net</th></tr></thead>
                <tbody>{data.pnl.map((row) => (
                  <tr key={row.branch}><td>{row.branch.replace('Dhaka Table House · ', '')}</td><td className={ui.num}>{formatBdt(row.revenue)}</td><td className={ui.num}>{formatBdt(row.cogs)}</td><td className={ui.num}>{formatBdt(row.overheads)}</td>
                    <td className={`${ui.num} ${row.status === 'profit' ? ui.up : ui.down}`}>{formatBdt(row.netProfit)}{row.netMarginPct !== null ? ` (${row.netMarginPct}%)` : ''}</td></tr>
                ))}</tbody>
              </table>
              <table className={ui.table} style={{ marginTop: 10 }}>
                <thead><tr><th>Branch</th><th className={ui.num}>Avg table turn</th><th className={ui.num}>Revenue per customer</th></tr></thead>
                <tbody>{data.turn.map((row) => (
                  <tr key={row.branch}><td>{row.branch.replace('Dhaka Table House · ', '')}</td><td className={ui.num}>{row.avgTurnMinutes} min</td><td className={ui.num}>{formatBdt(row.revenuePerCover)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>
          <section className={ui.card}>
            <div className={ui.cardHead}><div><small>KITCHEN</small><h2>Slowest dishes to prepare</h2></div></div>
            <div className={ui.cardBody}>
              <table className={ui.table}>
                <thead><tr><th>Dish</th><th className={ui.num}>Avg</th><th className={ui.num}>90th pct</th><th className={ui.num}>Target</th></tr></thead>
                <tbody>{data.prep.slice(0, 8).map((row) => (
                  <tr key={row.item}><td>{row.item}</td><td className={ui.num}>{row.avgPrepMinutes} min</td>
                    <td className={`${ui.num} ${row.p90PrepMinutes > row.targetMinutes * 1.5 ? ui.down : ''}`}>{row.p90PrepMinutes} min</td><td className={ui.num}>{row.targetMinutes} min</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        </div>

        <section className={ui.card}>
          <div className={ui.cardHead}><div><small>EXTERNAL FACTORS</small><h2>Rain vs covers (90 days)</h2></div></div>
          <div className={`${ui.cardBody} ${ui.grid3}`}>
            <div className={ui.kpi}><span>Correlation</span><strong>{data.weather.correlationRainVsCovers ?? '—'}</strong><small>rainfall vs daily covers, branch and weekday adjusted</small></div>
            <div className={ui.kpi}><span>Guests on rainy days</span><strong className={(data.weather.rainyDayCoverChangePct ?? 0) < 0 ? ui.down : ui.up}>{data.weather.rainyDayCoverChangePct === null ? '—' : `${data.weather.rainyDayCoverChangePct > 0 ? '+' : ''}${data.weather.rainyDayCoverChangePct}%`}</strong><small>vs the same branch and weekday ({data.weather.rainyDays} rainy days)</small></div>
            <div className={ui.kpi}><span>Sells more in rain</span><strong style={{ fontSize: 16 }}>{data.weather.itemsThatSellMoreWhenRaining[0]?.item ?? '—'}</strong>
              <small>{data.weather.itemsThatSellMoreWhenRaining[0] ? `${data.weather.itemsThatSellMoreWhenRaining[0].rainyDaySharePct}% of items on rainy days vs ${data.weather.itemsThatSellMoreWhenRaining[0].dryDaySharePct}% dry` : ''}</small></div>
          </div>
          {data.weather.caveat && <div className={ui.cardBody}><p className={ui.muted}>{data.weather.caveat}</p></div>}
        </section>
      </>}
    </>
  );
}

export default function AnalyticsPage() {
  return (
    <PageShell active="analytics" title="Analytics" kicker="SALES, MENU, KITCHEN AND DEMAND">
      {() => <AnalyticsView />}
    </PageShell>
  );
}
