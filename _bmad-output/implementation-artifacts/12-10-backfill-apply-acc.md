# Story 12.10 — backfill `--apply` + deploy + na-verificatie (ACC, 2026-07-13)

Uitgevoerd na expliciete toestemming Friso. Deploy-commit `b352cd3` (app-container healthy). Backfill via de GEDEPLOYDE code: `docker exec <app> node dist/scripts/backfill-reference-logo-field-type.js` (het echte, geteste script — niet een reimplementatie).

## Deploy
- `b352cd3` naar `acc` → ghcr-build → Coolify redeploy; app-container `logo-recognition-app:b352cd3` **healthy**. Registratie-fix (reference-logos.ts + promotion.ts) + dekkingsteller (`coverage` op `GET /api/v1/flywheel/overview`) + backfill-script nu live.

## Dry-run (gedeployde code, read-only) — bevestigd
- Actieve refs 223 · **Te updaten 184** · Al correct 39 · Ambigu (opgelost) 24 · Ambigu (NIET gezet) **0**. "Droge run — niets geschreven." Identiek aan de eerdere fallback-dry-run.

## `--apply` (goedgekeurde write)
- **184 rijen geschreven, 0 overgeslagen** (concurrency-guard). 38 categorie-verplaatsingen (NutritionalScore 18 / DietTypeCode 16 / EU_consumerUsage 4 / GHS 0) + 146 gs1_field-vullingen.

## Na-verificatie (read-only)
- **Idempotentie:** 2e dry-run → **Te updaten 0, Al correct 223**. Alle referenties nu correct getagd.
- **Per-field_type-verdeling (actief, groupBy):**
  - DietTypeCode: **16**
  - EU_consumerUsageLabelCodeList: **4**
  - NutritionalScore: **24** (19 echt na 12.9 + 5 synthetisch zaad)
  - PackagingMarkedLabelAccreditationCode: **179**
  - GHSSymbolDescriptionCode: 0
  - **Totaal 223** ✓
- `field_type` is hiermee voor het eerst betrouwbaar per categorie → automatische per-categorie-rapportage (de dekkingsteller) werkt op correcte data.

## Ambiguïteit
- 24 NUTRISCORE_*-refs "ambigu opgelost" via de tiebreak "specifieke codelijst wint van generieke default" → NutritionalScore. 0 codes onder >1 specifieke codelijst (0 handmatige beslissingen). FODMAP komt niet voor in de bibliotheek.
