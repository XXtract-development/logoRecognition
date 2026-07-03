/**
 * Story 15.4 — Drempelbeheer (thresholds.ts) tests.
 *
 * Dekt:
 *  - AC 2: reden SERVER-SIDE verplicht (lege/whitespace reden → error);
 *  - AC 2: `threshold_changes`-log met oude + nieuwe waarde + userId + reden;
 *  - AC 2: per-methode-drempels (template/embedding/classifier) afzonderlijk;
 *  - taak 2.3: effectieve-waarde-resolutie override ?? env ?? default 0,90 (één
 *    gedeelde resolutiefunctie);
 *  - taak 2.4: bereik-validatie (buiten 0,50–0,99 / niet op de 0,01-stap → error).
 *
 * De settings-store wordt in-memory gemockt op zijn prisma-grens (systemSetting),
 * de audit-log via de `thresholdChange`-delegate.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import prisma from '../../core/db';
import {
  resolvePromotionThreshold,
  getThresholdsView,
  changeThreshold,
  thresholdKeyForMethod,
  ThresholdReasonRequiredError,
  ThresholdMethodInvalidError,
  ThresholdOutOfRangeError,
} from '../../services/flywheel/thresholds';
import { clearSettingsCache } from '../../services/flywheel/system-settings';

const mockPrisma = prisma as unknown as {
  systemSetting: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  thresholdChange: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

let store: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  clearSettingsCache();
  store = {};
  delete process.env.FLYWHEEL_PROMOTION_THRESHOLD_TEMPLATE;
  delete process.env.FLYWHEEL_PROMOTION_THRESHOLD_EMBEDDING;
  delete process.env.FLYWHEEL_PROMOTION_THRESHOLD_CLASSIFIER;

  mockPrisma.systemSetting.findUnique.mockImplementation(
    async ({ where }: { where: { key: string } }) =>
      where.key in store ? { key: where.key, value: store[where.key] } : null
  );
  mockPrisma.systemSetting.upsert.mockImplementation(
    async ({ where, create }: { where: { key: string }; create: { value: unknown } }) => {
      store[where.key] = create.value;
      return { key: where.key, value: create.value };
    }
  );
  mockPrisma.thresholdChange.create.mockResolvedValue({
    id: 'tc-1',
    changedAt: new Date('2026-07-03T09:00:00Z'),
  });
  mockPrisma.thresholdChange.findMany.mockResolvedValue([]);
});

// ── resolutie override ?? env ?? default (taak 2.3) ──────────────────────────
describe('resolvePromotionThreshold — override ?? env ?? default (taak 2.3)', () => {
  it('valt terug op default 0,90 zonder override en zonder env', async () => {
    expect(await resolvePromotionThreshold('template')).toBe(0.9);
  });

  it('leest de env-waarde als er geen override is', async () => {
    process.env.FLYWHEEL_PROMOTION_THRESHOLD_EMBEDDING = '0.85';
    expect(await resolvePromotionThreshold('embedding')).toBe(0.85);
  });

  it('laat de system_settings-override winnen van env', async () => {
    process.env.FLYWHEEL_PROMOTION_THRESHOLD_CLASSIFIER = '0.85';
    store[thresholdKeyForMethod('classifier')] = { value: 0.95 };
    expect(await resolvePromotionThreshold('classifier')).toBe(0.95);
  });

  it('detectie zonder methode valt onder classifier (strengste)', async () => {
    store[thresholdKeyForMethod('classifier')] = { value: 0.93 };
    expect(await resolvePromotionThreshold(undefined)).toBe(0.93);
    expect(await resolvePromotionThreshold(null)).toBe(0.93);
  });
});

// ── verplichte reden (AC 2) ──────────────────────────────────────────────────
describe('changeThreshold — verplichte reden (AC 2)', () => {
  it('gooit ThresholdReasonRequiredError bij een lege reden', async () => {
    await expect(
      changeThreshold({ method: 'template', newValue: 0.92, reason: '', by: 'user-1' })
    ).rejects.toBeInstanceOf(ThresholdReasonRequiredError);
  });

  it('gooit ThresholdReasonRequiredError bij een whitespace-only reden', async () => {
    await expect(
      changeThreshold({ method: 'template', newValue: 0.92, reason: '   ', by: 'user-1' })
    ).rejects.toBeInstanceOf(ThresholdReasonRequiredError);
    // Geen audit-rij bij een geweigerde wijziging.
    expect(mockPrisma.thresholdChange.create).not.toHaveBeenCalled();
  });
});

// ── audittrail (AC 2, AD-13) ─────────────────────────────────────────────────
describe('changeThreshold — audittrail (AC 2)', () => {
  it('logt oude + nieuwe waarde + userId + reden in threshold_changes', async () => {
    process.env.FLYWHEEL_PROMOTION_THRESHOLD_EMBEDDING = '0.90';
    const result = await changeThreshold({
      method: 'embedding',
      newValue: 0.92,
      reason: 'twee besmette batches uit dezelfde importbron',
      by: 'sanne',
    });

    expect(mockPrisma.thresholdChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          thresholdKey: thresholdKeyForMethod('embedding'),
          oldValue: '0.9',
          newValue: '0.92',
          reason: 'twee besmette batches uit dezelfde importbron',
          userId: 'sanne',
        }),
      })
    );
    expect(result.oldValue).toBe(0.9);
    expect(result.newValue).toBe(0.92);
  });

  it('persisteert de override in system_settings (bron van de actuele waarde)', async () => {
    await changeThreshold({ method: 'template', newValue: 0.88, reason: 'kalibratie', by: 'u' });
    expect(store[thresholdKeyForMethod('template')]).toEqual({ value: 0.88 });
    // Na de wijziging leest de resolver de verse override.
    expect(await resolvePromotionThreshold('template')).toBe(0.88);
  });
});

// ── bereik-validatie (taak 2.4) ──────────────────────────────────────────────
describe('changeThreshold — bereik-validatie (taak 2.4)', () => {
  it('weigert een waarde onder 0,50', async () => {
    await expect(
      changeThreshold({ method: 'template', newValue: 0.4, reason: 'x', by: 'u' })
    ).rejects.toBeInstanceOf(ThresholdOutOfRangeError);
  });

  it('weigert een waarde boven 0,99', async () => {
    await expect(
      changeThreshold({ method: 'template', newValue: 1.0, reason: 'x', by: 'u' })
    ).rejects.toBeInstanceOf(ThresholdOutOfRangeError);
  });

  it('weigert een waarde die niet op de 0,01-stap ligt', async () => {
    await expect(
      changeThreshold({ method: 'template', newValue: 0.905, reason: 'x', by: 'u' })
    ).rejects.toBeInstanceOf(ThresholdOutOfRangeError);
  });

  it('weigert een onbekende methode', async () => {
    await expect(
      changeThreshold({ method: 'onbekend', newValue: 0.9, reason: 'x', by: 'u' })
    ).rejects.toBeInstanceOf(ThresholdMethodInvalidError);
  });
});

// ── per-methode-view + historie (AC 2, UX-DR7) ───────────────────────────────
describe('getThresholdsView — per-methode + historie (AC 2)', () => {
  it('toont alle drie de methoden afzonderlijk met bron', async () => {
    process.env.FLYWHEEL_PROMOTION_THRESHOLD_TEMPLATE = '0.85';
    store[thresholdKeyForMethod('embedding')] = { value: 0.95 };
    const view = await getThresholdsView();

    const byMethod = Object.fromEntries(view.methods.map((m) => [m.method, m]));
    expect(view.methods).toHaveLength(3);
    expect(byMethod.template.value).toBe(0.85);
    expect(byMethod.template.source).toBe('env');
    expect(byMethod.embedding.value).toBe(0.95);
    expect(byMethod.embedding.source).toBe('override');
    expect(byMethod.classifier.value).toBe(0.9);
    expect(byMethod.classifier.source).toBe('default');
  });

  it('geeft de wijzigingshistorie (nieuwste boven) uit threshold_changes', async () => {
    mockPrisma.thresholdChange.findMany.mockResolvedValue([
      {
        id: 'tc-2',
        thresholdKey: thresholdKeyForMethod('embedding'),
        oldValue: '0.9',
        newValue: '0.92',
        reason: 'reden',
        userId: 'sanne',
        changedAt: new Date('2026-07-03T09:00:00Z'),
      },
    ]);
    const view = await getThresholdsView();
    expect(mockPrisma.thresholdChange.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { changedAt: 'desc' } })
    );
    expect(view.history).toHaveLength(1);
    expect(view.history[0].method).toBe('embedding');
    expect(view.history[0].oldValue).toBe('0.9');
    expect(view.history[0].newValue).toBe('0.92');
  });
});
