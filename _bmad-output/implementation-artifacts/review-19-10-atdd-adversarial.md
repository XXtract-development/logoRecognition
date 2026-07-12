# Adversariële review — ATDD-tests Story 19.10

verdict: PASS

Scope: `apps/ml-service/tests/unit/test_queue_harvest_19_10.py` (RED/GREEN ATDD voor
`queue_harvest.run_batch`, story 19.10). Doel van de review: jagen op false greens,
over-mocking, RED-tests die eigenlijk groen zijn, ontbrekende edge-cases en asserts
die op mock-internals leunen. Alle bevindingen zijn doorgevoerd of expliciet als
bewust-contract gedocumenteerd (geen stille waivers).

## Container-bewijs (RED/GREEN)

ghcr-image `logo-recognition-ml:acc`, wegwerp-container, worktree gemount:

- 4 FAILED (RED, nieuw gedrag — falen tegen de ongewijzigde `queue_harvest.py`):
  `test_ac1_scoopt_op_top_n_en_neemt_sub_k_mee_RED`,
  `test_ac1_top_n_nul_houdt_alleen_sub_k_over_RED`,
  `test_ac3_expliciete_exclude_weert_top_volume_en_sub_k_RED`,
  `test_ac3_default_exclude_weert_recyclable_RED`.
- 5 PASSED (GREEN, preservatie): AC2, AC4a/b/c, AC5d.

## Bevindingen

### F1 — [MEDIUM] FLOOR-test pinde de drempel niet op 0,85 — FIXED
`test_ac4b` (oud): rejecteerde sim 0,50 en accepteerde 0,95 — bewees alleen "een
drempel ergens tussen 0,5 en 0,95", niet FLOOR=0,85. Een stille FLOOR-verlaging naar
bv. 0,60 zou onopgemerkt blijven.
Fix: grens aangescherpt naar sim 0,84 (reject) / 0,86 (accept), zodat de test de
FLOOR op ~0,85 pint. Re-run: GREEN.

### F2 — [MEDIUM] AC3 dwingt volledige uitsluiting af (vs story-optie 'strengere cap') — GERESOLVED (bewust contract)
Story-Task 2 biedt twee opties: *uitsluiten* óf *onder strengere cap/FLOOR*. Een test
die volledige afwezigheid eist, forecloseert de tweede optie.
Resolutie: de orchestrator-opdracht kiest expliciet de uitsluit-aanpak via
`HARVEST_EXCLUDE_CODES` ("uitgesloten codes verschijnen NOOIT in de output, ook als
crops ertegen matchen"). De ATDD pint dus de gekozen optie A. Gedocumenteerd in de
test-docstring + checklist; geen over-constraint maar het vastgelegde contract.

### F3 — [LOW] AC2 leunt op INSERT-SQL-literals (`'open'`, tabelnaam) — GERESOLVED (bewust)
De preservatie-assert controleert `"artwork_review_items" in sql` en `"'open'" in sql`.
Dat koppelt aan SQL-tekst en zou breken bij een legitieme parametrisatie van de status.
Resolutie: de OPEN-status is precies het te-borgen gedrag (geen auto-promotie, 19.8-pad);
story-Task 3 zegt expliciet "geen gedragswijziging". De assert is dus de behavior-guard,
niet mock-internals. Versterkt met `"reference_logos" not in sql` (geen promotie) +
`method='embedding'` en `reason=MARKER` op de bind-args (observeerbare DB-effecten).

### F4 — [LOW] Volume-bron-key/schema is gepind — GERESOLVED (ATDD-contract, gedocumenteerd)
De RED-tests vereisen dat de volume-ranking uit `flywheel-index/keurmerk-etiket-index.json`
(MinIO, dict `code -> volume`) komt. Een dev die een andere bron kiest houdt de RED-tests
rood. Dit is inherent aan ATDD (het contract wordt gepind) en is prominent gedocumenteerd
in de module-docstring + checklist, mét de motivatie (ml-service zonder Prisma; zelfde
patroon als de bestaande `state.json`) en de afgewezen alternatief (api-endpoint).

### F5 — [LOW] `pending`-state-koppeling tussen embed/gate/find_similar — GECONTROLEERD, geen defect
De fakes delen een `pending`-tag die door `generate_embedding` wordt gezet en door
`keurmerk_probability` + `find_similar_references` gelezen. Risico: interleaving zou de
tag corrumperen (false green/red). Gecontroleerd: `run_batch` verwerkt crops strikt
sequentieel binnen één async-taak (geen `gather`/concurrency), dus de tag is per crop
correct. Bevestigd door de groene gate/floor-tests (die exact deze koppeling gebruiken).

### F6 — [—] False-green-scan op de GREEN-tests — GEEN false greens
Elke GREEN-test faalt aantoonbaar als het geborgde gedrag verdwijnt: gate weg → GATED
verschijnt; FLOOR weg → LOW verschijnt; cap weg → per_code {CAP:5}; dry-run weg →
executes/puts niet leeg; insert weg → inserted 0. Geen enkele GREEN-test slaagt triv.

### F7 — [—] RED-tests borgen écht nieuw gedrag — GECONTROLEERD
Alle 4 RED-tests (a) falen tegen de huidige code (container-bewijs) én (b) zijn
reachable-green onder de gedocumenteerde implementatie (top-N ∪ sub-k − exclude):
mentaal getraceerd voor elk. AC1-test1 eist de exacte set {A,B,E} → dwingt zowel de
top-N-scope (C,D vallen af) als de sub-k-inclusie (E blijft) af; een partiële impl
(alleen top-N, of alleen sub-k) faalt. AC1-test2 (top_n=0) isoleert het sub-k-pad.

### F8 — [LOW] Onobserveerbare contract-clausule "beperkt tot codes met >=1 actieve ref" — NIET unit-getest (bewust)
De selectie beperkt zich tot classificeerbare codes (>=1 actieve ref). Dit is op
unit-niveau onobserveerbaar: `find_similar_references` levert per definitie alleen codes
mét actieve refs, dus een impl die de clausule vergeet produceert identieke output.
Gedocumenteerd als niet-unit-testbaar; valt onder de live DRY_RUN-verificatie (AC6).

## Edge-case-dekking (adversariële checklist)
- Lege top-N (`HARVEST_TOP_N=0`) → alleen sub-k: `test_ac1_top_n_nul...` ✔
- Code in top-N én exclude (RECYCLABLE top-volume + excluded): `test_ac3_expliciete...` ✔
- Code sub-k én exclude (TRIMAN n=1 + excluded): `test_ac3_expliciete...` ✔
- Cap-grens (5 crops, cap=2 → exact 2): `test_ac4c...` ✔
- Dry-run vs state-write (STATE_KEY niet geschreven): `test_ac5d...` ✔
- Default-exclude zonder env: `test_ac3_default...` ✔
- Gate-voorfilter vóór nearest-ref: `test_ac4a...` ✔
- FLOOR-grens 0,85 gepind: `test_ac4b...` ✔ (F1)

## Fix-log
1. F1 doorgevoerd (FLOOR-grens 0,84/0,86). Re-run container: 4 RED / 5 GREEN — split
   ongewijzigd, GREEN nog groen. Verdict: PASS.
