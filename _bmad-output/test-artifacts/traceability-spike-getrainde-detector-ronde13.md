---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-15'
scope: SPEC CAP-22 ronde 13 (besluit Friso 15-11-2026)
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-22)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md (§6c)
  - _bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde13.md
  - _bmad-output/test-artifacts/atdd-checklist-ronde13-samenvoeg-r12-20261115.md
---

# Traceability: CAP-22 ronde 13

## Gate Decision: PASS

**Rationale:** P0 11/11, P1 5/5, totaal 16/16. `uv run pytest tests/test_ronde13_samenvoeg_r12_20261115.py tests/test_ronde11c_samenvoeg_20261112.py tests/test_cap10_draaiplan.py -q` = 97 passed; volle suite `-m "not zwaar"` = 1195 passed, 4 deselected (15-11-2026). Rood vooraf: 41 failed, 1 passed (de geslaagde test bewaakt het bestaande script).

## Matrix

| # | Criterium (SPEC CAP-22 / toetsset §6c) | Test(s) | Prio | Dekking |
|---|---|---|---|---|
| 1 | Bevestigd en onleesbaar achteraan in items-volgorde; open en ontbrekend niet; categorieën = aantal items | `test_bevestigd_en_onleesbaar_achteraan…` | P0 | FULL |
| 2 | Recordvorm, sleutelvolgorde, `tijd` = `bijgewerkt`, 13 `bevestigde_codes`, `herkomst_etiket` | `test_bevestigd_record_heeft_alle_velden…`, `test_onleesbaar_record…` | P0 | FULL |
| 3 | Byte-garantie voor alle andere records, beide schrijfformaten | `test_oude_records_byte_gelijk…`, `test_ensure_ascii…` | P0 | FULL |
| 4 | Eigen byte-controle weigert vóór het vervangen | `test_byte_garantie_weigert_en_schrijft_niets`, `test_byte_garantie_weigert_gewijzigd_oud_record` | P0 | FULL |
| 5 | Telt mee in `uitslag.stand` en gate C (mens/AI), vóór en na | `test_per_keurmerk_en_gate_c_voor_en_na`, `test_onleesbaar_record…` | P0 | FULL |
| 6 | Droogloop schrijft niets; reservekopie `voor-r12` met originele bytes | `test_droogloop…`, `test_reservekopie…` | P0 | FULL |
| 7 | Herlezen vóór schrijven; schrijffout wordt weigering | `test_weigert_als_uitslag_tussen…`, `test_schrijffout_wordt_weigering` | P0 | FULL |
| 8 | Herhalen: gelijk → niets; strikt nieuwer → vervangen op zijn plek | `test_tweede_run…`, `test_strikt_nieuwer…`, `test_nieuwer_over_onleesbaar_vervangt` (2) | P0 | FULL |
| 9 | Ouder, gelijk tijdstip, ingetrokken (onleesbaar/open over bevestigd), open over onleesbaar, vreemde sleutels: laten staan | `test_ouder_en_ingetrokken…` (4), `test_open_over_onleesbaar…`, `test_record_met_vreemde_sleutels…` | P0 | FULL |
| 10 | Al samengevoegd maar niet meer in de export apart gemeld | `test_eerder_samengevoegd…` | P0 | FULL |
| 11 | Weigeringen schrijven niets (export, itemslijst, markering, formaat, records, tijden) | `test_weigering_schrijft_niets` (14), `test_weigert_vreemde_itemslijst` (3), `test_weigert_items_id…zonder_markering`, `test_weigert_export_zonder_beoordelingen`, `test_weigert_uitslag_in_ander_formaat`, `test_weigeringen_na_review` (3) | P0 | FULL |
| 12 | Alle fouten met id in één melding | `test_alle_fouten_in_een_melding` | P1 | FULL |
| 13 | Opdrachtregel: droog, echt, weigering, id's van vervangen | `test_main_droog_en_weigering`, `test_main_echt_meldt_reservekopie`, `test_main_noemt_vervangen_ids` | P1 | FULL |
| 14 | Geen klantcodes in het script | `test_geen_klantcodes_in_het_script` | P1 | FULL |
| 15 | `samenvoeg_glutenvrij.py` zonder gedragswijziging | `test_samenvoeg_glutenvrij_houdt_zijn_achtervoegsel`, `test_ronde11c_samenvoeg_20261112.py` (alle) | P1 | FULL |
| 16 | DRAAIPLAN noemt alleen bestaande scripts | `test_cap10_draaiplan.py` | P1 | FULL |

## Gaps en risico's

- Geen dekkingsgat. Niet getest (bewust): de echte samenvoeging op `$PM/toets/uitslag.json` (draait de hoofdsessie met de echte download) en de omzetting van een onverwacht genest type naar een weigering (alleen nog onbereikbare vormen na de veldcontrole).
- Besluit Friso 15-11-2026 ("Bevestigd blijft staan"): een later onleesbaar of open over een samengevoegd bevestigd etiket laat het bevestigde oordeel staan en wordt gemeld als ingetrokken; gedekt door `test_ouder_en_ingetrokken_laten_staan`. Was tot dan een aanname.
