import { test, expect } from '@playwright/test';

test.describe('Media page', () => {
  test('shows seeded photos by default and lets you open a lightbox', async ({ page }) => {
    await page.goto('/media');

    await expect(page.getByAltText('Kelso performing live on stage')).toBeVisible();
    await expect(page.getByAltText('Backstage before a show')).toBeVisible();

    await page.getByAltText('Kelso performing live on stage').click();
    // Lightbox renders a second, larger copy of the same image
    await expect(page.getByAltText('Kelso performing live on stage')).toHaveCount(2);
  });

  test('switches to the videos tab and embeds the seeded YouTube videos', async ({ page }) => {
    await page.goto('/media');

    await page.getByRole('button', { name: /videos/i }).click();
    await expect(page.getByText('Live at The Aggie')).toBeVisible();
    await expect(page.locator('iframe[src*="dQw4w9WgXcQ"]').first()).toBeVisible();
  });
});
