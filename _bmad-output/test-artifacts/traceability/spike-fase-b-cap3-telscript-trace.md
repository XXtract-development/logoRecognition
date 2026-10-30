---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-10-30'
---

# Traceability — spike fase B, CAP-3 telscript (`tel.py`)

- **Spec:** `_bmad-output/implementation-artifacts/spec-spike-fase-b-cap3-telscript.md` (route `oneshot`, status `done`); contract `SPEC.md` CAP-3/CAP-5 en `meetopzet.md` §0, §3, §5, §6.
- **Criteria:** AC-1a t/m AC-14 uit `_bmad-output/test-artifacts/atdd-checklist-spike-fase-b-cap3-telscript.md`, plus AC-15 t/m AC-18: regels uit §0/§5.5/§6 die de Blind Hunter-review van 30-10 als ongedekt aanwees en die in dezelfde bouw zijn doorgevoerd.
- **Toetsen:** `_bmad-output/planning-artifacts/spike-architectuurkeuze-logoherkenning/fase-b/test_tel.py` (pytest, unit + CLI-integratie op verzonnen mini-sets met bekende uitkomst). Geen HTTP-endpoints, geen authenticatie: die heuristieken zijn niet van toepassing.
- **Gemeten (VERIFIED 30-10-2026):** `cd …/fase-b && ~/logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/.venv/bin/python -m pytest -q -p no:cacheprovider test_tel.py` → **31 passed**. De 6 na de review toegevoegde of aangescherpte toetsen falen op de code van vóór de review (6 failed, 25 passed).
- **Uitvoermodus:** sequentieel (één toetsbestand, één script).
- **Kennis geladen:** test-priorities-matrix, risk-governance, probability-impact, test-quality, selective-testing. Prioriteit: P0 voor alles wat de telling of de beslissing direct verandert (ATDD: "P0 tenzij vermeld"); P1 voor rapportvelden en invoerbescherming.

## Matrix

