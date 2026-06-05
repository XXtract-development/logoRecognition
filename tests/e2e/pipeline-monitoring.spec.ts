/**
 * Pipeline Monitoring & Approval E2E Tests — ATDD RED PHASE (Epic 8 & 9)
 *
 * Failing acceptance tests, generated BEFORE implementation (TDD red phase).
 * Elke test is geskipt met `test.skip`; verwijder de `.skip` per test zodra
 * de bijbehorende story geïmplementeerd is.
 *
 * data-testid CONTRACT voor de developer:
 *   pipeline-jobs-panel        — overzicht van pipeline-jobs met status (Story 9.1/9.3)
 *   pipeline-job-row           — rij per job (met status + retry-knop bij failed)
 *   retraining-notification    — notificatie "retraining aanbevolen" incl. reden (Story 9.2)
 *   approval-queue-page        — goedkeuringsoverzicht (Story 9.5)
 *   evaluation-report          — challenger-vs-champion-rapport (Story 9.5)
 *   activate-model-button      — de ene menselijke goedkeuringsklik (Story 9.5)
 *   review-item-provenance     — herkomstblok op reviewitem in uncertainty-queue (Story 8.5)
 *
 * Environment: BASE_URL (default http://localhost:5173).
 */

import { test, expect, Page } from '@playwright/test';

async function waitForPageStability(page: Page, timeout = 1000) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(timeout);
}

// ---------------------------------------------------------------------------
// Journey 1 — Story 9.1/9.3: jobstatus zichtbaar en herstartbaar (P0)
// ---------------------------------------------------------------------------

test.describe('Pipeline Jobs — zichtbaarheid en herstart', () => {
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/training');
    await waitForPageStability(page);
  });

  // TODO ATDD: remove .skip when implemented (Story 9.1)
  test.skip('datamanager sees pipeline jobs with their current status', async ({ page }) => {
    const panel = page.locator('[data-testid="pipeline-jobs-panel"]');
    await expect(panel).toBeVisible();

    const rows = panel.locator('[data-testid="pipeline-job-row"]');
    expect(await rows.count()).toBeGreaterThanOrEqual(0);
    // Status is per rij zichtbaar als tekst (waiting/active/completed/failed)
    if ((await rows.count()) > 0) {
      await expect(rows.first()).toContainText(/waiting|active|completed|failed|delayed/i);
    }
  });

  // TODO ATDD: remove .skip when implemented (Story 9.1)
  test.skip('failed jobs show the failure reason and a retry action', async ({ page }) => {
    const failedRow = page
      .locator('[data-testid="pipeline-job-row"]', { hasText: /failed/i })
      .first();
    await expect(failedRow).toBeVisible();

    await expect(failedRow.getByRole('button', { name: /opnieuw|retry/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Journey 2 — Story 9.2: trigger-notificatie met reden (P0)
// ---------------------------------------------------------------------------

test.describe('Retraining-notificatie', () => {
  test.setTimeout(30_000);

  // TODO ATDD: remove .skip when implemented (Story 9.2)
  test.skip('datamanager sees a retraining recommendation including the concrete reason', async ({ page }) => {
    await page.goto('/');
    await waitForPageStability(page);

    const notification = page.locator('[data-testid="retraining-notification"]');
    await expect(notification).toBeVisible();
    // De reden is concreet ("X nieuwe gevalideerde annotaties"), niet generiek
    await expect(notification).toContainText(/\d+/);
  });
});

// ---------------------------------------------------------------------------
// Journey 3 — Story 9.5: goedkeuringsscherm en éénklik-activatie (P0)
// ---------------------------------------------------------------------------

test.describe('Goedkeuringsflow — challenger vs champion', () => {
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/models');
    await waitForPageStability(page);
  });

  // TODO ATDD: remove .skip when implemented (Story 9.5)
  test.skip('approval queue shows the full evaluation report side by side', async ({ page }) => {
    await page.locator('[data-testid="approval-queue-page"]').waitFor();

    const report = page.locator('[data-testid="evaluation-report"]').first();
    await expect(report).toBeVisible();
    // Holdout-metrics van challenger én champion naast elkaar + het verschil
    await expect(report).toContainText(/challenger/i);
    await expect(report).toContainText(/champion|actief model/i);
    await expect(report).toContainText(/holdout/i);
  });

  // TODO ATDD: remove .skip when implemented (Story 9.5)
  test.skip('one human click activates the approved model via the existing flow', async ({ page }) => {
    const report = page.locator('[data-testid="evaluation-report"]').first();
    await report.locator('[data-testid="activate-model-button"]').click();

    // Bevestigingsdialoog (XXtract-regel) en daarna zichtbare bevestiging
    await page.getByRole('button', { name: /bevestig|activeer/i }).click();
    await expect(page.getByText(/geactiveerd|activated/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Journey 4 — Story 8.5: herkomst zichtbaar op reviewitems (P1)
// ---------------------------------------------------------------------------

test.describe('Review queue — herkomst van auto-annotaties', () => {
  test.setTimeout(30_000);

  // Story 8.5 is opgeleverd (UI-slag 2026-06-05): route gecorrigeerd van /training
  // naar de gebouwde /artwork-review (ArtworkReviewPage) en test ontskipt.
  // Skip-conditie alleen nog bij lege queue (geen seed-data in de doelomgeving).
  test('review item shows crop, proposed label, confidence and discrepancy reason', async ({ page }) => {
    await page.goto('/artwork-review');
    await waitForPageStability(page);

    const firstReviewItem = page.locator('[data-testid="review-item-provenance"]').first();
    if ((await page.locator('[data-testid="review-item-provenance"]').count()) === 0) {
      test.skip(true, 'Geen reviewitems aanwezig in doelomgeving — UI-contract niet verifieerbaar zonder seed-data');
    }
    await expect(firstReviewItem).toBeVisible();

    await expect(firstReviewItem.locator('img')).toBeVisible(); // crop
    await expect(firstReviewItem).toContainText(/%|confidence/i); // confidence
    await expect(firstReviewItem).toContainText(/verwacht|niet verwacht|expected/i); // discrepantie-reden
  });
});
