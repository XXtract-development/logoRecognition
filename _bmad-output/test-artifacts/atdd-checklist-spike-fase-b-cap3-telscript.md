---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-10-30'
inputDocuments:
  - _bmad-output/planning-artifacts/spike-architectuurkeuze-logoherkenning/SPEC.md
  - _bmad-output/planning-artifacts/spike-architectuurkeuze-logoherkenning/meetopzet.md
  - ~/logo-meetset-20261018/ontwikkelmeting-20261028/voorlopige-selectie.json (alleen structuur)
  - ~/logo-meetset-20261018/ontwikkelmeting-20261028/nulmeting/ruw/e001.json + analyse.py (B0-formaat)
  - fase-b/fb_k1.py (K1-formaat), proef/ruw/k2a-op-k1b (K4-formaat)
---

# ATDD-checklist: spike fase B, CAP-3 telscript (`tel.py`)

## Preflight

- Stack: backend (Python). Testkader: pytest 9.2 in `~/logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/.venv`.
- Acceptatiecriteria: meetopzet §3.1–§3.10, §0 (rangorde vóór adjudicatie, B0-regels, GLN-aantallen, adjudicatielijst), §5, §6; SPEC CAP-3/CAP-5.
- Knowledge-fragmenten (Playwright, Pact) niet van toepassing: zuiver Python-script zonder HTTP of browser.

## Generatiemodus en uitvoering

- AI-generatie (backend). Uitvoermodus: config `auto` zou `subagent` kiezen; gekozen **sequentieel**, één unit-werker. Reden: één zuiver
  Python-script met één toetsbestand; de API- (HTTP) en E2E-werkers (browser) van de skill zijn niet van toepassing (N/A).

## Teststrategie (alles unit/integratie in één bestand, P0 tenzij vermeld)

| AC | regel | toets |
|---|---|---|
| AC-1a | §3.1 begrenzen, vak zonder oppervlak, maat onbekend | test_begrens_tot_etiket_en_vak_zonder_oppervlak_vervalt |
| AC-1b | §3.1 samenvoegen IoU≥0,5 via ketens, hoogste zekerheid, geen omhullende | test_samenvoegen_keten_houdt_lid_met_hoogste_zekerheid_geen_omhullende |
| AC-1c | §3.1 K1: eerst teruggegeven lid (venster, volgorde) | test_samenvoegen_k1_bij_gelijke_stand_eerst_teruggegeven_lid |
| AC-1d | §3.1 code zonder vak = onterecht | test_code_zonder_vak_telt_als_onterecht_en_wordt_niet_samengevoegd |
| AC-1e | §3.1 tegel→etiket (K1 al omgerekend; niet dubbel) | test_k1_adapter_ander_vak_null_volgorde_en_geen_dubbele_omrekening |
| AC-2a | §3.2 raakt (middelpunt/IoU/oppervlak ≤4×) en te groot vak | test_raakt_middelpunt_in_vergroot_vak_of_iou_en_oppervlakgrens |
| AC-2b | §3.2 één melding over twee waarheidsvakken | test_een_melding_over_twee_waarheidsvakken_telt_voor_grootste_iou |
| AC-2c | §1 grof vak | test_grof_vak_alleen_middelpunt_en_hoogstens_een_terechte_melding |
| AC-3 | §3.3 Nutri-Score-letter | test_nutriscore_letter_is_de_soort_en_verwarbaar_paar_apart |
| AC-4/5/6 | §3.4–3.6 gevonden, gemist, onterecht, vals%, vals-alarm, GLN-aantal | test_tellers_noemers_vals_en_vals_alarm_mislukt_eruit |
| AC-6b | §3.6 Wilson-95% | test_wilson_bekende_waarde |
| AC-6c | §3.6 GLN-clusterbootstrap reproduceerbaar | test_bootstrap_gln_reproduceerbaar |
| AC-7 | §3.7 mislukte verwerking, >2% ongeldig | test_mislukte_verwerking_telt_positieve_paren_als_gemist_en_grens_twee_procent (+ tellers-toets) |
| AC-8 | §3.8 verwarbare paren | test_verwarbaar_vlabel_vegan_en_groene_punt_niet_voor_andere_paren, test_nutriscore_… , test_stabiliteit_… |
| AC-9 | §3.9 stabiliteit | test_stabiliteit_en_verwarbaar_in_resultaat |
| AC-10a | lekpaarfilter, kern/aanvulling, B0 zonder herpakt | test_deelverzamelingen_lekpaarfilter_kern_aanvulling_en_b0_herpakt |
| AC-10b | adapters B0 / K1 / stap 2 (K2, K3b, K3c) / K4 | test_b0_adapter_*, test_k1_adapter_*, test_stap2_adapter_*, test_k4_poort_* |
| AC-10c | waarheidsformaat `positieve_vakken` | test_lees_waarheid_formaat_voorlopige_selectie |
| AC-11 | §0 rangorde vóór adjudicatie, §5 na adjudicatie, te weinig vast | test_oordeel_voor_en_na_adjudicatie, test_rangorde_voor_adjudicatie_te_weinig_vast_b0_erbuiten_kosten_beslissen |
| AC-12 | §0/§6 adjudicatielijst blind, ontdubbeld, willekeurig, gemiste paren beste variant | test_adjudicatielijst_blind_ontdubbeld_willekeurig_met_gemiste_paren |
| AC-13 | §6 toepassen (8%, vervallen), herberekening, omgezette meldingen | test_adjudicatie_toepassen_8_procent_en_vervallen_waarheid_en_herberekening |
| AC-14 | CLI, varianten uit submappen, uitvoerbestanden, lijst blijft na adjudicatie | test_cli_end_to_end |

## Rode fase (VERIFIED 2026-10-30)

```
cd .../spike-architectuurkeuze-logoherkenning/fase-b
~/logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/.venv/bin/python -m pytest test_tel.py -q -p no:cacheprovider
→ 26 failed in 0.46s  (tel.py bestaat nog niet; elke toets faalt afzonderlijk op AttributeError)
```

## Implementatiechecklist

- [ ] `tel.py`: begrens, iou, samenvoegen, raakt, tel_etiket, lees_waarheid, lees_b0, lees_k1, lees_stap2, lees_k4, wilson, trekkingen,
  bootstrap, oordeel, bereken, adjudicatielijst, pas_adjudicatie_toe, omgezet, main.
- [ ] Alleen stdlib; TOP15 vast in het script (fb_common trekt cv2/numpy binnen).

## Aannames bij het ontwerp van de toets

- Grof vak: alleen de middelpuntregel (§1 "alleen als"), geen oppervlakgrens.
- Meldingen zonder vak gaan niet naar de adjudicatielijst (geen plek om te tonen); ze blijven onterecht.
- K4: als de K2-op-K1-uitvoer ontbreekt, mislukt is of niet even lang is als de K1-meldingen, is het etiket mislukt.
- Bootstrap: per deelverzameling één vaste reeks trekkingen over alle GLN's (multipliciteiten), gedeeld door alle maten; trekkingen met noemer 0 vervallen.
- "Beste variant per keurmerk" voor de gemiste paren: hoogste gevonden% (slechtste run, alle paren), B0 uitgezonderd (buiten de rangorde).
