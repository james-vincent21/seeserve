'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ui from '@/features/shell/platform.module.css';
import { api } from '@/shared/api/hub';

function Verify() {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use: guard against React strict-mode double effects.
    if (started.current) return;
    started.current = true;
    if (!token) {
      setError('This link is missing its token.');
      return;
    }
    api('/auth/verify', { method: 'POST', json: { token } })
      .then(() => router.replace('/ops'))
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Sign-in failed'));
  }, [router, token]);

  return error
    ? <div className={ui.error}>{error} <Link href="/login">Request a new link</Link></div>
    : <div className={ui.notice}>Signing you in…</div>;
}

export default function VerifyPage() {
  return (
    <main style={{ display: 'grid', minHeight: '100vh', placeItems: 'center', padding: 16, background: '#f5f5f0' }}>
      <div style={{ width: 'min(420px, 100%)' }}>
        <Suspense fallback={<div className={ui.notice}>Signing you in…</div>}><Verify /></Suspense>
      </div>
    </main>
  );
}
