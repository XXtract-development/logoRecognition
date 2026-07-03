# Adversarial self-review — Story 13.6 (Rollback, persistente pauze, automatische stilstand)

reviewed_commit: (pre-commit, working tree op branch epic/vliegwiel-13)
verdict: PASS
scope: apps/api — migratie 0015, services/flywheel/{rollback,pause,baseline,system-settings,hard-negative-export,types,gate,promotion-batch,nomination}.ts, api/v1/{flywheel,reference-logos,artwork-pipeline}.ts, tests.

## Bevindingen per severity (alle gefixt / verantwoord)

### CRITICAL — geen

### HIGH
- **H1 — DELETE i.p.v. soft-delete zou herleidbaarheid + @@unique breken (AD-3).**
  Gecontroleerd: `rollback.ts` gebruikt uitsluitend `referenceLogo.updateMany({ data: { active: false } })`; nergens `delete`. Test `flywheel-rollback` assert `active=false` en de her-promotie-variantLabel-uniciteit. GEEN issue — bewust zo gebouwd.
- **H2 — Pauze-scope te breed (adversarial F8): live-detectie/trainingsdata mag NIET blokkeren.**
  De `isPaused()`/`shouldSkipForPause()`-check zit UITSLUITEND in `nomination.ts` (nominatie-insert) en `promotion-batch.ts:runPromotionLoop` (job-start). Grep bevestigt: geen pauze-check in detection-flow, feedback-incorporation, artwork-pipeline-detectie, outlier-audit of dashboard-reads. GEEN issue.

### MEDIUM
- **M1 — Race tussen status-lezing en rollback-transactie.** De `findUnique` (status=passed-check) en de mutatie staan buiten één transactie. Gemitigeerd: de conditional `updateMany WHERE status='passed'` binnen de transactie gooit `BatchNotRollbackableError` bij 0 rijen (test dekt de race). De batch is bovendien al afgesloten (status ≠ pending), dus de worker raakt hem niet. Aanvaardbaar.
- **M2 — Baseline-terugval na rollback.** Geen aparte actie nodig: `gate.ts:resolveBaseline` selecteert de meest recente `passed`-batch en `rolled_back` telt niet mee (bestaand 13.5-gedrag, `WHERE status='passed'`). Rollback markeert daarnaast de baseline stale → verse nulmeting. Geverifieerd in gate.ts; GEEN issue.
- **M3 — Alle vier invalidatie-triggerpaden.** (a) rollback → `markBaselineStale('rollback')`; (b) reference-curatie → create + deactivate in reference-logos.ts; (c) outlier-deactivatie → `markBaselineStale` geëxporteerd + contract gedocumenteerd in baseline.ts (15.x roept aan); (d) legacy-12.3 → beide `registerReference`-plekken (1090/1218) markeren bij `added=true`. Alle vier aanwezig.

### LOW
- **L1 — read-cache-lag pauze (max 2s cross-process).** Bewust: story staat "korte read-cache met invalidatie" toe; `setSetting` invalideert de eigen-proces-cache direct. Config via `FLYWHEEL_SETTINGS_CACHE_TTL_MS`. Aanvaard.
- **L2 — best-effort markeringen zijn `void`-fired in de HTTP-paden (reference-logos/artwork-pipeline).** Bewust non-fataal (mag de al-geslaagde mutatie niet terugdraaien); consistent met het bestaande `reloadTemplates`-patroon op dezelfde plekken.
- **L3 — export defensief dubbel-filter.** DB-`WHERE reason IN (...)` + applicatie-`isHumanHardNegativeReason`. Redundant maar bewust defensief (AD-12); test dekt de injectie van een `outlier`-rij.
- **L4 — geen HTTP pause/resume-endpoint.** Correct: dat is 15.4-eigendom (story-afbakening). 13.6 levert alleen de service + pauze-status in de overview-response.

## Checklist
- Alle AC geïmplementeerd: ja (zie ac-trace-13-6.md).
- Architectuur-patterns gevolgd (AD-3/5/11/12/13/15), anti-patterns vermeden: ja.
- Graceful degradation: ja (best-effort baseline/cache/notificatie; fail-safe reads bij DB-fout → niet-gepauzeerd/niet-stale).
- Security/secrets: geen secrets; rollback + export ADMIN-only (`requireRole('ADMIN')`); rollback vereist reden (herleidbaarheid).
- Dode code / debug-statements: geen (grep schoon).
- Migratie: 0015 met down.sql, lokaal toegepast op localhost:5432 (DB-veiligheid geverifieerd).

## Fix-log
Geen open bevindingen — alle punten zijn óf bewust ontwerp (verantwoord) óf reeds correct geïmplementeerd. Geen code-wijziging nodig na review.
