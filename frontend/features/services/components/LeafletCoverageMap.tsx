'use client';

import { useEffect, useRef, useState } from 'react';
import type { ServiceAreaMapProps } from '@/features/services/components/ServiceAreaMap';

/** Public service-area markers, not live technician positions. No automatic geolocation. */
export function LeafletCoverageMap({
  technicians,
  customerLocation,
  apiKey,
}: ServiceAreaMapProps & { apiKey: string }) {
  const element = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let disposed = false;
    let map: import('leaflet').Map | null = null;
    setStatus('loading');
    void import('leaflet')
      .then((L) => {
        if (disposed || !element.current) return;
        const points: [number, number][] = [];
        if (customerLocation) points.push([customerLocation.latitude, customerLocation.longitude]);
        for (const item of technicians) {
          if (item.latitude !== null && item.longitude !== null)
            points.push([item.latitude, item.longitude]);
        }
        if (points.length === 0) {
          setStatus('error');
          return;
        }
        map = L.map(element.current, { scrollWheelZoom: false });
        const tiles = L.tileLayer(
          `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${encodeURIComponent(apiKey)}`,
          {
            maxZoom: 18,
            attribution:
              '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
          },
        );
        tiles.on('tileerror', () => {
          if (!disposed) setStatus('error');
        });
        tiles.on('load', () => {
          if (!disposed) setStatus((current) => (current === 'error' ? current : 'ready'));
        });
        tiles.addTo(map);
        if (customerLocation) {
          L.circleMarker([customerLocation.latitude, customerLocation.longitude], {
            radius: 9,
            color: '#101827',
            fillColor: '#ffffff',
            fillOpacity: 1,
          })
            .bindTooltip('Your selected search location')
            .addTo(map);
        }
        for (const item of technicians) {
          if (item.latitude === null || item.longitude === null) continue;
          // DOM textContent avoids interpreting technician-provided text as HTML.
          const tooltip = document.createElement('span');
          tooltip.textContent = `${item.display_name} · approximate service-area center`;
          L.circleMarker([item.latitude, item.longitude], {
            radius: 8,
            color: '#101827',
            fillColor: '#b8e986',
            fillOpacity: 1,
          })
            .bindTooltip(tooltip)
            .addTo(map);
        }
        if (points.length === 1) map.setView(points[0], 12);
        else map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 13 });
      })
      .catch(() => {
        if (!disposed) setStatus('error');
      });
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [technicians, customerLocation, apiKey]);

  return (
    <div>
      {status === 'loading' && (
        <p role="status" className="mb-2 text-sm">
          Loading interactive map…
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="mb-2 text-sm">
          Map tiles could not be loaded. Use the list view; check the provider key and domain
          restrictions.
        </p>
      )}
      <div
        ref={element}
        aria-label="Interactive service-area map"
        className="z-0 h-[320px] w-full rounded-2xl border border-midnight/10 sm:h-[420px]"
      />
      <p className="mt-2 text-xs text-midnight/60">
        Map markers are approximate service-area centers, not technician locations. Availability is
        not verified.
      </p>
    </div>
  );
}
