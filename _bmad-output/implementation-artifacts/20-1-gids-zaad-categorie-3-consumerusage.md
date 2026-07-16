# Story 20.1: Gids-zaad + declaratie-meting voor categorie 3 (Gebruiksinfo-logo's / EU_consumerUsageLabelCodeList)

Status: review

<!-- Eerste story van epic 20 "Uitrol keurmerk-vakken" (uitrolplan 2026-07-07, volgorde 4→3→2→1;
     categorie 4 Nutri-Score afgerond via epic 12). Friso gaf 2026-07-16 de start-go voor categorie 3.
     Registratie in sprint-status.yaml in dezelfde werkbeurt = retro-actiepunt 1 van epic 12. -->

## Story

Als beheerder van de keurmerk-referentiebibliotheek
wil ik de categorie-3-vakken (consumenten-gebruiksinfo-pictogrammen) gezaaid hebben met officiële gids-logo's én weten welke van die codes daadwerkelijk gedeclareerd worden op producten met artwork,
zodat de sampler gericht kandidaat-crops kan vinden en de uitrol-lus (vullen → bevestigen → herkennen) voor categorie 3 kan starten.

## Context / kernfeiten (empirisch geverifieerd 2026-07-16)

- **Startsituatie ACC:** categorie 3 heeft 1 actieve code / 4 refs (AISE-achtig, via vliegwiel). Universe volgens frontend-codelijst (`apps/web/src/data/spoor-codes.ts` `CONSUMER_USAGE_CODES`): 21 codes (AISE_1–AISE_14, NIX18, PREGNANCY_WARNING, DO_NOT_FLUSH, DO_NOT_DRINK_AND_DRIVE_WARNING, MINIMUM_DRINKING_AGE_18_WARNING, POULTRY_MEAT_WARNING).
- **Gids-inventaris (gemeten in `Packaging_label_guide_January2026_3_1_35.xlsx`, staat in ~/Downloads):** sheet `Labels_Instructions` = **12 embedded pictogrammen** met kolom-A-codes voor attribuut `consumerUsageLabelCode/…/enumerationValue`: KEEP_AWAY_FROM_CHILDREN, RINSE_HANDS_AFTER_USE, DO_NOT_INGEST, DO_NOT_MIX_WITH_OTHER_PRODUCTS, KEEP_AWAY_FROM_EYES, AVOID_PROLONGED_SKIN_CONTACT, DO_NOT_CHANGE_CONTAINERS, VENTILATE_ROOM_AFTER_USE, USE_WITH_DRY_HANDS, CLOSE_THE_BAG, `CLOSE _THE_LID` (⚠️ spatie-typo in de gids — normaliseren), DO_NOT_PIERCE_BREAK_OR_CUT.
- **⚠️ Codelijst-mismatch (de kern-onzekerheid):** de gids gebruikt wereldwijde GDS-enumeration-codes; onze frontend-lijst heeft Benelux-stijl `AISE_1`–`AISE_14`. Welke vorm leveranciers ÉCHT declareren bepaalt onder welke `t3777Code` gezaaid moet worden — dat beslist de meting (Task 1), niet een aanname. `parseDeclaredMarks` (apps/api/src/services/t3777-declarations.ts) parseert het `consumerUsageLabelCode`-blok al en levert de rauwe declaratiecodes.
- **NIET in de gids:** NIX18, PREGNANCY_WARNING, DO_NOT_FLUSH e.d. — daarvoor is een aanvullende officiële bron nodig (buiten scope; alleen registreren wélke gedeclareerde codes bron-loos blijven).
- **Seed-mechanisme bestaat en is bewezen (12.1):** `apps/api/scripts/extract_gs1_label_guide.py` (nu hard op sheet `Labels_Packaging`) + `apps/api/scripts/seed-reference-logos-from-guide.js` (idempotent upsert per (code, variant); `GS1_FIELD`-map bevat `EU_consumerUsageLabelCodeList: 'enumerationValue'` al; roept na import de ML rebuild-reference-embeddings + reload-templates endpoints aan).
- **Sampler-randvoorwaarde:** zonder gids-zaad vindt de bootstrap/sampler geen kandidaten (de 17/32-overslag-les uit 19.8).

