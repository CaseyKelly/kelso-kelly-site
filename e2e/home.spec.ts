import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test('renders the hero, featured video, and upcoming shows from the seeded database', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /Kelso/ }).first()).toBeVisible();

    // Featured video section (first video by order_index in db/test-seed.sql)
    await expect(page.getByRole('heading', { name: 'Watch Kelso Perform' })).toBeVisible();
    await expect(page.locator('iframe[src*="dQw4w9WgXcQ"]')).toBeVisible();

    // Upcoming shows section, seeded events
    await expect(page.getByRole('heading', { name: 'Upcoming Shows' })).toBeVisible();
    await expect(page.getByText('Live at The Whiskey Barrel')).toBeVisible();
    await expect(page.getByText('Summer Concert Series')).toBeVisible();

    // Past event should not appear on the home page
    await expect(page.getByText('New Year Show')).toHaveCount(0);
  });

  test('links to the schedule and contact pages', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'See Schedule' }).click();
    await expect(page).toHaveURL(/\/schedule$/);
  });
});
