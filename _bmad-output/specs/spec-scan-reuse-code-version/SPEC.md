---
id: SPEC-scan-reuse-code-version
companions: [brownfield.md]
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Hergebruik van scanresultaten volgt de codeversie

## Why

Pijn. De pijplijn-API geeft een eerder afgerond scanresultaat terug als hetzelfde etiket binnen 24 uur opnieuw binnenkomt. De hergebruiksleutel kent de modelversie (handmatige env `LOGO_MODEL_VERSION`) en de referentiepool, maar niet de versie van de herkenningscode. VERIFIED 13-10-2026 op ACC: na de uitrol van 9392809 kregen alle 195 eerder gescande etiketten het oude resultaat; alleen `rescan=true` gaf een nieuwe scan. Gevolg: na elke codeverbetering krijgt n8n voor al gescande etiketten de oude, slechtere uitkomst, tot iemand handmatig `LOGO_MODEL_VERSION` ophoogt.

## Capabilities

- **CAP-1**
  - **intent:** Na een uitrol met andere herkenningscode wordt een eerder resultaat niet hergebruikt; dezelfde aanvraag levert een nieuwe scan.
  - **success:** Test: scan klaar onder codeversie A; zelfde product, beeld, afnemer, modelversie en referentiepool onder codeversie B → nieuw scanId, geen `deduplicated`, één nieuwe taak. Die nieuwe rij heeft `attempt = 1` (telling per sleutel), ook als de aanvraag `rescan=true` is.
- **CAP-2**
  - **intent:** Binnen dezelfde code- en modelversie blijft hergebruik werken zoals nu.
  - **success:** Test: twee identieke aanvragen onder dezelfde codeversie → tweede antwoord `{scanId: <eerste>, deduplicated: true}`, geen nieuwe taak. De bestaande hergebruiktests blijven groen met een testopzet die `LOGO_IMAGE_TAG` op een vaste geldige hash zet en `SOURCE_COMMIT` verwijdert.
- **CAP-3**
  - **intent:** Is de codeversie onbekend of ongeldig, dan wordt nooit hergebruikt (gelijkheid niet aantoonbaar); de scan zelf werkt gewoon.
  - **success:** Test: (a) geen `LOGO_IMAGE_TAG` en geen `SOURCE_COMMIT`, (b) `LOGO_IMAGE_TAG=acc` (ook met geldige `SOURCE_COMMIT`), (c) een korte hash of `20261013` → twee identieke aanvragen geven twee verschillende scanIds en beide scans eindigen `done`.
- **CAP-4**
  - **intent:** De codeversie komt uit `LOGO_IMAGE_TAG` (de draaiende image); alleen als die ontbreekt of leeg is uit `SOURCE_COMMIT`. Geldig is uitsluitend een volledige commit-hash van 40 hexadecimale tekens, na weghalen van witruimte en omzetten naar kleine letters. De waarde wordt per aanvraag gelezen.
  - **success:** Test: met geldige `LOGO_IMAGE_TAG` verandert een wissel van `SOURCE_COMMIT` niets aan hergebruik, een wissel van `LOGO_IMAGE_TAG` wel. Zonder `LOGO_IMAGE_TAG` stuurt `SOURCE_COMMIT` het hergebruik. `" ABC…(40) "` en `"abc…(40)"` gelden als dezelfde versie.
- **CAP-5**
  - **intent:** Elke opgeslagen scanrij draagt één per aanvraag berekende hergebruiksleutel: `<LOGO_MODEL_VERSION>@<codeversie>` als beide bekend zijn, anders `<LOGO_MODEL_VERSION of unknown>@none`. Opzoeken gebeurt alleen met de volledige vorm; `@none` wordt nooit opgezocht.
  - **success:** Test: de rij van een gewone scan, van een vervangen (superseded) aanvraag en van een aanvraag zonder codeversie bevat respectievelijk `model-1@<hash>`, `model-1@<hash>` en `model-1@none`.
