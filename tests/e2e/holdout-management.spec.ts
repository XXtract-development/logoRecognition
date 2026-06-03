/**
 * Holdout Management E2E Tests — ATDD RED PHASE (Epic 7, Stories 7.1 & 7.2)
 *
 * Failing acceptance tests, generated BEFORE implementation (TDD red phase).
 * Elke test is geskipt met `test.skip`; verwijder de `.skip` per test zodra
 * de bijbehorende story geïmplementeerd is.
 *
 * data-testid CONTRACT voor de developer (Story 7.1 & 7.2):
 *   holdout-toggle        — knop/switch op een afbeeldingskaart om holdout te (de)markeren
 *   holdout-badge         — badge op een afbeeldingskaart die holdout-status toont
 *   batch-image-picker    — selectielijst van afbeeldingen bij batch-samenstelling
 *   holdout-metrics-panel — paneel op model-detail met holdout-metrics
 *   model-comparison-table— vergelijkingstabel met kolom holdout-accuracy
 *
 * Environment: BASE_URL (default http://localhost:5173), zelfde conventie als
 * models-page.spec.ts.
 */

import { test, expect, Page } from '@playwright/test';

async function waitForPageStability(page: Page, timeout = 1000) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(timeout);
}

// ---------------------------------------------------------------------------
// Journey 1 — Story 7.1: holdout markeren en uitsluiting van batch-selectie (P0)
// ---------------------------------------------------------------------------

test.describe('Holdout Management — Image Library', () => {
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/training');
    await waitForPageStability(page);
  });

  // TODO ATDD: remove .skip when implemented (Story 7.1)
  test.skip('datamanager can mark an image as holdout and sees the badge', async ({ page }) => {
    const firstCard = page.locator('[data-testid="image-card"]').first();
    await expect(firstCard).toBeVisible();

    await firstCard.locator('[data-testid="holdout-toggle"]').click();

    await expect(firstCard.locator('[data-testid="holdout-badge"]')).toBeVisible();
    await expect(firstCard.locator('[data-testid="holdout-badge"]')).toContainText(/holdout/i);

    // Persistentie: na reload is de badge er nog
    await page.reload();
    await waitForPageStability(page);
    await expect(
      page.locator('[data-testid="image-card"]').first().locator('[data-testid="holdout-badge"]'),
    ).toBeVisible();
  });

  // TODO ATDD: remove .skip when implemented (Story 7.1)
  test.skip('holdout images are excluded from training batch selection', async ({ page }) => {
    // Markeer de eerste afbeelding als holdout en onthoud de identificatie
    const firstCard = page.locator('[data-testid="image-card"]').first();
    const imageName = await firstCard.getAttribute('data-image-id');
    await firstCard.locator('[data-testid="holdout-toggle"]').click();
    await expect(firstCard.locator('[data-testid="holdout-badge"]')).toBeVisible();

    // Open batch-samenstelling: de holdout-afbeelding mag niet selecteerbaar zijn
    await page.getByRole('button', { name: /start training|nieuwe training/i }).click();
    const picker = page.locator('[data-testid="batch-image-picker"]');
    await expect(picker).toBeVisible();
    await expect(picker.locator(`[data-image-id="${imageName}"]`)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Journey 2 — Story 7.2: holdout-metrics zichtbaar op models-pagina (P1)
// ---------------------------------------------------------------------------

test.describe('Holdout Metrics — Models Page', () => {
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/models');
    await waitForPageStability(page);
  });

  // TODO ATDD: remove .skip when implemented (Story 7.2)
  test.skip('model detail shows holdout metrics separate from train/val metrics', async ({ page }) => {
    await page.locator('[data-testid="model-row"]').first().click();

    const panel = page.locator('[data-testid="holdout-metrics-panel"]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/holdout/i);
    await expect(panel).toContainText(/accuracy/i);
    // Holdout-set-omvang is onderdeel van het contract (FR42)
    await expect(panel).toContainText(/\d+ (items|afbeeldingen)/i);
  });

  // TODO ATDD: remove .skip when implemented (Story 7.2)
  test.skip('model comparison shows both models evaluated on the same holdout set', async ({ page }) => {
    await page.getByRole('button', { name: /vergelijk|compare/i }).click();

    const table = page.locator('[data-testid="model-comparison-table"]');
    await expect(table).toBeVisible();
    await expect(table.locator('th', { hasText: /holdout/i })).toBeVisible();
    // Zelfde holdout-set: de set-identificatie (omvang/hash) is gelijk voor beide rijen
    const holdoutSetCells = table.locator('[data-testid="holdout-set-id"]');
    await expect(holdoutSetCells).toHaveCount(2);
    const first = await holdoutSetCells.nth(0).textContent();
    const second = await holdoutSetCells.nth(1).textContent();
    expect(first).toBe(second);
  });
});
