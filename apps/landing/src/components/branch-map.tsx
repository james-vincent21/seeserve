'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import type { Branch } from '@/lib/hub';

/** OpenStreetMap tiles via Leaflet: no API key, no tracking account. */
export function BranchMap({ branches }: { branches: Branch[] }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current || branches.length === 0) return;
    let map: import('leaflet').Map | undefined;
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !container.current) return;
      map = L.map(container.current, { scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      const points = branches.map((branch) => {
        L.circleMarker([branch.lat, branch.lng], { radius: 10, color: '#17221e', fillColor: '#e3a13b', fillOpacity: 0.95, weight: 2 })
          .addTo(map!)
          .bindPopup(`<strong>${branch.name}</strong><br/>${branch.address}<br/>${branch.phone ?? ''}`);
        return [branch.lat, branch.lng] as [number, number];
      });
      map.fitBounds(points, { padding: [40, 40] });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [branches]);

  return <div ref={container} className="map" role="region" aria-label="Map of our branches" />;
}