- **CAP-6**
  - **intent:** Het `modelVersion` in elk antwoord en de omzettabelstand (`validForModelVersion`, exacte match) blijven alleen van `LOGO_MODEL_VERSION` afhangen, zodat een uitrol een goedgekeurde automatisch-stand niet stil onbereikbaar of bereikbaar maakt.
  - **success:** Test: `logoResults.modelVersion` is exact `LOGO_MODEL_VERSION` (zonder achtervoegsel) bij een geslaagde én een mislukte scan.
- **CAP-7**
  - **intent:** De documentatie beschrijft de nieuwe sleutel, de bronvolgorde, het gedrag zonder codeversie en de herstart van `attempt`.
  - **success:** `docs/02-architecture/api-specification.md` (Dedupe-passage en `model_version`-definitie) noemt deze vier punten.

## Constraints

- Geen databasemigratie en geen schemawijziging: de sleutel reist mee in de bestaande kolom `model_version` (VarChar 256).
- `logoResults.v1.json` en de API-antwoorden veranderen niet.
- Geen wijziging aan omgevingsvariabelen op ACC of productie; de oplossing werkt met wat de uitrol al zet (VERIFIED op ACC: `LOGO_IMAGE_TAG` = `SOURCE_COMMIT` = image-revisie in app én ml-service).
- Oude rijen worden niet gewist of herschreven en blijven via hun scanId leesbaar; alleen nieuw hergebruik stopt.

## Non-goals

- De ml-service laten meesturen welke model- of codeversie hij draait.
- Herkenningswijzigingen zonder nieuwe commit herkennen (ml-omgevingsvariabelen zoals provider of taalmodel, modelactivatie via training); daarvoor blijft `LOGO_MODEL_VERSION` ophogen of `rescan` nodig.
- Een codeversie in het antwoord of in de omzettabel opnemen.
- Productie-inrichting: de productie-compose geeft `LOGO_MODEL_VERSION` niet door (geen env_file), dus hergebruik staat daar uit; dat blijft zo.
- Bestaande resultaten actief vervangen of n8n laten herscannen.

## Success signal

- Na de eerstvolgende uitrol naar ACC levert een herhaalde aanvraag voor een al gescand etiket (zonder `rescan`) een nieuwe scan met de nieuwe code; een tweede herhaling binnen 24 uur onder diezelfde uitrol wordt wél hergebruikt. Meting: `select model_version, count(*) from logo_scans where created_at > '<uitroltijdstip>' group by 1;` toont na de uitrol alleen sleutels `acc-20261006@<nieuwe SHA>`. Hergebruik schrijft geen rij; dat deel wordt gemeten aan `deduplicated: true` in het antwoord op de tweede herhaling. Bewust: elke uitrol, ook een die alleen documentatie raakt, zet hergebruik terug.

## Assumptions

- API en ml-service worden samen uitgerold onder één commit (VERIFIED op ACC 13-10 via gelijke `LOGO_IMAGE_TAG` in beide containers).
- Een wijziging van de omzettabel valt al onder de bestaande `policyVersion`-controle.
- Ontbreekt een geldige codeversie terwijl `LOGO_MODEL_VERSION` gezet is, dan meldt het logboek eenmalig dat hergebruik uitstaat.
- `LOGO_MODEL_VERSION` blijft ruim onder 215 tekens; daarboven past de sleutel niet in de kolom en faalt opslaan gelogd, zoals nu al boven 256.
- Risico, geen nieuw gedrag: direct na een uitrol missen alle herhaalaanvragen tegelijk; boven het wachtrijplafond (`LOGO_SCAN_MAX_QUEUED`, standaard 20) krijgt n8n het bestaande 503 BUSY met `Retry-After`.

## Open Questions

- Productie: moet hergebruik daar bij de inrichting aan, door `LOGO_MODEL_VERSION` door te geven en `RELEASE_SHA` als `LOGO_IMAGE_TAG`? Buiten scope van deze reparatie.
