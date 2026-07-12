# Story 19.15 — AC5 deel 2: read-only verificatie zaadkeuze (`resolveSeedPath` gids-voorkeur)

Datum: 2026-07-12 · **read-only op ACC** (uitsluitend `SELECT` op `reference_logos`, geen writes/deploy/container-mutatie). De 19.15-code is (nog) **niet gedeployd** — het query-LOGICA-verschil is rechtstreeks in SQL tegen de live ACC-DB bewezen, niet via gedeployde code.

**Verdict AC5 deel 2: GEHAALD.** Van de **21** klassen met zowel een gids- als een echte-crop-referentie wisselt de zaadkeuze in **21/21** gevallen van een ECHTE crop (oud) naar het GIDS-zaad (nieuw). GREEN_DOT is het verwachte kernvoorbeeld. De fallback voor gids-loze klassen is niet-brekend.

---

## Meetopzet

Twee queries, per klasse gedraaid en vergeleken op `storage_path` + `source` van de gekozen rij. `REAL_CROP_SOURCES = ('review-confirmed','realref-live-poc','flywheel-promotion')`. Geen `active`-filter (spiegelt `resolveSeedPath`).

- **OUD (newest-any):** `WHERE t3777_code=? AND storage_path <> '' ORDER BY created_at DESC LIMIT 1`.
- **NIEUW (gids-voorkeur):** `WHERE t3777_code=? AND storage_path <> '' AND (source IS NULL OR source <> ALL(REAL_CROP_SOURCES)) ORDER BY created_at DESC LIMIT 1`; bij geen resultaat → **fallback** = de OUDE query (newest-any).

Probe (read-only): `scratchpad/seedcheck.py`, `psycopg2` met `set_session(readonly=True)`.

---

## Kernbewijs (AC1) — klassen die van seed wisselen

**21 klassen** hebben ≥1 gids- én ≥1 echte-crop-referentie ("gemengd"). In **alle 21** koos de OUDE query een ECHTE crop (want die is nieuwer dan het gids-logo) en kiest de NIEUWE query het GIDS-zaad. Dit zijn precies de klassen die de bug raakte.

| Klasse | OUD source | NIEUW source (gids) |
|--------|-----------|---------------------|
| **GREEN_DOT** | review-confirmed | wikimedia (The_Green_Dot.svg) |
| BETER_LEVEN_1_STER | review-confirmed | gs1-packaging-label-guide |
| EU_ORGANIC_FARMING | review-confirmed | wikimedia (Organic-Logo.svg) |
| EUROPEAN_V_LABEL_VEGAN | review-confirmed | wikimedia (V-Label_Vegan) |
| FOREST_STEWARDSHIP_COUNCIL_MIX | review-confirmed | wikimedia (FSC) |
| MARINE_STEWARDSHIP_COUNCIL_LABEL | review-confirmed | gs1-packaging-label-guide |
| RAINFOREST_ALLIANCE_PEOPLE_NATURE | review-confirmed | gs1-packaging-label-guide |
| RECYCLABLE_GENERAL_CLAIM | realref-live-poc | gs1-packaging-label-guide |
| TRIMAN | review-confirmed | gs1-packaging-label-guide |
| CONFORMITE_EUROPEENNE | realref-live-poc | gs1-packaging-label-guide |
| CROSSED_GRAIN_SYMBOL | review-confirmed | gs1-packaging-label-guide |
| EUROPEAN_V_LABEL_VEGETARIAN | realref-live-poc | gs1-packaging-label-guide |
| VEGAN_SOCIETY_VEGAN_LOGO | realref-live-poc | gs1-packaging-label-guide |
| AISE_2020_COMPANY | realref-live-poc | gs1-packaging-label-guide |
| CCA_GLUTEN_FREE | review-confirmed | gs1-packaging-label-guide |
| WEIDEMELK | review-confirmed | gs1-packaging-label-guide |
| NUTRISCORE_A t/m E (5) | review-confirmed | synthetic-nutriscore-bootstrap |

**GREEN_DOT-casus (kernvoorbeeld):**
- OUD → `artwork-crops/08000146031236/0064b9cbb3be.png` · source `review-confirmed` (ECHTE crop)
- NIEUW → `reference-logos/GREEN_DOT/default.png` · source `https://commons.wikimedia.org/wiki/File:The_Green_Dot.svg` (GIDS)

Dit reproduceert exact de "NB" uit de Task 8-verificatie: vóór 19.15 zou de bootstrap voor GREEN_DOT een echte crop als zoekzaad pakken (hoge seed-cosine, geen conditie-C-marge zichtbaar); ná 19.15 pakt hij weer het gids-logo.

> NB NUTRISCORE A–E: het "gids"-zaad is hier het `synthetic-nutriscore-bootstrap`-zaad. Dat valt bewust buiten `REAL_CROP_SOURCES` (het is een synthetisch gids-achtig zaad, geen mens-bevestigde echte crop), dus de gids-voorkeur-query behandelt het correct als niet-echt en kiest het als zaad.

---

## Fallback (AC2) — niet-brekend voor gids-loze klassen

**7 klassen** hebben UITSLUITEND echte crops (geen gids-referentie). Bij die klassen levert de NIEUWE gids-voorkeur-query niets → de fallback (newest-any) grijpt → **identiek resultaat als OUD**. Geverifieerd (5 getoond):

| Klasse | NIEUW-modus | NIEUW == OUD |
|--------|-------------|:---:|
| BETER_LEVEN_2_STER | FALLBACK | ✓ |
| FREE_FROM_GLUTEN | FALLBACK | ✓ |
| HALAL | FALLBACK | ✓ |
| LACTOSE_FREE | FALLBACK | ✓ |
| PREGNANCY_WARNING | FALLBACK | ✓ |

De fix is dus niet-brekend: klassen zonder gids-zaad houden exact hun oude gedrag.

---

## NULL-source-bevinding

Op ACC zijn er momenteel **0** referentie-rijen met `source IS NULL` (met niet-lege `storage_path`). De NULL-safe `OR source IS NULL`-clausule uit de code-review-fix is dus **defensief correct maar niet geactiveerd** door de huidige ACC-data — alle gids-rijen dragen een expliciete niet-echte source (gs1-guide / wikimedia / synthetic). De clausule blijft nodig als vangnet voor toekomstige NULL-source-gidsen, maar verandert vandaag geen enkele keuze.

---

## Telling

- Gemengde klassen (gids + echte crop): **21**
- Klassen die van seed wisselen (OUD echte-crop → NIEUW gids): **21** (100% van de gemengde set)
- Gids-loze klassen (fallback, ongewijzigd): **7**
- NULL-source gids-rijen: **0**

Alles read-only tegen de ACC-DB; de 19.15-code is nog niet gedeployd.
