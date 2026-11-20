'use client';

import { useEffect, useState } from 'react';
import { getTables, type TableView } from '@/shared/api/client';
import styles from './dashboard.module.css';

export function Dashboard() {
  const [tables, setTables] = useState<TableView[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getTables().then(setTables).catch(() => setError('API is unavailable. Start the Express API and PostgreSQL.'));
  }, []);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>RESTAURANT VISION · DEMO</p><h1>Floor dashboard</h1></div>
        <span className={styles.mode}>Recorded video · Standard mode</span>
      </header>
      <section className={styles.section}>
        <div className={styles.sectionTitle}><div><h2>Tables</h2><p>Live state from the demo pipeline</p></div><span>{tables.length} configured</span></div>
        {error ? <p className={styles.error}>{error}</p> : <div className={styles.grid}>
          {tables.map((table) => <article className={styles.card} key={table.id}>
            <div className={styles.cardTop}><h3>{table.label}</h3><span className={`${styles.dot} ${styles[table.status]}`} /></div>
            <p className={styles.status}>{table.status}</p><small>{table.seatedAt ? `Seated since ${table.seatedAt}` : 'No active seating'}</small>
          </article>)}
        </div>}
      </section>
      <section className={styles.events}><h2>Recent alerts</h2><p>Alerts will appear here when the video inference pipeline is connected.</p></section>
    </main>
  );
}
