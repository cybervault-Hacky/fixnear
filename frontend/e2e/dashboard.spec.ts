import { expect, test } from '@playwright/test';

const dashboardRoutes = [
  { path: '/dashboard', heading: 'Welcome, Demo.', navigationLabel: 'Overview' },
  { path: '/dashboard/profile', heading: 'Your profile details.', navigationLabel: 'Profile' },
  {
    path: '/dashboard/addresses',
    heading: 'Keep service locations organised.',
    navigationLabel: 'Addresses',
  },
  {
    path: '/dashboard/activity',
    heading: 'Service history, clearly laid out.',
    navigationLabel: 'Service activity',
  },
  {
    path: '/dashboard/homepassport',
    heading: 'A home record for the things you rely on.',
    navigationLabel: 'HomePassport',
  },
  {
    path: '/dashboard/warranties',
    heading: 'Keep the terms alongside the record.',
    navigationLabel: 'Warranties',
  },
] as const;

const responsiveViewports = [
  { name: '320 × 740 mobile', width: 320, height: 740 },
  { name: '360 × 800 mobile', width: 360, height: 800 },
  { name: '390 × 844 mobile', width: 390, height: 844 },
  { name: '430 × 932 mobile', width: 430, height: 932 },
  { name: '768 × 1024 tablet', width: 768, height: 1024 },
  { name: '1440 × 900 desktop', width: 1440, height: 900 },
] as const;