## Acceptatiecriteria

1. **AC1 — Meting declaratie×artwork (read-only).** Er is een reproduceerbaar meetresultaat (markdown-rapport in implementation-artifacts) dat per gedeclareerde consumerUsage-code telt: (a) hoeveel GTINs in de artwork-set (~1.881) hem declareren (via `resolveDeclaredMarks`/catalog, patroon 12.15-map-builder), (b) of er artwork-pagina's voor die GTINs zijn. Het rapport beantwoordt expliciet: welke code-vorm wordt gedeclareerd (AISE_x, GDS-namen, of beide) en welke top-codes een gids-logo hebben.
2. **AC2 — Extractie-uitbreiding.** `extract_gs1_label_guide.py` kan via een parameter (bv. `--sheet Labels_Instructions --field-type EU_consumerUsageLabelCodeList --gs1-field enumerationValue`) het instructie-blad extraheren; codes worden genormaliseerd (trim, interne spaties → underscore-conventie: `CLOSE _THE_LID` → `CLOSE_THE_LID`); manifest draagt fieldType/gs1Field per entry; default-gedrag (Labels_Packaging) blijft byte-identiek.
3. **AC3 — Seeding (permission-gated ACC-schrijf).** De 12 instructie-pictogrammen zijn geseed als actieve gids-referenties (`variantLabel gs1-guide*`, fieldType `EU_consumerUsageLabelCodeList`, gs1Field `enumerationValue`) onder de code-vorm die de meting (AC1) als gedeclareerde vorm aanwijst (bij dubbele vorm: de gedeclareerde vorm wint; gids-GDS-naam als alias vastleggen in het rapport). Idempotent: tweede run = 0 nieuwe rijen.
4. **AC4 — Embeddings herbouwd.** Na seeding zijn de reference-embeddings herbouwd (bestaand endpoint uit 12.1) zodat de gezaaide codes vindbaar zijn voor sampler/classify; aantoonbaar via de embedding-telling per gezaaide code (> 0).
5. **AC5 — Uitrol-startlijst.** Het rapport eindigt met de concrete sampler-scope voor de volgende story (20.2): de lijst codes die (gedeclareerd ∧ artwork ∧ gezaaid) zijn, plus de lijst "gedeclareerd maar bron-loos" (NIX18 e.d.) als expliciete follow-up.
6. **AC6 — Tests.** ATDD: extractie-uitbreiding (sheet-parameter, veld-metadata, code-normalisatie incl. de spatie-typo, default-gedrag ongewijzigd) rood→groen; bestaande 12.1-extractietests blijven groen; seed-script-helpers (variant/storage-path) ongewijzigd bewezen door bestaande tests.

## Taken

1. **Task 1 (AC1):** Meetscript (TS, patroon `build-nutriscore-declared-map.ts`): itereer artwork-GTINs → `resolveDeclaredMarks` → verzamel `EU_consumerUsageLabelCodeList`-codes (rauwe vorm!) → kruis met artwork-aanwezigheid → rapport `20-1-meting-consumerusage-declaraties.md`. Read-only; catalog-cache hergebruiken.
2. **Task 2 (AC2, AC6):** RED-tests voor de extractie-uitbreiding → implementatie (`--sheet`/`--field-type`/`--gs1-field` + normalisatie) → GREEN; volledige bestaande extractie-suite groen.
3. **Task 3 (AC3):** Lokale extractie-run (xlsx in ~/Downloads) → manifest + PNG's → docker cp naar ACC api-container → seed-run. **Éérst expliciete toestemming van Friso voor de ACC-schrijf.**
4. **Task 4 (AC4):** Rebuild-endpoint aanroepen + verificatie embedding-telling per code (read-only query).
5. **Task 5 (AC5):** Rapport afronden met sampler-scope 20.2 + bron-loos-lijst.

## Dev Notes

