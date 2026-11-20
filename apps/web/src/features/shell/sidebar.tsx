'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from '@/features/dashboard/dashboard.module.css';
import { Icon, type IconName } from '@/shared/ui/icon';

export type NavKey = 'overview' | 'ops' | 'analytics' | 'assistant' | 'docs';

const businessNav: Array<{ key: NavKey; href: string; label: string; icon: IconName }> = [
  { key: 'ops', href: '/ops', label: 'Queue & bookings', icon: 'users' },
  { key: 'analytics', href: '/analytics', label: 'Analytics', icon: 'chart' },
  { key: 'assistant', href: '/assistant', label: 'Owner assistant', icon: 'chat' },
  { key: 'docs', href: '/docs', label: 'Docs', icon: 'book' },
];

/** Shared sidebar. The CCTV overview passes its in-page section links as `children`. */
export function Sidebar({ active, children, footer }: { active: NavKey; children?: ReactNode; footer?: ReactNode }) {
  return (
    <aside className={styles.sidebar}>
      <Link className={styles.brand} href="/" aria-label="SeeServe home">
        <span className={styles.brandMark}><span /><span /><span /><span /></span>
        <span className={styles.brandText}>see<span>serve</span><small>FLOOR INTELLIGENCE</small></span>
      </Link>

      <div className={styles.sideLabel}>LIVE FLOOR</div>
      <nav className={styles.navigation} aria-label="Live floor">
        <Link className={`${styles.navItem} ${active === 'overview' ? styles.navActive : ''}`} href="/"><Icon name="grid" /><span>CCTV overview</span>{active === 'overview' && <i />}</Link>
        {children}
      </nav>

      <div className={styles.sideLabel} style={{ marginTop: 22 }}>BUSINESS</div>
      <nav className={styles.navigation} aria-label="Business">
        {businessNav.map((item) => (
          <Link key={item.key} className={`${styles.navItem} ${active === item.key ? styles.navActive : ''}`} href={item.href}>
            <Icon name={item.icon} /><span>{item.label}</span>{active === item.key && <i />}
          </Link>
        ))}
      </nav>

      <div className={styles.sidebarBottom}>
        <div className={styles.privacyCard}>
          <div className={styles.privacyIcon}><Icon name="shield" /></div>
          <strong>Privacy mode</strong>
          <p>Camera frames are analysed in memory and never stored. Guest emails are used only for tickets.</p>
          <span><i /> ACTIVE</span>
        </div>
        {footer}
      </div>
    </aside>
  );
}
