import { expect, test } from '@playwright/test';

const technicianRoutes = [
  { path: '/technician', heading: 'Welcome, Rohan.', navigationLabel: 'Overview' },
  {
    path: '/technician/profile',
    heading: 'Set up a professional profile preview.',
    navigationLabel: 'Profile',
  },
  {
    path: '/technician/services',
    heading: 'Choose the services to show in this demo.',
    navigationLabel: 'Services & skills',
  },
  {
    path: '/technician/coverage',
    heading: 'Choose broad Pune service zones.',
    navigationLabel: 'Service coverage',
  },
  {
    path: '/technician/availability',
    heading: 'Set a weekly availability preview.',
    navigationLabel: 'Availability',
  },
  {
    path: '/technician/jobs',
    heading: 'A work history example, not a job feed.',
    navigationLabel: 'Work history',
  },
  {
    path: '/technician/earnings',
    heading: 'Illustrative values, never a payout balance.',
    navigationLabel: 'Earnings overview',
  },
  {
    path: '/technician/verification',
    heading: 'A preview of future verification stages.',
    navigationLabel: 'Verification stages',
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

for (const route of technicianRoutes) {
  test(`${route.path} renders its route, the demo notice and active workspace link`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(route.path);

    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
    await expect(page.getByRole('note').first()).toContainText(
      'Technician dashboard · demonstration only',
    );
    await expect(page.getByRole('navigation', { name: 'Technician dashboard' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();

    const activeLink = page
      .getByRole('navigation', { name: 'Technician dashboard' })
      .getByRole('link', { name: route.navigationLabel, exact: true });
    await expect(activeLink).toBeVisible();
    await expect(activeLink).toHaveAttribute('aria-current', 'page');
  });
}

for (const viewport of responsiveViewports) {
  for (const route of technicianRoutes) {
    test(`${route.path} fits ${viewport.name} without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
      await expectNoHorizontalOverflow(page, `${route.path} at ${viewport.name}`);
    });
  }
}

test('profile validates sample fields, saves, cancels, and shares session state with overview', async ({
  page,
}) => {
  await page.goto('/technician/profile');

  const name = page.getByLabel('Full name');
  const email = page.getByLabel('Email address');
  const phone = page.getByLabel('Phone number (fictional sample)');
  const experience = page.getByLabel('Total years of experience (example)');
  const description = page.getByLabel('Professional description');

  await name.fill('  ');
  await email.fill('not-an-email');
  await phone.fill('12');
  await experience.fill('61');
  await description.fill('Too short.');
  await page.getByRole('button', { name: 'Save profile' }).click();

  await expect(page.getByText('Enter a fictional name for this sample profile.')).toBeVisible();
  await expect(page.getByText(/Enter an email in a valid format/)).toBeVisible();
  await expect(page.getByText(/Enter 10–15 digits/)).toBeVisible();
  await expect(page.getByText('Enter a whole number from 0 to 60 for this demo.')).toBeVisible();
  await expect(
    page.getByText('Add at least 30 characters to the sample description.'),
  ).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: 'correct the highlighted fields' }),
  ).toBeVisible();

  await name.fill('Asha Sample');
  await email.fill('asha@example.test');
  await phone.fill('');
  await experience.fill('3');
  await description.fill(
    'A fictional technician profile description for layout testing only, with no claims about a real person.',
  );
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Fictional profile changes saved in this browser session only.',
  );

  await name.fill('Unsaved Draft');
  await page.getByRole('button', { name: 'Cancel changes' }).click();
  await expect(name).toHaveValue('Asha Sample');
  await expect(page.getByRole('status')).toContainText('Unsaved profile changes were cancelled');

  await page
    .getByRole('navigation', { name: 'Technician dashboard' })
    .getByRole('link', { name: 'Overview', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Asha.' })).toBeVisible();
  await expect(
    page.getByText('asha@example.test · fictional contact', { exact: true }),
  ).toBeVisible();
});

test('service categories and example experience fields can be validated, saved, and reset', async ({
  page,
}) => {
  await page.goto('/technician/services');

  const ac = page.getByRole('checkbox', { name: 'AC repair' });
  const plumbing = page.getByRole('checkbox', { name: 'Plumbing services' });
  await expect(ac).toBeChecked();
  await expect(plumbing).not.toBeChecked();

  await ac.uncheck();
  await plumbing.check();
  const plumbingExperience = page.getByLabel('Years of experience for Plumbing services (example)');
  await plumbingExperience.fill('');
  await page.getByRole('button', { name: 'Save service selections' }).click();
  await expect(
    page.getByText('Enter a whole number from 0 to 60 for this fictional category.'),
  ).toBeVisible();

  await plumbingExperience.fill('2');
  await page.getByRole('button', { name: 'Save service selections' }).click();
  await expect(page.getByRole('status')).toContainText('saved in this browser session only');
  await expect(page.getByRole('status')).toContainText('not verified skills');

  await plumbing.uncheck();
  await page.getByRole('button', { name: 'Reset changes' }).click();
  await expect(plumbing).toBeChecked();

  await page
    .getByRole('navigation', { name: 'Technician dashboard' })
    .getByRole('link', { name: 'Overview', exact: true })
    .click();
  const selectedSummary = page.getByRole('region', { name: 'Selected service categories' });
  await expect(selectedSummary).toContainText('Plumbing services');
  await expect(selectedSummary).not.toContainText('AC repair');
});

test('coverage zones support add, remove, empty, save and reset interactions', async ({ page }) => {
  await page.goto('/technician/coverage');

  await page.getByRole('button', { name: 'Remove Central Pune cluster' }).click();
  await page.getByRole('button', { name: 'Remove West Pune cluster' }).click();
  await expect(page.getByRole('heading', { name: 'No sample zones selected' })).toBeVisible();

  await page.getByLabel('Choose a Pune demo zone').selectOption('East Pune cluster');
  await page.getByRole('button', { name: 'Add zone' }).click();
  const zoneCard = page.getByRole('list').filter({ hasText: 'East Pune cluster' }).first();
  await expect(zoneCard).toContainText('East Pune cluster');
  await page.getByRole('button', { name: 'Save coverage zones' }).click();
  await expect(page.getByRole('status')).toContainText('saved in this browser session only');

  await page.getByRole('button', { name: 'Remove East Pune cluster' }).click();
  await page.getByRole('button', { name: 'Reset changes' }).click();
  await expect(page.getByRole('button', { name: 'Remove East Pune cluster' })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Technician dashboard' })
    .getByRole('link', { name: 'Overview', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Pune coverage preview' }).getByText('East Pune cluster', {
      exact: true,
    }),
  ).toBeVisible();
});

test('weekly availability supports day toggles, time validation, save and reset', async ({
  page,
}) => {
  await page.goto('/technician/availability');

  const sunday = page.getByRole('checkbox', { name: 'Available Sunday in sample schedule' });
  await expect(sunday).not.toBeChecked();
  await sunday.check();

  const mondayStart = page.getByLabel('Monday start time');
  await mondayStart.fill('18:00');
  await page.getByRole('button', { name: 'Save weekly preview' }).click();
  await expect(
    page.getByText('Choose a valid start time earlier than the end time.'),
  ).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Each available day needs a valid start time' }),
  ).toBeVisible();

  await mondayStart.fill('08:30');
  await page.getByRole('button', { name: 'Save weekly preview' }).click();
  await expect(page.getByRole('status')).toContainText('This is not live availability');
  await expect(sunday).toBeChecked();

  await sunday.uncheck();
  await page.getByRole('button', { name: 'Reset changes' }).click();
  await expect(sunday).toBeChecked();

  await page
    .getByRole('navigation', { name: 'Technician dashboard' })
    .getByRole('link', { name: 'Overview', exact: true })
    .click();
  await expect(page.getByText('7 sample days', { exact: true })).toBeVisible();
});

test('work history shows illustrative completed and cancelled cards with expandable details', async ({
  page,
}) => {
  await page.goto('/technician/jobs');
  await expect(
    page.getByRole('heading', { name: 'No live work history is connected' }),
  ).toBeVisible();
  await expect(page.getByText('Completed · demo').first()).toBeVisible();
  await expect(page.getByText('Cancelled · demo')).toBeVisible();

  await page.locator('details').first().locator('summary').click();
  await expect(page.getByText('DEMO-JOB-021', { exact: false }).last()).toBeVisible();
  await expect(
    page.getByText(/No customer identity or contact details are available/).first(),
  ).toBeVisible();
});

test('earnings view presents fictional amounts and an accessible chart without payments', async ({
  page,
}) => {
  await page.goto('/technician/earnings');
  await expect(page.getByText('₹6,450', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole('img', { name: /Fictional monthly completed-job values in Indian rupees/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No live earnings or payments are connected' }),
  ).toBeVisible();
  await expect(page.getByRole('note').last()).toContainText('Every rupee amount is fictional');
  await expect(page.getByText('Not connected in this preview')).toBeVisible();
});

test('verification page shows all future stages without collecting identity documents', async ({
  page,
}) => {
  await page.goto('/technician/verification');
  await expect(
    page.getByRole('heading', { name: 'No identity documents are collected' }),
  ).toBeVisible();
  for (const title of [
    'Profile information',
    'Skills information',
    'Identity verification',
    'Document review',
    'Approval status',
  ]) {
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText('Not available in preview')).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});

test('mobile technician navigation is keyboard-operable and navigates between sections', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/technician');

  const openButton = page.getByRole('button', { name: 'Open technician navigation' });
  await openButton.click();
  const mobileNavigation = page.getByRole('navigation', { name: 'Technician dashboard mobile' });
  await expect(mobileNavigation).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Close technician navigation' }).first(),
  ).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Escape');
  await expect(mobileNavigation).toBeHidden();
  await expect(openButton).toBeFocused();

  await openButton.click();
  await mobileNavigation.getByRole('link', { name: 'Verification stages' }).click();
  await expect(page).toHaveURL(/\/technician\/verification$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'A preview of future verification stages.' }),
  ).toBeVisible();
  await expect(mobileNavigation).toBeHidden();
});

test('technician pages respect reduced motion and keep the mobile menu available', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/technician');

  expect(
    await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  ).toBe(true);
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Rohan.' })).toBeVisible();

  await page.getByRole('button', { name: 'Open technician navigation' }).click();
  const mobileNavigation = page.getByRole('navigation', { name: 'Technician dashboard mobile' });
  await expect(mobileNavigation).toBeVisible();
  const drawer = page.locator('#technician-mobile-navigation').locator('xpath=ancestor::aside[1]');
  const transitionDuration = await drawer.evaluate((element) =>
    Number.parseFloat(window.getComputedStyle(element).transitionDuration.split(',')[0] ?? '0'),
  );
  expect(transitionDuration).toBeLessThanOrEqual(0.02);
});

test('homepage provides a clearly labeled entry to the technician demo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Preview the technician dashboard demo' }).click();
  await expect(page).toHaveURL(/\/technician$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Rohan.' })).toBeVisible();
});
