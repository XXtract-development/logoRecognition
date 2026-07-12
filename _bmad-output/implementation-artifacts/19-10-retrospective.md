# Story 19.10 — Retrospective (implement-sprint, epic-agent)

Status: story `review`, epic-19 NIET closed (Task 7/AC6 + Task 8 pending-permission)

## Wat ging goed
- De ATDD-tests waren al RED-fase gebouwd en adversarieel gereviewd (verdict PASS)
  vóórdat de implementatie begon — het interface-contract (`topn = (top-N ∪
  sub-k) − exclude`) was daardoor volledig ondubbelzinnig. Geen enkele
  ontwerpvraag hoefde tijdens de implementatie zelf beantwoord te worden.
- Alle 9 tests (4 voorheen-RODE + 5 GREEN-preservatie) waren in één
  implementatie-poging groen — geen fix-lussen op de ATDD-laag nodig.
- Vroeg lokaal (container) getest vóór de dure volledige-suite-run bespaarde
  iteratietijd.

## Wat brak / wat een verrassing was
- Het ATDD-testcontract specificeerde de volume-index als een simpel platte
  `{code: volume}`-dict, maar het bestaande productiescript
  (`build-keurmerk-index.ts`) bouwt een veel rijker `KeurmerkIndex`-schema
  (`summary.perKey["fieldType/code"] = {gtins, labels}`). Dit was een
  contract/productie-mismatch die niet in de ATDD-review was opgemerkt (F4 in
  die review benoemt alleen de key/schema-keuze, niet de structuurmismatch met
  het bestaande script). Opgelost door `_load_volume_index` beide vormen te
  laten verdragen (flat-dict primair voor het testcontract, met een fallback-pad
  dat het echte schema aggregeert op `labels` per code) — een bewuste,
  gedocumenteerde keuze i.p.v. een gok.
- De adversariële implementatie-review vond één LOW-bevinding (non-
  deterministische tie-break bij gelijke volume-waarden rond de top-N-grens) —
  klein, maar had in productie tot verwarrende run-op-run-variatie kunnen
  leiden. Gefixt met een secundaire alfabetische sorteersleutel.
- 6 pre-existing ml-pytest collection-errors (los van 19.10, al aanwezig op de
  epic-basis 0c9712f) — bevestigd via git-diff dat geen van die testbestanden
  door deze story geraakt is.

## Patronen/afspraken voor vervolgstories
- Bij een ATDD-contract dat een externe data-bron aanneemt (hier: de volume-
  index), check tijdens de implementatie ALTIJD of er al een productie-schrijver
  van die bron bestaat in de repo (hier: `build-keurmerk-index.ts`) en of het
  schema overeenkomt met het testcontract. Een implementatie die alleen het
  testcontract volgt kan in productie stuk lopen op een schema-mismatch die de
  unit-tests niet vangen (mock-gedreven false confidence).
- Determinisme bij sorteringen/rankings die een harde cutoff bepalen (top-N)
  verdient standaard een secundaire sorteersleutel — anders is het gedrag bij
  ties impliciet afhankelijk van niet-gegarandeerde bron-volgorde (hier:
  asyncpg-rijvolgorde).

## Openstaand (niet deze story's scope om te sluiten)
- Task 7 / AC6: live `HARVEST_DRY_RUN` op ACC om de per-code-verdeling en het
  gekalibreerde `HARVEST_TOP_N`-default (nu 30, "kalibreerbaar" per de story)
  te valideren. Vereist expliciete per-geval toestemming van Friso.
- Task 8: verse epic-19-retrospective — pas relevant zodra Task 7/AC6 is
  afgerond en de story naar `done` kan.
