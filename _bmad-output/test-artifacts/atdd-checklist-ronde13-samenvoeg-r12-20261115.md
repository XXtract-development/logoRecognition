---
title: ATDD-checklist ronde 13 — samenvoeging nieuwe etiketten ronde 12 (CAP-22)
datum: 2026-11-15
spec: _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-22), toetsset.md §6c
tests: _bmad-output/planning-artifacts/spike-getrainde-detector/tests/test_ronde13_samenvoeg_r12_20261115.py
---

# ATDD ronde 13

Testniveau: unit/integratie in pytest op bestanden in `tmp_path`; verzonnen etiketcodes (`ronde11_hulp.eid`), exportrecords in de vorm van `slaNu` (bijgewerkt met milliseconden en `Z`, gesorteerde `bevestigde_codes`, `open`-tussenstand, `{gedownload, aantal, beoordelingen}`).

| Eis (§6c) | Prioriteit | Test |
|---|---|---|
| Bevestigd en onleesbaar opnemen, achteraan in items-volgorde; open en ontbrekend niet; categorieën = aantal items | P0 | `test_bevestigd_en_onleesbaar_achteraan…` |
| Recordvorm en sleutelvolgorde, tijd = bijgewerkt, herkomst_etiket | P0 | `test_bevestigd_record_heeft_alle_velden…`, `test_onleesbaar_record…` |
| Byte-garantie oude records, beide schrijfformaten | P0 | `test_oude_records_byte_gelijk…`, `test_ensure_ascii_uitslag_blijft_ascii` |
| Rapport per keurmerk en gate C vóór/na (mens/AI) | P0 | `test_per_keurmerk_en_gate_c_voor_en_na` |
| Droogloop, reservekopie, herlezen vóór vervangen | P0 | `test_droogloop…`, `test_reservekopie…`, `test_weigert_als_uitslag_tussen…` |
| Herhalen: gelijk, nieuwer, ouder, ingetrokken, ontbreekt na samenvoegen, vreemde sleutels | P0 | `test_tweede_run…`, `test_strikt_nieuwer…`, `test_ouder_en_ingetrokken…` (4), `test_eerder_samengevoegd…`, `test_record_met_vreemde_sleutels…` |
| Weigeringen schrijven niets (export, itemslijst, markering, formaat) | P0 | `test_weigering_schrijft_niets` (14), `test_weigert_vreemde_itemslijst` (3), `test_weigert_items_id_in_uitslag_zonder_markering`, `test_weigert_export_zonder_beoordelingen`, `test_weigert_uitslag_in_ander_formaat` |
| Alle fouten in één melding | P1 | `test_alle_fouten_in_een_melding` |
| Opdrachtregel droog/echt/weigering | P1 | `test_main_droog_en_weigering`, `test_main_echt_meldt_reservekopie` |
| Geen klantcodes; samenvoeg_glutenvrij zonder gedragswijziging | P1 | `test_geen_klantcodes_in_het_script`, `test_samenvoeg_glutenvrij_houdt_zijn_achtervoegsel`, bestaande `test_ronde11c_samenvoeg_20261112.py` |

Rood vooraf (15-11-2026): `uv run pytest tests/test_ronde13_samenvoeg_r12_20261115.py -q` = 41 failed, 1 passed (de geslaagde test is de achtervoegselbewaking van het bestaande script).
