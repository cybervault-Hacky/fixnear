'use client';

import {
  ArrowUpRight,
  List,
  LoaderCircle,
  LocateFixed,
  Map,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';

import { Container } from '@/components/layout/Container';
import { ServiceAreaMap } from '@/features/services/components/ServiceAreaMap';
import {
  BrowserLocationError,
  requestBrowserLocation,
  type BrowserLocation,
} from '@/lib/location/browser-location';
import { FixNearApiError } from '@/lib/api/client';
import {
  findNearbyTechnicians,
  type NearbyLocationSearch,
  type NearbyTechnicianList,
} from '@/lib/api/technician-discovery';

type LocationMode = 'manual_area' | 'coordinates';
type MapListView = 'list' | 'map';

type NearbyTechnicianDiscoveryProps = {
  serviceSlug: string;
  serviceTitle: string;
};

function errorMessage(error: unknown): string {
  if (error instanceof FixNearApiError) {
    if (error.status === 404) return 'This service is no longer active in the public catalog.';
    if (error.status === 422) return error.message;
  }
  return 'Nearby service providers could not be loaded. Please retry or use a different area.';
}

function profileHref(userId: string, serviceSlug: string) {
  return `/technicians/${encodeURIComponent(userId)}/services/${encodeURIComponent(serviceSlug)}`;
}

export function NearbyTechnicianDiscovery({
  serviceSlug,
  serviceTitle,
}: NearbyTechnicianDiscoveryProps) {
  const areaId = useId();
  const cityId = useId();
  const stateId = useId();
  const postalId = useId();
  const radiusId = useId();
  const [locationMode, setLocationMode] = useState<LocationMode>('manual_area');
  const [deviceLocation, setDeviceLocation] = useState<BrowserLocation | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<
    'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'
  >('idle');
  const [permissionMessage, setPermissionMessage] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [radiusKm, setRadiusKm] = useState('25');
  const [result, setResult] = useState<NearbyTechnicianList | null>(null);
  const [view, setView] = useState<MapListView>('list');
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  const requestDeviceLocation = async () => {
    setResult(null);
    setSearchError('');
    setPermissionStatus('requesting');
    setPermissionMessage('Waiting for browser permission and a one-time location fix…');
    try {
      const location = await requestBrowserLocation();
      setDeviceLocation(location);
      setPermissionStatus('granted');
      setLocationMode('coordinates');
      setPermissionMessage(
        'Location permission granted for this search only. Coordinates are not saved to the service address or shared with technicians.',
      );
      setSearchError('');
    } catch (error) {
      const code = error instanceof BrowserLocationError ? error.code : 'unavailable';
      const denied = code === 'permission_denied';
      setDeviceLocation(null);
      setLocationMode('manual_area');
      setPermissionStatus(denied ? 'denied' : 'unavailable');
      setPermissionMessage(
        denied
          ? 'Location permission was denied. Search by an area, city or PIN code instead.'
          : 'Browser location is unavailable. Search by an area, city or PIN code instead.',
      );
    }
  };

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchError('');
    setResult(null);
    let criteria: NearbyLocationSearch;
    if (locationMode === 'coordinates') {
      if (!deviceLocation) {
        setSearchError(
          'Tap “Use my location” and grant permission, or switch to manual area search.',
        );
        return;
      }
      criteria = {
        mode: 'coordinates',
        latitude: deviceLocation.latitude,
        longitude: deviceLocation.longitude,
        radius_km: Number(radiusKm),
      };
    } else {
      if (!area.trim() && !city.trim() && !postalCode.trim()) {
        setSearchError('Enter an area, city or PIN code to search manually.');
        return;
      }
      criteria = {
        mode: 'manual_area',
        ...(area.trim() ? { area: area.trim() } : {}),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(state.trim() ? { state: state.trim() } : {}),
        ...(postalCode.trim() ? { postal_code: postalCode.trim() } : {}),
      };
    }
    setLoading(true);
    try {
      setResult(await findNearbyTechnicians(serviceSlug, criteria));
    } catch (error) {
      setSearchError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const switchToManual = () => {
    setLocationMode('manual_area');
    setResult(null);
  };

  const switchToCoordinates = () => {
    if (deviceLocation) {
      setLocationMode('coordinates');
      setResult(null);
    }
  };

  return (
    <section
      id="nearby-technicians"
      aria-labelledby="nearby-technicians-title"
      className="border-y border-midnight/8 bg-[#f8faf7] py-14 sm:py-18"
    >
      <Container>
        <div className="max-w-3xl">
          <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-midnight/55">
            <MapPin aria-hidden="true" size={14} />
            Service-area discovery
          </p>
          <h2
            id="nearby-technicians-title"
            className="text-balance text-2xl font-semibold tracking-[-0.04em] text-midnight sm:text-3xl"
          >
            Find {serviceTitle.toLowerCase()} professionals by area.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-midnight/65">
            Results include only technicians with an active account, approved verification, an
            active skill for this service and a matching service area. FixNear does not check live
            availability or confirm an appointment.
          </p>
        </div>

        <div className="mt-7 grid items-start gap-5 lg:grid-cols-[minmax(260px,0.72fr)_minmax(0,1.28fr)]">
          <form
            onSubmit={search}
            className="grid gap-4 rounded-2xl border border-midnight/10 bg-white p-4 shadow-sm sm:p-5"
          >
            <div
              className="grid grid-cols-2 gap-2"
              role="group"
              aria-label="Choose search location method"
            >
              <button
                type="button"
                onClick={switchToManual}
                aria-pressed={locationMode === 'manual_area'}
                className={`min-h-11 rounded-xl border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight ${locationMode === 'manual_area' ? 'border-midnight bg-midnight text-white' : 'border-midnight/15 text-midnight/70 hover:bg-[#f8faf7]'}`}
              >
                Area or PIN
              </button>
              <button
                type="button"
                onClick={switchToCoordinates}
                disabled={!deviceLocation}
                aria-pressed={locationMode === 'coordinates'}
                className={`min-h-11 rounded-xl border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:cursor-not-allowed disabled:opacity-50 ${locationMode === 'coordinates' ? 'border-midnight bg-midnight text-white' : 'border-midnight/15 text-midnight/70 hover:bg-[#f8faf7]'}`}
              >
                My location
              </button>
            </div>

            <button
              type="button"
              onClick={() => void requestDeviceLocation()}
              disabled={permissionStatus === 'requesting'}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-midnight/15 bg-white px-3 text-sm font-semibold text-midnight hover:bg-[#f8faf7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:cursor-wait disabled:opacity-60"
            >
              {permissionStatus === 'requesting' ? (
                <LoaderCircle aria-hidden="true" size={16} className="animate-spin" />
              ) : (
                <LocateFixed aria-hidden="true" size={16} />
              )}
              {permissionStatus === 'requesting' ? 'Requesting location…' : 'Use my location'}
            </button>
            <p
              role="status"
              aria-live="polite"
              className="-mt-2 text-xs leading-5 text-midnight/55"
            >
              {permissionMessage ||
                'Your browser is not asked until you tap the button. You can always search manually.'}
            </p>

            {locationMode === 'manual_area' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  htmlFor={areaId}
                  className="grid gap-1.5 text-xs font-semibold text-midnight/75"
                >
                  Area or locality
                  <input
                    id={areaId}
                    value={area}
                    onChange={(event) => setArea(event.currentTarget.value)}
                    maxLength={120}
                    autoComplete="address-level3"
                    placeholder="Area or locality"
                    className="min-h-11 min-w-0 rounded-xl border border-midnight/15 bg-white px-3 text-sm font-normal text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                  />
                </label>
                <label
                  htmlFor={postalId}
                  className="grid gap-1.5 text-xs font-semibold text-midnight/75"
                >
                  PIN code
                  <input
                    id={postalId}
                    value={postalCode}
                    onChange={(event) => setPostalCode(event.currentTarget.value)}
                    maxLength={12}
                    autoComplete="postal-code"
                    inputMode="numeric"
                    placeholder="PIN code"
                    className="min-h-11 min-w-0 rounded-xl border border-midnight/15 bg-white px-3 text-sm font-normal text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                  />
                </label>
                <label
                  htmlFor={cityId}
                  className="grid gap-1.5 text-xs font-semibold text-midnight/75"
                >
                  City · optional
                  <input
                    id={cityId}
                    value={city}
                    onChange={(event) => setCity(event.currentTarget.value)}
                    maxLength={120}
                    autoComplete="address-level2"
                    placeholder="City"
                    className="min-h-11 min-w-0 rounded-xl border border-midnight/15 bg-white px-3 text-sm font-normal text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                  />
                </label>
                <label
                  htmlFor={stateId}
                  className="grid gap-1.5 text-xs font-semibold text-midnight/75"
                >
                  State · optional
                  <input
                    id={stateId}
                    value={state}
                    onChange={(event) => setState(event.currentTarget.value)}
                    maxLength={120}
                    autoComplete="address-level1"
                    placeholder="State"
                    className="min-h-11 min-w-0 rounded-xl border border-midnight/15 bg-white px-3 text-sm font-normal text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                  />
                </label>
              </div>
            ) : (
              <div className="grid gap-3 rounded-xl bg-[#f8faf7] p-3 text-sm text-midnight/70">
                <p>
                  One-time browser coordinates are used for this search. They are not saved or
                  shared with technicians.
                </p>
                <label
                  htmlFor={radiusId}
                  className="grid gap-1.5 text-xs font-semibold text-midnight/75"
                >
                  Approximate service-area radius
                  <select
                    id={radiusId}
                    value={radiusKm}
                    onChange={(event) => setRadiusKm(event.currentTarget.value)}
                    className="min-h-11 rounded-xl border border-midnight/15 bg-white px-3 text-sm font-normal text-midnight outline-none focus:border-midnight/50 focus:ring-2 focus:ring-lime/55"
                  >
                    <option value="5">5 km</option>
                    <option value="10">10 km</option>
                    <option value="25">25 km</option>
                    <option value="50">50 km</option>
                  </select>
                </label>
              </div>
            )}

            {searchError ? (
              <p role="alert" className="rounded-xl bg-[#fff3f1] px-3 py-2 text-sm text-[#8d3028]">
                {searchError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-midnight px-4 text-sm font-semibold text-white transition hover:bg-[#1d2a3f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? (
                <LoaderCircle aria-hidden="true" size={16} className="animate-spin" />
              ) : null}
              {loading ? 'Searching…' : 'Find eligible technicians'}
            </button>
          </form>

          <div className="min-w-0">
            {result ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-midnight">
                      {result.total === 0
                        ? 'No matching service areas'
                        : `${result.total} eligible ${result.total === 1 ? 'technician' : 'technicians'}`}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-midnight/55">{result.note}</p>
                  </div>
                  {result.total > 0 ? (
                    <div
                      className="flex gap-1 rounded-xl border border-midnight/10 bg-white p-1"
                      role="group"
                      aria-label="Switch technician results view"
                    >
                      <button
                        type="button"
                        onClick={() => setView('list')}
                        aria-pressed={view === 'list'}
                        className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${view === 'list' ? 'bg-midnight text-white' : 'text-midnight/65 hover:bg-[#f8faf7]'}`}
                      >
                        <List aria-hidden="true" size={16} /> List view
                      </button>
                      <button
                        type="button"
                        onClick={() => setView('map')}
                        aria-pressed={view === 'map'}
                        className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${view === 'map' ? 'bg-midnight text-white' : 'text-midnight/65 hover:bg-[#f8faf7]'}`}
                      >
                        <Map aria-hidden="true" size={16} /> Map view
                      </button>
                    </div>
                  ) : null}
                </div>

                {result.total === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-midnight/20 bg-white p-6 text-sm leading-6 text-midnight/65">
                    No technician is displayed unless the database confirms active status, approved
                    verification, a matching active service skill and service coverage. You can
                    still submit a request; admin assignment is handled separately.
                  </div>
                ) : view === 'map' ? (
                  <div className="mt-4">
                    <ServiceAreaMap technicians={result.results} />
                    <p className="mt-2 text-xs leading-5 text-midnight/50">
                      Markers are approximate service-area centers supplied by technicians; they do
                      not show technician homes, current position or availability.
                    </p>
                  </div>
                ) : (
                  <ul className="mt-4 grid gap-3">
                    {result.results.map((technician) => (
                      <li
                        key={technician.user_id}
                        className="rounded-2xl border border-midnight/10 bg-white p-4 shadow-sm sm:p-5"
                      >
                        <div className="flex items-start gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef7e5] text-midnight">
                            <ShieldCheck aria-hidden="true" size={19} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <h4 className="font-semibold text-midnight">
                                {technician.display_name}
                              </h4>
                              <span className="rounded-full bg-[#eef7e5] px-2 py-0.5 text-[0.65rem] font-semibold text-midnight/70">
                                Approved verification
                              </span>
                            </div>
                            <p className="mt-1 text-sm leading-6 text-midnight/65">
                              {technician.professional_description}
                            </p>
                            <p className="mt-2 text-xs leading-5 text-midnight/55">
                              Service area: {technician.coverage_area}
                              {technician.years_experience !== null
                                ? ` · ${technician.years_experience} years' experience`
                                : ''}
                              {technician.distance_km !== null
                                ? ` · about ${technician.distance_km} km to the service-area center`
                                : ''}
                            </p>
                            <Link
                              href={profileHref(technician.user_id, serviceSlug)}
                              className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-lg text-sm font-semibold text-midnight underline decoration-midnight/25 underline-offset-4 hover:decoration-midnight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
                            >
                              View service profile <ArrowUpRight aria-hidden="true" size={15} />
                            </Link>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="grid min-h-60 place-items-center rounded-2xl border border-dashed border-midnight/20 bg-white p-6 text-center sm:min-h-72">
                <div className="max-w-md">
                  <MapPin aria-hidden="true" size={22} className="mx-auto text-midnight/45" />
                  <p className="mt-3 text-sm font-semibold text-midnight">
                    Search area-specific service coverage
                  </p>
                  <p className="mt-2 text-sm leading-6 text-midnight/60">
                    Coordinate searches sort only when both the search fix and a technician-entered
                    service-area center exist. Manual area or PIN searches match coverage fields and
                    never show invented distances.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
