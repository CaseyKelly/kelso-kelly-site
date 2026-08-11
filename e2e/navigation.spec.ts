import { test, expect } from '@playwright/test';

test.describe('Header navigation', () => {
  test('navigates to every top-level page via the header', async ({ page }) => {
    await page.goto('/');

    const routes: Array<[name: string, path: string]> = [
      ['Photos & Videos', '/media'],
      ['Schedule', '/schedule'],
      ['Bio', '/bio'],
      ['Song List', '/songs'],
      ['Contact', '/contact'],
    ];

    for (const [name, path] of routes) {
      await page.getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
  });

  test('shows a mobile menu on small viewports', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');

    const desktopBioLink = page.getByRole('link', { name: 'Bio', exact: true });
    await expect(desktopBioLink).toBeHidden();

    await page.getByRole('button').first().click();
    await expect(page.getByRole('link', { name: 'Bio', exact: true })).toBeVisible();
  });
});
