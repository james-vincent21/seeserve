'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import ui from '@/features/shell/platform.module.css';
import { api } from '@/shared/api/hub';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<{ message: string }>('/auth/request-link', { method: 'POST', json: { email } });
      setMessage(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send the link');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ display: 'grid', minHeight: '100vh', placeItems: 'center', padding: 16, background: '#f5f5f0' }}>
      <div className={ui.card} style={{ width: 'min(420px, 100%)' }}>
        <div className={ui.cardHead}>
          <div><small>SEESERVE DASHBOARD</small><h2>Sign in with your admin email</h2></div>
        </div>
        <form className={`${ui.cardBody} ${ui.form}`} onSubmit={submit}>
          <label className={ui.field}>
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@restaurant.com" />
          </label>
          <button className={`${ui.button} ${ui.primary}`} disabled={busy} type="submit">{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
          {message && <p className={ui.notice}>{message} The link works once and expires in 15 minutes.</p>}
          {error && <p className={ui.error}>{error}</p>}
          <p className={ui.muted}>
            No password is stored. Admin addresses are set by the owner (ADMIN_EMAILS). In local development without an
            email service, the link is printed in the API console. <Link href="/">Back to the floor view</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
