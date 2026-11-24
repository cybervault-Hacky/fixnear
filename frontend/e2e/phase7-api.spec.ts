import { expect, test } from '@playwright/test';

const databaseGuide = {
  id: '5c6b53b4-e447-44cf-997a-ef58fd07ca11',
  slug: 'catalog-demo-guide',
  title: 'Catalog Demo Guide',
  home_title: 'Catalog guide',
  home_description: 'A database-backed guide fixture',
  description: 'A published service guide returned by the mocked database API.',
  listing_description: 'A custom service guide for testing the database-backed public catalog.',
  category: {
    id: '1b687d7b-853f-497b-bf78-5f5b5e4df9b6',
    slug: 'home-systems',
    title: 'Home systems',
    description: 'Home systems guides.',
    display_order: 1,
  },
  keywords: ['custom guide', 'catalog test'],
  common_problems: [
    { title: 'A reported concern', description: 'A concise and non-diagnostic example.' },
  ],
  inspection_scope: ['Describe the issue and review accessible components.'],
  questions: [
    { question: 'What should I share?', answer: 'Describe what changed and when it occurs.' },
  ],
  related_service_slugs: [],
  display_order: 0,
};

test('public services directory prefers published database catalog data when API is available', async ({
  page,
}) => {
  await page.route('**/api/backend/v1/services', async (route) => {
    await route.fulfill({ json: [databaseGuide] });
  });

  await page.goto('/services');

  await expect(page.getByRole('status')).toHaveText('Showing 1 of 1 service guides.');
  await expect(page.getByText('Connected to the active FixNear service catalog.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Catalog Demo Guide/ })).toHaveAttribute(
    'href',
    '/services/catalog-demo-guide',
  );
  await expect(page.getByRole('link', { name: /AC Repair/ })).toHaveCount(0);
});

test('homepage category discovery uses the active catalog API when it is available', async ({
  page,
}) => {
  await page.route('**/api/backend/v1/services', async (route) => {
    await route.fulfill({ json: [databaseGuide] });
  });

  await page.goto('/');

  await expect(page.getByText('Search uses active database service guides.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose Catalog guide' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose AC repair' })).toHaveCount(0);
});

test('dynamic database service guides use the active catalog for related guides', async ({
  page,
}) => {
  const relatedGuide = {
    ...databaseGuide,
    id: '5c6b53b4-e447-44cf-997a-ef58fd07ca12',
    slug: 'related-database-guide',
    title: 'Related Database Guide',
    home_title: 'Related guide',
    related_service_slugs: [],
  };
  const detailGuide = {
    ...databaseGuide,
    related_service_slugs: [relatedGuide.slug],
  };

  await page.route('**/api/backend/v1/services/catalog-demo-guide', async (route) => {
    await route.fulfill({ json: detailGuide });
  });
  await page.route('**/api/backend/v1/services', async (route) => {
    await route.fulfill({ json: [detailGuide, relatedGuide] });
  });

  await page.goto('/services/catalog-demo-guide');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Catalog Demo Guide, explained clearly.' }),
  ).toBeVisible();
  await expect(
    page.getByText('Guide content is served from the FixNear service catalog.'),
  ).toBeVisible();
  await expect(page.locator('#common-problems')).toContainText('A reported concern');
  await expect(page.locator('#service-includes')).toContainText('Describe the issue');
  await expect(page.getByRole('link', { name: /Related Database Guide/ })).toHaveAttribute(
    'href',
    '/services/related-database-guide',
  );
  await expect(page.getByRole('heading', { name: 'Catalog Demo Guide questions' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(
    /\$\d|\bprice:\s*|available now|verified technician/i,
  );
});

test('account-backed technician tools show no demo record when access is denied', async ({
  page,
}) => {
  await page.route('**/api/backend/v1/technician/**', async (route) => {
    await route.fulfill({
      status: 403,
      json: { detail: { code: 'forbidden', message: 'Access denied.' } },
    });
  });
  await page.route('**/api/backend/v1/services', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.goto('/technician/manage');

  await expect(
    page.getByRole('heading', { name: 'Technician management is protected.' }),
  ).toBeVisible();
  await expect(page.getByText(/not authorized for technician self-service/i)).toBeVisible();
  await expect(page.getByText('Sample Technician').first()).toHaveCount(0);
  await expect(
    page.getByText(
      /No technician profile, contact details, availability or verification status are displayed\./,
    ),
  ).toBeVisible();
});

test('admin catalog screen reads database records and soft-deactivates guides through the API', async ({
  page,
}) => {
  const timestamp = '2026-11-22T00:00:00Z';
  const category = {
    ...databaseGuide.category,
    is_active: true,
    created_at: timestamp,
    updated_at: timestamp,
  };
  let guide = { ...databaseGuide, is_active: true, created_at: timestamp, updated_at: timestamp };

  await page.route('**/api/backend/v1/admin/service-catalog/categories', async (route) => {
    await route.fulfill({ json: [category] });
  });
  await page.route('**/api/backend/v1/admin/service-catalog/services', async (route) => {
    await route.fulfill({ json: [guide] });
  });
  await page.route('**/api/backend/v1/admin/service-catalog/services/**', async (route) => {
    const method = route.request().method();
    if (method === 'DELETE') {
      guide = { ...guide, is_active: false };
      await route.fulfill({ status: 204 });
      return;
    }
    if (method === 'PATCH') {
      const changes = route.request().postDataJSON() as Partial<typeof guide>;
      guide = { ...guide, ...changes };
      await route.fulfill({ json: guide });
      return;
    }
    await route.fulfill({ status: 405, json: { detail: 'Unsupported test method.' } });
  });
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/admin/service-catalog');

  await expect(page.getByRole('heading', { name: 'Catalog Demo Guide' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Home systems' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AC Repair' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Deactivate guide' }).click();
  await expect(page.getByRole('status')).toHaveText('Service guide deactivated.');
  await expect(page.getByRole('heading', { name: 'Catalog Demo Guide' })).toHaveCount(0);

  await page.getByLabel('Include inactive guides').check();
  await page.getByRole('button', { name: 'Publish guide' }).click();
  await expect(page.getByRole('status')).toHaveText('Service guide published.');
  await expect(page.getByRole('heading', { name: 'Catalog Demo Guide' })).toBeVisible();
});

test('admin service catalog hides data and mutations for non-admin accounts', async ({ page }) => {
  await page.route('**/api/backend/v1/admin/service-catalog/**', async (route) => {
    await route.fulfill({
      status: 403,
      json: { detail: { code: 'forbidden', message: 'Access denied.' } },
    });
  });

  await page.goto('/admin/service-catalog');

  await expect(page.getByRole('heading', { name: 'Manage service guides.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Admin access required' })).toBeVisible();
  await expect(
    page.getByText(/only an authenticated user with a server-managed admin role/i),
  ).toBeVisible();
  await expect(page.getByText('AC Repair', { exact: true })).toHaveCount(0);
});
