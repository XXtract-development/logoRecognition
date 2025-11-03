import { test, expect } from '@playwright/test';

test.describe('Recognition Workflow', () => {
  test('complete recognition workflow', async ({ page }) => {
    await page.goto('/recognize');

    // Upload test
    const uploadArea = page.locator('[data-testid="image-uploader"]');
    await expect(uploadArea).toBeVisible();

    // Check accessibility
    await expect(page).toHaveTitle(/Logo Recognition/);

    // Verify UI elements
    await expect(page.locator('[data-testid="results-display"]')).toBeVisible();
  });

  test('accessibility compliance', async ({ page }) => {
    await page.goto('/recognize');

    // Check for ARIA labels
    const mainContent = page.locator('[role="main"]');
    await expect(mainContent).toBeVisible();
  });

  test('keyboard navigation', async ({ page }) => {
    await page.goto('/recognize');

    // Tab navigation
    await page.keyboard.press('Tab');
    const focusedElement = await page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('dark mode toggle', async ({ page }) => {
    await page.goto('/recognize');

    const themeToggle = page.locator('[data-testid="theme-toggle"]');
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      await page.waitForTimeout(500);
    }
  });

  test('responsive design', async ({ page }) => {
    const viewports = [
      { width: 320, height: 568 },
      { width: 768, height: 1024 },
      { width: 1920, height: 1080 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('/recognize');

      const container = page.locator('.recognition-container');
      await expect(container).toBeVisible();
    }
  });
});
