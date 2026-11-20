'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function TicketLookup() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim()) router.push(`/ticket/${encodeURIComponent(code.trim().toUpperCase())}`);
  };
  return (
    <main className="section">
      <div className="wrap">
        <div className="eyebrow">My ticket</div>
        <h1 style={{ fontSize: 'clamp(36px, 5vw, 56px)', margin: '8px 0 20px' }}>Check your booking or queue place</h1>
        <form className="form" onSubmit={submit}>
          <label>Ticket number<input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="R-7KX2QD or Q-PH3M9A" /></label>
          <button className="button" type="submit">Look it up</button>
        </form>
      </div>
    </main>
  );
}
