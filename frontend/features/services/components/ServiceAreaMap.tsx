'use client';

import Link from 'next/link';
import { useState, type ComponentType } from 'react';

import { LeafletCoverageMap } from '@/features/services/components/LeafletCoverageMap';

import type { NearbyTechnician } from '@/lib/api/technician-discovery';

export type ServiceAreaMapProps = {
  technicians: NearbyTechnician[];
  customerLocation?: { latitude: number; longitude: number } | null;
};

/** Adapter contract for replacing the local schematic with a configured map SDK. */
export type ServiceAreaMapProvider = {
  id: string;
  attribution: string;
  MapView: ComponentType<ServiceAreaMapProps>;
};

function getPosition(technician: NearbyTechnician, index: number, points: NearbyTechnician[]) {
  const located = points.filter((item) => item.latitude !== null && item.longitude !== null);
  const latitudes = located.map((item) => item.latitude!);
  const longitudes = located.map((item) => item.longitude!);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeSpan = Math.max(maxLatitude - minLatitude, 0.03);
  const longitudeSpan = Math.max(maxLongitude - minLongitude, 0.03);
  const x = 12 + ((technician.longitude! - minLongitude) / longitudeSpan) * 76;
  const y = 88 - ((technician.latitude! - minLatitude) / latitudeSpan) * 76;
  // Keep stacked points keyboard/click reachable; this is schematic spacing, not a real location.
  const samePointIndex = located
    .slice(0, located.indexOf(technician))
    .filter(
      (item) => item.latitude === technician.latitude && item.longitude === technician.longitude,
    ).length;
  const offset =
    samePointIndex === 0 ? 0 : (samePointIndex % 2 ? 1 : -1) * Math.ceil(samePointIndex / 2) * 3;
  return { left: `${Math.max(6, Math.min(94, x + offset))}%`, top: `${y}%`, index };
}

function SchematicCoverageMap({ technicians }: ServiceAreaMapProps) {
  const located = technicians.filter(
    (technician) => technician.latitude !== null && technician.longitude !== null,
  );

  if (located.length === 0) {
    return (
      <div
        className="grid min-h-[280px] place-items-center rounded-2xl border border-dashed border-midnight/20 bg-[#f8faf7] p-6 text-center sm:min-h-[340px]"
        aria-label="Schematic service-area map without configured markers"
      >
        <div className="max-w-sm">
          <p className="text-sm font-semibold text-midnight">
            No approximate map markers available
          </p>
          <p className="mt-2 text-sm leading-6 text-midnight/60">
            This result set has no technician-entered service-area center coordinates. List results
            remain available; no location is estimated.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        role="img"
        aria-label="Schematic map preview showing approximate technician service-area centers, not a live street map"
        className="relative min-h-[280px] overflow-hidden rounded-2xl border border-midnight/10 bg-[radial-gradient(ellipse_at_50%_50%,rgba(204,235,143,0.32),transparent_60%),linear-gradient(135deg,#f7faf4,#e9f0e8)] sm:min-h-[340px]"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(16,24,39,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(16,24,39,0.06)_1px,transparent_1px)] [background-size:34px_34px]"
        />
        <div
          aria-hidden="true"
          className="absolute left-[17%] top-[31%] h-2/5 w-1/4 rotate-12 rounded-[40%] border border-midnight/10 bg-white/35"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-[17%] right-[15%] h-1/4 w-2/5 -rotate-6 rounded-[45%] border border-midnight/10 bg-lime/10"
        />
        {located.map((technician, index) => {
          const position = getPosition(technician, index, located);
          return (
            <Link
              key={technician.user_id}
              href={`/technicians/${encodeURIComponent(technician.user_id)}/services/${encodeURIComponent(technician.service_slug)}`}
              aria-label={`Open ${technician.display_name}'s ${technician.service_title} service profile`}
              title={`${technician.display_name} · approximate service-area center`}
              style={{ left: position.left, top: position.top }}
              className="absolute z-10 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-midnight text-xs font-bold text-lime shadow-lg ring-1 ring-midnight/15 transition hover:scale-110 focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
            >
              {index + 1}
            </Link>
          );
        })}
        <span className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-2.5 py-1.5 text-[0.65rem] font-semibold text-midnight/65 shadow-sm">
          Schematic · not to scale
        </span>
        <span className="absolute bottom-3 right-3 rounded-lg bg-white/90 px-2.5 py-1.5 text-[0.65rem] font-semibold text-midnight/65 shadow-sm">
          No live map tiles
        </span>
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {located.map((technician, index) => (
          <li key={technician.user_id}>
            <Link
              href={`/technicians/${encodeURIComponent(technician.user_id)}/services/${encodeURIComponent(technician.service_slug)}`}
              className="flex min-h-12 items-center gap-3 rounded-xl border border-midnight/10 bg-white px-3 py-2 text-sm hover:border-midnight/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-midnight text-xs font-bold text-lime">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-midnight">
                  {technician.display_name}
                </span>
                <span className="block truncate text-xs text-midnight/55">
                  Approximate coverage · {technician.coverage_area}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const schematicServiceAreaMapProvider: ServiceAreaMapProvider = {
  id: 'schematic',
  attribution: 'Schematic service-area preview · no map provider or street data configured',
  MapView: SchematicCoverageMap,
};

export function ServiceAreaMap({
  technicians,
  customerLocation,
  provider = schematicServiceAreaMapProvider,
}: ServiceAreaMapProps & { provider?: ServiceAreaMapProvider }) {
  const [consented, setConsented] = useState(false);
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';
  const mapConfigured = /^[A-Za-z0-9_-]{1,128}$/.test(key);
  const ProviderMap = provider.MapView;
  return (
    <div data-map-provider={consented && mapConfigured ? 'maptiler' : provider.id}>
      {mapConfigured && !consented && (
        <div className="mb-3 rounded-xl border border-midnight/10 bg-white p-4 text-sm">
          <p>
            Interactive tiles are provided by MapTiler. Loading them shares your IP address and
            approximate map viewport with the provider. Your exact coordinates are not sent as a
            form field.
          </p>
          <button
            type="button"
            onClick={() => setConsented(true)}
            className="mt-2 min-h-10 rounded-lg bg-midnight px-4 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
          >
            Load interactive map
          </button>
        </div>
      )}
      {mapConfigured && consented ? (
        <LeafletCoverageMap
          technicians={technicians}
          customerLocation={customerLocation}
          apiKey={key}
        />
      ) : (
        <>
          <p className="mb-2 text-xs leading-5 text-midnight/55">
            {provider.attribution}
            {!mapConfigured ? ' · Configure a public MapTiler key for an interactive map.' : ''}
          </p>
          <ProviderMap technicians={technicians} customerLocation={customerLocation} />
        </>
      )}
    </div>
  );
}
