'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import ui from '@/features/shell/platform.module.css';
import { BranchPicker, PageShell } from '@/features/shell/page-shell';
import { api, dhakaTime, type FloorTable, type QueueBoard, type QueueEntry, type Reservation } from '@/shared/api/hub';

const statusClass: Record<string, string> = {
  waiting: ui.badgeWarn, booked: ui.badgeWarn, seated: ui.badgeOk, served: ui.badgeMuted, completed: ui.badgeMuted,
  left: ui.badgeMuted, cancelled: ui.badgeMuted, no_show: ui.badgeMuted,
};

function OpsBoard() {
  const [branch, setBranch] = useState('gulshan');
  const [board, setBoard] = useState<QueueBoard | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [floor, setFloor] = useState<FloorTable[]>([]);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [walkIn, setWalkIn] = useState({ guestName: '', partySize: 2 });
  const [seatChoice, setSeatChoice] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const [nextBoard, nextReservations, nextFloor] = await Promise.all([
        api<QueueBoard>(`/staff/queue?branch=${branch}`),
        api<Reservation[]>(`/staff/reservations?branch=${branch}`),
        api<FloorTable[]>(`/staff/floor?branch=${branch}`),
      ]);
      setBoard(nextBoard);
      setReservations(nextReservations);
      setFloor(nextFloor);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the queue');
    }
  }, [branch]);

  useEffect(() => {
    void refresh();
    // Live updates over SSE; a slow poll covers proxies that buffer event streams.
    const source = new EventSource('/api/backend/v1/staff/stream');
    source.addEventListener('ready', () => setLive(true));
    source.onerror = () => setLive(false);
    for (const type of ['queue.updated', 'reservation.created', 'reservation.updated', 'floor.updated']) {
      source.addEventListener(type, (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as { branchId: string };
        if (payload.branchId === branch) void refresh();
      });
    }
    const poll = window.setInterval(() => void refresh(), 30_000);
    return () => {
      source.close();
      window.clearInterval(poll);
    };
  }, [branch, refresh]);

  const act = async (path: string, json: unknown) => {
    try {
      await api(path, { method: 'POST', json });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Action failed');
    }
  };

  const addWalkIn = async (event: FormEvent) => {
    event.preventDefault();
    await act('/staff/queue', { branchId: branch, ...walkIn });
    setWalkIn({ guestName: '', partySize: 2 });
  };

  const freeTables = floor.filter((table) => !table.occupiedSince);
  const tableFor = (entry: QueueEntry) => seatChoice[entry.code] ?? freeTables.find((table) => table.capacity >= entry.partySize)?.id ?? '';
  const counts = board?.counts;
  const bookingCounts = reservations.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }), {});

  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <BranchPicker value={branch} onChange={setBranch} />
        <span className={`${ui.badge} ${live ? ui.badgeOk : ui.badgeMuted}`}>{live ? '● Live' : 'Polling'}</span>
        {board && <span className={ui.muted}>Wait estimates use {board.turnTimes.source === 'measured' ? `measured turn times (${board.turnTimes.samples} seatings, 30 days)` : 'default turn times (not enough history yet)'}.</span>}
      </div>
      {error && <p className={ui.error}>{error}</p>}

      <section className={ui.kpis}>
        <div className={ui.kpi}><span>Waiting now</span><strong>{counts?.waiting ?? '—'}</strong><small>walk-in parties</small></div>
        <div className={ui.kpi}><span>Serviced today</span><strong>{counts ? counts.seated + counts.served : '—'}</strong><small>{counts?.served ?? 0} finished · {counts?.left ?? 0} left the queue</small></div>
        <div className={ui.kpi}><span>Bookings today</span><strong>{reservations.length}</strong><small>{bookingCounts.booked ?? 0} upcoming · {bookingCounts.seated ?? 0} seated · {bookingCounts.no_show ?? 0} no-show</small></div>
        <div className={ui.kpi}><span>Tables occupied</span><strong>{floor.filter((t) => t.occupiedSince).length}/{floor.length}</strong><small>{freeTables.length} free now</small></div>
      </section>

      <div className={ui.grid2}>
        <section className={ui.card}>
          <div className={ui.cardHead}><div><small>WALK-IN QUEUE</small><h2>Today&apos;s queue</h2></div></div>
          <div className={ui.cardBody}>
            <form className={ui.formRow} onSubmit={addWalkIn} style={{ marginBottom: 10 }}>
              <label className={ui.field}>Guest name<input required minLength={2} value={walkIn.guestName} onChange={(e) => setWalkIn({ ...walkIn, guestName: e.target.value })} /></label>
              <label className={ui.field}>Party<input type="number" min={1} max={20} value={walkIn.partySize} onChange={(e) => setWalkIn({ ...walkIn, partySize: Number(e.target.value) })} /></label>
              <button className={`${ui.button} ${ui.primary}`} type="submit" style={{ alignSelf: 'end' }}>Add walk-in</button>
            </form>
            <table className={ui.table}>
              <thead><tr><th>#</th><th>Ticket</th><th>Guest</th><th className={ui.num}>Party</th><th className={ui.num}>Est. wait</th><th>Status</th><th /></tr></thead>
              <tbody>
                {(board?.tickets ?? []).filter((t) => t.status === 'waiting' || t.status === 'seated').map((entry) => (
                  <tr key={entry.code}>
                    <td>{entry.position ?? '—'}</td>
                    <td><code>{entry.code}</code></td>
                    <td>{entry.guestName}</td>
                    <td className={ui.num}>{entry.partySize}</td>
                    <td className={ui.num}>{entry.estimatedWaitMinutes === null ? '—' : `${entry.estimatedWaitMinutes} min`}</td>
                    <td><span className={`${ui.badge} ${statusClass[entry.status]}`}>{entry.status}{entry.tableId ? ` · ${entry.tableId}` : ''}</span></td>
                    <td>
                      <div className={ui.rowActions}>
                        {entry.status === 'waiting' && <>
                          <select aria-label="Table" value={tableFor(entry)} onChange={(e) => setSeatChoice({ ...seatChoice, [entry.code]: e.target.value })}>
                            <option value="">Table…</option>
                            {freeTables.map((table) => <option key={table.id} value={table.id}>{table.label} ({table.capacity})</option>)}
                          </select>
                          <button className={ui.button} disabled={!tableFor(entry)} onClick={() => void act(`/staff/queue/${entry.code}/seat`, { tableId: tableFor(entry) })}>Seat</button>
                          <button className={ui.button} onClick={() => void act(`/staff/queue/${entry.code}/status`, { status: 'left' })}>Left</button>
                        </>}
                        {entry.status === 'seated' && <button className={ui.button} onClick={() => void act(`/staff/queue/${entry.code}/status`, { status: 'served' })}>Served</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {board && board.tickets.filter((t) => t.status === 'waiting' || t.status === 'seated').length === 0 && <tr><td colSpan={7} className={ui.muted}>Nobody is waiting.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <div className={ui.grid}>
          <section className={ui.card}>
            <div className={ui.cardHead}><div><small>RESERVATIONS</small><h2>Today&apos;s bookings</h2></div></div>
            <div className={ui.cardBody}>
              <table className={ui.table}>
                <thead><tr><th>Time</th><th>Ticket</th><th>Guest</th><th className={ui.num}>Party</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {reservations.map((booking) => (
                    <tr key={booking.id}>
                      <td>{dhakaTime(booking.reservedFor)}</td>
                      <td><code>{booking.code}</code></td>
                      <td>{booking.guestName}</td>
                      <td className={ui.num}>{booking.partySize}</td>
                      <td><span className={`${ui.badge} ${statusClass[booking.status]}`}>{booking.status.replace('_', ' ')}</span></td>
                      <td>
                        {booking.status === 'booked' && <div className={ui.rowActions}>
                          <button className={ui.button} disabled={!freeTables.some((t) => t.capacity >= booking.partySize)}
                            onClick={() => void act(`/staff/reservations/${booking.id}/status`, { status: 'seated', tableId: freeTables.find((t) => t.capacity >= booking.partySize)?.id })}>Seat</button>
                          <button className={ui.button} onClick={() => void act(`/staff/reservations/${booking.id}/status`, { status: 'no_show' })}>No-show</button>
                        </div>}
                      </td>
                    </tr>
                  ))}
                  {reservations.length === 0 && <tr><td colSpan={6} className={ui.muted}>No bookings today.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className={ui.card}>
            <div className={ui.cardHead}><div><small>FLOOR</small><h2>Tables</h2></div></div>
            <div className={ui.cardBody}>
              <table className={ui.table}>
                <thead><tr><th>Table</th><th className={ui.num}>Seats</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {floor.map((table) => (
                    <tr key={table.id}>
                      <td>{table.label} <span className={ui.muted}>({table.id})</span></td>
                      <td className={ui.num}>{table.capacity}</td>
                      <td>{table.occupiedSince
                        ? <span className={`${ui.badge} ${ui.badgeOk}`}>seated since {dhakaTime(table.occupiedSince)}</span>
                        : <span className={`${ui.badge} ${ui.badgeMuted}`}>free</span>}</td>
                      <td><div className={ui.rowActions}>{table.occupiedSince && <button className={ui.button} onClick={() => void act(`/staff/tables/${table.id}/vacate`, {})}>Free table</button>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export default function OpsPage() {
  return (
    <PageShell active="ops" title="Queue & bookings" kicker="LIVE OPERATIONS">
      {() => <OpsBoard />}
    </PageShell>
  );
}
