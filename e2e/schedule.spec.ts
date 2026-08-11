import { test, expect } from '@playwright/test';

test.describe('Schedule page', () => {
  test('lists upcoming shows and past shows separately from the seeded database', async ({ page }) => {
    await page.goto('/schedule');

    await expect(page.getByRole('heading', { name: 'Upcoming Shows' })).toBeVisible();
    await expect(page.getByText('Live at The Whiskey Barrel')).toBeVisible();
    await expect(page.getByText('Summer Concert Series')).toBeVisible();
    await expect(page.getByText('The Whiskey Barrel')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Past Shows' })).toBeVisible();
    await expect(page.getByText('New Year Show')).toBeVisible();
  });

  test('shows a ticket link for an upcoming event that has one', async ({ page }) => {
    await page.goto('/schedule');
    await expect(page.getByRole('link', { name: /Get Tickets/i }).first()).toBeVisible();
  });
});
