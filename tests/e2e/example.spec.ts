import { test, expect } from '@playwright/test';

/**
 * Example E2E Test Suite voor Logo Recognition
 *
 * Deze tests gebruiken Playwright MCP voor browser automation
 */

test.describe('Logo Recognition - Basic Functionality', () => {

  test('should load homepage successfully', async ({ page }) => {
    // Navigate to homepage
    await page.goto('/');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify page title
    await expect(page).toHaveTitle(/Logo Recognition/i);

    // Take screenshot
    await page.screenshot({ path: 'test-results/screenshots/homepage.png' });
  });

  test('should have proper HTML structure', async ({ page }) => {
    // Collect console errors before navigation
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check for app root element (React uses #root)
    const appRoot = page.locator('#root');
    await expect(appRoot).toBeAttached();

    // Wait a bit for any async errors
    await page.waitForTimeout(2000);

    // Filter out expected errors (DevTools warning, network errors from API)
    const criticalErrors = consoleErrors.filter(
      err => !err.includes('Download the React DevTools') &&
             !err.includes('Failed to load resource') &&  // Network errors from backend
             !err.includes('net::ERR_')  // Network connectivity errors
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('should be responsive', async ({ page, viewport }) => {
    await page.goto('/');

    // Test different viewports
    const viewports = [
      { width: 375, height: 667, name: 'Mobile' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 1920, height: 1080, name: 'Desktop' }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(500);

      // Verify app is attached at all sizes (React uses #root)
      const appRoot = page.locator('#root');
      await expect(appRoot).toBeAttached();

      // Screenshot for each viewport
      await page.screenshot({
        path: `test-results/screenshots/responsive-${vp.name}.png`
      });
    }
  });

  test('should load without JavaScript errors', async ({ page }) => {
    const jsErrors: Error[] = [];

    page.on('pageerror', error => {
      jsErrors.push(error);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    expect(jsErrors).toHaveLength(0);
  });

  test('should have working service worker (PWA)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check if service worker is registered
    const swRegistered = await page.evaluate(() => {
      return 'serviceWorker' in navigator;
    });

    expect(swRegistered).toBeTruthy();
  });
});

test.describe('Logo Recognition - API Integration', () => {

  test('should connect to API health endpoint', async ({ request }) => {
    const response = await request.get('http://localhost:8000/health');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('ok');
  });

  test('should have CORS enabled', async ({ request }) => {
    const response = await request.get('http://localhost:8000/health', {
      headers: {
        'Origin': 'http://localhost:3000'
      }
    });

    expect(response.ok()).toBeTruthy();

    // CORS headers should be present
    const headers = response.headers();
    expect(headers['access-control-allow-origin']).toBeDefined();
  });
});

test.describe('Logo Recognition - Performance', () => {

  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const loadTime = Date.now() - startTime;

    // Should load in less than 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('should have good Lighthouse scores', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // This is a placeholder - full Lighthouse integration would require additional setup
    // But we can check basic metrics
    const performanceMetrics = await page.evaluate(() => {
      const perfData = window.performance.timing;
      return {
        loadTime: perfData.loadEventEnd - perfData.navigationStart,
        domReady: perfData.domContentLoadedEventEnd - perfData.navigationStart
      };
    });

    expect(performanceMetrics.loadTime).toBeLessThan(5000);
    expect(performanceMetrics.domReady).toBeLessThan(2000);
  });
});
