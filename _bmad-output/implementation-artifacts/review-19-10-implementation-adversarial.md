# Adversariële review — implementatie Story 19.10 (`queue_harvest.py`)

verdict: PASS
reviewed_commit: f8d3701

Scope: `git diff 0c9712f..f8d3701 -- apps/ml-service/app/services/queue_harvest.py`
(0c9712f = vorige epic-branch-basis / laatste `done`-story 19.15). Dit is
UITSLUITEND de implementatie van de `topn`-scoping (top-N-volume ∪ sub-k) −
exclude; de ATDD-tests zelf zijn al apart adversarieel gereviewd (verdict PASS,
`review-19-10-atdd-adversarial.md`) — deze review focust op de implementatie die
de tests groen maakt, niet op de tests opnieuw.

## Reviewvragen + bevindingen

### 1. Klopt de topn-formule exact met het contract?
`topn = (top_by_volume | sub_k) - EXCLUDE_CODES` (regel ~207) — matcht letterlijk
`(top_N_op_volume ∪ sub_k_klassen) − exclude_codes` uit de checklist. `sub_k` komt
uit `refs_by_code` (n < MIN_REFS_SUB_K=3), `top_by_volume` uit `ranked[:TOP_N]`.
Geverifieerd via 9/9 groene container-tests (incl. de twee edge-cases TOP_N=0 en
exclude-wint-van-beide). **Geen bevinding.**

### 2. `_load_volume_index` — correct en fail-safe?
- `try/except Exception: return {}` rond de storage-read + JSON-parse — een
  ontbrekende/kapotte index geeft dus een lege ranking, NOOIT een terugval op
  "alle actieve codes" (AC1-vereiste). **Geen bevinding.**
- Tolereert twee schema's: het platte ATDD-testcontract (`{code: volume}`) én het
  echte, rijkere `KeurmerkIndex`-schema van `build-keurmerk-index.ts`
  (`summary.perKey["fieldType/code"] = {gtins, labels}`), geaggregeerd op
  `labels` per code over fieldTypes. Dit dekt zowel de test-fixture als de
  productie-realiteit — een bewuste, gedocumenteerde ontwerpkeuze (zie
  Completion Notes in het storybestand), niet een gok. **Geen bevinding.**
- **F1 — [LOW] non-deterministische tie-break bij gelijke volume — GEFIXT.**
  De oorspronkelijke `sorted(..., key=lambda c: volume[c], reverse=True)` had
  geen secundaire sorteersleutel; bij twee codes met identieke volume-waarde was
  de winnaar van de top-N-grens afhankelijk van de (niet-gegarandeerde) volgorde
  van de asyncpg-rijen. Niet zichtbaar in de ATDD-tests (geen tie-scenario), maar
  wel een reproduceerbaarheids-risico in productie (dezelfde staat kan tussen
  runs een andere top-N opleveren rond de grens). Fix (commit f8d3701): secundaire
  sleutel `(-volume[c], c)` — alfabetisch stabiel bij gelijke volume. Re-run:
  9/9 nog steeds groen (geen tie-scenario in de tests geraakt, dus geen regressie
  mogelijk).
- **F2 — [LOW/informational] `isinstance(v, (int, float))` accepteert bool-waarden
  — NIET gefixt (bewust, geen realistisch risico).** Python's `bool` is een
  subklasse van `int`, dus een `true`/`false`-waarde in een malformed flat-index
  zou als 1/0 meetellen. De productie-index (zowel het testcontract als
  `build-keurmerk-index.ts`) bevat nooit boolean-waarden voor volume — dit is een
  theoretische edge-case zonder realistisch aanvalspad of productiescenario.
  Gedocumenteerd, niet gefixt (over-engineering voor een niet-bestaand risico).

### 3. Blijft de bestaande harvest-mechaniek ongewijzigd?
Diff bevestigt: gate-check (`kp < GATE_THRESHOLD`), `find_similar_references`
met `threshold=FLOOR`, per-code-cap (`len(queue[code]) >= PER_CODE_CAP`),
crop-upload + INSERT `artwork_review_items` (status `'open'`, method
`'embedding'`, reason `MARKER`), resume-state (`STATE_KEY`) en `HARVEST_DRY_RUN`-
gedrag zijn **letterlijk ongewijzigd** — de enige diff-hunks zitten in de
docstring, de nieuwe module-constanten, de nieuwe `_load_volume_index`-functie en
de `topn`-berekening zelf. **Geen bevinding.**

### 4. Edge-cases
- Lege `refs_by_code` (geen actieve refs) → `topn` = lege set → 0 kandidaten,
  geen exception. Correct fail-safe gedrag.
- Lege/ontbrekende volume-index → `top_by_volume` = lege set, `sub_k` blijft
  functioneren onafhankelijk (gedekt door `test_ac1_top_n_nul_...`, analoog
  scenario). Correct.
- `TOP_N=0` → `ranked[:0]` = `[]`, alleen sub-k blijft over — expliciet getest
  (`test_ac1_top_n_nul_houdt_alleen_sub_k_over_RED`), groen.
- Code zonder volume-entry maar wel sub-k → wordt via `sub_k` toch meegenomen
  (de generator `c for c in refs_by_code if c in volume` sluit 'm uit van
  `top_by_volume`, maar `sub_k` itereert over `refs_by_code` los van `volume`).
  Correct en getest (crop-codes in AC4a/b/c hebben geen impact van volume-
  aanwezigheid, alleen van sub-k).

### 5. Dode code / debug-statements / security
Geen `print`/debug-restjes toegevoegd (het bestaande `print(json.dumps(result))`
was al aanwezig, ongewijzigd). Geen secrets. SQL-query ongeparametriseerd maar
zonder user-input (identiek patroon aan de vervangen query) — geen
injection-oppervlak. **Geen bevinding.**

## Samenvatting
1 LOW-bevinding (F1, non-deterministische tie-break) gevonden en gefixt in
commit f8d3701. 1 LOW/informational bevinding (F2) bewust niet gefixt
(gedocumenteerd, geen realistisch risico). Geen critical/high/medium-bevindingen.
Verdict: **PASS** op commit f8d3701.

## Fix-log
1. F1 — secundaire sorteersleutel `(-volume[c], c)` toegevoegd (queue_harvest.py,
   `run_batch`). Re-run container: 9/9 groen. Commit `f8d3701`.
