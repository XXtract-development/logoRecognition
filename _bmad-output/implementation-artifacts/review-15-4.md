# Adversarial self-review — Story 15.4 (Drempelbeheer en pauzebediening)

reviewed_commit: (pre-commit, working tree op branch epic/vliegwiel-15)
verdict: PASS

Adversarial self-review langs de severity-niveaus critical → low. Alle bevindingen gefixt vóór commit.

## Critical

Geen.

## High

Geen. Specifiek gecontroleerd:
- **Eén resolutiefunctie voor de effectieve drempel.** `resolvePromotionThreshold` (thresholds.ts) is het enige effectieve-waarde-leespad (`system_settings-override ?? env ?? default 0,90`). De drie hot-path-callers — `nomination.ts`, `guardrails.ts`, `batch-detail.ts` — zijn omgezet van de directe env-lezing (`getPromotionThresholdForMethod`) naar deze async resolver. Geen tweede leespad dat de UI-override negeert (guardrail uit de story voldaan). Geverifieerd: `grep` toont geen resterende `getPromotionThresholdForMethod`-aanroep buiten config.ts (env-basis) en thresholds.ts (resolver-fallback).
- **`threshold_changes` is audittrail, geen configuratiebron.** De actuele waarde leeft in de `system_settings`-override; de audit-tabel wordt nooit gelezen om de actuele drempel te bepalen. `getThresholdsView` leest de override + env, de historie apart.
- **Migratie uitsluitend additief + 15.4-DDL.** `migrate diff` toonde een drift-regel (`ALTER TABLE retraining_notifications … DROP DEFAULT`); die is bewust NIET in migratie 0017 opgenomen — 0017 bevat uitsluitend `CREATE TABLE threshold_changes` + de DESC-index. Lokaal toegepast (localhost:5432 geverifieerd), `migrate status` = up to date, geen tabel-drops.
- **Pauze-semantiek niet herbouwd.** `pause-control.ts` roept de bestaande 13.6-service (`pause`/`resume`) aan; de scope-handhaving (welke hooks/jobs stoppen) blijft 13.6-gedrag. 15.4 voegt alleen het HTTP-endpoint + de `threshold_changes`-logging + de quarantaine-waarschuwing toe.

## Medium

- **Atomiciteit van override + audit-rij.** `changeThreshold` schrijft de `system_settings`-override én de `threshold_changes`-rij binnen één `prisma.$transaction` (interactieve vorm), zodat een half-geschreven audittrail niet kan ontstaan. De in-process settings-cache wordt na de transactie gericht geïnvalideerd (`invalidateSetting`) zodat de resolver de verse override leest — GEEN tweede upsert (dubbele schrijf vermeden).
- **Stilstand-batch-ids blijven beschikbaar voor de rode banner.** `registerQuarantine` (13.6) reset de teller ná auto-pauze, waardoor de batch-ids verloren zouden gaan. Opgelost met een aparte persistente `AUTO_PAUSE_STANDSTILL`-record (batchIds + k + tijdstip), gezet bij het bereiken van K en gewist bij een bewuste hervatting (`resume`). De rode banner leest deze record voor de detail-links.
- **Kleursemantiek (UX-DR5).** Amber pauzebanner uitsluitend bij handmatige pauze; rode banner uitsluitend bij automatische stilstand (`by === 'system'` + stilstand-record). De pauzeschakelaar wordt nooit rood (neutraal grijs met amber statuslabel). Getest in StandstillBanner.test (amber-variant toont geen rode banner en omgekeerd).

## Low

- **Dode code verwijderd.** Een aanvankelijk geëxporteerde helper `clearStandstillRecord` werd nergens gebruikt (de clear zit inline in `resume`); verwijderd om dode code te vermijden.
- **Ongebruikte imports verwijderd** uit de nieuwe testbestanden (`React`, `within`) — tsc clean (op de één pre-existing, niet-15.4 fout in `MobileReviewDeck.test.tsx` na).
- **i18n-keys toegevoegd** aan `nl.json` (flywheel.thresholds/pause/standstill + common.close) voor consistentie met 15.1/15.2, hoewel de componenten `defaultValue`-fallbacks hebben.

## Geaccepteerd gedrag (geen bevinding)

- Als een datamanager handmatig pauzeert bovenop een reeds automatische stilstand (of vice versa), bepaalt de laatste `by`-waarde de banner-variant. Auto-pauze re-pauzeert niet als al gepauzeerd; dan blijft de human als `by` staan en toont het paneel `manual`. Dit is acceptabel: de mens heeft de bediening expliciet overgenomen en is al op de hoogte.
- Hervatten blokkeert niet op openstaande quarantaines (FR-19, expliciete story-eis): de hervat-modal waarschuwt alleen. Getest.

## Testresultaat na de laatste fix

- apps/api vitest: 601 passed / 2 skipped / 20 todo (was 566 vóór 15.4 → +35).
- apps/web vitest: 115 passed / 16 todo (was 99 vóór 15.4 → +16).
- Beide tsc --noEmit clean (op de pre-existing MobileReviewDeck.test-fout na, niet in 15.4-scope).
