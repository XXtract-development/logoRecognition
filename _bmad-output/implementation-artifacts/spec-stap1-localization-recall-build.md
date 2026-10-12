---
title: 'Stap 1: heel etiket + tegels, Nutri-Score-vangnet op de lat, ongeldig vakje overslaan'
type: 'feature'
created: '2026-10-12'
status: 'done'
baseline_commit: 'a6869038acd0b953d653f23348e7981b798d0596'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/stap1-lokalisatie/_bmad-output/specs/spec-stap1-localization-recall/SPEC.md'
  - '/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/stap1-lokalisatie/_bmad-output/specs/spec-stap1-localization-recall/ontwerp.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stap 1 wijst op volledige etiketten veel zichtbare keurmerken niet aan (één modelvraag op een verkleind beeld); een omgedraaid vakje in een modelantwoord laat de hele scan mislukken; het Nutri-Score-vangnet meldt twijfelende letters (vooral "A") die niet kloppen.

**Approach:** Stap 1 vraagt het model naar het hele etiket plus tot 5 tegels (plafond 6 aanroepen, besluit productowner 12-10-2026), voegt de vakjes samen en houdt unie en budget per constructie binnen de grenzen; een ongeldig vakje wordt overgeslagen en geteld; het vangnet claimt in de strikte route alleen bij ≥ 0,99; aanroepen en tokens per scan komen in `stap1`.

## Boundaries & Constraints

**Always:** zie `ontwerp.md` (bron van waarheid voor tegelgeometrie, reserve, volgorde, velden). Eén falende aanroep laat de lokalisatie zichtbaar falen (503 met foutklasse). Unie ≤ 64 zonder 503. Bestaande foutklassen en logredactie blijven.

**Never:** drempels van stap 2 bijstellen; herhaalpogingen; migraties of schemawijzigingen; sleutels of beeldbytes in log/antwoord; niet-strikte classificatie wijzigen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Groot etiket | 4400×3000, plafond 6 | 1 hele-etiket-aanroep + ≤ 5 tegels | N/A |
| Klein etiket / plafond 1–2 | ≤ 1600 px of env 1/2 | alleen hele-etiket-aanroep | N/A |
| Ongeldige env | `VISUAL_PROPOSAL_MAX_CALLS=99` | plafond 6 + waarschuwing | N/A |
| Omgedraaid vakje | `[500,0,100,1000]` + geldig vakje | geldig vakje blijft, `skipped` 1 | geen fout |
| Tegel 429 | één tegelaanroep faalt | lokalisatie 503 `provider_status_429` | rest geannuleerd |
| > 64 vakjes | 1 GHS + 70 voorstellen | 64 vakjes, GHS eerst, `dropped` 7 | geen 503 |
| Weinig budget | verfijning traag | rest onverfijnd, `unrefined` > 0 | geen 504 |
| Vangnet onder lat | strikt, A2 "A" 0,9 | bestaande embedding-uitkomst (onzeker) | N/A |
| Usage ontbreekt | één aanroep zonder `usage` | `tokens_in`/`tokens_out` null | N/A |

</frozen-after-approval>

## Code Map