| Criterium | Prio | Toetsen | Dekking | Fout-/randpad |
|---|---|---|---|---|
| AC-1a §3.1 begrenzen, vak zonder oppervlak, maat onbekend | P0 | `test_begrens_tot_etiket_en_vak_zonder_oppervlak_vervalt`, `test_etiketmaat_geleend_van_andere_variant_bij_begrenzen` | FULL | vak buiten etiket, maat onbekend |
| AC-1b §3.1 samenvoegen IoU ≥ 0,5 via ketens, hoogste zekerheid | P0 | `test_samenvoegen_keten_houdt_lid_met_hoogste_zekerheid_geen_omhullende` | FULL | keten A~B~C |
| AC-1c §3.1 K1: eerst teruggegeven lid | P0 | `test_samenvoegen_k1_bij_gelijke_stand_eerst_teruggegeven_lid` | FULL | gelijke stand |
| AC-1d §3.1 code zonder vak = onterecht | P0 | `test_code_zonder_vak_telt_als_onterecht_en_wordt_niet_samengevoegd` | FULL | vak `null` |
| AC-1e §3.1 tegel → etiket (K1 al omgerekend, niet dubbel) | P0 | `test_k1_adapter_ander_vak_null_volgorde_en_geen_dubbele_omrekening` | FULL | `ander`, vak `null` |
| AC-2a §3.2 raakt: middelpunt/IoU/oppervlak ≤ 4× | P0 | `test_raakt_middelpunt_in_vergroot_vak_of_iou_en_oppervlakgrens` | FULL | te groot vak |
| AC-2b §3.2 één melding over twee waarheidsvakken | P0 | `test_een_melding_over_twee_waarheidsvakken_telt_voor_grootste_iou` | FULL | n.v.t. |
| AC-2c §1 grof vak | P0 | `test_grof_vak_alleen_middelpunt_en_hoogstens_een_terechte_melding` | FULL | tweede melding op bezet grof vak |
| AC-3 §3.3 Nutri-Score-letter | P0 | `test_nutriscore_letter_is_de_soort_en_verwarbaar_paar_apart` | FULL | C op B-balk |
| AC-4/5/6 §3.4–3.6 tellers, noemers, vals%, vals-alarm, GLN-aantal | P0 | `test_tellers_noemers_vals_en_vals_alarm_mislukt_eruit` | FULL | mislukt etiket uit de noemer van vals-alarm |
| AC-6b §3.6 Wilson-95% | P0 | `test_wilson_bekende_waarde` | FULL | n = 0 |
| AC-6c §3.6 GLN-bootstrap, reproduceerbaar | P0 | `test_bootstrap_gln_reproduceerbaar` | FULL | trekkingen met noemer 0, alle noemers 0 |
| AC-7 §3.7 mislukte verwerking, > 2% ongeldig | P0 | `test_mislukte_verwerking_telt_positieve_paren_als_gemist_en_grens_twee_procent`, `test_tellers_…` | FULL | precies 2% (geldig) en 4% (ongeldig) |
| AC-8 §3.8 verwarbare paren | P0 | `test_verwarbaar_vlabel_vegan_en_groene_punt_niet_voor_andere_paren`, `test_nutriscore_…`, `test_stabiliteit_…` | FULL | niet-verwarbaar paar telt niet |
| AC-9 §3.9 stabiliteit (met noemer) | P0 | `test_stabiliteit_en_verwarbaar_in_resultaat` | FULL | één run → `null` (`test_winnaar_…`) |
| AC-10a lekpaarfilter, kern/aanvulling, B0 zonder herpakt | P0 | `test_deelverzamelingen_lekpaarfilter_kern_aanvulling_en_b0_herpakt` | FULL | lekpaar op negatief paar |
| AC-10b adapters B0 / K1 / stap 2 / K4, varianten uit submappen | P0 | `test_b0_adapter_methode_drempel_en_negeren`, `test_b0_adapter_mislukt_en_herpakt`, `test_k1_adapter_…`, `test_stap2_adapter_drempel_top15_en_k3c`, `test_k4_poort_…`, `test_lees_ruw_varianten_k4_naam_vtf_en_lege_map_overgeslagen` | FULL | mislukte/onvolledige K2-uitvoer voor K4, ghs-specialist en codes buiten 15 |
| AC-10c waarheidsformaat `positieve_vakken` | P0 | `test_lees_waarheid_formaat_voorlopige_selectie` | FULL | n.v.t. |
| AC-11 §0 rangorde vóór, §5 na adjudicatie, te weinig vast | P0 | `test_oordeel_voor_en_na_adjudicatie`, `test_rangorde_voor_adjudicatie_te_weinig_vast_b0_erbuiten_kosten_beslissen` | FULL | < 5 GLN's, Wilson-grenzen, beste wisselt |
| AC-12 §0/§6 adjudicatielijst blind, ontdubbeld, willekeurig, gemiste paren | P0 | `test_adjudicatielijst_blind_ontdubbeld_willekeurig_met_gemiste_paren` | FULL | melding zonder vak niet in de lijst; geen variantnaam |
| AC-13 §6 toepassen (8%, vervallen), herberekening, omgezet | P0 | `test_adjudicatie_toepassen_8_procent_en_vervallen_waarheid_en_herberekening` | FULL | onbekend id, antwoord anders dan ja/nee |
| AC-14 CLI end-to-end, uitvoerbestanden, lijst past bij invoer | P0 | `test_cli_end_to_end` | FULL | gewijzigde lijst → stop |
| AC-15 §0/§3.7 winnaar: geen bij overlappende Wilson, ongeldige run of één run | P0 | `test_winnaar_vraagt_twee_geldige_runs_en_niet_overlappende_wilson`, `test_tellers_…`, `test_rangorde_…` | FULL | alle drie de weigerpaden |
| AC-16 §0/§5.5/CAP-5 aandeel niet-gelabelde meldingen; beste variant + gat in procentpunten; teller/noemer in rangorde | P1 | `test_tellers_…`, `test_winnaar_…` | FULL | keurmerk zonder positieven → `null` |
| AC-17 §0/§6 "ja" voor alle groepsleden; bestaande lijst niet overschrijven; resultaat na adjudicatie apart; niet-lekgetoetste paren | P0 | `test_ja_geldt_voor_alle_leden_van_een_ketengroep`, `test_cli_b0_drempel_vast_en_lijst_niet_overschrijven`, `test_cli_end_to_end` | FULL | afwijkende bestaande lijst → stop |
| AC-18 §2 B0-drempels vast, los van `--drempel` | P1 | `test_cli_b0_drempel_vast_en_lijst_niet_overschrijven` | FULL | `--drempel 0.95` |

## Gaten

- Geen P0/P1-gaten binnen deze spec.
- Buiten deze spec, uitgesteld (`deferred-work.md`): (1) de omrekening tegel → etiket zelf zit in `fb_k1.parse` en heeft geen eigen toets; (2) uitsluitregel §5.1 (165 s / 8 GB) koppelen aan de rangorde ná adjudicatie (gegevens uit `fb_kostentijd.py`); (3) echte lekcontrole op paren die de adjudicatie toevoegt.
- Echte-data-controle (geen toets, VERIFIED 30-10): B0 uit `nulmeting/ruw` geeft 26/186 gevonden, per keurmerk gelijk aan `nulmeting/RESULTAAT.md`; zonder herpakte etiketten 19/113.

## Gate

- P0: 24/24 = 100%. P1: 2/2 = 100%. Overall: 26/26 = 100%.
- **Besluit: PASS** — P0 100%, P1 100% (doel 90%), overall 100% (minimum 80%).
