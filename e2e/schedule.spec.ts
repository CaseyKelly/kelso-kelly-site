import { test, expect } from '@playwright/test';

test.describe('Schedule page', () => {
  test('lists upcoming shows and past shows separately from the seeded database', async ({ page }) => {
    await page.goto('/schedule');

    await expect(page.getByRole('heading', { name: 'Upcoming Shows' })).toBeVisible();
    await expect(page.getByText('Live at The Whiskey Barrel')).toBeVisible();
    await expect(page.getByText('Summer Concert Series')).toBeVisible();
    // Exact match: the venue name ("The Whiskey Barrel") also appears as a
    // substring of the event title heading above, which would otherwise make
    // this locator ambiguous.
    await expect(page.getByText('The Whiskey Barrel', { exact: true })).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Past Shows' })).toBeVisible();
    await expect(page.getByText('New Year Show')).toBeVisible();
  });

  test('shows a ticket link for an upcoming event that has one', async ({ page }) => {
    await page.goto('/schedule');
    await expect(page.getByRole('link', { name: /Get Tickets/i }).first()).toBeVisible();
  });
});
