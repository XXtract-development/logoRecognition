---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-12'
scope: SPEC CAP-20 ronde 11c (samenvoeging glutenvrij in toets/uitslag.json)
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-20)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md (§6b)
  - _bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde11c.md (I/O-matrix, triage)
  - _bmad-output/test-artifacts/atdd-checklist-ronde11c-samenvoeg-glutenvrij-20261112.md
  - _bmad/tea/testarch/knowledge/{test-priorities-matrix,risk-governance,probability-impact,test-quality,selective-testing}.md
---

# Traceability: CAP-20 ronde 11c

## Gate Decision: PASS

**Rationale:** P0 13/13 (100%), P1 7/7 (100%), totaal 20/20. Geen gaten; de echte samenvoeging is buiten de build (hoofdsessie), met een geslaagde droogloop op een kopie als bewijs voor acceptatiecriterium 3.

## Tests (stap 2)

`uv run pytest tests/test_ronde11c_samenvoeg_20261112.py tests/test_cap10_draaiplan.py -q` (map `spike-getrainde-detector`), 12-11-2026: **45 passed**. Unit/integratie op verzonnen bestanden in `tmp_path`; geen API, geen browser. Foutpaden: 16 weigergevallen, mislukt vervangen, wijziging tussen lezen en schrijven (twee momenten), bestaande reservekopie.

## Matrix (stap 3)

| # | Criterium (CAP-20 / §6b) | Test(s) | Prio | Dekking |
|---|---|---|---|---|
| 1 | Menselijk oordeel uit export: keuze, `bevestigde_codes`, markering artefact | `test_regels_mens_gaat_voor_…` | P0 | FULL |
| 2 | AI afwezig op niet-getoonde etiketten met markering `ai-r10` | `test_regels_mens_gaat_voor_…` | P0 | FULL |
| 3 | AI aanwezig zonder mens telt niet | `test_regels_mens_gaat_voor_…` | P0 | FULL |
| 4 | Alleen glutenvrij uit de export; andere velden, volgorde, formaat (ook niet-ASCII, beide formaten) en rechten blijven | `test_alle_andere_velden_…`, `test_alleen_glutenvrij_komt_uit_de_export`, `test_niet_ascii_en_rechten_blijven[2]` | P0 | FULL |
| 5 | Ouder exportrecord overschrijft latere bevestiging niet (lokale pagina, artefactmarkering, onbekende markering) | `test_ouder_exportrecord_…`, `test_ouder_dan_artefactmarkering_…` | P0 | FULL |
| 6 | Mens vervangt AI (ook onzeker); nieuwere export vervangt oudere; al gelijk | `test_mens_vervangt_ai_…` | P0 | FULL |
| 7 | Herhaalbaar: tweede run verandert niets, geen tweede reservekopie | `test_tweede_run_…` | P0 | FULL |
| 8 | Droogloop schrijft niets, zelfde rapport | `test_droogloop_…` | P0 | FULL |
| 9 | Reservekopie = bytekopie; bestaande reservekopie weigert | `test_reservekopie_is_bytekopie_…`, `test_reservekopie_die_al_bestaat_weigert` | P0 | FULL |
| 10 | Atomisch: mislukt vervangen laat uitslag en geen tijdelijk bestand achter | `test_mislukt_vervangen_…` | P0 | FULL |
| 11 | Wijziging vóór reservekopie en vlak vóór vervangen: weigeren | `test_weigert_als_uitslag_tussen_…`, `test_wijziging_vlak_voor_het_vervangen_…` | P0 | FULL |
| 12 | Weigeringen (16 gevallen) schrijven niets; vreemde vorm wordt weigering | `test_weigert_en_schrijft_niets[16]` | P0 | FULL |
| 13 | Gate C vóór/na = `poort_glutenvrij`, grenzen 15/16 en 34/35, zonder mens/AI | `test_gate_c_voor_en_na_…[3]` | P0 | FULL |
| 14 | Onafhankelijke controle: `ai_onwaar` uit de voorinvulling met verdeling; `ai_gemarkeerd` uit het geschreven bestand | `test_rapport_telt_ai_onwaar_…` | P1 | FULL |
| 15 | Ingetrokken oordeel haalt niets weg | `test_ingetrokken_oordeel_…` | P1 | FULL |
| 16 | Mens op niet-bevestigd uitslagrecord: niets | `test_mens_op_niet_bevestigd_…` | P1 | FULL |
| 17 | Uitslagrecord zonder status = niet bevestigd | `test_uitslagrecord_zonder_status_…` | P1 | FULL |
| 18 | Symbolische koppeling blijft koppeling | `test_symbolische_koppeling_…` | P1 | FULL |
| 19 | Opdrachtregel: droogloop en weigering met code 1 | `test_main_droog_…`, `test_main_weigert_met_code_1` | P1 | FULL |
| 20 | DRAAIPLAN noemt alleen bestaande, geteste scripts | `test_cap10_genoemde_scripts_…` | P1 | FULL |

Acceptatiecriterium 3 (droogloop op een kopie van de echte uitslag): uitgevoerd 12-11-2026, categorieën samen 352, `ai_onwaar` 317 allemaal `ai_toegepast`, echte uitslag byte-gelijk gebleven (spec ronde 11c).

## Gaten (stap 4)

Kritiek en hoog: geen. Bekende, bewust niet gedekte punten (verworpen in de reviewtriage, met reden): export `onleesbaar` op een niet-getoond etiket, onbevestigde tussenstand glutenvrij in de uitslag, id's in het rapport, `mens_ouder` bij gelijke keuze. Uitgesteld (al in deferred-work.md): de telling van AI-oordelen in het eindrapport van `tel_proef`.

## Gate (stap 5)

| Criterium | Vereist | Werkelijk | Status |
|---|---|---|---|
| P0-dekking | 100% | 100% (13/13) | MET |
| P1-dekking | ≥ 90% | 100% (7/7) | MET |
| Totaal | ≥ 80% | 100% (20/20) | MET |

**Besluit: PASS.**
