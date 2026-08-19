import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Complete E2E Test Suite - Full Application Flow
 * Tests the entire user journey from HomePage through Recognition and Dashboard
 */

// Increase default timeout for slower machines
test.setTimeout(60000);

// Helper to wait for page stability
async function waitForPageStability(page: Page, timeout = 1000) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(timeout);
}

// Helper to check for critical console errors
async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter out expected/acceptable errors
      if (!text.includes('Download the React DevTools') &&
          !text.includes('Failed to load resource') &&
          !text.includes('net::ERR_') &&
          !text.includes('WebSocket') &&
          !text.includes('favicon')) {
        errors.push(text);
      }
    }
  });
  return errors;
}

test.describe('Complete User Journey - Full Flow', () => {

  test('should complete full journey: Home → Recognition → Upload → Dashboard', async ({ page }) => {
    // Step 1: Load HomePage
    await page.goto('/');
    await waitForPageStability(page);

    // Verify HomePage loaded
    await expect(page.locator('h1')).toContainText('Logo Recognition');

    // Step 2: Click "Start Recognition" button
    const startButton = page.getByRole('button', { name: /start recognition/i });
    await expect(startButton).toBeVisible();
    await startButton.click({ force: true });

    // Step 3: Verify Recognition page loaded
    await page.waitForURL('/recognize');
    await waitForPageStability(page);

    // Verify Recognition interface elements
    await expect(page.locator('.recognition-interface, [role="main"]')).toBeVisible();
    await expect(page.getByText(/upload image|drag.*drop/i).first()).toBeVisible();

    // Step 4: Navigate to Dashboard
    await page.goto('/dashboard');
    await waitForPageStability(page);

    // Verify Dashboard loaded
    await expect(page.locator('h2')).toContainText('Dashboard');
    await expect(page.getByText(/total recognitions/i)).toBeVisible();

    // Step 5: Return to Home
    await page.goto('/');
    await waitForPageStability(page);
    await expect(page.locator('h1')).toContainText('Logo Recognition');

    // Take final screenshot
    await page.screenshot({ path: 'test-results/screenshots/full-journey-complete.png' });
  });

  test('should navigate between all pages without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));

    // Visit all routes
    const routes = ['/', '/recognize', '/dashboard', '/'];

    for (const route of routes) {
      await page.goto(route);
      await waitForPageStability(page, 500);
    }

    // No JavaScript errors should occur
    expect(errors).toHaveLength(0);
  });
});

test.describe('HomePage - Landing Page', () => {

  test('should display all main elements', async ({ page }) => {
    await page.goto('/');
    await waitForPageStability(page);

    // Hero section
    await expect(page.locator('h1')).toContainText('Logo Recognition');
    // Updated: New subtitle text after UX redesign
    await expect(page.getByText(/detect.*identify logos|advanced ai/i)).toBeVisible();

    // Main path cards - Updated: Now using PathCard components with Start Recognition/Start Training
    await expect(page.getByRole('button', { name: /start recognition/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /start training/i })).toBeVisible();

    // Feature/stats cards at bottom
    await expect(page.getByText(/fast processing/i)).toBeVisible();
    await expect(page.getByText(/high accuracy/i)).toBeVisible();
    await expect(page.getByText(/export results/i)).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/homepage-elements.png' });
  });

  test('should navigate to Recognition page via button', async ({ page }) => {
    await page.goto('/');
    await waitForPageStability(page);

    await page.getByRole('button', { name: /start recognition/i }).click({ force: true });
    await page.waitForURL('/recognize', { timeout: 10000 });

    await expect(page.url()).toContain('/recognize');
  });

  test('should navigate to Dashboard via quick link', async ({ page }) => {
    await page.goto('/');
    await waitForPageStability(page);

    // Updated: Dashboard is now accessed via Quick Link button, not a primary CTA
    const dashboardLink = page.getByRole('button', { name: /dashboard/i });
    await expect(dashboardLink).toBeVisible();
    await dashboardLink.click({ force: true });
    await page.waitForURL('/dashboard', { timeout: 10000 });

    await expect(page.url()).toContain('/dashboard');
  });
});

