# Adversarial review — Story 19.2 (declaratie-parser 5/5 keurmerkvelden)

Datum: 2026-07-04 · Reviewer: onafhankelijke subagent (adversarial) · Scope: `apps/api/src/services/t3777-declarations.ts` (`parseDeclaredMarks`/`MARK_FIELDS`) + testbestand.

## Bevindingen

1. `t3777-declarations.ts` (packaging-velden) — **geen defect**: `packagingMarkedLabelAccreditationCode`-regex matcht niet binnen `localPackagingMarkedLabelAccreditationCodeReference` (voorafgaand teken `l`, hoofdletter-mismatch) en andersom. Geen kruisbesmetting (empirisch bevestigd).
2. `t3777-declarations.ts` (enumerationValue-scoping) — **geen defect**: `enumerationValue\b` matcht bewust niet `enumerationValueInformation`/`enumerationValues`; block-regex `consumerUsageLabelCode\b` matcht geen `…Reference`-varianten; geneste/self-closing/attribuut-/namespace-gevallen correct.
3. Edge-cases — **geen defect**: lege/whitespace-waarden geguard; dedup per (fieldType, code) cross-block; geen catastrophic backtracking (500k-char open block 0ms, 20k blokken 21ms); byte-gelijkheid oude 3 velden bevestigd.
4. Testdekking — **adequaat**: beide nieuwe velden + scoping (incl. *Information-negatie + stray-negatie) + byte-gelijk-regressie gedekt.

## Observatie (opgevolgd)
- `medium` — fieldType-mapping: parser emitte aanvankelijk `ConsumerUsageLabelCode`, terwijl de canonieke `reference_logos.fieldType` (bron `apps/web/src/data/spoor-codes.ts`) `EU_consumerUsageLabelCodeList` is → marks zouden niet koppelen. **Gefixt**: fieldType gecorrigeerd naar `EU_consumerUsageLabelCodeList`; tests bijgewerkt; suite groen.

## VERDICT: PASS
(regex-logica correct; de fieldType-observatie is verwerkt met de correctie hierboven.)
