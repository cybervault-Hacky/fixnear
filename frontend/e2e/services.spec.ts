import { expect, test } from '@playwright/test';

const responsiveViewports = [
  { name: '320 × 740 mobile', width: 320, height: 740 },
  { name: '360 × 800 mobile', width: 360, height: 800 },
  { name: '390 × 844 mobile', width: 390, height: 844 },
  { name: '430 × 932 mobile', width: 430, height: 932 },
  { name: '768 × 1024 tablet', width: 768, height: 1024 },
  { name: '1440 × 900 desktop', width: 1440, height: 900 },
] as const;

const serviceRoutes = [
  { slug: 'ac-repair', title: 'AC Repair' },
  { slug: 'refrigerator-repair', title: 'Refrigerator Repair' },
  { slug: 'washing-machine-repair', title: 'Washing Machine Repair' },
  { slug: 'ro-repair', title: 'RO Water Purifier Repair' },
  { slug: 'electrical', title: 'Electrical Services' },
  { slug: 'plumbing', title: 'Plumbing Services' },
] as const;

async function expectNoHorizontalOverflow(
  page: import('@playwright/test').Page,
  viewportName: string,
) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));

  expect(
    dimensions.documentWidth,
    `${viewportName}: document should not overflow horizontally`,
  ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(
    dimensions.bodyWidth,
    `${viewportName}: body should not overflow horizontally`,
  ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

for (const viewport of responsiveViewports) {
  test(`service directory fits ${viewport.name} without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/services');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Find a clearer path to a home repair.' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, `${viewport.name} service directory`);
  });

  for (const service of serviceRoutes) {
    test(`${service.title} guide fits ${viewport.name} without horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/services/${service.slug}`);
      await expect(
        page.getByRole('heading', { level: 1, name: `${service.title}, explained clearly.` }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page, `${viewport.name} ${service.title} guide`);
    });
  }
}

for (const service of serviceRoutes) {
  test(`/services/${service.slug} has the complete service-guide journey`, async ({ page }) => {
    await page.goto(`/services/${service.slug}`);

    await expect(
      page.getByRole('heading', { level: 1, name: `${service.title}, explained clearly.` }),
    ).toBeVisible();
    await expect(page.locator('#common-problems')).toBeVisible();
    await expect(page.locator('#service-includes')).toContainText('clear inspection');
    await expect(page.locator('#service-journey')).toContainText('Choose a service');
    await expect(page.locator('#service-journey')).toContainText(
      'Requests for active catalog services are recorded through the FixNear API.',
    );
    await expect(page.locator('#service-journey')).toContainText(
      'there is no automatic technician matching.',
    );
    await expect(page.locator('#transparent-estimates')).toContainText('Inspection and diagnosis');
    await expect(page.locator('#transparent-estimates')).toContainText('Parts and materials');
    await expect(page.locator('#customer-approval')).toContainText(
      'Additional work should wait for your approval.',
    );
    await expect(page.getByRole('heading', { name: `${service.title} questions` })).toBeVisible();
    await expect(page.getByRole('link', { name: 'All service guides' }).first()).toHaveAttribute(
      'href',
      '/services',
    );
  });
}

test('service directory filters by category and searches service names and common problems', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/services');

  const status = page.getByRole('status');
  const search = page.getByRole('searchbox', { name: 'Search by service or common problem' });
  await expect(status).toHaveText('Showing 6 of 6 service guides.');

  const applianceFilter = page.getByRole('button', { name: 'Appliance repair', exact: true });
  await applianceFilter.click();
  await expect(applianceFilter).toHaveAttribute('aria-pressed', 'true');
  await expect(status).toHaveText('Showing 4 of 6 service guides.');
  await expect(page.locator('a[href="/services/washing-machine-repair"]')).toBeVisible();
  await expect(page.locator('a[href="/services/plumbing"]')).toHaveCount(0);

  await search.fill('front load');
  await expect(status).toHaveText('Showing 1 of 6 service guides for “front load”.');
  await expect(page.locator('a[href="/services/washing-machine-repair"]')).toBeVisible();
  await expect(page.locator('a[href="/services/ac-repair"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(search).toHaveValue('');
  await expect(status).toHaveText('Showing 6 of 6 service guides.');

  await search.fill('not cooling');
  await expect(status).toHaveText('Showing 2 of 6 service guides for “not cooling”.');
  await expect(page.locator('a[href="/services/ac-repair"]')).toBeVisible();
  await expect(page.locator('a[href="/services/refrigerator-repair"]')).toBeVisible();
  await expect(page.locator('a[href="/services/electrical"]')).toHaveCount(0);
});

test('empty search state offers a working reset', async ({ page }) => {
  await page.goto('/services');

  const search = page.getByRole('searchbox', { name: 'Search by service or common problem' });
  await search.fill('teleporter');
  await expect(page.getByRole('heading', { name: 'No matching service guides' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(
    'Showing 0 of 6 service guides for “teleporter”.',
  );

  await page.getByRole('button', { name: 'Clear search and filters' }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByRole('status')).toHaveText('Showing 6 of 6 service guides.');
});

test('mobile service navigation returns to the directory from a detail guide', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/services/ac-repair');

  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('link', { name: 'Services' })
    .click();

  await expect(page).toHaveURL(/\/services$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Find a clearer path to a home repair.' }),
  ).toBeVisible();
});

test('service discovery keeps reduced-motion users on a zero-motion path', async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrated|hydration/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/services');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Find a clearer path to a home repair.' }),
  ).toHaveCSS('opacity', '1');
  expect(
    await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  ).toBe(true);

  const search = page.getByRole('searchbox', { name: 'Search by service or common problem' });
  await search.fill('plumbing');
  await expect(page.getByRole('status')).toHaveText(
    'Showing 1 of 6 service guides for “plumbing”.',
  );
  expect(hydrationErrors).toEqual([]);
});