- `apps/ml-service/app/services/artwork_proposals.py` -- `proposal_image` (hergebruiken per tegel), `parse_proposals` (overslaan + `stats`), `visual_proposals` (TaskGroup, tegels, samenvoegen, return `(vakjes, stats)`).
- `apps/ml-service/app/api/artwork.py` ~830-890 -- visuele tak localize: unpack tuple, cap 64 vóór verfijning, reserve-check in verfijnlus, unie-volgorde + afkappen, `proposals`-velden; `_visual_error_class` ~680 (`proposal_capacity` weg); `LocalizeResponse.proposals`-type (accepteert null).
- `apps/ml-service/app/services/classification.py` ~490-555 -- A2-vangnet: in strikte runtime claim alleen bij `a2_conf >= ns_threshold`. Bevestigingsroute ~400-440 niet aanraken.
- `apps/api/src/services/ml-client.ts` ~404 -- type `proposals` uitbreiden.
- `apps/api/src/services/pipeline/logo-scan-flow.ts` ~88 (`Stap1`), ~295 (vullen na lokalisatie).
- Tests: `apps/ml-service/tests/test_stap1_localization_recall_atdd.py` (nieuw, rood), `tests/test_artwork_proposals.py`, `tests/test_logo_scan_robustness_atdd.py`, `tests/test_artwork_strict_runtime.py` (tuple-return, capaciteit → 200, `proposals`-dict), `apps/api/src/__tests__/routes/logo-scans-stap1.atdd.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `artwork_proposals.py` -- tegels, TaskGroup, merge, stats, parser-overslaan -- CAP-1/3/6
- [x] `artwork.py` -- tuple, cap/reserve/unie, nieuwe tellingen, capaciteitsklasse weg -- CAP-1/3
- [x] `classification.py` -- vangnetlat in strikte runtime -- CAP-5
- [x] `ml-client.ts`, `logo-scan-flow.ts` -- stap1-velden, null als onbekend, afwezig bij falen -- CAP-3
- [x] bestaande tests uit Code Map -- aanpassen aan bewust veranderd gedrag -- ontwerp.md §Bestaande tests
- [x] `versions.md` -- Nederlandse eindgebruikersregel -- werkafspraak

**Acceptance Criteria:**
- Given de ATDD-bestanden, when de suites draaien, then alle nieuwe tests groen en geen nieuwe fouten t.o.v. de nulmeting (lokaal 52 bestaande fouten in ml-service).

## Implementation Notes

- Checkpoint 1 headless goedgekeurd (geen open vragen; productownerbesluiten 12-10-2026 dekken de intent). Repository-root voor alle paden: `/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/stap1-lokalisatie`.

- Bouw door subagent; reviewlagen (blind, edge case, verification gap) als verse subagents; 10 patches doorgevoerd door dezelfde subagent, 5 bevindingen verworpen met bewijs (triagelog). Verificatie: ml-suite 52 failed/731 passed = exact dezelfde 52 fouten als de nulmeting op acc; API-vitest 1555 passed, 2 failed + 5 bestanden die niet laden (bcrypt-binding/Prisma-client in de worktree, vooraf aanwezig, niet in gewijzigde code); `logo-scans-stap1.atdd.test.ts` 23/23.

## Spec Change Log

## Review Triage Log

| # | bron | bevinding | verdict | bewijs / route |
|---|---|---|---|---|
| 1 | blind, edge | reserve dubbel gebruikt; uitleg tegenstrijdig (verfijning vs classificatie) | low | Bij 165 s budget en provider 4–16 s (gemeten) blijft ruim tijd; gedrag (rest onverfijnd i.p.v. falen) is gewenst. Wel tegenstrijdig commentaar → patch (één uitleg, reserve één keer bepalen). |
| 2 | edge | trage verfijnaanroep net boven reserve → 503 | false | Eén verfijning ±5 s, reserve = min(30 s, 25%) ≥ 30 s bij pijplijnbudget; alleen bij kunstmatig kleine budgetten. |
| 3 | blind, edge | afkappen unie raakt verfijnde vakjes eerst | false | Bewuste volgorde uit ontwerp.md (voorstellen vóór verfijnd); gemeten max 36 voorstellen, afkappen kwam niet voor. Telling `dropped` dekt het. |
| 4 | blind, edge | randvakjes van tegels blijven naast heel-etiket-vakje staan | false | Precies de gemeten variant (VTF, IoU 0,7, zelfde tegelprompt) waarop meetverslag en productownerbesluit rusten; de eindmeting telt het effect mee. |
| 5 | edge | expliciete drempel < A2-vloer laat vangnet onder vloer claimen | low | Pijplijn stuurt geen drempel (PR #25), maar fix is één `max()` → patch. |
| 6 | blind | plafond 1 ≠ oud gedrag: IoU-ontdubbeling binnen één aanroep | medium | Echt: binnen één antwoord vallen nu vakjes weg die eerder bleven → patch (alleen tegen vakjes uit eerdere aanroepen ontdubbelen). Budget 75%: gedocumenteerd verschil. |
| 7 | blind | `raw` betekent na ontdubbelen | low | Bewust (ontwerp.md); commentaar in Stap1/LocalizeResponse aanvullen → patch. |
| 8 | blind | per-aanroep-fouten niet zichtbaar | medium | Bij falen blijft onbekend welke/hoeveel aanroepen faalden; CAP-3 vraagt foutpercentage per aanroep → patch (één logregel met totaal, aantal mislukt, klasse per mislukte aanroep, zonder geheimen). |
| 9 | blind | tokens van mislukte scans niet bewaard | false | SPEC CAP-3 legt expliciet vast: na mislukte lokalisatie afwezig. |
| 10 | blind | geen rem op 429 / geen herhaalpoging | false | SPEC/ontwerp: geen herhaalpoging; risico wordt in de proef gemeten (poort mislukte scans). |
| 11 | blind | `unrefined` niet in stap1 | low | Zonder veld is in productie niet te zien of de reserve ingrijpt; triviaal → patch (`onverfijnd`). |
| 12 | blind | plafond 2 = 1 ongedocumenteerd; waarschuwing per scan | low | Docstring aanvullen → patch. |
| 13 | blind, verif. | tests: standaardplafond niet exact, geen test op visuele reserve, tegeloverlap, 0,7-grens, Nutri-Score-lat | medium | Geverifieerd door verwijderen van reserve/overlap/grens: suites bleven groen → patch (gerichte tests). |
| 14 | blind | versions.md "hoeveel dat kostte" | low | Er worden tokens bewaard, geen kosten → patch (woordkeus). |
| 15 | blind | randtest verfijning hangt van klok af | low | 0,3 s × 10 tegen 1,5 s budget met 0,375 s reserve: ruime marge; geen patch. |

## Verification

**Commands:**
- `cd apps/ml-service && MODEL_PATH=/private/tmp/claude-501/-Users-frisovanweelden-Documents-projects-logoRecognition/21776626-f2c9-4039-bcea-efde9427be45/scratchpad/stap1/models TORCH_HOME=$MODEL_PATH/torch /private/tmp/claude-501/-Users-frisovanweelden-Documents-projects-logoRecognition/ddabd0a8-fd23-4297-9060-17b4da492a60/scratchpad/venv-ml/bin/python -m pytest -q -p no:cacheprovider tests` -- expected: alleen de 52 bestaande fouten (lijst: `/private/tmp/claude-501/-Users-frisovanweelden-Documents-projects-logoRecognition/21776626-f2c9-4039-bcea-efde9427be45/scratchpad/stap1/ml-baseline.txt`)
- `cd apps/api && npx vitest run` -- expected: groen (of alleen bestaande fouten)
- `cd apps/api && npx tsc --noEmit -p .` -- expected: geen nieuwe typefouten
