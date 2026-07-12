/**
 * Story 19.5 — Declaratie-guard in searchAndQueueClassForReview op 5/5 keurmerkvelden (ATDD).
 *
 * RODE FASE (vóór de fix). De guard in `searchAndQueueClassForReview` (bootstrap-run.ts)
 * checkt de declaratie momenteel via `resolveDeclarations` — de T3777-only lezer die
 * ALLEEN `packagingMarkedLabelAccreditationCode` kent. De 19.3-keurmerk→etiket-index
 * is echter gebouwd met `resolveDeclaredMarks` — de 5/5-lezer die óók dietTypeCode,
 * nutritionalScore, enumerationValue en localPackagingMarkedReference dekt.
 *
 * Gevolg (het go-live-defect): een GTIN die een keurmerk via één van die vier extra
 * velden declareert (bv. PREGNANCY_WARNING via enumerationValue, of VEGAN via
 * dietTypeCode) wordt door de guard afgewezen met "GTIN declareert de code niet" →
 * 0 nominaties.
 *
 * DE SLEUTELTEST hieronder laat de twee bronnen bewust UITEENLOPEN:
 *   - `resolveDeclarations`  → ziet de code NIET (T3777-only, leeg)
 *   - `resolveDeclaredMarks` → ziet de code WEL (5/5, via een niet-T3777-veld)
 * Tegen de HUIDIGE code (guard = resolveDeclarations) valt de GTIN af en wordt
 * `bootstrapSearch` nooit aangeroepen → deze test FAALT (rood). Na de fix (guard =
 * 5/5 declared-marks) passeert de GTIN en wordt `bootstrapSearch` aangeroepen → groen.
 *
 * De overige tests borgen het contract dat ONGEWIJZIGD moet blijven (regressie):
 *   - accreditatie-codes (T3777) blijven passeren (bootstrap 17.1 regressievrij);
 *   - een niet-declarerende GTIN blijft overgeslagen + geteld (harde guard, AC1 17.1);
 *   - een declaratie-lookup met reason != 'ok' blijft fail-closed.
 *
 * Prisma (`core/db`) en `mlClient` zijn globaal gemockt (src/__tests__/setup.ts).
 * `nomination` + `t3777-declarations` worden hier gemockt; de mock-factory levert
 * BEIDE lezers zodat de test zowel vóór als na de fix compileert en draait.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import { resolveDeclarations, resolveDeclaredMarks } from '../../services/t3777-declarations';
import { searchAndQueueClassForReview } from '../../services/flywheel/bootstrap-run';

vi.mock('../../services/t3777-declarations', () => ({
  resolveDeclarations: vi.fn(),
  resolveDeclaredMarks: vi.fn(),
}));

const mockDecl = resolveDeclarations as unknown as ReturnType<typeof vi.fn>;
const mockMarks = resolveDeclaredMarks as unknown as ReturnType<typeof vi.fn>;
const mockMl = mlClient as unknown as {
  bootstrapSearch: ReturnType<typeof vi.fn>;
  computePhash: ReturnType<typeof vi.fn>;
};
const mockPrisma = prisma as unknown as {
  referenceLogo: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  artworkImport: { findFirst: ReturnType<typeof vi.fn> };
  artworkReviewItem: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  hardNegative: { findUnique: ReturnType<typeof vi.fn> };
};

/** Opts met ruim budget + verre deadline zodat alleen de guard bepalend is. */
function opts() {
  return { remainingBudget: 10, deadline: Date.now() + 60_000 };
}

/** Eén ml-match met een ECHT (uitgesneden) crop_path. */
function match(gtin: string, cropPath: string, cosine = 0.97) {
  return {
    gtin,
    bbox: { x: 1, y: 2, width: 3, height: 4 },
    seed_cosine: cosine,
    crop_path: cropPath,
    source_file: `artwork/${gtin}/converted-0.png`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FLYWHEEL_BOOTSTRAP_THRESHOLD;

  // Elke klasse heeft een gids-zaad; elke GTIN heeft een artwork-pagina.
  // referenceLogo.findFirst dient het zaad (geen active-filter) én de crop-dedup
  // (active:true) — zaad aanwezig, geen bestaande crop-referentie.
  mockPrisma.referenceLogo.findFirst.mockImplementation(({ where }: { where: { active?: boolean } }) =>
    Promise.resolve(where.active ? null : { storagePath: 'reference-logos/SEED/seed.png' })
  );
  // Story 19.9: standaard 0 actieve ECHTE-crop-referenties (< k) — deze suite test
  // de declaratie-guard (19.5), niet de 19.9-ranking.
  mockPrisma.referenceLogo.findMany.mockResolvedValue([]);
  mockPrisma.artworkImport.findFirst.mockImplementation(
    ({ where }: { where: { gtin: string } }) =>
      Promise.resolve({ storagePath: `artwork/${where.gtin}/converted-0.png` })
  );
  // ml levert per doorzochte GTIN één ECHTE crop.
  mockMl.bootstrapSearch.mockImplementation(
    ({ gtinPages }: { gtinPages: Array<{ gtin: string }> }) =>
      Promise.resolve({
        seed_path: 'reference-logos/SEED/seed.png',
        threshold: 0.6,
        matches: gtinPages.map((p) => match(p.gtin, `artwork-crops/${p.gtin}/crop.png`)),
        gtins_processed: gtinPages.length,
        gtins_total: gtinPages.length,
        timed_out: false,
        seed_leaks_skipped: 0,
      })
  );
  // Story 19.8 (herzien): crops worden als OPEN review-item voorgelegd.
  mockMl.computePhash.mockResolvedValue({ content_hash: 'ch-1' });
  mockPrisma.hardNegative.findUnique.mockResolvedValue(null);
  mockPrisma.artworkReviewItem.findFirst.mockResolvedValue(null);
  mockPrisma.artworkReviewItem.create.mockResolvedValue({ id: 'ri-1' });
});

