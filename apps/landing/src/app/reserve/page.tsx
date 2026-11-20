'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { hub, shortBranch, type Branch, type PublicReservation, type QueueTicket } from '@/lib/hub';

const dhakaToday = () => new Date(Date.now() + 6 * 3_600_000).toISOString().slice(0, 10);

function ReserveForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<'booking' | 'queue'>(params.get('mode') === 'queue' ? 'queue' : 'booking');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState({
    branchId: params.get('branch') ?? 'gulshan', guestName: '', guestEmail: '', partySize: 2, date: dhakaToday(), time: '20:00', notes: '', consent: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<{ reservation: PublicReservation; emailSent: boolean } | null>(null);
  const [ticket, setTicket] = useState<{ ticket: QueueTicket; emailSent: boolean } | null>(null);

  useEffect(() => {
    hub<Branch[]>('/branches').then(setBranches).catch(() => undefined);
  }, []);

  const update = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'booking') {
        setBooking(await hub('/reservations', {
          method: 'POST',
          json: {
            branchId: form.branchId, guestName: form.guestName, guestEmail: form.guestEmail, partySize: form.partySize,
            reservedFor: `${form.date}T${form.time}:00+06:00`, notes: form.notes || undefined, consent: form.consent,
          },
        }));
      } else {
        setTicket(await hub('/queue', {
          method: 'POST',
          json: { branchId: form.branchId, guestName: form.guestName, partySize: form.partySize, guestEmail: form.guestEmail || undefined },
        }));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (booking) {
    return (
      <div className="ticket">
        <div className="eyebrow">Table booked</div>
        <p className="code">{booking.reservation.code}</p>
        <p>{booking.reservation.guestName}, party of {booking.reservation.partySize} at {shortBranch(booking.reservation.branchName)} on {booking.reservation.reservedForLocal}.</p>
        <p>{booking.emailSent ? 'We emailed your ticket.' : 'Keep this ticket number — email confirmation is not enabled on this demo server.'}</p>
        <Link className="button" href={`/ticket/${booking.reservation.code}`}>View or cancel</Link>
      </div>
    );
  }
  if (ticket) {
    return (
      <div className="ticket">
        <div className="eyebrow">You&apos;re in the queue</div>
        <p className="code">{ticket.ticket.code}</p>
        <p>Number {ticket.ticket.position} in line at {shortBranch(ticket.ticket.branchName)}. Estimated wait: {ticket.ticket.estimatedWaitMinutes ?? '?'} minutes.</p>
        <Link className="button" href={`/ticket/${ticket.ticket.code}`}>Track my place</Link>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className={`button ${mode === 'booking' ? '' : 'secondary'}`} onClick={() => setMode('booking')}>Book ahead</button>
        <button type="button" className={`button ${mode === 'queue' ? '' : 'secondary'}`} onClick={() => setMode('queue')}>Join today&apos;s queue</button>
      </div>
      <label>Branch
        <select value={form.branchId} onChange={(event) => update({ branchId: event.target.value })}>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{shortBranch(branch.name)}</option>)}
        </select>
      </label>
      <div className="row">
        <label>Your name<input required minLength={2} maxLength={80} value={form.guestName} onChange={(event) => update({ guestName: event.target.value })} /></label>
        <label>Guests<input required type="number" min={1} max={20} value={form.partySize} onChange={(event) => update({ partySize: Number(event.target.value) })} /></label>
      </div>
      <label>Email {mode === 'queue' && <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional — we&apos;ll email your ticket)</span>}
        <input type="email" required={mode === 'booking'} value={form.guestEmail} onChange={(event) => update({ guestEmail: event.target.value })} />
      </label>
      {mode === 'booking' && <>
        <div className="row">
          <label>Date<input required type="date" min={dhakaToday()} value={form.date} onChange={(event) => update({ date: event.target.value })} /></label>
          <label>Time (Dhaka)<input required type="time" min="12:00" max="22:00" step={900} value={form.time} onChange={(event) => update({ time: event.target.value })} /></label>
        </div>
        <label>Notes<textarea maxLength={200} rows={2} value={form.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="Birthday, high chair…" /></label>
        <label className="check"><input type="checkbox" required checked={form.consent} onChange={(event) => update({ consent: event.target.checked })} />
          I agree that my name and email are used to manage this booking and send my ticket. They are not used for marketing.</label>
      </>}
      {error && <p className="error">{error}</p>}
      <button className="button" disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'booking' ? 'Book my table' : 'Get a queue ticket'}</button>
    </form>
  );
}

export default function ReservePage() {
  return (
    <main className="section">
      <div className="wrap">
        <div className="eyebrow">Reservations</div>
        <h1 style={{ fontSize: 'clamp(36px, 5vw, 56px)', margin: '8px 0 20px' }}>Save your seat</h1>
        <Suspense fallback={null}><ReserveForm /></Suspense>
      </div>
    </main>
  );
}
