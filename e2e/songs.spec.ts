import { test, expect } from '@playwright/test';

test.describe('Song list page', () => {
  test('searches the real static song list and narrows results', async ({ page }) => {
    await page.goto('/songs');

    await expect(page.getByText(/Showing \d+ of \d+ songs/)).toBeVisible();

    const searchBox = page.getByPlaceholder(/search by song title or artist/i);
    await searchBox.fill('Die a Happy Man');
    await expect(page.getByText('Die a Happy Man')).toBeVisible();
    await expect(page.getByText('Showing 1 of')).toBeVisible();
  });

  test('shows an empty state for a query that matches nothing', async ({ page }) => {
    await page.goto('/songs');
    await page.getByPlaceholder(/search by song title or artist/i).fill('zzzznonexistentsongzzzz');
    await expect(page.getByText('No Songs Found')).toBeVisible();
  });
});
