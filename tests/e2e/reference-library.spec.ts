/**
 * Reference Library E2E Tests — ATDD RED PHASE (Epic 7, Story 7.3)
 *
 * Failing acceptance tests, generated BEFORE implementation (TDD red phase).
 * Elke test is geskipt met `test.skip`; verwijder de `.skip` per test zodra
 * Story 7.3 geïmplementeerd is.
 *
 * data-testid CONTRACT voor de developer (Story 7.3):
 *   reference-library-page    — paginacontainer van de referentiebibliotheek
 *   reference-library-upload  — uploadformulier (file + t3777Code + variantLabel + bron)
 *   reference-code-group      — groepering per T3777-code in het overzicht
 *   reference-variant-card    — kaart per variant (met preview-afbeelding)
 *   reference-variant-deactivate — knop om een variant te deactiveren
 *   reference-variant-inactive   — visuele status van een gedeactiveerde variant
 *
 * Environment: BASE_URL (default http://localhost:5173).
 *
 * STATUS (Story 7.3 implementation): the UI is implemented (ReferenceLibraryPage
 * + components, route /reference-library, data-testids per contract) and the
 * required fixtures exist (reference-logo-sample.png, invalid-reference.txt).
 * These four tests stay `test.skip` because they require a fully running stack
 * (web dev server + API + MinIO + seeded reference data), which is not available
 * in this implementation run and could not be verified locally. Un-skip once an
 * e2e environment with seed data is available.
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';

async function waitForPageStability(page: Page, timeout = 1000) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(timeout);
}

// ---------------------------------------------------------------------------
// Journey 3 — Story 7.3: referentiebibliotheek beheren (P1)
// ---------------------------------------------------------------------------

test.describe('Reference Library — Keurmerk-referenties', () => {
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/reference-library');
    await waitForPageStability(page);
  });

  // TODO ATDD: remove .skip when implemented (Story 7.3)
  test.skip('datamanager can upload a reference logo with T3777 code and variant', async ({ page }) => {
    await expect(page.locator('[data-testid="reference-library-page"]')).toBeVisible();

    const upload = page.locator('[data-testid="reference-library-upload"]');
    await upload.locator('input[name="t3777Code"]').fill('EU_ORGANIC_FARMING');
    await upload.locator('input[name="variantLabel"]').fill('kleur-nl');
    await upload.locator('input[name="source"]').fill('https://agriculture.ec.europa.eu/organic-logo');
    await upload
      .locator('input[type="file"]')
      .setInputFiles(path.join(__dirname, 'fixtures', 'reference-logo-sample.png'));
    await upload.getByRole('button', { name: /upload|toevoegen/i }).click();

    // Variant verschijnt in het overzicht onder de juiste code-groep
    const group = page.locator('[data-testid="reference-code-group"]', {
      hasText: 'EU_ORGANIC_FARMING',
    });
    await expect(group).toBeVisible();
    const card = group.locator('[data-testid="reference-variant-card"]', { hasText: 'kleur-nl' });
    await expect(card).toBeVisible();
    await expect(card.locator('img')).toBeVisible(); // preview
  });

  // TODO ATDD: remove .skip when implemented (Story 7.3)
  test.skip('overview groups variants per T3777 code with previews', async ({ page }) => {
    const groups = page.locator('[data-testid="reference-code-group"]');
    await expect(groups.first()).toBeVisible();

    const firstGroup = groups.first();
    const cards = firstGroup.locator('[data-testid="reference-variant-card"]');
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(cards.first().locator('img')).toBeVisible();
  });

  // TODO ATDD: remove .skip when implemented (Story 7.3)
  test.skip('datamanager can deactivate a variant without losing history', async ({ page }) => {
    const card = page.locator('[data-testid="reference-variant-card"]').first();
    await expect(card).toBeVisible();

    await card.locator('[data-testid="reference-variant-deactivate"]').click();
    // Bevestigingsdialoog (XXtract-conventie: expliciete bevestiging)
    await page.getByRole('button', { name: /bevestig|deactiveer/i }).click();

    // Variant blijft zichtbaar, maar met inactieve status — geen verwijdering
    await expect(card.locator('[data-testid="reference-variant-inactive"]')).toBeVisible();
  });

  // TODO ATDD: remove .skip when implemented (Story 7.3)
  test.skip('upload form rejects unsupported file types with a clear error', async ({ page }) => {
    const upload = page.locator('[data-testid="reference-library-upload"]');
    await upload.locator('input[name="t3777Code"]').fill('EU_ORGANIC_FARMING');
    await upload.locator('input[name="variantLabel"]').fill('fout-formaat');
    await upload
      .locator('input[type="file"]')
      .setInputFiles(path.join(__dirname, 'fixtures', 'invalid-reference.txt'));
    await upload.getByRole('button', { name: /upload|toevoegen/i }).click();

    await expect(page.getByText(/alleen png of svg|formaat niet ondersteund/i)).toBeVisible();
  });
});
