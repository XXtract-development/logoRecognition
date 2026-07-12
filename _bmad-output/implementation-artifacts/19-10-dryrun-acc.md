# Story 19.10 — AC6: DRY-RUN validatie van de nieuwe `queue_harvest`-scoping (ACC, read-only)

Datum: 2026-07-12 · **read-only op ACC** (`HARVEST_DRY_RUN=1`, geen crop-upload, geen DB-INSERT, geen state.json-write). De gedeployde ml-container is NIET gewijzigd: de branch-code is in een **wegwerp-container** (`docker run --rm`, `--network container:<ml>` voor identieke MinIO/DB-toegang) gedraaid met de branch-`app/` read-only gemount. Base-image: `ghcr.io/xxtract-development/logo-recognition-ml:0c9712f`. Branch-code: `epic-19-19.10` worktree, `apps/ml-service/app/services/queue_harvest.py` (geverifieerd: binnen `services/` is dit het enige inhoudelijk gewijzigde bestand t.o.v. het deployed image).

**Verdict AC6: GEHAALD.** De nieuwe scoping levert `topn = (top-N-volume ∪ sub-k) − exclude` = **30 codes** (niet alle 43 actieve). RECYCLABLE_GENERAL_CLAIM en TRIMAN zijn uitgesloten ook al staan ze hoog in de volume-ranking. De volume-index wordt gevonden en gelezen. De DRY-RUN muteerde niets (`inserted: 0`) en er is geen flood.

---

## 1. Scoping (AC1/AC3) — `topn = (top-N-volume ∪ sub-k) − exclude`

Config (branch-defaults, geen env-override): `HARVEST_TOP_N=30`, `MIN_REFS_SUB_K=3`, `HARVEST_EXCLUDE_CODES={RECYCLABLE_GENERAL_CLAIM, TRIMAN}`, `HARVEST_FLOOR=0.85`, `DRY_RUN=true`.

- **Actieve referentie-codes in de DB:** 43. De oude scope was "elke code met ≥1 actieve referentie" (43). De nieuwe scope is **30** — bewijs dat de begrenzing werkt (het is géén "alle actieve codes").
- **Samenstelling van de 30:**
  - **top-N-volume (uit de index):** 15 codes rangschikbaar op volume; ná aftrek van de 2 excludes → 13 dragen bij. `top_by_volume_count = 15`.
  - **sub-k (<3 actieve refs):** 21 codes. Altijd meegenomen, ook als ze niet in de top-volume staan. `sub_k_count = 21`.
  - **overlap (zowel volume als sub-k):** 4 (CERTIFIED_B_CORPORATION, HALAL, HALAL_QUALITY_CONTROL, SEPARATE_COLLECTION).
  - Union 15 ∪ 21 = 32; **− exclude (2)** = **30**. ✓
  - **9 codes puur uit volume** (niet sub-k): CONFORMITE_EUROPEENNE, EUROPEAN_V_LABEL_VEGAN, FOREST_STEWARDSHIP_COUNCIL_MIX, FREE_FROM_GLUTEN, GREEN_DOT, PREGNANCY_WARNING, RAINFOREST_ALLIANCE_PEOPLE_NATURE, RETURNABLE_CAN_NL, VEGAN.
  - **17 codes puur uit sub-k** (niet in de top-volume) — bewijs dat sub-k óók zonder volume-ranking meetelt: AISE_2020_COMPANY, ALLERGYCERTIFIED, ALLERGY_UK_SEAL_APPROVAL, CCA_GLUTEN_FREE, CROSSED_GRAIN_SYMBOL, DZG_GLUTEN_FREE, ECC_HALAL, EUROPEAN_V_LABEL_VEGETARIAN, FAIR_TRADE_MARK, HALAL_CERTIFICATION_SERVICES, HALAL_CORRECT, IFANCA_HALAL, LACTOSE_FREE, NSF_GLUTEN_FREE, ON_THE_WAY_TO_PLANETPROOF, RAINFOREST_ALLIANCE, VEGAN_SOCIETY_VEGAN_LOGO.

- **Exclude werkt aantoonbaar, óók tegen hoog-volume codes:** in de volume-ranking staan **RECYCLABLE_GENERAL_CLAIM (volume 32, 27 actieve refs)** en **TRIMAN (volume 13, 7 actieve refs)** hoog — beide zouden zonder de flood-guard ruim in de top-N-volume vallen. Toch: `recyclable_in_topn = false`, `triman_in_topn = false`. De exclude-lijst wint van top-N én sub-k. Dit is precies de flood-staart die de story wil weren.

**Volume-ranking (top-15, gelezen uit de index):**

