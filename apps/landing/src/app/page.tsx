'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BranchMap } from '@/components/branch-map';
import { bdt, hub, shortBranch, type Branch, type MenuItem } from '@/lib/hub';

export default function Home() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [signature, setSignature] = useState<MenuItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([hub<Branch[]>('/branches'), hub<MenuItem[]>('/menu')])
      .then(([nextBranches, menu]) => {
        setBranches(nextBranches);
        const picks = ['kacchi', 'beef-rezala', 'chicken-tikka', 'hilsa', 'mishti-doi', 'borhani'];
        setSignature(picks.map((id) => menu.find((item) => item.id === id)).filter((item): item is MenuItem => Boolean(item)));
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load the menu'));
  }, []);

  return (
    <main>
      <section className="section">
        <div className="wrap hero">
          <div>
            <div className="eyebrow">Gulshan · Dhanmondi · Uttara</div>
            <h1>Slow-cooked kacchi, <em>served</em> without the wait.</h1>
            <p>
              Bengali classics, charcoal grills and Iftar platters in three Dhaka branches. Book a table in seconds, join the
              queue from your phone, and get your ticket by email.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/reserve">Book a table</Link>
              <Link className="button secondary" href="/reserve?mode=queue">Join today&apos;s queue</Link>
              <Link className="button secondary" href="/menu">See the menu</Link>
            </div>
          </div>
          <aside className="hero-card">
            <h3>Why guests come back</h3>
            <ul>
              <li>Our team sees which tables need attention, so nobody waits unnoticed</li>
              <li>Live queue position and wait time on your ticket</li>
              <li>Iftar service paced around Maghrib during Ramadan</li>
              <li>Open daily 12:00–23:00</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--paper)' }}>
        <div className="wrap">
          <div className="eyebrow">From the kitchen</div>
          <h2>Signature dishes</h2>
          {error && <p className="error">{error}</p>}
          <div className="cards">
            {signature.map((item) => (
              <article key={item.id} className="card">
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <p className="price" style={{ marginTop: 10 }}>{bdt(item.price)}</p>
                {item.tags.length > 0 && <div className="tags">{item.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}</div>}
              </article>
            ))}
          </div>
          <p style={{ marginTop: 20 }}><Link href="/menu">Full menu →</Link></p>
        </div>
      </section>

      <section className="section" id="branches">
        <div className="wrap">
          <div className="eyebrow">Find us</div>
          <h2>Three branches across Dhaka</h2>
          <BranchMap branches={branches} />
          <div className="branch-list">
            {branches.map((branch) => (
              <article key={branch.id} className="card">
                <h3>{shortBranch(branch.name)}</h3>
                <p>{branch.address}</p>
                <p>{branch.phone} · {branch.openingHours.daily}</p>
                <p style={{ marginTop: 10 }}><Link href={`/reserve?branch=${branch.id}`}>Book at {shortBranch(branch.name)} →</Link></p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
