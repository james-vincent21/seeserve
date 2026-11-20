'use client';

import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { hub, shortBranch, type PublicReservation, type QueueTicket } from '@/lib/hub';

export default function TicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = decodeURIComponent(rawCode).toUpperCase();
  const isQueue = code.startsWith('Q-');
  const [reservation, setReservation] = useState<PublicReservation | null>(null);
  const [ticket, setTicket] = useState<QueueTicket | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      if (isQueue) setTicket(await hub<QueueTicket>(`/queue/${encodeURIComponent(code)}`));
      else setReservation(await hub<PublicReservation>(`/reservations/${encodeURIComponent(code)}`));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Ticket not found');
    }
  }, [code, isQueue]);

  useEffect(() => {
    void load();
    if (!isQueue) return;
    const timer = window.setInterval(() => void load(), 30_000); // queue position refreshes itself
    return () => window.clearInterval(timer);
  }, [isQueue, load]);

  const cancel = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setReservation(await hub<PublicReservation>(`/reservations/${encodeURIComponent(code)}/cancel`, { method: 'POST', json: { email } }));
      setMessage('Your reservation has been cancelled.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not cancel');
    }
  };

  return (
    <main className="section">
      <div className="wrap" style={{ maxWidth: 640 }}>
        <div className="eyebrow">{isQueue ? 'Queue ticket' : 'Reservation'}</div>
        {error && <p className="error">{error} <Link href="/ticket">Try another number</Link></p>}
        {ticket && (
          <div className="ticket">
            <p className="code">{ticket.code}</p>
            <p>{ticket.guestName}, party of {ticket.partySize} · {shortBranch(ticket.branchName)}</p>
            {ticket.status === 'waiting'
              ? <p><strong>Number {ticket.position} in line</strong> ({ticket.partiesAhead} ahead of you). Estimated wait: <strong>{ticket.estimatedWaitMinutes ?? '?'} min</strong>.</p>
              : <p>Status: <strong>{ticket.status}</strong>.</p>}
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Estimate based on {ticket.estimateSource === 'measured' ? 'how long tables have actually been taking this month' : 'typical table times'}. Updates every 30 seconds.</p>
          </div>
        )}
        {reservation && (
          <div className="ticket">
            <p className="code">{reservation.code}</p>
            <p>{reservation.guestName}, party of {reservation.partySize}</p>
            <p>{shortBranch(reservation.branchName)} · {reservation.reservedForLocal}</p>
            <p>Status: <strong>{reservation.status}</strong></p>
            {reservation.status === 'booked' && (
              <form className="form" onSubmit={cancel} style={{ marginTop: 16, padding: 16 }}>
                <label>To cancel, enter the email you booked with<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                <button className="button secondary" type="submit">Cancel reservation</button>
              </form>
            )}
            {message && <p className="notice" style={{ marginTop: 12 }}>{message}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
