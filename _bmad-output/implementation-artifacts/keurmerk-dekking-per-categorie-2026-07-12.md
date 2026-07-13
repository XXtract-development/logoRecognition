# Keurmerk-dekking per GS1-categorie — ACC-stand 2026-07-12

Datum: 2026-07-12 · **read-only op ACC** (alleen `SELECT` op `reference_logos` + één MinIO-read van de volume-index). Geen writes. Gemeten via de gedeployde ml-container, base-image `ghcr.io/xxtract-development/logo-recognition-ml:6bf5fad`, DB Postgres `logo_recognition` (Cherry). Peil: actieve referenties (`active=true`).

`REAL_CROP_SOURCES = ('review-confirmed','realref-live-poc','flywheel-promotion')` = door mensen bevestigde ECHTE crops. Alle andere `source` (gids/wikimedia/synthetic/NULL) = gids/zaad. k-drempel conditie C = **3 actieve echte refs**.

---

## ⚠️ Belangrijke databevinding vooraf: `field_type` is GEEN werkende categorie-tag op ACC

De opdracht ging ervan uit dat `reference_logos.field_type` de GS1-categorie direct bevat. **Op de ACC-data klopt dat niet.** Feitelijke verdeling van `field_type` over de 241 actieve refs:

| field_type | refs | codes |
|-----------|-----:|------:|
| `PackagingMarkedLabelAccreditationCode` (schema-default) | 236 | 43 |
| `NutritionalScore` | 5 | 5 |

Alles zit in de **default-bucket** `PackagingMarkedLabelAccreditationCode` — óók codes die conceptueel DietType (VEGAN, HALAL, V-Label), EU-usage (PREGNANCY_WARNING, AISE) of Nutri-Score zijn. De 5 `NutritionalScore`-refs zijn uitsluitend de **synthetische Nutri-Score-zaden**; de 20+ echte Nutri-Score-crops staan óók onder de default. `gs1_field` is grotendeels NULL (203) en helpt evenmin. `DietTypeCode`, `EU_consumerUsageLabelCodeList` en `GHSSymbolDescriptionCode` hebben **0** refs met die field_type.

**Gevolg:** een categorie-split puur op `field_type` is niet betrouwbaar. Daarom rapporteer ik hieronder (a) de harde code-niveau-totalen, (b) het per-categorie gedeclareerde universe uit de MinIO-index (dié IS wél gecategoriseerd), en (c) een indicatieve hand-mapping van de gevulde codes naar hun echte categorie (klopt exact met de totalen).

---

## A. Totaalbeeld (code-niveau, hard)

| Metric | Waarde |
|--------|-------:|
| Codes met ≥1 actieve referentie ("vakken gevuld") | **43** |
| Totaal actieve referenties | **241** (203 echt + 38 gids) |
| Codes met ≥3 ACTIEVE refs | 21 |
| **Codes met ≥3 ECHTE refs (herkenning-klaar, conditie C)** | **20** |
| Codes met ≥1 ECHTE crop (mens-bevestigd, "echt gevuld") | **28** |
| Codes gids-only (≥1 ref, 0 echte crops → wacht op review) | **15** |

Het verschil 21 vs 20 bij "≥3": FAIRTRADE_COCOA heeft 3 gids-refs maar 0 echte → wel ≥3 totaal, niet herkenning-klaar.

---

## B. Gedeclareerd universe per categorie (uit MinIO-index — WÉL gecategoriseerd)

Uit `flywheel-index/keurmerk-etiket-index.json` (`summary.perKey`, sleutels `fieldType/code`) — dit zijn de codes die in productdeclaraties voorkomen (= er is artwork om in te zoeken, "harvestbaar"):

| GS1-categorie | gedeclareerde codes |
|---------------|--------------------:|
| PackagingMarkedLabelAccreditationCode | 18 |
| DietTypeCode | 7 |
| EU_consumerUsageLabelCodeList | 6 |
| NutritionalScore | 1 |
| GHSSymbolDescriptionCode | 0 |
| **Totaal** | **32** |

De index categoriseert dus wél netjes — de categorie-informatie bestaat in het systeem, alleen niet op `reference_logos.field_type`.

---

## C. Dekking per categorie (indicatieve hand-mapping van de 43 gevulde codes)

> Categorie hand-toegekend op basis van de code-betekenis (NIET uit `field_type`, dat op ACC één default-bucket is). De totalen reconciliëren exact met sectie A (43 gevuld / 20 ≥3-echt / 28 met-echt / 15 gids-only).