- **Volg 12.1's beslissingen:** seeds mogen < 200px (bewuste bypass van de 7.3-uploadvloer); `deriveVariantLabel`/`buildStoragePath` hergebruiken; upsert-sleutel (t3777Code, variantLabel).
- **Geen migraties** ([[feedback-no-migrations-without-permission]]); datamodel is toereikend (fieldType/gs1Field bestaan).
- **WMF-waarschuwing:** openpyxl dropt wmf-beelden (gezien bij de inventaris-run); tel expliciet hoeveel van de 12 beelden decodeerbaar zijn en rapporteer drops i.p.v. stil verlies (12.1-les: EMF gedropt).
- **Template-cap bewaken (12.1 risico A):** 12 extra templates op de localize-kosten is beperkt, maar noteer de nieuwe template-telling in het rapport; de region-proposer-route (12.2) blijft de structurele lijn.
- **Lock-step:** story + sprint-status-entry in dezelfde commit (epic-12-retro-actiepunt 1); epic-20 + 20-1 + 20-2 (backlog) direct registreren.

## Change Log

- 2026-07-16: aangemaakt (bmad-create-story) na Friso's start-go voor de categorie-3-uitrol; gids-inventaris en codelijst-mismatch empirisch vastgesteld; eerste story van epic 20.

- 2026-07-16 (zelfde dag): **Task 1 + Task 2 af.** Meting via prod-Mongo (ACC-catalog bleek 404/500-gaten te hebben; verklaart ook 12.15's 142/1862): 193 declarerende producten, gedeclareerde vorm = Benelux-lijst; top-3 = alcohol-waarschuwingen (161/97/60) ZONDER gids-logo; AISE↔GDS-koppeltabel authoritatief afgeleid uit het Benelux-datamodel. Zie 20-1-meting-consumerusage-declaraties.md (+ -data.json). Extractie-uitbreiding ATDD: 4 RED→GREEN (--sheet/--field-type/--gs1-field + opt-in --normalize-codes; validatie afgestemd op echte codes met +/haakjes/mixed case); Labels_Packaging-default empirisch BYTE-IDENTIEK bewezen (oud-vs-nieuw manifest-diff op alle 1026 beelden); 2 pre-existing stale asserties ("ACCREDITATION") gefixt; suite 9/9 groen. RESTEERT: Task 3 seed (12 gids-pictogrammen onder AISE_x-codes, permission-gated), Task 4 embedding-rebuild, Task 5 rapport-afronding; plus Friso-beslissing externe bronnen voor de 3 waarschuwings-pictogrammen.
- 2026-07-16 (zelfde dag): **Task 3+4+5 af (seed met Friso's akkoord).** Lokale extractie (12/12 decodeerbaar, 0 drops) → GDS→AISE-remap (herkomst als `guideSourceCode` in manifest) → seed op ACC via /app-pad (les: script moet ín /app staan voor module-resolutie) → rebuild 256 refs/0 fouten → DB-verificatie 12/12 actief + embedding. Idempotentie: run 2 = zelfde rijen, 0 nieuw. AC1-6 daarmee alle vervuld; adversariële review gestart. Open follow-up (buiten scope, voorstel aan Friso): bron-route voor de 3 alcohol-waarschuwingen + AISE_14/DO_NOT_FLUSH/NIX18.
- 2026-07-16: **Adversariële review PASS** (byte-identiteit default-pad onafhankelijk herbevestigd op alle 1026 beelden; alle kolom-A-waarden van alle 5 gids-bladen getoetst: 0 false rejects). 2 van 3 LOWs direct verwerkt: L1 nette fout bij onbestaand --sheet (exit 2 i.p.v. KeyError, +test), L2 GDS→AISE-remap als gecommit --code-map-bestand (apps/api/scripts/code-maps/consumerusage-aise.json, +test met herkomst-alias-assert; herseeden op prod/nieuwe gids-versie is nu reproduceerbaar). L3 (normalize-flag zou 1 bestaande Labels_Packaging-code hernoemen: VIGNERONS...France) = inherente, gedocumenteerde eigenschap van de bewuste opt-in — geen wijziging. Suite 11/11. Status → review; done-flip na sampler-run 20.2 of eerdere bevestiging.
