---
title: 'Hergebruik van scanresultaten volgt de codeversie'
type: 'bugfix'
created: '2026-10-13'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/specs/spec-scan-reuse-code-version/SPEC.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** De pijplijn-API hergebruikt binnen 24 uur een afgerond scanresultaat op een sleutel zonder codeversie; na een uitrol van betere herkenningscode krijgt n8n voor al gescande etiketten het oude resultaat (VERIFIED op ACC 13-10-2026: 195 etiketten na 9392809).

**Approach:** Per aanvraag één hergebruiksleutel berekenen, `<LOGO_MODEL_VERSION>@<codeversie>` (codeversie = 40-hex `LOGO_IMAGE_TAG`, alleen bij ontbrekende/lege `LOGO_IMAGE_TAG` de 40-hex `SOURCE_COMMIT`; getrimd, kleine letters), en die gebruiken voor opzoeken en voor elke opgeslagen rij; zonder geldige codeversie `<model of unknown>@none` opslaan en niet hergebruiken. Antwoord-`modelVersion` en omzettabel blijven op `LOGO_MODEL_VERSION`. Volledig contract: SPEC.md (CAP-1..CAP-7).

</frozen-after-approval>

## Implementation Notes

- `apps/api/src/services/pipeline/logo-scan-flow.ts`: `codeVersion()` (LOGO_IMAGE_TAG, anders SOURCE_COMMIT; 40 hex, getrimd, kleine letters, per aanvraag gelezen); `reuseKey` voor opzoeken, `tracked.modelVersion` = `reuseKey` of `<model|unknown>@none` voor elke insert (pending en superseded); eenmalige waarschuwing als hergebruik uitstaat door ontbrekende codeversie.
- Antwoord-`modelVersion` (`buildLogoResults`, `failedState`) ongewijzigd op `process.env.LOGO_MODEL_VERSION`.
- Documentatie: `docs/02-architecture/api-specification.md`, `.env.example`, `///`-commentaar op `LogoScan.modelVersion` in `schema.prisma` (alleen commentaar, geen migratie), `versions.md`.
- Verrassing: drie bestaande AC1-controles postten zonder `productId` en toetsten daardoor niets; gerepareerd in de ATDD-stap.
- Tests: dedupe-bestand 30/30 vóór (basislijn) → 41/41 na; volledige API-suite 1622 passed, 2 skipped, 67 todo; `tsc --noEmit` schoon.

## Review Triage Log

Lagen: Blind Hunter (oneshot-laag) en Edge Case Hunter, beide verse subagents op hetzelfde modelniveau.

- BH1 SOURCE_COMMIT-terugval bij lege LOGO_IMAGE_TAG op ACC — low, verworpen voor deze wijziging: de deploy-job pint altijd `LOGO_IMAGE_TAG` (build-push.yml:109; VERIFIED gezet op ACC 13-10), en `docker-compose.test.yml` bouwt uit broncode waar `SOURCE_COMMIT` wél de code is; structurele oplossing uitgesteld (deferred-work: commit in de image).
- BH2 commit niet in de image — defer (deferred-work), groter dan deze reparatie.
- BH3 elke uitrol zet hergebruik terug — low, patch: als bewuste keuze gedocumenteerd in api-specification.md en memlog.
- BH4 versions.md overclaimt — low, patch: "zodra ze opnieuw worden aangeboden" en beperkt tot nieuwe softwareversies.
- BH5 succesmeting bewijst het niet — medium, patch: SPEC-succesmeting met uitroltijdstip en meting van hergebruik via `deduplicated: true`.
- BH6 omzettabel/timeout niet getest — false: `gs1-block.ts` gebruikt dezelfde `input.modelVersion` voor antwoord en `resolve` (r.65/75), timeout deelt `failedState` met het geteste failed-pad; memlog-claim gecorrigeerd.
- BH7 stil uit zonder codeversie — low, patch: eenmalige waarschuwing in het logboek.
- BH8 .env.example en schema-commentaar verouderd — low, patch: beide bijgewerkt.
- BH9 BMAD-papierwerk onvolledig — false op het moment van afronden: deze status, triage en trace worden in deze run bijgewerkt; `sources: []` klopt, de briefing is geen bestand.
- ECH1 taak vóór uitrol, uitgevoerd erna — maybe-false/low-medium, defer (deferred-work) met wat het zou bewijzen.
- ECH2 sleutel > 256 tekens — low, verworpen: vastgelegd als aanname in SPEC (LOGO_MODEL_VERSION ruim onder 215; ACC-waarde 13 tekens), opslagfout wordt al gelogd.
- ECH3 LOGO_IMAGE_TAG niet expliciet in app-environment — false: VERIFIED 13-10 via `docker exec env` dat app en ml-service hem via `env_file: .env` hebben.

