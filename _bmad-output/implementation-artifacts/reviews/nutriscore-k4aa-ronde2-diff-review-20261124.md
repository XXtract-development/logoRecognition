---
title: Review ronde-2 diff Nutri-Score K4-aa (familiepoort + stemmen)
date: 2026-11-24
skill: bmad-review (één gebundelde ronde; lenzen adversarial, edge-case-hunter, verification-gap)
invoer: git diff (werkkopie skua, basis 45f93bd) — apps/ml-service/app/services/k4aa.py, tests/test_k4aa_nutriscore_de_atdd.py, SPEC CAP-2/CAP-2b ronde 2, atdd-checklist
eerdere review: nutriscore-k4aa-ronde2-spec-review-20261124.md
---

# Review ronde-2 diff Nutri-Score K4-aa

Structure- en prose-lens niet gedraaid: de documentwijzigingen zijn in de spec-review van vandaag al gelezen; deze ronde gaat over code en tests.

**Uitkomst:** `gate` en `one_letter` doen wat CAP-2 en CAP-2b ronde 2 zeggen. Geen fout gevonden in de code. Wel drie gaten in de tests (mutanten blijven leven), een verouderde checklist, en twee plekken waar het contract niet is bijgewerkt.

## Bewijs

- VERIFIED: `pytest tests/test_k4aa_atdd.py tests/test_k4aa_nutriscore_de_atdd.py tests/test_k4aa_vergelijk_norm.py -q` → 64 passed.
- VERIFIED: de 19 tests in `test_k4aa_nutriscore_de_atdd.py` tegen de oude `k4aa.py` (HEAD 45f93bd) → 6 rood, 13 groen. Rood: letter achter andere letter, letter buiten top-3, confidence, gelijke stemmen → laagste orde, meeste stemmen wint, end-to-end.
- VERIFIED: mutatietest op een kopie in de scratchmap (niet in de repo), 11 mutanten:

| Mutant | Uitkomst |
|---|---|
| M1 Nutri-Score op eigen score (oude top-3-regel) | gedood (2 tests) |
| M2 confidence = eigen letterscore als aanwezig | gedood |
| M3 Nutri-Score moet op plek 1 staan | **overleeft** |
| M4 Nutri-Score alleen in top-2 | **overleeft** |
| M5 stemmen zonder IoU-eis (zelfde letter elders telt mee) | **overleeft** |
| M6 stemmen zonder code-eis | gedood |
| M7 stemmen IoU `>` i.p.v. `>=` | **overleeft** |
| M8 sorteren op confidence vóór stemmen | gedood |
| M9 gelijkstand → hoogste orde | gedood (4 tests) |
| M10 `one_letter` niet aangeroepen in `scan` | gedood |
| M11 confidence = laagste Nutri-Score-score | gedood |

- VERIFIED: aanroepers van `gate`/`one_letter`: alleen `scan` (k4aa.py:659-660) en `test_k4aa_atdd.py:252` (niet-Nutri-Score, blijft groen). `_letters_ok` heeft geen andere gebruikers meer.
- VERIFIED: geen spike-pin raakt de poort; CAP-4-pins (INSTRUCTIE+DEEL, SCHEMA, blad, `len(TOP15)==17`) ongewijzigd groen.

## Bevindingen

### verification-gap

1. **Plek 2 en 3 van de top niet getoetst voor een Nutri-Score-melding.** `k4aa.py:248-252`. Elke test met een Nutri-Score-melding die blijft, heeft een Nutri-Score-code op plek 1. M3/M4 overleven. Toevoegen: top `{WEIDEMELK 0,9; GREEN_DOT 0,8; NUTRISCORE_D 0,7}`, melding `NUTRISCORE_A` → blijft, confidence 0,7.
2. **IoU-eis bij stemmen niet getoetst.** `k4aa.py:267-271`. M5 overleeft: een losse C elders op het etiket zou een stem geven aan de C op de balk. Toevoegen: B (orde 0) en C (orde 1) op dezelfde balk plus een C ver weg → B wint.
3. **Grens IoU = 0,5 bij stemmen niet getoetst** (M7). Klein: `merge` en de onderdrukking gebruiken ook `>=`. Eén test met precies 0,5 sluit het.
4. **Dubbele assertie.** `test_cap2_nutriscore_without_any_letter_in_the_top3_is_dropped`: `top4` is dezelfde invoer als `top` en bevat geen letter, terwijl het commentaar "letter op plek 4" zegt. De tweede assertie toetst niets nieuws (plek 4 wordt wel gedekt door `test_cap2_rank_4_nutriscore_via_top_codes_is_dropped`). Weghalen of een echte plek-4-letter geven.
5. **ATDD-checklist verouderd.** Zegt "3 rood, 14 groen (17)"; het bestand heeft 19 tests en tegen de oude code is het 6 rood, 13 groen. De twee CAP-2b-stemtests en de aangepaste e2e-test staan niet in de rode fase vermeld.

