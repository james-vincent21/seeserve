'use client';

import { useEffect, useMemo, useState } from 'react';
import { bdt, hub, type MenuItem } from '@/lib/hub';

export default function MenuPage() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    hub<MenuItem[]>('/menu').then(setMenu).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load the menu'));
  }, []);

  const categories = useMemo(() => {
    const visible = menu.filter((item) => !filter || item.tags.includes(filter));
    return [...new Set(visible.map((item) => item.category))].map((category) => ({ category, items: visible.filter((item) => item.category === category) }));
  }, [menu, filter]);

  return (
    <main className="section">
      <div className="wrap">
        <div className="eyebrow">Menu</div>
        <h1 style={{ fontSize: 'clamp(36px, 5vw, 56px)', margin: '8px 0' }}>What we&apos;re cooking</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['', 'vegetarian', 'signature', 'iftar', 'rainy-day'].map((tag) => (
            <button key={tag || 'all'} className={`button ${filter === tag ? '' : 'secondary'}`} onClick={() => setFilter(tag)}>{tag || 'All dishes'}</button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        {categories.map(({ category, items }) => (
          <section key={category} className="menu-category">
            <h2>{category}</h2>
            {items.map((item) => (
              <div key={item.id} className="menu-row">
                <div><strong>{item.name}</strong><p>{item.description}</p></div>
                <div className="price">{bdt(item.price)}</div>
              </div>
            ))}
          </section>
        ))}
        <p style={{ color: 'var(--muted)', marginTop: 24 }}>All meat is halal. Ask staff about nuts and allergens.</p>
      </div>
    </main>
  );
}
