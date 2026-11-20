'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import dashboard from '@/features/dashboard/dashboard.module.css';
import ui from './platform.module.css';
import { Sidebar, type NavKey } from './sidebar';
import { api, ApiError, type StaffSession } from '@/shared/api/hub';
import { Icon } from '@/shared/ui/icon';

/**
 * Layout for the business pages. With `requireAuth`, unauthenticated visitors are sent to /login;
 * the API enforces the same rule server-side, so this guard is only for a smooth experience.
 */
export function PageShell({ active, title, kicker, actions, requireAuth = true, children }: {
  active: NavKey;
  title: string;
  kicker: string;
  actions?: ReactNode;
  requireAuth?: boolean;
  children: (session: StaffSession | null) => ReactNode;
}) {
  const router = useRouter();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [state, setState] = useState<'checking' | 'ready'>(requireAuth ? 'checking' : 'ready');

  useEffect(() => {
    let cancelled = false;
    api<StaffSession>('/auth/me')
      .then((me) => {
        if (cancelled) return;
        setSession(me);
        setState('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        if (requireAuth && error instanceof ApiError && error.status === 401) router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        else setState('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [requireAuth, router]);

  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
  };

  return (
    <div className={dashboard.appShell}>
      <Sidebar
        active={active}
        footer={session && (
          <div className={dashboard.profile}>
            <div className={dashboard.avatar}>{session.email.slice(0, 1).toUpperCase()}</div>
            <div><strong>{session.email}</strong><small>{session.role}</small></div>
            <button className={dashboard.iconButton} aria-label="Sign out" title="Sign out" onClick={() => void signOut()}><Icon name="logout" /></button>
          </div>
        )}
      />
      <main className={dashboard.main}>
        <header className={dashboard.topbar}>
          <div className={dashboard.breadcrumb}>BUSINESS <span>/</span> <strong>{title.toUpperCase()}</strong></div>
          <div className={dashboard.topActions}>{actions}</div>
        </header>
        <div className={dashboard.content}>
          <section className={ui.pageHead}>
            <div className={dashboard.kicker}><span /> {kicker}</div>
            <h1>{title}</h1>
          </section>
          {state === 'checking' ? <div className={ui.loading}>Checking your session…</div> : children(session)}
        </div>
      </main>
    </div>
  );
}

export function BranchPicker({ value, onChange, includeAll = false }: { value: string; onChange: (value: string) => void; includeAll?: boolean }) {
  return (
    <label className={ui.picker}>
      <span>Branch</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {includeAll && <option value="">All branches</option>}
        <option value="gulshan">Gulshan</option>
        <option value="dhanmondi">Dhanmondi</option>
        <option value="uttara">Uttara</option>
      </select>
    </label>
  );
}
