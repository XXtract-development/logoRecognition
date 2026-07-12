# ATDD-checklist — Story 19.10 (Harvest-koppeling + scope-begrenzing)

Testbestand: `apps/ml-service/tests/unit/test_queue_harvest_19_10.py`
Doelbestand (nog te implementeren): `apps/ml-service/app/services/queue_harvest.py` — `run_batch()`
Status: **RED-fase gezet** (tests geschreven vóór implementatie). Adversariële review: **PASS**.

## Container-run (ghcr `logo-recognition-ml:acc`, wegwerp, worktree gemount)

```
docker run --rm --platform linux/amd64 \
  -v <repo>/apps/ml-service/app:/app/app -v <repo>/apps/ml-service/tests:/app/tests -w /app \
  ghcr.io/xxtract-development/logo-recognition-ml:acc \
  sh -c 'pip install -q pytest pytest-asyncio; python -m pytest tests/unit/test_queue_harvest_19_10.py -p no:cacheprovider -rA -q'
```

Uitkomst tegen de HUIDIGE (ongewijzigde) code: **4 failed, 5 passed** — de 4 RED-tests
falen (nieuw gedrag nog niet aanwezig), de 5 GREEN-tests slagen (preservatie).

## AC → test-mapping

| AC | Test | Soort | Status tegen huidige code | Borgt |
|----|------|-------|---------------------------|-------|
| AC1 | `test_ac1_scoopt_op_top_n_en_neemt_sub_k_mee_RED` | RED | FAIL (verwacht) | top-N-volume-scope + sub-k-inclusie; C,D (rang 3/4, ≥k) vallen buiten scope |
| AC1 | `test_ac1_top_n_nul_houdt_alleen_sub_k_over_RED` | RED | FAIL (verwacht) | edge 'lege top-N' (`HARVEST_TOP_N=0`) → alleen sub-k overblijft |
| AC3 | `test_ac3_expliciete_exclude_weert_top_volume_en_sub_k_RED` | RED | FAIL (verwacht) | `HARVEST_EXCLUDE_CODES` weert RECYCLABLE (top-volume) én TRIMAN (sub-k) |
| AC3 | `test_ac3_default_exclude_weert_recyclable_RED` | RED | FAIL (verwacht) | default-exclude = RECYCLABLE_GENERAL_CLAIM,TRIMAN zonder env |
| AC2 | `test_ac2_crop_landt_als_open_review_item_geen_auto_promotie_GREEN` | GREEN | PASS | INSERT OPEN `artwork_review_items` (status open, method `embedding`, reason MARKER), geen `reference_logos`-promotie, resume-state geschreven |
| AC4 | `test_ac4a_gate_weert_crop_onder_gate_threshold_GREEN` | GREEN | PASS | keurmerk-gate (< GATE_THRESHOLD 0,5) weert crop vóór nearest-ref |
| AC4 | `test_ac4b_floor_weert_crop_onder_085_GREEN` | GREEN | PASS | nearest-ref-FLOOR gepind op ~0,85 (0,84 reject / 0,86 accept) |
| AC4 | `test_ac4c_per_code_cap_gehandhaafd_GREEN` | GREEN | PASS | per-code-cap begrenst kandidaten per run (5 crops, cap 2 → 2) |
| AC5d | `test_ac5d_dry_run_muteert_niets_GREEN` | GREEN | PASS | `HARVEST_DRY_RUN=1` → geen crop-upload, geen INSERT, geen state-write |
| AC5a-c | (= de RED/GREEN-tests hierboven samen) | — | — | AC5 vraagt exact deze ml-pytest-dekking |
| AC6 | live DRY_RUN op ACC | n.v.t. | permission-gated | NIET geautomatiseerd (read-only live-run, aparte toestemming) |

## Vastgelegde interface (RED-tests pinnen dit; de implementatie vult het in)

De klasse-selectie (`topn`) van `run_batch` wordt:

```
topn = ( top_N_op_volume  ∪  sub_k_klassen )  −  exclude_codes
       , beperkt tot codes met >=1 actieve echte ref
```

- **`HARVEST_TOP_N`** (env, int): aantal top-volume-keurmerken waarop de harvest scoopt.
  Vervangt de huidige `topn` = "élke code met ≥1 actieve ref" (`queue_harvest.py:117-122`).
- **`HARVEST_EXCLUDE_CODES`** (env, komma-gescheiden t3777-codes, whitespace-getrimd,
  hoofdlettergevoelig): flood-guard. **Default** (env leeg/afwezig):
  `RECYCLABLE_GENERAL_CLAIM,TRIMAN`. Een uitgesloten code verschijnt NOOIT in de output —
  óók niet als top-volume, óók niet als sub-k (exclude wint van beide).
- **Volume-ranking-bron**: MinIO-JSON-index onder key
  `flywheel-index/keurmerk-etiket-index.json`, geladen via
  `storage_service.get_training_image(key)`, dict `code -> volume` (int). Gekozen boven
  een api-endpoint (ml-service heeft geen Prisma; zelfde patroon als `state.json`).
  Ontbreekt de index → NIET terugvallen op "élke actieve code" (dat doet AC1 teniet).
- **Sub-k**: klassen met < k=3 actieve echte refs (aligned met 19.9 `min_refs=3`) worden
  altijd meegenomen. De selectie-query levert per actieve code zijn actieve-ref-count als
  kolom `n` (bv. `SELECT t3777_code, COUNT(*) AS n FROM reference_logos WHERE active=true GROUP BY t3777_code`).

Ongewijzigd (preservatie, GREEN-geborgd): de harvest-mechaniek (regio → embed → gate →
nearest-ref@FLOOR 0,85 → cap → INSERT OPEN review-item), het OPEN-review-pad (19.8), de
gate-v2/FLOOR-kleppen, de resume-state en `HARVEST_DRY_RUN`.

## Definition of Done voor de implementatie
- Alle 4 RED-tests worden GREEN zonder dat een GREEN-test rood wordt.
- Volledige suite groen in de ghcr-container-run hierboven.
- Geen wijziging aan embedding-model, region-proposer, gate-drempel, conditie C (19.9),
  `resolveSeedPath` (19.15) of de 19.8-review-routering.
