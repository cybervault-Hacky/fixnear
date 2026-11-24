import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    geolocationCalls: number;
  }
}

const service = {
  id: '7b3f3343-c8e2-4c2a-94b1-22c315f51670',
  slug: 'ac-repair',
  title: 'AC Repair',
  home_title: 'Air conditioner',
  home_description: 'Cooling problems',
  description: 'A service guide used by location discovery tests.',
  listing_description: 'A test-only service guide.',
  category: {
    id: '3a8fac52-0611-454b-864d-fc510f4abf34',
    slug: 'appliance-repair',
    title: 'Appliance repair',
    description: 'Test category',
    display_order: 0,
  },
  keywords: ['cooling'],
  common_problems: [],
  inspection_scope: [],
  questions: [],
  related_service_slugs: [],
  display_order: 0,
};

const technicianId = '0a34f931-7a84-4cc5-a1a1-66d33d16677a';
const nearbyTech = {
  user_id: technicianId,
  display_name: 'Test-only technician',
  professional_description: 'Test fixture only; this is not a real technician profile.',
  years_experience: 5,
  service_slug: 'ac-repair',
  service_title: 'AC Repair',
  verification_approved: true,
  coverage_area: 'Test locality, Test city',
  coverage_city: 'Test city',
  coverage_state: 'Test state',
  coverage_postal_code: '000001',
  latitude: 1.23,
  longitude: 4.56,
  distance_km: null,
  distance_basis: null,
};

const technicianProfile = {
  user_id: technicianId,
  display_name: nearbyTech.display_name,
  professional_description: nearbyTech.professional_description,
  years_experience: 5,
  verification_approved: true,
  service_slug: 'ac-repair',
  service_title: 'AC Repair',
  service_description: 'Test-only profile',
  coverage_areas: [
    {
      area_name: 'Test locality',
      city: 'Test city',
      state: 'Test state',
      postal_code: '000001',
      latitude: 1.23,
      longitude: 4.56,
    },
  ],
  note: 'Test fixture only.',
};

async function mockServiceCatalog(page: import('@playwright/test').Page) {
  await page.route('**/api/backend/v1/services/ac-repair', async (route) => {
    await route.fulfill({ json: service });
  });
  await page.route('**/api/backend/v1/services', async (route) => {
    await route.fulfill({ json: [service] });
  });
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const { viewportWidth, pageWidth } = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  expect(pageWidth).toBeLessThanOrEqual(viewportWidth + 1);
}

