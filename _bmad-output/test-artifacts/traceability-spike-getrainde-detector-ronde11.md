---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-12'
scope: SPEC CAP-19 ronde 11 (artefactpagina laat glutenvrij nalopen)
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-19 success, constraint, assumptions)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md (§6a)
  - _bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde11.md
  - _bmad-output/test-artifacts/atdd-checklist-ronde11-artefact-glutenvrij-20261112.md
  - _bmad/tea/testarch/knowledge/{test-priorities-matrix,risk-governance,probability-impact,test-quality,selective-testing}.md
---

# Traceability: CAP-19 ronde 11

## Gate Decision: PASS

**Rationale:** P0-dekking 100% (15/15), P1-dekking 100% (4/4), totaal 19/20 volledig (95%; de ene gedeeltelijke is P2). Geen kritieke of hoge gaten.

## Context (stap 1)

Criteria uit SPEC CAP-19 *success* en toetsset §6a. Prioriteit naar risico: verlies of verkeerde telling van antwoorden in de gedeelde opslag en klantdata in de publieke repository = P0; ongewijzigd gedrag dat al in versie 4 werkte = P1/P2. Uitvoering stap 4: sequentieel (één kleine matrix).

## Tests (stap 2)

- Browser (Playwright, nagebootste `window.claude`, verzonnen codes): `tests/test_ronde11_artefact_browser_20261112.py`, 9 tests.
- Unit (bouwscript, zonder Playwright): `tests/test_ronde11_artefact_bouw_20261112.py`, 16 tests (6 geparametriseerd).
- Run 12-11-2026: `uv run pytest tests/test_ronde11_artefact_browser_20261112.py tests/test_ronde11_artefact_bouw_20261112.py -q` = 25 passed.
- Heuristieken: geen API-eindpunten of rechten in scope (de opslag is nagebootst; `can("data.write")` is ongewijzigd gedrag van versie 4). Foutpaden: weigering bij bevestigen, zes weigeringen van het bouwscript, werkboom- en `.git`-pad, weigerpad van de opdrachtregel, late opslag.

## Matrix (stap 3)