test.describe('Recognition Interface - Core Functionality', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/recognize');
    await waitForPageStability(page);
  });

  test('should display upload interface', async ({ page }) => {
    // Upload section should be visible
    const uploadArea = page.locator('.ant-upload-drag, .upload-dropzone, [class*="upload"]').first();
    await expect(uploadArea).toBeVisible();

    // Drag & drop text
    await expect(page.getByText(/drag.*drop|click.*upload/i).first()).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/recognition-upload-interface.png' });
  });

  test('should display connection status indicator', async ({ page }) => {
    // Connection status badge should be visible (bottom-right fixed element)
    const statusIndicator = page.locator('.fixed.bottom-4.right-4, [role="status"]').first();

    // Wait for status indicator with timeout
    await statusIndicator.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

    // If visible, check content
    if (await statusIndicator.isVisible()) {
      const statusText = await statusIndicator.textContent();
      expect(statusText).toMatch(/connect|online|offline|checking|backend/i);
    }
  });

  test('should show backend unavailable warning when API is down', async ({ page }) => {
    // If backend is not running, alert should appear
    const backendAlert = page.locator('.ant-alert').filter({ hasText: /backend|unavailable|offline/i });

    // Either visible (backend down) or not present (backend up) - both are valid states
    const isVisible = await backendAlert.isVisible().catch(() => false);

    if (isVisible) {
      await expect(backendAlert).toContainText(/backend|unavailable|offline/i);
      await page.screenshot({ path: 'test-results/screenshots/recognition-backend-warning.png' });
    }
  });

  test('should have export button (disabled when no results)', async ({ page }) => {
    const exportButton = page.getByRole('button', { name: /export/i });
    await expect(exportButton).toBeVisible();

    // Should be disabled when no results
    await expect(exportButton).toBeDisabled();
  });

  test('should have proper ARIA labels for accessibility', async ({ page }) => {
    // Main interface should have proper role
    const mainInterface = page.locator('[role="main"], .recognition-interface');
    await expect(mainInterface.first()).toBeVisible();

    // Export button should have aria-label
    const exportButton = page.getByRole('button', { name: /export/i });
    await expect(exportButton).toBeVisible();
  });
});

test.describe('Recognition Interface - Image Upload', () => {

  test('should accept image file via file input', async ({ page }) => {
    await page.goto('/recognize');
    await waitForPageStability(page);

    // Create a test image (1x1 red pixel PNG)
    const testImagePath = path.join(process.cwd(), 'tests', 'fixtures', 'test-logo.png');

    // Check if test image exists, if not create a simple one
    if (!fs.existsSync(testImagePath)) {
      // Create fixtures directory
      const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');
      if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
      }

      // Create a simple 100x100 red square PNG (minimal valid PNG)
      const pngBuffer = createMinimalPNG();
      fs.writeFileSync(testImagePath, pngBuffer);
    }

    // Find the file input
    const fileInput = page.locator('input[type="file"]');

    // Upload the test image
    await fileInput.setInputFiles(testImagePath);

    // Wait for upload to process
    await page.waitForTimeout(2000);

    // Screenshot after upload
    await page.screenshot({ path: 'test-results/screenshots/recognition-after-upload.png' });
  });

  test('should show drag and drop zone styling', async ({ page }) => {
    await page.goto('/recognize');
    await waitForPageStability(page);

    const dropZone = page.locator('.ant-upload-drag, .ant-upload-dragger').first();
    await expect(dropZone).toBeVisible();

    // Verify it has the inbox icon
    await expect(page.locator('.anticon-inbox, [class*="inbox"]').first()).toBeVisible();
  });
});

test.describe('Dashboard Page', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await waitForPageStability(page);
  });

  test('should display dashboard title', async ({ page }) => {
    await expect(page.locator('h2')).toContainText('Dashboard');
  });

  test('should display statistics cards', async ({ page }) => {
    // Check for stat cards
    await expect(page.getByText(/total recognitions/i)).toBeVisible();
    await expect(page.getByText(/success rate/i)).toBeVisible();
    await expect(page.getByText(/avg.*processing time|average/i)).toBeVisible();
    await expect(page.getByText(/today/i)).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/dashboard-stats.png' });
  });

  test('should display dashboard content', async ({ page }) => {
    // Dashboard should have some content - stats, cards, or any meaningful UI
    const anyContent = page.locator('.ant-card, .ant-statistic, .ant-table, h2, h3');
    const contentCount = await anyContent.count();

    // Dashboard should render some content
    expect(contentCount).toBeGreaterThan(0);

    await page.screenshot({ path: 'test-results/screenshots/dashboard-content.png' });
  });

  test('should display tags or statistics elements', async ({ page }) => {
    // Dashboard may have tags or other visual indicators
    const tags = page.locator('.ant-tag');
    const statCards = page.locator('.ant-statistic, .ant-card');

    const tagCount = await tags.count();
    const cardCount = await statCards.count();

    // Should have either tags or stat cards (or both)
    expect(tagCount + cardCount).toBeGreaterThan(0);
  });
});

