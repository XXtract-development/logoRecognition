/**
 * Training Pipeline Page E2E Tests
 *
 * Tests for /training/pipeline page — training job management UI including:
 * - Page load and rendering
 * - Key UI elements (title, buttons, jobs table/empty state)
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
// UI Tests — Training Pipeline Page
// ---------------------------------------------------------------------------

test.describe('Training Pipeline Page — UI', () => {
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/training/pipeline');
    await waitForPageStability(page);
  });

  test('page loads without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/training/pipeline');
    await waitForPageStability(page);

    await expect(page.locator('#root')).toBeAttached();
    expect(errors).toHaveLength(0);
  });

  test('shows Training Pipeline title', async ({ page }) => {
    const title = page.locator('h2');
    await expect(title).toBeVisible();

    const titleText = await title.textContent();
    // t('training.pipeline', 'Training Pipeline')
    expect(titleText).toMatch(/training pipeline|trainings?pipeline/i);
  });

  test('shows pipeline description', async ({ page }) => {
    // t('training.pipelineDescription', 'Create and monitor ML training jobs')
    const description = page.getByText(/create and monitor|maak en monitor/i);
    await expect(description).toBeVisible();
  });

  test('has New Training Job button', async ({ page }) => {
    // t('training.newJob', 'New Training Job')
    const newJobButton = page.getByRole('button', { name: /new training job|nieuwe trainings?job/i });
    await expect(newJobButton).toBeVisible();
  });

  test('shows Training Jobs section', async ({ page }) => {
    // Card title: t('training.trainingJobs', 'Training Jobs')
    const jobsSection = page.getByText(/training jobs|trainings?jobs/i);
    await expect(jobsSection).toBeVisible();
  });

  test('shows empty state or jobs table', async ({ page }) => {
    // Wait for loading spinner to disappear
    await page.waitForTimeout(2000);

    const emptyState = page.locator('.ant-empty');
    const table = page.locator('.ant-table');

    const hasEmpty = await emptyState.isVisible().catch(() => false);
    const hasTable = await table.isVisible().catch(() => false);

    expect(hasEmpty || hasTable).toBeTruthy();
  });

  test('empty state shows correct message and Create First Training Job button', async ({ page }) => {
    await page.waitForTimeout(2000);

    const emptyState = page.locator('.ant-empty');
    const hasEmpty = await emptyState.isVisible().catch(() => false);

    if (hasEmpty) {
      // t('training.noJobs', 'No training jobs yet')
      const emptyText = page.getByText(/no training jobs|geen trainings?jobs/i);
      await expect(emptyText).toBeVisible();

      // t('training.createFirst', 'Create First Training Job')
      const createFirstButton = page.getByRole('button', { name: /create first|eerste.*aanmaken/i });
      await expect(createFirstButton).toBeVisible();
    }
  });

  test('New Training Job button opens create modal', async ({ page }) => {
    const newJobButton = page.getByRole('button', { name: /new training job|nieuwe trainings?job/i });
    await newJobButton.click({ force: true });

    // Modal should appear with form fields
    const modal = page.locator('.ant-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // t('training.createJob', 'Create Training Job')
    const modalTitle = modal.getByText(/create training job|trainings?job aanmaken/i);
    await expect(modalTitle).toBeVisible();

    // Form should have Job Name field
    const nameInput = modal.locator('input').first();
    await expect(nameInput).toBeVisible();

    // Close modal
    const cancelButton = modal.getByRole('button', { name: /cancel|annuleren/i });
    await cancelButton.click();
  });

  test('page renders at different viewports without errors', async ({ page }) => {
    const viewports = [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto('/training/pipeline');
      await waitForPageStability(page, 500);

      await expect(page.locator('#root')).toBeAttached();
    }
  });
});

// ---------------------------------------------------------------------------
// API Tests — /api/v1/training/jobs
// ---------------------------------------------------------------------------

test.describe('Training Pipeline Page — API', () => {
  test.setTimeout(15_000);

  test('GET /api/v1/training/jobs returns 200 with jobs array', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/api/v1/training/jobs`);
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body).toHaveProperty('jobs');
    expect(Array.isArray(body.jobs)).toBeTruthy();
    expect(body).toHaveProperty('total');
    expect(typeof body.total).toBe('number');
  });

  test('GET /api/v1/training/jobs is publicly accessible (no auth required for read)', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/api/v1/training/jobs`);
    expect(res.status()).not.toBe(401);
    expect(res.status()).not.toBe(403);
  });

  test('GET /api/v1/training/jobs accepts status filter query parameter', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    for (const status of ['completed', 'running', 'queued', 'failed']) {
      const res = await request.get(`${apiBase()}/api/v1/training/jobs?status=${status}&limit=5`);
      expect(res.ok()).toBeTruthy();

      const body = await res.json();
      expect(body).toHaveProperty('jobs');
      expect(Array.isArray(body.jobs)).toBeTruthy();
    }
  });

  test('GET /api/v1/training/jobs accepts limit and offset parameters', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/api/v1/training/jobs?limit=2&offset=0`);
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body).toHaveProperty('jobs');
    expect(body.jobs.length).toBeLessThanOrEqual(2);
  });

  test('GET /api/v1/training/jobs returns valid job structure when jobs exist', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/api/v1/training/jobs`);
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    if (body.jobs.length > 0) {
      const job = body.jobs[0];
      expect(job).toHaveProperty('id');
      expect(job).toHaveProperty('name');
      expect(job).toHaveProperty('status');
      expect(job).toHaveProperty('progress');
      expect(job).toHaveProperty('config');
      expect(job).toHaveProperty('createdAt');
    }
    // Empty is valid — ACC may have no training data
  });
});