| # | code | volume | in topn? |
|--:|------|-------:|:--:|
| 1 | PREGNANCY_WARNING | 57 | ✓ |
| 2 | VEGAN | 39 | ✓ |
| 3 | **RECYCLABLE_GENERAL_CLAIM** | 32 | ✗ (excluded) |
| 4 | GREEN_DOT | 23 | ✓ |
| 5 | RAINFOREST_ALLIANCE_PEOPLE_NATURE | 14 | ✓ |
| 6 | **TRIMAN** | 13 | ✗ (excluded) |
| 7 | FREE_FROM_GLUTEN | 7 | ✓ |
| 8 | FOREST_STEWARDSHIP_COUNCIL_MIX | 4 | ✓ |
| 9 | HALAL | 3 | ✓ |
| 10 | SEPARATE_COLLECTION | 3 | ✓ |
| 11–15 | CERTIFIED_B_CORPORATION(2), CONFORMITE_EUROPEENNE(1), EUROPEAN_V_LABEL_VEGAN(1), HALAL_QUALITY_CONTROL(1), RETURNABLE_CAN_NL(1) | | ✓ |

---

## 2. Volume-index (AC1)

- **Gevonden en gelezen:** `flywheel-index/keurmerk-etiket-index.json` bestaat in MinIO. `volume_index_found = true`, `volume_index_size = 32` codes met numerieke volume-waarde → bruikbare `code→volume`-ranking.
- **No-fallback-gedrag geverifieerd:** in een eerste run met verkeerde MinIO-credentials (index onleesbaar) gaf `_load_volume_index` bewust `{}` → `top_by_volume` leeg → `topn` viel terug op **alleen sub-k (21) − exclude**, en NIET op "alle actieve codes". Dat is exact het gedocumenteerde AC1-gedrag: een ontbrekende index versmalt de scope, hij verbreedt hem nooit naar alles.
- NB: de index rankt 32 codes, waarvan er 15 ook een actieve referentie hebben (de overige 17 vallen weg omdat je zonder actieve referentie niet kunt classificeren). Daardoor is de effectieve top-volume-bijdrage 15 (13 na exclude); het leeuwendeel van de scope komt nu van sub-k. Dat is correct gedrag, maar het betekent dat de "top-N=30"-cap voorlopig niet knelt.

---

## 3. Geen flood (AC3) — per-code kandidaat-verdeling

Verse DRY-RUN over een venster van 40 GTINs (offset 0→40 van 1857; start-offset read-only in-memory op 0 gezet omdat de persistente state al op 1857/1857 staat — de prod-harvest was compleet):

```
{"dry_run": true, "candidates": 4, "inserted": 0,
 "from_offset": 0, "to_offset": 40, "total_gtins": 1857, "remaining": 1817,
 "per_code": {"RAINFOREST_ALLIANCE_PEOPLE_NATURE": 4}, "seconds": 77.1}
```

- Alle 4 kandidaten landen in **RAINFOREST_ALLIANCE_PEOPLE_NATURE** — een topn-code — ruim onder de `HARVEST_PER_CODE_CAP=25`. Geen enkele klasse overspoelt.
- **RECYCLABLE / TRIMAN = 0** (niet in `per_code`): structureel geborgd door `if code not in topn: continue` — een match op een uitgesloten code wordt nooit in de wachtrij gezet.
- Kanttekening: dit is een klein, snel venster (40/1857 GTINs → 4 kandidaten); de no-flood-eigenschap is bovendien structureel gegarandeerd (topn-lidmaatschap + per-code-cap), dus het kleine sample is louter illustratief en consistent.

---

## 4. DRY-RUN muteerde niets (AC-veiligheid)

- Output-vlaggen: `dry_run: true`, `inserted: 0` in élke run. Het volledige `if not DRY_RUN:`-blok (crop-`put_training_image` + `INSERT INTO artwork_review_items` + state.json-write) is overgeslagen.
- **state.json ongewijzigd:** de forced start-offset 0 zat uitsluitend in-memory (een read-interceptie op `STATE_KEY`); er is niets naar MinIO teruggeschreven. De persistente `keurmerk-harvest/state.json` staat nog op `next_offset: 1857`.
- De gedeployde container is niet aangeraakt (wegwerp-container `--rm`, branch-app read-only gemount; van de live-container is alleen `env` gelezen en de `services/`-map uitgekopieerd voor de diff — beide reads).

---

## AC6-verdict: **GEHAALD**

1. ✅ Scoping = `(top-N-volume ∪ sub-k) − exclude` = 30 codes (niet alle 43). RECYCLABLE & TRIMAN uitgesloten ondanks hoog volume; sub-k-codes zonder top-volume zitten er wél in.
2. ✅ Volume-index `flywheel-index/keurmerk-etiket-index.json` gevonden en gelezen (32 codes); ontbrekende index versmalt (sub-k only), valt nooit terug op "alle actieve".
3. ✅ Geen flood: 4 kandidaten in 1 topn-code, onder de cap; RECYCLABLE/TRIMAN = 0.
4. ✅ DRY-RUN muteerde niets: `inserted: 0`, geen crop/DB/state-write, deployed container ongemoeid.

Alles read-only (`HARVEST_DRY_RUN=1`) tegen ACC MinIO + Postgres; base-image-tag `0c9712f`, branch-code `epic-19-19.10`.
