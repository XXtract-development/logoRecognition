# 20.1 — Meting: gedeclareerde gebruiksinfo-codes (EU_consumerUsageLabelCodeList) × artwork-set

Datum: 2026-07-16 · Read-only · Bron: prod-MongoDB `application.tradeItems` (bron van waarheid voor declaraties), server-side mongosh-scan over de 1.870 artwork-(GLN,GTIN)-paren (2.420 tradeItem-documenten over alle doelmarkten).

## Waarom prod-Mongo en niet de ACC-catalog-API

Eerste meetpoging via `catalog.acc.xxtract.com/api/tradeitemxml` haalde maar 267/1.870 producten op (404 = product niet in ACC-catalog/TM-mismatch; 500 = bekend upstream-gat). Dit verklaart met terugwerkende kracht ook waarom de 12.15-declaratiekaart "slechts" 142/1.862 resolved rapporteerde: dat was ACC-catalog-dekking, geen declaratie-dekking. Prod-Mongo bevat de volledige set.

## Resultaat: 193 producten declareren gebruiksinfo-logo's

| Code (gedeclareerde vorm) | Producten | Gids-logo beschikbaar? |
|---|---:|---|
| **PREGNANCY_WARNING** | **161** | ❌ niet in de GS1-gids — externe officiële bron nodig |
| **DO_NOT_DRINK_AND_DRIVE_WARNING** | **97** | ❌ idem |
| **MINIMUM_DRINKING_AGE_18_WARNING** | **60** | ❌ idem |
| AISE_1 (buiten bereik kinderen) | 28 | ✅ gids `KEEP_AWAY_FROM_CHILDREN` |
| AISE_5 (niet inslikken) | 17 | ✅ gids `DO_NOT_INGEST` |
| AISE_2 (oogcontact vermijden) | 13 | ✅ gids `KEEP_AWAY_FROM_EYES` |
| AISE_12 (zak goed sluiten) | 9 | ✅ gids `CLOSE_THE_BAG` |
| AISE_10 (droge handen) | 7 | ✅ gids `USE_WITH_DRY_HANDS` |
| AISE_14 (capsules niet lostrekken) | 7 | ❌ niet in de gids |
| DO_NOT_FLUSH | 5 | ❌ niet in de gids (A.I.S.E.-icoon, externe bron) |
| NIX18 | 1 | ❌ niet in de gids (officiële NIX18-huisstijl) |

## Kernconclusies

1. **De gedeclareerde code-vorm is de Benelux-lijst** (AISE_x + waarschuwings-codes) — exact onze frontend-`CONSUMER_USAGE_CODES`. De GDS-namen uit het gids-blad worden door géén enkel product gedeclareerd. Seeding moet dus onder de AISE_x-/waarschuwings-codes gebeuren, met de gids-GDS-naam als bron-alias.
2. **De koppeltabel is authoritatief afleidbaar**: het Benelux-datamodel (`benelux-fmcg-data-model-31362-nederlands.xlsx`, blad Codelijsten) geeft per AISE_x de officiële Engelse naam die 1-op-1 matcht met de gids-GDS-naam. Mapping (gids → declaratiecode): KEEP_AWAY_FROM_CHILDREN→AISE_1, KEEP_AWAY_FROM_EYES→AISE_2, RINSE_HANDS_AFTER_USE→AISE_3, AVOID_PROLONGED_SKIN_CONTACT→AISE_4, DO_NOT_INGEST→AISE_5, DO_NOT_CHANGE_CONTAINERS→AISE_6, DO_NOT_MIX_WITH_OTHER_PRODUCTS→AISE_7, VENTILATE_ROOM_AFTER_USE→AISE_8, USE_WITH_DRY_HANDS→AISE_10, CLOSE_THE_LID→AISE_11 (gids-typo `CLOSE _THE_LID`), CLOSE_THE_BAG→AISE_12, DO_NOT_PIERCE_BREAK_OR_CUT→AISE_13. Niet in de gids: AISE_9, AISE_14.
3. **80% van het declaratie-volume zit in de 3 alcohol-waarschuwingen** (zwangerschap 161, niet-rijden 97, 18+ 60) — en juist die hebben géén gids-logo. Voor de uitrol-impact zijn externe officiële pictogram-bronnen dus belangrijker dan de AISE-gids-seeds. Kandidaat-bronnen (goed te keuren door Friso): het gestandaardiseerde zwangerschaps-pictogram (doorgestreepte zwangere vrouw, EU/FR-wetgeving), de STIVA/"Geen 18, geen alcohol"-beeldmerken, NIX18-huisstijl. → follow-up-beslissing, buiten 20.1-scope.
4. **Sampler-scope voor 20.2 (gedeclareerd ∧ artwork ∧ zaadbaar nu):** AISE_1, AISE_2, AISE_5, AISE_10, AISE_12 (samen 74 declarerende producten). Na de externe-bron-beslissing: + PREGNANCY_WARNING, DO_NOT_DRINK_AND_DRIVE_WARNING, MINIMUM_DRINKING_AGE_18_WARNING (samen ~318 declaratie-instanties).
5. **Bron-loos-lijst** (gedeclareerd, geen bron in gids): PREGNANCY_WARNING, DO_NOT_DRINK_AND_DRIVE_WARNING, MINIMUM_DRINKING_AGE_18_WARNING, AISE_14, DO_NOT_FLUSH, NIX18.