### edge-case

6. **Stemmen tellen meldingen, niet vensters.** `k4aa.py:267-271`. CAP-2b zegt "stemmen van de vensters". Meldt Gemini dezelfde letter twee keer in één venster (overlappende vakken), dan telt dat als twee stemmen. INFERENCE: zeldzaam. Kies: tel `len({k["orde"][0] ...})`, of zet in de spec dat meldingen tellen.
7. **Gelijkstand gaat naar venster 0 = het hele etiket.** `orde = (venster, plek)`, en venster 0 is het volledige etiket (`windows()`, k4aa.py:171), dus de grofste blik wint elke 1-tegen-1. INFERENCE: of dat de juiste letter vaker of minder vaak oplevert is onbekend; de deelmeting moet het per geval tonen (aantal beslissingen via gelijkstand).
8. **Een afgesneden balk geeft nog steeds twee letters.** Een tegel die de balk doorsnijdt geeft een vak met IoU < 0,5 tegen het volle vak. `one_letter` laat dan twee verschillende letters staan. Dit gedrag bestond al, maar zonder de letterpoort komt het vaker door. INFERENCE. Tel in de deelmeting hoe vaak er twee letters op hetzelfde etiket blijven.

### adversarial

9. **Afwijking van het basiscontract niet vastgelegd.** SPEC-logo-scan-k4aa CAP-3 zegt: een vak met code X blijft alleen als X in de top-3 staat. De familiepoort wijkt daar voor Nutri-Score van af. CAP-4 van de nieuwe spec noemt alleen drie pins en CAP-8. Voeg één regel toe: "CAP-3 (K4-xy-regel) geldt niet voor `NUTRISCORE_*`; zie CAP-2 van deze spec".
10. **De docstring van de module klopt niet meer.** `k4aa.py:6-7` zegt dat prompt, schema en referentieblad byte-gelijk zijn aan de spike. Dat is sinds ronde 1 niet meer zo (nieuwe hashes, CAP-4). De contractregel verwijst alleen naar spec-logo-scan-k4aa. Pas de tekst aan en verwijs ook naar spec-nutriscore-k4aa-de.
11. **Verwachte uitkomst botst met de eigen stopregel.** De spec verwacht na de fix ongeveer A 14%, B 22% en C 40% vals. CAP-5(b) eist ≤ 15% vals voor A, B en C. Volgens de eigen voorspelling stopt ronde 2 dus na de deelset, op B en C. INFERENCE (24-11-cijfers, zelfde etiketten). Geen codefout, maar meld het vooraf aan de orchestrator, zodat "stop met conclusie" de verwachte uitkomst is en geen verrassing.
12. **`confidence` verandert van betekenis voor de afnemer.** `apps/api/.../gs1-block.ts:63,88` sorteert op `confidence` en kiest per soort de hoogste, en de beoordelaar ziet die als `zekerheid`. Bij NUTRISCORE_A kan dat nu de score van D zijn. Per soort kan er niets misgaan, want elke letter is een eigen soort. De spec zegt het, maar de afnemer niet. INFERENCE: geen gedragsfout. Overweeg een `redenen`-markering, of noem het in `versions.md`.
13. **Onzuivere referenties stemmen nu voor de hele familie mee.** Volgens het manifest van 12-07 waren er Beter Leven/Halal-referenties met label E. In de spec staat dit als UNVERIFIED-aanname. Een read-only telling per letter, met een steekproef, is goedkoop en hoort in het meetrapport.

## Niet gevonden (bevestigd)

- Lege top (vak ongeldig) → Nutri-Score en andere codes vallen allebei weg (k4aa.py:249-256).
- Andere codes dan Nutri-Score gaan door dezelfde regel als vóór de wijziging (`test_cap3_top3…`, `test_cap2_other_codes…`, M1-M11 raken ze niet).
- Ketens A-B-C: de beslissing valt alleen tegen meldingen die al bewaard zijn (`test_cap2b_chain…` groen).
- `id(m)` als sleutel is veilig: `gate` maakt voor elke melding een nieuw dict.

## Herhalen

Mutatiescript: `scratchpad/mutate.py`. Het kopieert `apps/ml-service` en `apps/api/src/services/reference-code-mapping.json` naar de scratchmap, voert per mutant één tekstvervanging uit in `app/services/k4aa.py` en draait de drie testbestanden.
