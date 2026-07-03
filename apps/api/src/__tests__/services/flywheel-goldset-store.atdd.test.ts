/**
 * ATDD red-phase scaffold — Story 13.3: Gold-set naar beheerde opslag met seed-import
 *
 * Alle tests zijn it.todo (red phase). Beoogde modules:
 * apps/api/src/services/flywheel/gold-set.ts + seed-importscript.
 */
import { describe, it } from 'vitest';

describe('Story 13.3 — Gold-set naar beheerde opslag met seed-import (RED)', () => {
  it.todo(
    'AC1: Prisma-migratie voor gold_set_records (immutable, replacedById self-FK) bestaat met gedocumenteerd down-script en wordt alleen na expliciete goedkeuring uitgevoerd (ARCH-2)'
  );

  it.todo(
    'AC2: idempotent seed-importscript met --dry-run importeert gold-set-oogstrun.json (91 samples) + declared-marks-goldset.json (74 GTINs) naar gold_set_records met label/code/crop-verwijzing/herkomst; tweede run voegt niets toe; dry-run schrijft niets maar toont het importplan; repo-bestanden gemarkeerd als read-only legacy'
  );

  it.todo(
    'AC3: vervanging laat het oude record bestaan met replacedById gezet (enige toegestane mutatie); de actieve set is uitsluitend records met replacedById IS NULL, geresolved in apps/api'
  );
});