test('manual area discovery switches between list and schematic map on a narrow Android-sized viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockServiceCatalog(page);
  await page.route(
    '**/api/backend/v1/services/ac-repair/nearby-technicians/search',
    async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(body.area).toBe('Test locality');
      expect(body.mode).toBe('manual_area');
      expect(body.latitude).toBeUndefined();
      expect(new URL(route.request().url()).search).toBe('');
      await route.fulfill({
        json: {
          service_slug: 'ac-repair',
          results: [nearbyTech],
          total: 1,
          sort: 'service_area',
          location_mode: 'manual_area',
          note: 'Test-only approximate service coverage.',
        },
      });
    },
  );
  await page.route(
    `**/api/backend/v1/technicians/${technicianId}/services/ac-repair`,
    async (route) => {
      await route.fulfill({ json: technicianProfile });
    },
  );

  await page.goto('/services/ac-repair');
  const discovery = page.locator('#nearby-technicians');
  await discovery.scrollIntoViewIfNeeded();
  await expect(
    discovery.getByRole('heading', { name: /Find ac repair professionals by area/i }),
  ).toBeVisible();
  await expect(
    discovery.getByText(/Your browser is not asked until you tap the button/i),
  ).toBeVisible();
  await discovery.getByLabel('Area or locality').fill('Test locality');
  await discovery.getByRole('button', { name: 'Find eligible technicians' }).click();
  await expect(discovery.getByRole('heading', { name: '1 eligible technician' })).toBeVisible();
  await expect(discovery.getByText('Test-only technician')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await discovery.getByRole('button', { name: 'Map view' }).click();
  await expect(discovery.getByRole('button', { name: 'Map view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(discovery.getByText('Schematic · not to scale')).toBeVisible();
  await expect(
    discovery.getByRole('link', { name: "Open Test-only technician's AC Repair service profile" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await discovery.getByRole('button', { name: 'List view' }).click();
  await expect(discovery.getByRole('button', { name: 'List view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await discovery.getByRole('link', { name: 'View service profile' }).click();
  await expect(page).toHaveURL(new RegExp(`/technicians/${technicianId}/services/ac-repair$`));
  await expect(page.getByRole('heading', { name: 'Test-only technician' })).toBeVisible();
});

test('device geolocation is requested only after a tap and denied permission falls back to manual search', async ({
  page,
}) => {
  await mockServiceCatalog(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'geolocationCalls', { value: 0, writable: true });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(_success: unknown, error: (value: { code: number }) => void) {
          window.geolocationCalls += 1;
          error({ code: 1 });
        },
      },
    });
  });

  await page.goto('/services/ac-repair');
  const discovery = page.locator('#nearby-technicians');
  await discovery.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.geolocationCalls)).toBe(0);
  await discovery.getByRole('button', { name: 'Use my location' }).click();
  await expect(discovery.getByText(/Location permission was denied/i)).toBeVisible();
  await expect(discovery.getByLabel('Area or locality')).toBeVisible();
  expect(await page.evaluate(() => window.geolocationCalls)).toBe(1);
});

test('granted device geolocation is used only for the explicit nearby search', async ({ page }) => {
  await mockServiceCatalog(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'geolocationCalls', { value: 0, writable: true });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(
          success: (value: {
            coords: { latitude: number; longitude: number; accuracy: number };
          }) => void,
        ) {
          window.geolocationCalls += 1;
          success({ coords: { latitude: 0.123, longitude: 0.456, accuracy: 20 } });
        },
      },
    });
  });
  let observedSearchBody: unknown;
  await page.route(
    '**/api/backend/v1/services/ac-repair/nearby-technicians/search',
    async (route) => {
      observedSearchBody = route.request().postDataJSON();
      expect(new URL(route.request().url()).search).toBe('');
      await route.fulfill({
        json: {
          service_slug: 'ac-repair',
          results: [],
          total: 0,
          sort: 'distance',
          location_mode: 'coordinates',
          note: 'No technician service-area centers are configured for this test search.',
        },
      });
    },
  );

  await page.goto('/services/ac-repair');
  const discovery = page.locator('#nearby-technicians');
  await discovery.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.geolocationCalls)).toBe(0);
  await discovery.getByRole('button', { name: 'Use my location' }).click();
  await expect(
    discovery.getByText(/Location permission granted for this search only/i),
  ).toBeVisible();
  expect(await page.evaluate(() => window.geolocationCalls)).toBe(1);
  await expect(discovery.getByRole('button', { name: 'Find eligible technicians' })).toBeVisible();
  expect(observedSearchBody).toBeUndefined();
  await discovery.getByRole('button', { name: 'Find eligible technicians' }).click();
  await expect(discovery.getByRole('heading', { name: 'No matching service areas' })).toBeVisible();
  expect(observedSearchBody).toEqual({
    mode: 'coordinates',
    latitude: 0.123,
    longitude: 0.456,
    radius_km: 25,
  });
});

test('unavailable browser geolocation leaves manual area and PIN search usable', async ({
  page,
}) => {
  await mockServiceCatalog(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: undefined,
    });
  });
  let observedSearchBody: unknown;
  await page.route(
    '**/api/backend/v1/services/ac-repair/nearby-technicians/search',
    async (route) => {
      observedSearchBody = route.request().postDataJSON();
      expect(new URL(route.request().url()).search).toBe('');
      await route.fulfill({
        json: {
          service_slug: 'ac-repair',
          results: [],
          total: 0,
          sort: 'service_area',
          location_mode: 'manual_area',
          note: 'Test-only manual-area search.',
        },
      });
    },
  );

  await page.goto('/services/ac-repair');
  const discovery = page.locator('#nearby-technicians');
  await discovery.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => navigator.geolocation)).toBeUndefined();
  await discovery.getByRole('button', { name: 'Use my location' }).click();
  await expect(discovery.getByText(/Browser location is unavailable/i)).toBeVisible();
  await discovery.getByLabel('PIN code').fill('411038');
  await discovery.getByRole('button', { name: 'Find eligible technicians' }).click();
  await expect(discovery.getByRole('heading', { name: 'No matching service areas' })).toBeVisible();
  expect(observedSearchBody).toEqual({ mode: 'manual_area', postal_code: '411038' });
});