// ---------------------------------------------------------------------------
// AC1 — SLEUTELTEST: keurmerk via een NIET-T3777-veld passeert de guard.
// ---------------------------------------------------------------------------

describe('Story 19.5 — guard gebruikt de 5/5 declared-marks (AC1)', () => {
  it('laat een GTIN die het keurmerk via een niet-T3777-veld declareert door de guard (enumerationValue)', async () => {
    // De 5/5-lezer ziet PREGNANCY_WARNING (via consumerUsageLabelCode/enumerationValue).
    mockMarks.mockResolvedValue({
      marks: [{ code: 'PREGNANCY_WARNING', fieldType: 'EU_consumerUsageLabelCodeList' }],
      reason: 'ok',
    });
    // De oude T3777-only lezer zou hier NIETS zien (de mismatch die het defect
    // veroorzaakte); we geven 'm een lege declaratie zodat een schijn-fix die 'm nog
    // raadpleegt gegarandeerd de verkeerde kant op valt.
    mockDecl.mockResolvedValue({ codes: [], reason: 'lege-declaratie' });

    const res = await searchAndQueueClassForReview('PREGNANCY_WARNING', ['999'], opts());

    // Guard passeert → artwork wordt doorzocht → crop genomineerd.
    expect(mockMl.bootstrapSearch).toHaveBeenCalledTimes(1);
    expect(res.declaredGtins).toBe(1);
    expect(res.skippedNonDeclaring).toBe(0);
    expect(res.queuedForReview).toBe(1);
    expect(mockPrisma.artworkReviewItem.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.artworkReviewItem.create.mock.calls[0][0].data.cropPath).toBe('artwork-crops/999/crop.png');

    // Fix-richting HARD afdwingen: de guard raadpleegt UITSLUITEND de 5/5-lezer —
    // resolveDeclaredMarks WORDT geraadpleegd, én de oude T3777-only resolveDeclarations
    // NIET meer. Samen sluiten deze twee een schijn-fix uit die de oude lezer laat
    // staan of beide bronnen OR-t (dan zou deze test niet groen worden).
    expect(mockMarks).toHaveBeenCalledWith('999');
    expect(mockDecl).not.toHaveBeenCalled();
  });

  it('laat óók een dietTypeCode-keurmerk (VEGAN) door de guard', async () => {
    mockMarks.mockResolvedValue({
      marks: [{ code: 'VEGAN', fieldType: 'DietTypeCode' }],
      reason: 'ok',
    });
    mockDecl.mockResolvedValue({ codes: [], reason: 'lege-declaratie' });

    const res = await searchAndQueueClassForReview('VEGAN', ['888'], opts());

    expect(mockMl.bootstrapSearch).toHaveBeenCalledTimes(1);
    expect(res.declaredGtins).toBe(1);
    expect(res.skippedNonDeclaring).toBe(0);
    // De guard gebruikt de 5/5-lezer, niet de oude T3777-only lezer.
    expect(mockDecl).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC3 — bootstrap (17.1) regressievrij: accreditatie-codes blijven passeren.
// ---------------------------------------------------------------------------

describe('Story 19.5 — accreditatie-codes blijven passeren (AC3, regressie)', () => {
  it('een packagingMarkedLabelAccreditationCode (T3777) passeert de guard ongewijzigd', async () => {
    // 5/5-lezer bevat de accreditatie-code als mark; T3777-lezer óók (superset).
    mockMarks.mockResolvedValue({
      marks: [{ code: 'BLUE_ANGEL', fieldType: 'PackagingMarkedLabelAccreditationCode' }],
      reason: 'ok',
    });
    mockDecl.mockResolvedValue({ codes: ['BLUE_ANGEL'], reason: 'ok' });

    const res = await searchAndQueueClassForReview('BLUE_ANGEL', ['111'], opts());

    expect(mockMl.bootstrapSearch).toHaveBeenCalledTimes(1);
    expect(res.declaredGtins).toBe(1);
    expect(res.skippedNonDeclaring).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC2 — harde guard blijft intact: niet-declarerend + fail-closed.
// ---------------------------------------------------------------------------

describe('Story 19.5 — harde guard blijft intact (AC2)', () => {
  it('slaat een GTIN over die de code in GEEN enkel veld declareert (telt skippedNonDeclaring)', async () => {
    // Beide lezers zien wél een declaratie, maar niet de gevraagde code.
    mockMarks.mockResolvedValue({
      marks: [{ code: 'OTHER', fieldType: 'DietTypeCode' }],
      reason: 'ok',
    });
    mockDecl.mockResolvedValue({ codes: ['OTHER'], reason: 'ok' });

    const res = await searchAndQueueClassForReview('VEGAN', ['222'], opts());

    expect(mockMl.bootstrapSearch).not.toHaveBeenCalled();
    expect(res.declaredGtins).toBe(0);
    expect(res.skippedNonDeclaring).toBe(1);
    expect(res.queuedForReview).toBe(0);
  });

  it('blijft fail-closed bij een declaratie-lookup met reason != ok (bv. gln-ontbreekt)', async () => {
    mockMarks.mockResolvedValue({ marks: [], reason: 'gln-ontbreekt' });
    mockDecl.mockResolvedValue({ codes: [], reason: 'gln-ontbreekt' });

    const res = await searchAndQueueClassForReview('VEGAN', ['333'], opts());

    expect(mockMl.bootstrapSearch).not.toHaveBeenCalled();
    expect(res.skippedNonDeclaring).toBe(1);
  });
});