Ruwe data: scratchpad `cu_prod_meting.json` (per code de GTIN-lijst, voor de 20.2-sampler-run en de herkennings-tests).


## Seed-resultaat (2026-07-16, met toestemming Friso)

- **12/12 gids-pictogrammen geseed** op ACC onder de gedeclareerde AISE-codes (AISE_1 t/m 8, 10 t/m 13), fieldType `EU_consumerUsageLabelCodeList`, gs1Field `enumerationValue`, variantLabel `gs1-guide`, herkomst-alias (`guideSourceCode`) in het manifest vastgelegd.
- Embedding-rebuild automatisch meegedraaid: 256 referenties verwerkt, 0 fouten. DB-verificatie: alle 12 actief met 1 embedding elk.
- Idempotentie bevestigd: tweede run herschrijft dezelfde (code, variant)-rijen, 0 nieuwe records.
- Template-telling na seeding: 256 actieve referenties totaal (was 244).

## Sampler-scope 20.2 (definitief)

Direct te bemonsteren (gedeclareerd ∧ artwork ∧ gezaaid): **AISE_1 (28), AISE_5 (17), AISE_2 (13), AISE_12 (9), AISE_10 (7)** — GTIN-lijsten in `20-1-meting-consumerusage-data.json`. De overige gezaaide AISE-codes (3/4/6/7/8/11/13) hebben geen declarerende artwork-producten en dienen als bibliotheek-dekking.


## Route A gestart (2026-07-16, keuze Friso)

Voor de 3 waarschuwings-codes is gekozen voor **oogsten uit eigen artwork** (route A) i.p.v. externe bronnen: echte crops zijn bewezen sterkere referenties (12.3-les) en vermijden licentie-/stijlvarianten-vragen. Correctie op de startsituatie: de bestaande "1 actieve code / 4 refs" in categorie 3 blijkt **PREGNANCY_WARNING** te zijn (eerdere bootstrap-run) — zwangerschap heeft dus al echte referenties; niet-rijden en 18+ starten op 0.

Klaargezet in de beoordelings-wachtrij (reason `route-a-waarschuwing`, volledige pagina als startbeeld, Friso tekent het kader + accepteert): PREGNANCY_WARNING 6, MINIMUM_DRINKING_AGE_18_WARNING 5, DO_NOT_DRINK_AND_DRIVE_WARNING 4 open items. Script: scratchpad route_a_items.py (idempotent via review_item_exists; dedup bleek (gtin, source_file)-breed — 1 slot-telling-fix onderweg). Externe bronnen (route B) blijven alleen als restdekking voor AISE_9/POULTRY_MEAT_WARNING in beeld.


## Sampler-run uitgevoerd (2026-07-16, generieke declaratie-oogst)

Dry-run voorspelde 36 kandidaten; echte run leverde exact **36 open review-items** (voorspelling = uitkomst, 285 paren in ~7 min): PREGNANCY_WARNING 15 (cap; 17 extra beschikbaar voor een volgende ronde), DO_NOT_DRINK_AND_DRIVE_WARNING 8, MINIMUM_DRINKING_AGE_18_WARNING 5, AISE_1 3, AISE_5 3, AISE_2 2. AISE_10/AISE_12 gaven 0 boven de vloer (gids-zaad matcht die pagina's niet ≥0,60) — herkansen nadat de eerste echte crops van de andere codes bevestigd zijn (conditie C-effect), of met een verlaagde vloer.
