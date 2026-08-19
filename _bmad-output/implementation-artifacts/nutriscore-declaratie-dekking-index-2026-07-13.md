# Nutri-Score-letterdeclaratie in de artwork-set — dekking A–E (via bestaande 12.7-infra)

Datum: 2026-07-14 · **read-only** (gedeployde app-container `051cf09`, hergebruik van `resolveDeclaredMarks` uit Story 12.7). Geen registratie, geen data-writes. De functie cachet zijn eigen catalog-resultaten read-through in MinIO (inherent aan 12.7, geen app-state-mutatie).

## Verdict: **DOORBRAAK — er is ruim genoeg C/D in de bestaande artwork-set, met gegarandeerd-juist label**

De artwork-set-GTINs (dezelfde die 12.12 oogstte) bevatten **22 producten met een gedeclareerde Nutri-Score C** en **16 met een D** — véél meer dan de ~3 per letter die nodig zijn om C en D herkenning-klaar te maken. De letter komt rechtstreeks uit de GDSN-declaratie (`nutritionalScore`, waarde A–E), dus het label is gegarandeerd juist, en het bijbehorende artwork zit al in onze set.

---

## Meetopzet
- **GTIN-set:** alle distinct artwork-GTINs met een GLN uit `artwork_imports` = **1.862** (de artwork-set die 12.12 oogstte).
- **Methode:** per GTIN de gedeployde `resolveDeclaredMarks(gtin)` aangeroepen (12.7 — haalt de catalog-tradeItem-XML op, gecached/fail-safe, parseert o.a. `<nutritionalScore>`), en de marks met `fieldType === 'NutritionalScore'` getally'd per waarde. Concurrency 12, read-only.

## Resultaat — Nutri-Score-letterverdeling over 1.862 artwork-GTINs

| Letter | # GTINs | voorbeeld-GTINs |
|--------|--------:|-----------------|
| A | 30 | 08710624317911, 08717774266366, 08710105065829 |
| B | 33 | 08720195571568, 08717774267196, 08717774263389 |
| **C** | **22** | 08718265015500, 03661405000537, 08719587359235 |
| **D** | **16** | 08718989045609, 08710400400288, 08726900037732 |
| E | 41 | 08718989040208, 08718452937226, 08710466326829 |
| **Totaal (letters)** | **142** | (over 145 GTINs met een NutritionalScore-mark) |

- **C = 22 GTINs, D = 16 GTINs.** Ruim boven de k=3-drempel.
- **Waarde-formaat:** de **kale letter A–E** (upper-cased door de parser). Bevestigd: de A–E-buckets zijn schone enkele letters.

## Artwork-bestaan voor C/D — bevestigd
Voor 5 C/D-voorbeeld-GTINs heeft elk een `artwork_imports`-record mét `storagePath` (de volledige artwork-pagina):

| GTIN | letter | artwork-imports | met storagePath |
|------|:------:|:---------------:|:---------------:|
| 08718265015500 | C | 1 | ✓ |
| 03661405000537 | C | 1 | ✓ |
| 08718989045609 | D | 3 | ✓ |
| 08710400400288 | D | 1 | ✓ |
| 08726900037732 | D | 1 | ✓ |

De C/D-producten hebben dus al artwork in onze set — klaar om te oogsten.

---

## Belangrijke kanttekeningen

1. **Dit is een ONDERGRENS.** Van de 1.862 GTINs resolveden er 812 "ok"; de rest gaf `api-fout` (493, catalog HTTP 500 — waarschijnlijk transiënte load tijdens de bulk-run), `lege-declaratie` (412) of `404-mogelijk-TM-mismatch` (145). De 493 api-fouten zijn niet succesvol bevraagd → de **echte C/D-aantallen liggen waarschijnlijk hoger** dan 22/16. Zelfs de ondergrens is ruim voldoende. Een herrun (de 812 zijn nu gecached, dus snel) zou de 493 opnieuw proberen.
2. **Parser-nuance (geen impact op de letter-telling):** de deployed regex `<…nutritionalScore[^>]*>` prefix-matcht óók `<nutritionalScoreProductCategoryCode>`, waardoor product-categorie-codes onder fieldType `NutritionalScore` meelekken (GENERAL_FOODS 128, CHEESES 5, FATS_NUTS_SEEDS 4, BEVERAGES 1, RED_MEAT 1). Die zijn schoon te scheiden van de A–E-letters (mijn telling doet dat), maar het is het signaleren waard voor de 12.7-crosscheck. Het beïnvloedt de A–E-dekking hierboven NIET.

## Conclusie
De **bestaande artwork-set volstaat** voor C en D: 22 C- en 16 D-producten (ondergrens) met een GDSN-gedeclareerde letter én aanwezig artwork. We hoeven (voorlopig) NIET breder dan de index/prod-corpus. De vervolgstap is een gerichte oogst: neem per C/D-GTIN de gedeclareerde letter als gegarandeerd label, lokaliseer de Nutri-Score-regio op het artwork (bestaande region-proposer/gate), en registreer die crops als `NUTRISCORE_C`/`NUTRISCORE_D`-referenties — geen menselijke letter-gok meer nodig (in tegenstelling tot de noisy 12.12-vorm-oogst). Zodra elk ≥3 crops heeft, draait conditie C voor C en D zoals bij A/B/E.

*Read-only; hergebruik van 12.7 `resolveDeclaredMarks`; 1.862 GTINs bevraagd; app-container `051cf09`. De catalog-lookups vullen alleen de bestaande read-through-cache (geen registratie/data-write).*
