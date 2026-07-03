# Adversarial self-review — Story 12.8 (kruischeck-endpoint voor n8n)

reviewed_commit: e7094095768802279650fe982a0bc3c4d2a7b389 (epic/vliegwiel-16)
verdict: PASS (na fixes)

Scope: nieuwe verify-flow + routes + alias-module + ml-service codes-filter, en de
aansluiting op de 13.2/16.1 vliegwiel-haakjes. Shadow-mode invariant (AC8) en het
n8n verdict-responsecontract (AD-8) zijn de scherprechters.

## Bevindingen per severity

### CRITICAL

- **C1 — alias-inconsistentie tussen verdicts en de 16.1-mismatch-registratie.**
  `runFlywheelHooks` bouwde de `declaredSet` uit de RAUWE GS1-codes (`declared`),
  maar `detections[].code` en `confirmedCodes` zijn CANONIEK (na alias). Een
  gealiaste bevestiging (bv. `MARINE_STEWARDSHIP_COUNCIL` → `_LABEL`) matchte dan
  niet tegen de rauwe declared-set → de 16.1-mapper zou ten onrechte
  `declared-not-found`/`not-supported` schrijven én een confirmed detectie als
  `found-not-declared` tellen. Bug in de vliegwiel-datastroom (niet in het
  verdict-responsepad, dat op `aliased` werkt).
  FIX: registreer de mismatch-events op CANONIEKE declared-codes (de
  alias-mapping vóór de registratie toegepast), zodat declared/confirmed/detected
  allemaal in dezelfde (canonieke) ruimte leven. `nominateFromKruischeck` krijgt
  óók de canonieke declared-set mee. Test toegevoegd
  (`registers canonical declared codes to the kruischeck mismatch path`).

### HIGH

- **H1 — dubbele artwork-resolutie (DB + storage-fallback).** `no-artwork` mag
  alleen gemeld worden als er ÉCHT geen artwork is. De DB-query (`artwork_imports`)
  mist artwork dat wél in storage staat maar (nog) geen queryable importrij heeft.
  FIX: storage-fallback (`artwork/{gtin}/` keys) wanneer de DB niets oplevert;
  fail-safe (listing-fout → leeg, nooit throw). Getest via de mock (leeg → no-artwork).

- **H2 — verdict-response mag niet van de nominatie/registratie afhangen (AD-8).**
  De run-state wordt nu FIRST weggeschreven (stap 7), pas DAARNA draaien de
  vliegwiel-haakjes (stap 8). Met beide vlaggen uit doen die haakjes niets; met
  vlag aan veranderen ze de reeds-weggeschreven response niet. Getest: met vlag
  uit geen `mismatchEvent.createMany`-call, response identiek.

### MEDIUM

- **M1 — worker deelt de detection-queue (AC8).** Verify-jobs draaien op
  `artwork-detection` en worden per job-NAAM gerouteerd in de bestaande
  detection-worker (geen tweede Worker op dezelfde queue, die zou om jobs
  concurreren). `VERIFY_JOB_NAME`-route toegevoegd in `workers.ts`.

- **M2 — geen review-items/trainingsdata (AC8, hard).** De flow roept BEWUST NIET
  `crosscheckDetections` aan (die persisteert review-items); alleen de pure
  `getThresholdForMethod` wordt hergebruikt. Getest: geen
  `artworkReviewItem.createMany`/`trainingData.create`-calls.

- **M3 — fail-safe-lege declaratie ≠ "alles NOT_FOUND" (AC2).** Bij een lege
  declaratielijst eindigt de run `done` met lege `verdicts` + de `reason` 1-op-1
  doorgegeven. Getest (`gln-ontbreekt` → done, reason, verdicts=[]).

### LOW

- **L1 — GTIN-validatie op de route (8–14 cijfers)** voorkomt een zinloze run +
  ML-call op onzin-invoer (400, geen enqueue). Getest.

- **L2 — codes-filter helper puur + los getest.** `filter_templates_by_codes`
  is dependency-vrij uit de endpoint getrokken zodat de pytest hem zonder
  storage/DB dekt (skopt schoon waar numpy/cv2 ontbreken; draait op CI/ACC).

- **L3 — run-state TTL in Redis (default 24u).** Geen nieuwe tabel/migratie (AC7);
  een verlopen/onbekende runId → 404 (getest).

## Anti-patterns gecheckt

- Wiel niet opnieuw uitgevonden: declaratie-ophaal (8-3D), drempels (8.5),
  run-patroon (8.1), auth (`apiKeyAuth`) allemaal hergebruikt.
- Geen DB-migratie (geverifieerd: geen schema.prisma-wijziging).
- Geen secrets gelogd; geen dode code; geen debug-statements.
- Graceful degradation: elke Redis/ML/DB-fout is fail-safe (no-artwork/failed
  status of best-effort log), nooit een unhandled throw richting n8n.

## Post-deploy (AC10) — operationele vervolgtaak

ACC-bewijs (echte GTIN door het endpoint + `recognition_logs`-rij) valt buiten
deze implement-sprint-run (draait niet tegen ACC). Deploy-volgorde: eerst GitHub
Actions "Build and Push Docker Images", dan Coolify. Genoteerd als vervolgtaak.
