---
titel: Meting Nutri-Score A–E op ACC
datum: 2026-11-24
spec: _bmad-output/specs/spec-nutriscore-acc-test/SPEC.md
trace: _bmad-output/test-artifacts/traceability/nutriscore-acc-test-trace.md
---

# Meting Nutri-Score A–E op ACC (24-11-2026)

**Uitkomst: geen enkele letter haalt de eis (≥ 80% gevonden én ≤ 10% vals).** De kleur-lezer (`nutriscore-a2`/`-head`) is precies maar vindt weinig. De valse meldingen komen vrijwel allemaal uit de `embedding`-route.

> [!warning] Voorbehoud
> - De scores gebruiken de ruwe `detections`, ook onder de drempel en bij twijfel. Dat zijn niet de `items` met `uitkomststand` die afnemers zien. Of er op `items` gescoord moet worden, is een open vraag (review A5).
> - De referentiebeelden van de oude route kunnen uit dezelfde etiketten komen. Trainingsoverlap is niet gemeten; de scores kunnen daardoor te gunstig zijn.
> - Een gewichtswijziging in MinIO is niet zichtbaar in de model- of referentieversie.

## Opzet

- Route: de oude route (`LOGO_SCAN_ROUTE` niet gezet). Alle antwoorden hebben `modelVersion` `acc-20261006` (336/336) en referentieversie `540:2026-08-26T06:14:43.350Z` (336/336).
- Waarheid: het veld `nutriscore` in `toets/uitslag.json`, alleen status `bevestigd`. Dat zijn 352 etiketten: A 26, B 27, C 32, D 32, E 22, en 213 zonder letter.
- 336 etiketten hebben een antwoord (`done`), 16 niet.
- Vals = het aandeel gemelde letters dat fout is.
- Herkomst van de Nutri-Score-detecties: `embedding` 200, `nutriscore-a2` 74, `nutriscore-head` 3.
- Herrekend op 24-11 met het herziene script (`report()` op de opgeslagen antwoorden, zonder nieuwe aanvragen). Dat leverde dezelfde hoofdtabel op als de oorspronkelijke run.

## Alle methoden

| letter | gevonden | vals | eis |
|---|---|---|---|
| A | 71% (17/24) | 72% (43/60) | niet |
| B | 30% (7/23) | 68% (15/22) | niet |
| C | 35% (11/31) | 62% (18/29) | niet |
| D | 26% (8/31) | 71% (20/28) | niet |
| E | 36% (8/22) | 11% (1/9) | niet |

## Alleen `nutriscore-a2` / `nutriscore-head` (kleur-lezer met vangnet)

| letter | gevonden | vals | eis |
|---|---|---|---|
| A | 33% (8/24) | 11% (1/9) | niet |
| B | 26% (6/23) | 0% (0/6) | niet |
| C | 16% (5/31) | 0% (0/5) | niet |
| D | 16% (5/31) | 0% (0/5) | niet |
| E | 32% (7/22) | 0% (0/7) | niet |

## Alleen `embedding` (dichtstbijzijnde referentie)

| letter | gevonden | vals | eis |
|---|---|---|---|
| A | 50% (12/24) | 78% (42/54) | niet |
| B | 9% (2/23) | 88% (15/17) | niet |
| C | 23% (7/31) | 72% (18/25) | niet |
| D | 10% (3/31) | 87% (20/23) | niet |
| E | 9% (2/22) | 33% (1/3) | niet |

## Origineel en herschaald (alle methoden)

161 etiketten zijn groter dan de verzendgrens van het script; het endpoint weigert bestanden boven 10 MB met 413. In deze run zijn ze verstuurd als JPEG q90 met chroma-subsampling (4:2:0). Dat is verliesgevend, dus niet dezelfde pixels als het origineel. Het herziene script gebruikt q95 zonder subsampling (4:4:4), zakt zo nodig tot q60 en verstuurt een etiket niet als het dan nog niet past. Er is niet opnieuw gemeten.

| letter | origineel (191): gevonden | origineel: vals | herschaald (161): gevonden | herschaald: vals |
|---|---|---|---|---|
| A | 73% (8/11) | 65% (15/23) | 69% (9/13) | 76% (28/37) |
| B | 50% (1/2) | 88% (7/8) | 29% (6/21) | 57% (8/14) |
| C | 50% (1/2) | 80% (4/5) | 34% (10/29) | 58% (14/24) |
| D | 33% (1/3) | 91% (10/11) | 25% (7/28) | 59% (10/17) |
| E | 33% (3/9) | 0% (0/3) | 38% (5/13) | 17% (1/6) |

Zonder antwoord: 10 bij origineel en 6 bij herschaald. De oorzaak per etiket is in deze run niet vastgelegd; het herziene script schrijft die naar `_fouten/<id>.json`.

## Bronnen

- Ruwe antwoorden: `~/logo-meetset-20261018/nutriscore-acc-20261124/antwoorden` (buiten de repo; 336 bestanden met status `done`).
- Waarheid: `~/logo-meetset-20261018/proef-detector/toets/uitslag.json`.