async function expectNoHorizontalOverflow(
  page: import('@playwright/test').Page,
  description: string,
) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));

  expect(
    dimensions.documentWidth,
    `${description}: document width should fit the viewport`,
  ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(
    dimensions.bodyWidth,
    `${description}: body width should fit the viewport`,
  ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

for (const route of dashboardRoutes) {
  test(`${route.path} renders the shared demo dashboard layout`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(route.path);

    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
    await expect(page.getByRole('note')).toContainText('Demonstration workspace');
    await expect(page.getByRole('navigation', { name: 'Customer dashboard' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    const activeLink = page
      .getByRole('navigation', { name: 'Customer dashboard' })
      .getByRole('link', { name: route.navigationLabel });
    await expect(activeLink).toBeVisible();
    await expect(activeLink).toHaveAttribute('aria-current', 'page');
  });
}

for (const viewport of responsiveViewports) {
  for (const route of dashboardRoutes) {
    test(`${route.path} fits ${viewport.name} without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
      await expectNoHorizontalOverflow(page, `${route.path} at ${viewport.name}`);
    });
  }
}

test('profile validates fields, saves, cancels drafts, and shares session state with overview', async ({
  page,
}) => {
  await page.goto('/dashboard/profile');

  const name = page.getByLabel('Name');
  const email = page.getByLabel('Email address');
  const phone = page.getByLabel('Phone number (optional)');

  await name.fill('  ');
  await email.fill('not-an-email');
  await phone.fill('123');
  await page.getByRole('button', { name: 'Save profile' }).click();

  await expect(page.getByText('Enter a name for this demo profile.')).toBeVisible();
  await expect(page.getByText(/Enter an email in a valid format/)).toBeVisible();
  await expect(page.getByText(/Enter 10–15 digits/)).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: 'correct the highlighted fields' }),
  ).toBeVisible();

  await name.fill('Taylor Demo');
  await email.fill('taylor@example.test');
  await phone.fill('');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Profile changes saved for this dashboard session only.',
  );

  await name.fill('Unsaved Draft');
  await page.getByRole('button', { name: 'Cancel changes' }).click();
  await expect(name).toHaveValue('Taylor Demo');
  await expect(page.getByRole('status')).toContainText('Unsaved changes were cancelled');

  await page.getByRole('link', { name: 'Back to overview' }).click();
  await expect(page.getByText('Taylor Demo', { exact: true })).toBeVisible();
  await expect(page.getByText('taylor@example.test', { exact: true }).first()).toBeVisible();
});

test('addresses support validation, add, edit, default selection and delete with session-only feedback', async ({
  page,
}) => {
  await page.goto('/dashboard/addresses');
  await expect(
    page.getByText('Fictional sample placeholder · not a real customer address.').first(),
  ).toBeVisible();
  await expect(page.getByText('Default demo address')).toHaveCount(1);

  await page.getByRole('button', { name: 'Set Sample Work as default address' }).click();
  const workAddress = page.locator('article').filter({ hasText: 'Sample Work' });
  await expect(workAddress.getByText('Default demo address')).toBeVisible();

  await page.getByRole('button', { name: 'Edit Sample Home address' }).click();
  await expect(page.getByRole('heading', { name: 'Edit demo address' })).toBeVisible();
  await page.getByLabel('Address line 1').fill('2 Updated Example Road');
  await page.getByRole('button', { name: 'Save address changes' }).click();
  const homeAddress = page.locator('article').filter({ hasText: 'Sample Home' });
  await expect(homeAddress).toContainText('2 Updated Example Road');

  await page.getByRole('button', { name: 'Delete Sample Work address' }).click();
  await page.getByRole('button', { name: 'Confirm delete Sample Work' }).click();
  await expect(workAddress).toHaveCount(0);
  await expect(homeAddress.getByText('Default demo address')).toBeVisible();

  await page.getByRole('button', { name: 'Delete Sample Home address' }).click();
  await page.getByRole('button', { name: 'Confirm delete Sample Home' }).click();
  await expect(page.getByRole('heading', { name: 'No demo addresses yet' })).toBeVisible();

  await page.getByRole('button', { name: 'Add an address' }).click();
  await page.getByRole('button', { name: 'Save address' }).click();
  await expect(page.getByText('Add a short label for this demo address.')).toBeVisible();
  await expect(page.getByText('Enter six digits for the sample postal-code format.')).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: 'six-digit postal-code format' }),
  ).toBeVisible();

  await page.getByLabel('Address label').fill('Fictional studio');
  await page.getByLabel('Type').selectOption('Other');
  await page.getByLabel('Address line 1').fill('3 Imaginary Row');
  await page.getByLabel('Address line 2 (optional)').fill('Made-up Block C');
  await page.getByLabel('City or town').fill('Pune');
  await page.getByLabel('State or region').fill('Maharashtra');
  await page.getByLabel('Postal code').fill('000000');
  await page.getByRole('button', { name: 'Save address' }).click();

  const newAddress = page.locator('article').filter({ hasText: 'Fictional studio' });
  await expect(newAddress).toContainText('Fictional studio');
  await expect(newAddress.getByText('Other')).toBeVisible();
  await expect(newAddress.getByText('Default demo address')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('saved in this dashboard session only');
});

test('HomePassport opens sample appliance service and parts records', async ({ page }) => {
  await page.goto('/dashboard/homepassport');
  await expect(page.getByRole('heading', { name: 'No real appliances are saved' })).toBeVisible();
  await page.getByText('View sample service and parts history').first().click();
  await expect(page.getByText('Service history · sample').first()).toBeVisible();
  await expect(page.getByText('Parts replaced · sample').first()).toBeVisible();
  await expect(page.getByText(/ExampleAir|SampleCool/).first()).toBeVisible();
});

test('warranty cards show active and expired sample-date states with a coverage disclaimer', async ({
  page,
}) => {
  await page.goto('/dashboard/warranties');
  await expect(
    page.getByRole('heading', { name: 'No live warranty records are connected' }),
  ).toBeVisible();
  await expect(page.getByText('Active sample dates')).toBeVisible();
  await expect(page.getByText('Expired sample dates')).toBeVisible();
  await expect(
    page.getByText(/do not promise that any product or repair is covered/i),
  ).toBeVisible();
});

test('mobile dashboard drawer is keyboard-operable and navigates between sections', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');

  const openButton = page.getByRole('button', { name: 'Open dashboard navigation' });
  await openButton.click();
  const mobileNavigation = page.getByRole('navigation', { name: 'Customer dashboard mobile' });
  await expect(mobileNavigation).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Close dashboard navigation' }).first(),
  ).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Escape');
  await expect(mobileNavigation).toBeHidden();
  await expect(openButton).toBeFocused();

  await openButton.click();
  await mobileNavigation.getByRole('link', { name: 'Warranties' }).click();
  await expect(page).toHaveURL(/\/dashboard\/warranties$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Keep the terms alongside the record.' }),
  ).toBeVisible();
  await expect(mobileNavigation).toBeHidden();
});

test('dashboard respects reduced motion while keeping its navigation and content available', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard');

  expect(
    await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  ).toBe(true);
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Demo.' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open dashboard navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Customer dashboard mobile' })).toBeVisible();
});
