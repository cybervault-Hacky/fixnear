export type BrowserLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export type BrowserLocationErrorCode =
  'permission_denied' | 'position_unavailable' | 'timeout' | 'unavailable';

export class BrowserLocationError extends Error {
  readonly code: BrowserLocationErrorCode;

  constructor(code: BrowserLocationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'BrowserLocationError';
  }
}

export type GeolocationReader = Pick<Geolocation, 'getCurrentPosition'>;

/** Request one foreground location fix. Call only from an explicit user gesture. */
export function requestBrowserLocation(
  geolocation: GeolocationReader | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.geolocation,
): Promise<BrowserLocation> {
  if (!geolocation) {
    return Promise.reject(
      new BrowserLocationError('unavailable', 'This browser does not provide geolocation.'),
    );
  }

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          !Number.isFinite(accuracy) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180 ||
          accuracy < 0
        ) {
          reject(
            new BrowserLocationError(
              'position_unavailable',
              'The browser did not return usable location coordinates.',
            ),
          );
          return;
        }
        resolve({ latitude, longitude, accuracyMeters: accuracy });
      },
      (error) => {
        const code: BrowserLocationErrorCode =
          error.code === 1
            ? 'permission_denied'
            : error.code === 3
              ? 'timeout'
              : 'position_unavailable';
        const message =
          code === 'permission_denied'
            ? 'Location permission was denied.'
            : code === 'timeout'
              ? 'The browser location request timed out.'
              : 'The browser could not determine a location.';
        reject(new BrowserLocationError(code, message));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
    );
  });
}