| Categorie | codes gevuld | codes met ≥1 echte crop | codes ≥3 echte refs (herkenning-klaar) | gids-only (wacht) | gedeclareerd universe (index) | duiding |
|-----------|:-----------:|:----------------------:|:--------------------------------------:|:-----------------:|:-----------------------------:|---------|
| **PackagingMarkedLabelAccreditationCode** (bio/Fairtrade/FSC/MSC/recycling/dierenwelzijn) | 17 | 11 | **11** | 6 | 18 | engine bewezen — sterkste categorie |
| **NutritionalScore** (Nutri-Score A–E) | 5 | 5 | **4** (A,B,C,E; D=2) | 0 | 1 | engine bewezen, bijna vol |
| **DietTypeCode** (vegan/veg/halal/glutenvrij/lactose) | 18 | 9 | **3** (VEGAN, V-Label-Vegan, FREE_FROM_GLUTEN) | 9 | 7 | deels gevuld — lange halal-staart nog gids-only |
| **EU_consumerUsageLabelCodeList** (zwangerschap/AISE/statiegeld) | 3 | 3 | **2** (PREGNANCY_WARNING, RETURNABLE_CAN_NL) | 0 | 6 | deels gevuld — universe groter dan gevuld |
| **GHSSymbolDescriptionCode** (gevaarpictogrammen) | 0 | 0 | 0 | 0 | 0 | **leeg — nieuw spoor, nog niet gestart** |
| **Totaal** | **43** | **28** | **20** | **15** | 32 | |

### Herkenning-klare codes per categorie (≥3 echte refs)
- **Packaging (11):** RAINFOREST_ALLIANCE_PEOPLE_NATURE (26), RECYCLABLE_GENERAL_CLAIM (26), GREEN_DOT (16), BETER_LEVEN_1_STER (11), EU_ORGANIC_FARMING (10), WEIDEMELK (9), FOREST_STEWARDSHIP_COUNCIL_MIX (7), MARINE_STEWARDSHIP_COUNCIL_LABEL (6), TRIMAN (6), BETER_LEVEN_2_STER (6), CONFORMITE_EUROPEENNE (3).
- **Nutri-Score (4):** NUTRISCORE_A (12), NUTRISCORE_E (9), NUTRISCORE_B (9), NUTRISCORE_C (5). *(NUTRISCORE_D = 2 echt → net onder k.)*
- **DietType (3):** EUROPEAN_V_LABEL_VEGAN (12), VEGAN (9), FREE_FROM_GLUTEN (4).
- **EU-usage (2):** PREGNANCY_WARNING (4), RETURNABLE_CAN_NL (3).

### Gaten
- **GHSSymbolDescriptionCode: volledig leeg** (0 refs, 0 gedeclareerd in de index) — dit spoor is nog niet aangevangen.
- **DietType-halal-staart:** HALAL_CORRECT, HALAL_CERTIFICATION_SERVICES, IFANCA_HALAL, HALAL_QUALITY_CONTROL, ECC_HALAL, DZG_GLUTEN_FREE, NSF_GLUTEN_FREE, ALLERGYCERTIFIED, ALLERGY_UK_SEAL_APPROVAL — alleen een gids-zaad, 0 echte crops. Wachten op review-bevestiging.
- **Packaging gids-only (6):** FAIRTRADE_COCOA (3 gids), FAIR_TRADE_MARK, SEPARATE_COLLECTION, ON_THE_WAY_TO_PLANETPROOF, CERTIFIED_B_CORPORATION, RAINFOREST_ALLIANCE — gezaaid, nog geen bevestigde crop.
- **NUTRISCORE_D** net onder de k=3-drempel (2 echte crops).

---

## Duiding per categorie (samenvattend)
- **PackagingMarkedLabelAccreditationCode — engine bewezen.** 11 codes herkenning-klaar, tot 26 echte crops per code; de kernmotor van het vliegwiel draait hier.
- **NutritionalScore — engine bewezen, bijna vol.** 4/5 klaar, alleen D net onder de drempel.
- **DietTypeCode — deels gevuld.** 3 klaar (vegan/V-Label/glutenvrij), maar een lange halal-staart staat nog op gids-only.
- **EU_consumerUsageLabelCodeList — deels gevuld.** 2 klaar; het gedeclareerde universe (6) is groter dan wat gevuld is.
- **GHSSymbolDescriptionCode — leeg.** Nieuw spoor, nog geen enkele referentie of declaratie in de index.

---

## Exacte queries (read-only)
1. **Per-code aggregatie** (basis voor A en C):
   ```sql
   SELECT t3777_code,
          COUNT(*) total_active,
          COUNT(*) FILTER (WHERE source = ANY(ARRAY['review-confirmed','realref-live-poc','flywheel-promotion'])) real_active,
          COUNT(*) FILTER (WHERE source IS NULL OR source <> ALL(ARRAY['review-confirmed','realref-live-poc','flywheel-promotion'])) guide_active
   FROM reference_logos WHERE active=true AND t3777_code IS NOT NULL GROUP BY t3777_code;
   ```
2. **field_type-verdeling** (bevinding sectie ⚠️):
   ```sql
   SELECT field_type, count(*) refs, count(DISTINCT t3777_code) codes
   FROM reference_logos WHERE active=true GROUP BY field_type;
   ```
3. **Gedeclareerd universe:** MinIO `flywheel-index/keurmerk-etiket-index.json` → `summary.perKey`, sleutels gesplitst op `fieldType/code`, uniek per fieldType geteld.

Alles read-only; peil actieve referenties op 2026-07-12, image-tag `6bf5fad`.
