/**
 * Models Page E2E Tests
 *
 * Tests for /models page — model management UI including:
 * - Page load and rendering
 * - Key UI elements (title, buttons, table/empty state)
 * - API endpoint validation
 *
 * Environment: ACC (BASE_URL=https://logo-detection.acc.xxtract.com)
 */

import { test, expect, APIRequestContext, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiBase(): string {
  return process.env.BASE_URL || 'http://localhost:5173';
}

async function isApiReachable(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(`${apiBase()}/health`);
    return res.ok();
  } catch {
    return false;
  }
}

async function waitForPageStability(page: Page, timeout = 1000) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(timeout);
}

// ---------------------------------------------------------------------------
// UI Tests — Models Page
// ---------------------------------------------------------------------------

test.describe('Models Page — UI', () => {
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/models');
    await waitForPageStability(page);
  });

  test('page loads without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/models');
    await waitForPageStability(page);

    // App root should be present
    await expect(page.locator('#root')).toBeAttached();

    // No critical JS errors
    expect(errors).toHaveLength(0);
  });

  test('shows Model Management title', async ({ page }) => {
    // The page uses t('models.title', 'Model Management') — check for either translation
    const title = page.locator('h2');
    await expect(title).toBeVisible();

    const titleText = await title.textContent();
    // Accept Dutch "Modelbeheer" or English "Model Management"
    expect(titleText).toMatch(/model\s*management|modelbeheer/i);
  });

  test('has Train New Model button', async ({ page }) => {
    // Button text: t('models.trainNew', 'Train New Model')
    const trainButton = page.getByRole('button', { name: /train new model|nieuw model trainen/i });
    await expect(trainButton).toBeVisible();
  });

  test('has Compare Models button', async ({ page }) => {
    // Button text: t('models.compare', 'Compare Models')
    const compareButton = page.getByRole('button', { name: /compare models|modellen vergelijken/i });
    await expect(compareButton).toBeVisible();
  });

  test('shows All Models section', async ({ page }) => {
    // Card title: t('models.allModels', 'All Models')
    const allModelsSection = page.getByText(/all models|alle modellen/i);
    await expect(allModelsSection).toBeVisible();
  });

  test('shows description text', async ({ page }) => {
    // t('models.description', 'View, compare, and manage trained logo detection models')
    const description = page.getByText(/view.*compare.*manage|bekijk.*vergelijk.*beheer/i);
    await expect(description).toBeVisible();
  });

  test('shows empty state or model table', async ({ page }) => {
    // Wait for loading to complete (Spin disappears)
    await page.waitForTimeout(2000);

    // Either the empty state or the table should be visible
    const emptyState = page.locator('.ant-empty');
    const table = page.locator('.ant-table');

    const hasEmpty = await emptyState.isVisible().catch(() => false);
    const hasTable = await table.isVisible().catch(() => false);

    // One of them must be present
    expect(hasEmpty || hasTable).toBeTruthy();
  });

  test('empty state shows correct message and Train First Model button', async ({ page }) => {
    await page.waitForTimeout(2000);

    const emptyState = page.locator('.ant-empty');
    const hasEmpty = await emptyState.isVisible().catch(() => false);

    if (hasEmpty) {
      // t('models.noModels', 'No models trained yet')
      const emptyText = page.getByText(/no models|geen modellen/i);
      await expect(emptyText).toBeVisible();

      // t('models.trainFirst', 'Train First Model')
      const trainFirstButton = page.getByRole('button', { name: /train first model|eerste model trainen/i });
      await expect(trainFirstButton).toBeVisible();
    }
    // If models exist, this test is not applicable — skip gracefully
  });

  test('Train New Model button navigates to training pipeline', async ({ page }) => {
    const trainButton = page.getByRole('button', { name: /train new model|nieuw model trainen/i });
    await trainButton.click({ force: true });

    await page.waitForURL('/training/pipeline', { timeout: 10000 });
    expect(page.url()).toContain('/training/pipeline');
  });

  test('page renders at different viewports without errors', async ({ page }) => {
    const viewports = [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto('/models');
      await waitForPageStability(page, 500);

      await expect(page.locator('#root')).toBeAttached();
    }
  });
});

// ---------------------------------------------------------------------------
// API Tests — /api/v1/models
// ---------------------------------------------------------------------------

test.describe('Models Page — API', () => {
  test.setTimeout(15_000);

  test('GET /api/v1/models returns 200 with models array', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/api/v1/models`);
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body).toHaveProperty('models');
    expect(Array.isArray(body.models)).toBeTruthy();
    expect(body).toHaveProperty('total');
    expect(typeof body.total).toBe('number');
  });

  test('GET /api/v1/models is publicly accessible (no auth required for read)', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/api/v1/models`);
    // Should NOT return 401/403
    expect(res.status()).not.toBe(401);
    expect(res.status()).not.toBe(403);
  });

  test('GET /api/v1/models returns valid model structure when models exist', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/api/v1/models`);
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    if (body.models.length > 0) {
      const model = body.models[0];
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('name');
      expect(model).toHaveProperty('status');
      expect(model).toHaveProperty('accuracy');
      expect(model).toHaveProperty('version');
    }
    // If no models, that is a valid empty state
  });
});
