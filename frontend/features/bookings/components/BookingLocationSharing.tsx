'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiRequest, jsonRequest } from '@/lib/api/client';
import { requestBrowserLocation } from '@/lib/location/browser-location';

type Sharing = {
  state: 'enabled' | 'paused' | 'stopped';
  freshness: 'unavailable' | 'fresh' | 'stale';
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  location_updated_at: string | null;
};

type Props = { bookingId: string; viewer: 'technician' | 'customer' };

/** All location access is foreground-only and scoped to this booking. */
export function BookingLocationSharing({ bookingId, viewer }: Props) {
  const [sharing, setSharing] = useState<Sharing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const path =
    viewer === 'technician'
      ? `technician/bookings/${encodeURIComponent(bookingId)}/location-sharing`
      : `customer/bookings/${encodeURIComponent(bookingId)}/technician-location`;

  const load = useCallback(async () => {
    setError('');
    try {
      setSharing(await apiRequest<Sharing>(path));
    } catch {
      setError('Location status is unavailable. Please try again.');
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);

  const setState = async (state: 'enabled' | 'paused' | 'stopped') => {
    setBusy(true);
    setError('');
    try {
      setSharing(await apiRequest<Sharing>(path, jsonRequest('PUT', { state })));
    } catch {
      setError('Could not update sharing. Check that this booking is still assigned to you.');
    } finally {
      setBusy(false);
    }
  };
  const sendLocation = async () => {
    setBusy(true);
    setError('');
    try {
      const point = await requestBrowserLocation();
      setSharing(
        await apiRequest<Sharing>(
          `${path}/location`,
          jsonRequest('POST', {
            latitude: point.latitude,
            longitude: point.longitude,
            accuracy_meters: point.accuracyMeters,
          }),
        ),
      );
    } catch {
      setError(
        'Could not confirm the location update. Permission may be denied or the booking may have changed; refresh status.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-2xl border border-midnight/10 bg-white p-5"
      aria-label="Booking location sharing"
    >
      <h2 className="font-semibold">Booking-specific technician location</h2>
      <p className="mt-2 text-sm text-midnight/65">
        Location is shared only for this assigned booking. It is never collected in the background;
        Fresh updates expire from view after five minutes. Booking changes require sharing to be
        enabled again.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {sharing ? (
        <p className="mt-2 text-sm" role="status">
          Sharing: {sharing.state} · Location: {sharing.freshness}
          {sharing.location_updated_at
            ? ` · updated ${new Date(sharing.location_updated_at).toLocaleString()}`
            : ''}
        </p>
      ) : (
        <p className="mt-2 text-sm">Loading location status…</p>
      )}
      {viewer === 'customer' &&
        sharing?.freshness === 'fresh' &&
        sharing.latitude !== null &&
        sharing.longitude !== null && (
          <p className="mt-2 break-all text-sm">
            Technician location: {sharing.latitude.toFixed(5)}, {sharing.longitude.toFixed(5)} ·
            accuracy about {sharing.accuracy_meters?.toFixed(0)} m
          </p>
        )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
        >
          Refresh status
        </button>
        {viewer === 'technician' && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setState('enabled')}
              className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
            >
              Enable sharing
            </button>
            <button
              type="button"
              disabled={busy || sharing?.state !== 'enabled'}
              onClick={() => void sendLocation()}
              className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
            >
              Share current location once
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setState('paused')}
              className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
            >
              Pause
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setState('stopped')}
              className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50"
            >
              Stop and clear
            </button>
          </>
        )}
      </div>
    </section>
  );
}