| # | Criterium | Test(s) | Niveau | Prio | Dekking |
|---|---|---|---|---|---|
| 1 | Bevestigd zonder glutenvrij in `bevestigde_codes` = na te lopen; met glutenvrij en onleesbaar = afgehandeld; `open` = geen van beide | `test_teller_telt_alleen_ontbrekend_glutenvrij_als_na_te_lopen`, `test_opent_op_eerste_open_etiket_in_items_volgorde` | browser | P0 | FULL |
| 2 | Kopregel "x van N etiketten afgehandeld · y na te lopen", deel weg bij y = 0 | idem + `test_bevestigen_houdt_…`, `test_late_opslag_…` | browser | P0 | FULL |
| 3 | Opent op eerste niet-afgehandelde etiket in ITEMS-volgorde | `test_opent_op_na_te_lopen_…`, `test_opent_op_eerste_open_etiket_in_items_volgorde` | browser | P0 | FULL |
| 4 | Op na te lopen etiket: glutenvrij-rij actief, notitie "Al bevestigd: controleer alleen glutenvrij.", eerdere antwoorden zichtbaar | `test_opent_op_na_te_lopen_etiket_met_glutenvrij_actief_en_notitie` | browser | P0 | FULL |
| 5 | Glutenvrij voorgevuld uit de AI met AI-merkje | `test_glutenvrij_voorgevuld_met_ai_merkje` | browser | P0 | FULL |
| 6 | Bevestigen zonder glutenvrij-keuze geweigerd, niets geschreven | `test_bevestigen_zonder_glutenvrij_keuze_wordt_geweigerd` | browser | P0 | FULL |
| 7 | Na bevestigen: 12 keuzes en Nutri-Score ongewijzigd, `bevestigde_codes` met glutenvrij, `veranderd` behouden | `test_bevestigen_houdt_12_keuzes_en_nutriscore_en_voegt_glutenvrij_toe` | browser | P0 | FULL |
| 8 | Antwoord te laat: A komt terug terwijl B getoond wordt; melding "(etiket A)", stand A bijgewerkt, B (keuzes, getypte tekst, cursor) ongemoeid | `test_late_opslag_van_a_overschrijft_b_niet` | browser | P0 | FULL |
| 9 | Bouwscript zet het oordeel in ITEMS, rest ITEMS gelijk, telling | `test_zet_glutenvrij_in_items_en_laat_de_rest_gelijk`, `test_main_drukt_telling_af` | unit | P0 | FULL |
| 10 | Buiten de ITEMS-regel byte-gelijk aan het sjabloon | `test_buiten_items_regel_bytegelijk_aan_sjabloon` | unit | P0 | FULL |
| 11 | Weigering: ontbrekend, niet-booleaans, onbekend id, dubbele id, zonder voorinvulling, afwijkend bestaand oordeel; niets geschreven | `test_weigert_en_schrijft_niets[6]`, `test_main_weigert_met_code_1_en_schrijft_niets` | unit | P0 | FULL |
| 12 | Uitvoer binnen een git-werkboom of `.git` geweigerd, ook als de map nog niet bestaat | `test_weigert_uitvoer_binnen_git_werkboom`, `test_weigert_uitvoer_in_git_map` | unit | P0 | FULL |
| 13 | Sjabloon met lege ITEMS; geen `/_blob/`-adres of 13+ cijfers in `invul/artefact/` | `test_sjabloon_en_map_bevatten_geen_klantdata` | unit | P0 | FULL |
| 14 | Geen etiketcodes in spec, companions en memlog van de proef (publieke repo) | `test_documenten_van_de_proef_bevatten_geen_etiketcodes` | unit | P0 | FULL |
| 15 | Geen `</script>` uit ITEMS in het scriptblok | `test_scriptafsluiting_in_items_wordt_onschadelijk` | unit | P0 | FULL |
| 16 | Documentvorm in de opslag ongewijzigd (sleutels) | `test_bevestigen_houdt_…` (`set(doc)`) | browser | P1 | FULL |
| 17 | Tussenstand telt pas na bevestigen | `test_sneltoets_1_op_glutenvrij_rij_kiest_aanwezig` | browser | P1 | FULL |
| 18 | Sneltoets 1 op de glutenvrij-rij kiest aanwezig | idem | browser | P1 | FULL |
| 19 | Downloadknop geeft alle opgeslagen beoordelingen | `test_downloadknop_geeft_alle_opgeslagen_beoordelingen` | browser | P1 | FULL |
| 20 | Beelden, `/_blob/`-adressen, overige sneltoetsen en opmerkingveldregels ongewijzigd | indirect: #10 (alleen de ITEMS-regel verschilt van het sjabloon) en de sjabloondiff tegen versie 4 (alleen constanten, `volledig()`, weigertekst); opmerkingveld in #8 | — | P2 | PARTIAL |

Buiten de matrix (geen testbaar gedrag van deze build): publiceren als update van het bestaande artefact (taak hoofdsessie, constraint in SPEC); vergelijken van de afgedrukte telling met 352/35/317 bij het publiceren (hoofdsessie).

## Gaten en aanbevelingen (stap 4)

- Kritiek (P0): geen. Hoog (P1): geen.
- Gedeeltelijk: #20 (P2). Aanbeveling: geen extra test; het gedrag komt ongewijzigd uit versie 4 en de bytevergelijking bewijst dat het sjabloon de enige bron is. De bestaande browsertests van de lokale invulpagina (ronde 7–9) dekken dezelfde beeld- en sneltoetslogica niet voor dit sjabloon; als die code later afwijkt, dan een rooktest toevoegen.
- Tijdens de trace gevonden en doorgevoerd: de documentvorm (#16) werd niet gecontroleerd; `set(doc)`-controle toegevoegd, 25 passed.

## Gate (stap 5)

| Criterium | Vereist | Werkelijk | Status |
|---|---|---|---|
| P0-dekking | 100% | 100% (15/15) | MET |
| P1-dekking | ≥ 90% (pass) | 100% (4/4) | MET |
| Totaal | ≥ 80% | 95% (19/20) | MET |

**Besluit: PASS.**