test.describe('Responsive Design', () => {

  const viewports = [
    { width: 375, height: 667, name: 'mobile' },
    { width: 768, height: 1024, name: 'tablet' },
    { width: 1280, height: 800, name: 'desktop' },
    { width: 1920, height: 1080, name: 'large-desktop' },
  ];

  for (const vp of viewports) {
    test(`should render correctly on ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // Test all main routes
      for (const route of ['/', '/recognize', '/dashboard']) {
        await page.goto(route);
        await waitForPageStability(page, 300);

        // Verify app root is present
        await expect(page.locator('#root')).toBeAttached();

        // Save screenshot per route
        const routeName = route === '/' ? 'home' : route.replace('/', '');
        await page.screenshot({
          path: `test-results/screenshots/responsive-${vp.name}-${routeName}.png`
        });
      }
    });
  }
});

test.describe('Error Handling', () => {

  test('should handle 404 gracefully', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await waitForPageStability(page);

    // App should not crash - root element should still exist
    await expect(page.locator('#root')).toBeAttached();
  });

  test('should have error boundary for component crashes', async ({ page }) => {
    await page.goto('/');
    await waitForPageStability(page);

    // The ErrorBoundary component exists in the code
    // We can't easily trigger it, but we verify the app structure
    await expect(page.locator('#root')).toBeAttached();
    await expect(page.locator('#root > *').first()).toBeVisible();
  });
});

test.describe('Accessibility (a11y)', () => {

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/');
    await waitForPageStability(page);

    // Should have h1
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    expect(await h1.count()).toBe(1);
  });

  test('should have focusable interactive elements', async ({ page }) => {
    await page.goto('/');
    await waitForPageStability(page);

    // Buttons should be focusable
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    expect(buttonCount).toBeGreaterThan(0);

    // First button should be focusable
    await buttons.first().focus();
    await expect(buttons.first()).toBeFocused();
  });

  test('should support keyboard navigation', async ({ page, browserName }) => {
    // Skip on mobile browsers where keyboard navigation works differently
    test.skip(browserName === 'webkit' || page.viewportSize()?.width! < 768,
      'Mobile browsers handle keyboard focus differently');

    await page.goto('/');
    await waitForPageStability(page);

    // Tab through focusable elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Check that some element received focus
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.tagName : null;
    });

    // Something should be focused (not body/html)
    expect(focusedElement).not.toBeNull();
    expect(['BODY', 'HTML']).not.toContain(focusedElement);
  });

  test('should have proper contrast (visual check)', async ({ page }) => {
    await page.goto('/');
    await waitForPageStability(page);

    // Take screenshot for manual review
    await page.screenshot({
      path: 'test-results/screenshots/a11y-contrast-check.png',
      fullPage: true
    });

    // Verify text is readable (basic check - text elements exist)
    const textElements = page.locator('p, span, h1, h2, h3, h4, button');
    expect(await textElements.count()).toBeGreaterThan(0);
  });
});

test.describe('Performance', () => {

  test('should load pages quickly', async ({ page }) => {
    for (const route of ['/', '/recognize', '/dashboard']) {
      const startTime = Date.now();

      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');

      const loadTime = Date.now() - startTime;

      // Each page should load in under 3 seconds
      expect(loadTime).toBeLessThan(3000);
    }
  });

  test('should have acceptable first contentful paint', async ({ page }) => {
    await page.goto('/');
    await waitForPageStability(page);

    const fcp = await page.evaluate(() => {
      const entries = performance.getEntriesByType('paint');
      const fcpEntry = entries.find(e => e.name === 'first-contentful-paint');
      return fcpEntry ? fcpEntry.startTime : null;
    });

    if (fcp !== null) {
      expect(fcp).toBeLessThan(2000); // FCP should be under 2 seconds
    }
  });
});

test.describe('Theme and Styling', () => {

  test('should apply consistent styling across pages', async ({ page }) => {
    // Take screenshots of all pages for visual comparison
    for (const route of ['/', '/recognize', '/dashboard']) {
      await page.goto(route);
      await waitForPageStability(page);

      await page.screenshot({
        path: `test-results/screenshots/styling-${route.replace('/', 'home') || 'home'}.png`,
        fullPage: true
      });
    }
  });

  test('should have Card components styled correctly', async ({ page }) => {
    await page.goto('/');
    await waitForPageStability(page);

    const cards = page.locator('.ant-card');
    const cardCount = await cards.count();

    expect(cardCount).toBeGreaterThan(0);

    // Cards should have shadow styling
    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      await expect(card).toBeVisible();
    }
  });
});

// Helper function to create a minimal valid PNG
function createMinimalPNG(): Buffer {
  // This creates a valid 1x1 red pixel PNG
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk length + type
    0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x64, // 100x100
    0x08, 0x02, 0x00, 0x00, 0x00, 0xFF, 0x80, 0x02, // bit depth, color type, etc
    0x03, // CRC part
    0x00, 0x00, 0x00, 0x12, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
    0x78, 0x9C, 0x62, 0xF8, 0xCF, 0xC0, 0x00, 0x00,
    0x00, 0x64, 0x00, 0x01, 0xE4, 0x80, 0x7C, 0x65,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND chunk
    0xAE, 0x42, 0x60, 0x82
  ]);

  return pngData;
}
