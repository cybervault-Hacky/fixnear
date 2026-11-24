import { expect, test } from '@playwright/test';

const responsiveViewports = [
  { name: 'small Android', width: 320, height: 740 },
  { name: 'standard mobile', width: 390, height: 844 },
  { name: 'large mobile', width: 430, height: 932 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'large desktop', width: 1440, height: 1000 },
] as const;

for (const viewport of responsiveViewports) {
  test(`homepage fits ${viewport.name} without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Home repairs. Without the guesswork.' }),
    ).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));

    expect(dimensions.documentWidth, `${viewport.name}: document overflow`).toBeLessThanOrEqual(
      dimensions.viewportWidth + 1,
    );
    expect(dimensions.bodyWidth, `${viewport.name}: body overflow`).toBeLessThanOrEqual(
      dimensions.viewportWidth + 1,
    );
  });
}

test('reduced-motion users see revealed content without animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  for (const sectionId of ['pricelock', 'homepassport', 'how-it-works']) {
    const reveal = page.locator(`#${sectionId} div[style*="opacity"]`).first();
    await reveal.scrollIntoViewIfNeeded();
    await expect(reveal).toHaveCSS('opacity', '1');
  }
});

test('mobile menu toggles, closes on Escape, and closes after section selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const openButton = page.getByRole('button', { name: 'Open navigation menu' });
  await openButton.click();
  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(mobileNavigation).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close navigation menu' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  await page.getByRole('button', { name: 'Close navigation menu' }).click();
  await expect(mobileNavigation).toBeHidden();
  await expect(openButton).toHaveAttribute('aria-expanded', 'false');

  await openButton.click();
  await page.keyboard.press('Escape');
  await expect(mobileNavigation).toBeHidden();
  await expect(openButton).toBeFocused();

  await openButton.click();
  await mobileNavigation.getByRole('link', { name: 'Services' }).click();
  await expect(page).toHaveURL(/#services$/);
  await expect(mobileNavigation).toBeHidden();
});

test('search filters local service categories without implying live availability', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('Checking the active service catalog…')).toHaveCount(0);

  await page.getByLabel('What needs fixing?').fill('AC repair');
  await page.getByLabel('Your area').fill('Baner, Pune');
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Choose AC repair' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose Plumbing' })).toHaveCount(0);
  await expect(page.getByRole('status').first()).toContainText(
    'This preview does not show technician availability.',
  );
});

test('preview actions explain that account and technician registration are not active', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  await page
    .getByRole('button', { name: /Log in/ })
    .first()
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Customer accounts are not available in this preview.' }),
  ).toBeVisible();

  await page.getByRole('button', { name: /Join as a technician/ }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Technician sign-up is not open in this preview.' }),
  ).toBeVisible();
});
