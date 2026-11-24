import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BrowserLocationError, requestBrowserLocation } from '../lib/location/browser-location.ts';

function mockGeolocation(callback) {
  return {
    getCurrentPosition: (...args) => callback(...args),
  };
}

test('browser location resolves a foreground geolocation fix after the caller requests it', async () => {
  let options;
  const location = await requestBrowserLocation(
    mockGeolocation((success, _failure, requestOptions) => {
      options = requestOptions;
      success({ coords: { latitude: 0.123, longitude: 0.456, accuracy: 18 } });
    }),
  );

  assert.deepEqual(location, { latitude: 0.123, longitude: 0.456, accuracyMeters: 18 });
  assert.deepEqual(options, { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 });
});

test('browser location reports explicit permission denial so the UI can offer manual area selection', async () => {
  await assert.rejects(
    requestBrowserLocation(mockGeolocation((_success, failure) => failure({ code: 1 }))),
    (error) => error instanceof BrowserLocationError && error.code === 'permission_denied',
  );
});

test('browser location reports unavailable hardware/data without inventing coordinates', async () => {
  await assert.rejects(
    requestBrowserLocation(undefined),
    (error) => error instanceof BrowserLocationError && error.code === 'unavailable',
  );
  await assert.rejects(
    requestBrowserLocation(mockGeolocation((_success, failure) => failure({ code: 2 }))),
    (error) => error instanceof BrowserLocationError && error.code === 'position_unavailable',
  );
});
