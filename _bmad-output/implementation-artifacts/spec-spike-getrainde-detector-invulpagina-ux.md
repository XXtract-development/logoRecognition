---
title: 'Proef getrainde detector ronde 7: invulpagina op één scherm'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: '8bc97a72d9c3f732040bbf18708da625fe58215e'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/test-artifacts/atdd-checklist-spike-getrainde-detector.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/invul-ux/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/invul-ux/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Friso (02-11-2026): "Maak met bmad-ux een beter gebruikersvriendelijke pagina waarmee ik snel kan beoordelen en alle info op 1 scherm past." Op de huidige invulpagina staat het etiket als smalle strook, vallen de uitsneden onder de vouw, is de keurmerklijst lang (drie rondjes onder elkaar) en valt de AI-voorinvulling rechts van het scherm.

**Approach:** `invul/index.html` opnieuw opbouwen volgens de UX-spines (`invul-ux/EXPERIENCE.md`, `DESIGN.md`) en het "Interfacecontract ronde 7" in de ATDD-checklist (sectie "Ronde 7"): één scherm met kopregel, etiketbeeld met tegelkaders en inzoomen, uitsnedekolom, compact paneel met segmentknoppen, AI-merkjes, stand per rij, sneltoetsen per rij en "Bevestigen en volgende". Antwoordmodel, opslag, server-API en conceptsleutel blijven gelijk.

## Boundaries & Constraints

**Always:**
- Contract: "Interfacecontract ronde 7" plus de verduidelijkingen eronder in de ATDD-checklist; bij strijd over bediening en indeling winnen de spines, over antwoordmodel, opslag en "wat iemand typt raakt nooit kwijt" wint toetsset §6. De rest van de checklist blijft bindend.
- De 30 rode tests in `tests/test_ronde7_browser_20261102.py` groen maken en de 769 bestaande groen houden; tests alleen wijzigen bij een aantoonbare testfout, met reden in Implementation Notes.
- Toetsset §6: geen `focus()`/`select()` op een ander veld; geen ouder van een invoerveld vervangen; tellers, merkjes, "gewijzigd" en stand alleen via `textContent`/`hidden`/attributen op eigen elementen; concept per toetsaanslag in `sessionStorage` (`concept:<id>`) gaat vóór; `#keuzes` `inert` tot klaar; `blur()` alleen van een eigen knop of keuze bij etiketwissel.
- Eén HTML-bestand met eigen CSS en JS; geen externe bibliotheek, lettertype of CDN; huisstijlkleuren uit `DESIGN.md`.

**Never:**
- `invul/server.py`, `uitslag.py`, het schema van `uitslag.json` of de server-API wijzigen.
- Niets buiten `invul/index.html`, deze specfile, de ATDD-checklist, `deferred-work.md` en de tracebestanden; niet committen of pushen (de orchestrator commit na de trace).
- De live server op poort 8767 of `~/logo-meetset-20261018/` aanraken.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| zwaarste etiket | 6 uitsneden, lange namen, `#notitie` en foutmelding zichtbaar, venster 1440×800 of 1920×970 | geen paginascroll, alle vlakken binnen het venster, rijen ≤ 44 px | — |
| zeer hoog beeld | h/b > 3 | beginstand `breedte`, vak scrollt naar het eerste kader | — |
| sneltoets cijfer | rij actief, `2` | afwezig, tussenstand-POST, volgende rij; vanaf V-label blijft V-label | in `#opmerking` niets; herhaling niets |
| Nutri-Score-rij | `1`–`5`, `0` | letter A–E / onleesbaar aan-uit | `4`/`5`/`0` elders niets |
| onleesbare uitsnedenaam | `x-tegel-0.png` | uitsnede zonder `data-code`, geen kader | geen fout |
| beeld ontbreekt | 404 op het beeld | `beeld-fout` zichtbaar | keuzes blijven bruikbaar |
| opslagfout ander etiket | 500 na `b` | melding met de etiketcode | concept blijft |

</frozen-after-approval>

## Code Map

- `_bmad-output/planning-artifacts/spike-getrainde-detector/invul/index.html` -- de enige te wijzigen bestand. Hergebruik ongewijzigd de logica: `LOS`/`KEURMERKEN`/`NAAM`, `heeftVoorinvulling`, `uitVoorinvulling`, `getoond` (concept vóór serverstand), `formulier`, `volledig`, `veranderd`, `bewaarConcept`, `zetStand`, `haalStand`, `sla`/`slaNu` (één opslagketen, concept pas weg na bevestigde opslag), `slaHuidigeOp`, `isTekstveld`, `start` (klaar-teken). Herbouw: HTML/CSS-indeling, `bouwFormulier` (rijen met segmentknoppen in `#standen`), `toon`, `koppel` (toetsen), plus nieuw: beeldvak met stand/zoom, kaders, uitsnedekolom.
- `herken.py` `_starts`/`tegels` (regels 38–51) -- tegelregel 1024/256 die de pagina in JS naspiegelt; niet wijzigen.
- `toets.py` regels 403–416 -- herkomst van `hint` (hoogstens 2 per code, naam `<id>-<CODE>-<i>.png`).
- `invul/server.py` -- serveert alles; niet wijzigen.
- Bestaande browsertests die groen moeten blijven: `tests/test_cap03_invulpagina_browser.py`, `test_ronde3_browser_20261101.py`, `test_ronde5_browser_20261101.py`, `test_review_20261101.py` (o.a. `#opslaan` blijft staan, `#keuzes [role=radiogroup]`-volgorde, `#standen` met 9 standen).

## Tasks & Acceptance

**Execution:**
- [x] `_bmad-output/planning-artifacts/spike-getrainde-detector/invul/index.html` -- pagina opnieuw opbouwen volgens contract ronde 7 en spines -- verzoek Friso, CAP-3.

**Acceptance Criteria:**
- Given de suite, when `uv run --group dev pytest -q -p no:cacheprovider` draait in de specmap, then 0 failed (rood vóór de bouw: 30 failed, 769 passed, 2 skipped).
- Given `git status --porcelain`, when de bouw klaar is, then alleen toegestane paden gewijzigd.

## Implementation Notes

- Basis voor doorgaan bij een vuile werkboom (step-01): de wijzigingen zijn de spec-update, de UX-spines en de ATDD-tests van deze keten, op de passende tak `spike/proef-invulpagina-ux`; staande toestemming van de eigenaar om tot review te bouwen (headless: goedkeuren en doorgaan).
- Multi-goal (step-01): één doel (de invulpagina).
- Checkpoint 1 (step-02): geen open vragen; goedgekeurd en door op de staande toestemming van de eigenaar om tot review te bouwen; status via `ready-for-dev` naar `in-progress` (step-03), baseline `8bc97a72d9c3f732040bbf18708da625fe58215e`.
- Bouw (step-03): `invul/index.html` herbouwd; antwoordmodel, `getoond`/`formulier`/`volledig`/`veranderd`/`bewaarConcept`/`sla`/`slaNu`/`start` ongewijzigd overgenomen. Twee kleine aanvullingen in `slaNu`: een gelukte tussenstand houdt lokaal de status van het etiket (zoals de server), en melding (gelukt én mislukt) noemt de etiketcode als het verzoek bij een ander etiket hoort. Sneltoets-cijfers gebruiken `input.click()` op de juiste radio/checkbox, zodat ze exact de klikweg volgen (change → concept → tussenstand) zonder `focus()`. Toetsherhaling wordt behalve voor de pijlen genegeerd, ook voor `b` en Esc (ingedrukt gehouden `b` zou anders reeksen etiketten bevestigen).
- Testwijziging 1 (aantoonbare testfout, platform): `test_r7_klik_zoomt_in_en_esc_en_wissel_terug` verwachtte een `click` bij Ctrl-klik. Op macOS maakt Chromium van Ctrl-klik een rechterklik (`contextmenu`, géén `click`); gemeten met een losse Playwright-probe: Ctrl → `mousedown`+`contextmenu`, Meta → `mousedown`+`click`. Geen pagina kan dat veranderen. De test gebruikt op `darwin` alleen Meta (Cmd), elders Ctrl én Meta.
- Testwijziging 2 (aantoonbare testfout, wedloop): `test_r7_toetsen_123_en_pijlen_per_rij` las het concept uit `sessionStorage` ná het antwoord op de tussenstand-POST. Toetsset §6 (en `test_p0_concept_verdwijnt_pas_na_bevestigde_opslag`) laat het concept juist na de bevestigde opslag verdwijnen, dus de test botste met het contract en hing af van timing. De test bespiedt nu `Storage.setItem` en toetst het laatst geschreven concept voor het etiket.
- Verificatie: `test_ronde7_browser_20261102.py` 30/30 groen; volledige suite twee keer 799 passed, 2 skipped, 0 failed. Schermafbeeldingen op 1440×800 en 1920×970 (verzonnen beelden, buiten de repo): geen paginascroll, paneel 730/900 px hoog zonder overloop.
- Reviewronde 1 (alle punten doorgevoerd): `breedte` scrollt naar het bovenste kader (kleinste y0 uit `data-vak`; `hint` is op code gesorteerd); uitsnedenamen al bij `toon()`, na het laden weer weg bij een tegel buiten het tegelvlak; een mislukte opslag blijft in `#melding` staan (module-variabele `fout`) tot dat etiket wél opslaat; `gewijzigd`/`AI: …` op de naamregel, stand alleen op regel 2; `#keuzes` `overflow-y: auto`; sneltoetsentekst "Cmd-klik (Mac) of Ctrl-klik"; titel krimpt vóór de etiketcode; Enter op de beeldlink zoomt op het midden; een letter kiezen zet "letter onleesbaar" uit, letters gedimd zolang onleesbaar aan staat (0 twee keer brengt de letters terug); resize herberekent alleen `passend`; lokale `stand` in `start()` hernoemd. Tests aangescherpt (zichtbaarheid uitsnedekolom en `beeld-fout`, ↑/↓ en POST-telling op een keuze met focus, herhaalde `b`/Esc, `::after`-tekst "AI", geslaagde-opslagmelding met etiketcode) en `test_r7_nutriscore_letter_zet_onleesbaar_uit` toegevoegd. Testfout gerepareerd in `test_cap03_invulpagina_browser.py::test_p0_gewijzigde_keuze_gaat_mee_met_opslaan` (wankel: de tweede tussenstand-POST wordt pas na de eerste verstuurd, dus `expect_request` kon die vangen in plaats van de bevestiging; nu wacht de test elke tussenstand af; asserts ongewijzigd). `test_ronde7` + `test_cap03` browser: 43 passed.
- Route-poort (step-02): intent gaps 0 (indeling, toetsen, zoom en toestanden vastgelegd in spines en contract, na review); irreversibles 0 (geen data, geen migratie, server ongewijzigd, live server niet aangeraakt); footprint: 1 bestand, maar een volledige herbouw van de pagina (±500 regels, ±20 contractpunten, 30 nieuwe tests) — niet klein → `dispatch`.

## Spec Change Log

## Review Triage Log

Lagen: Blind Hunter (BH, 14), Edge Case Hunter (EC, 6), Verification Gap (VG, 5 + 1 overig). Geen laag overgeslagen. Uitkomst: 26 bevindingen; 20 patch (in 18 groepen, alle doorgevoerd), 0 defer, 6 verworpen (deels); geen intent_gap of bad_spec (geen loopback).

| id | verdict | bewijs | route |
|---|---|---|---|
| BH1 | medium | `beginstand()` nam het eerste kader in DOM-volgorde; `hint` is op code gesorteerd (`toets.py` `sorted(hinttegels.items())`), dus een hoger kader kon boven beeld blijven | patch (kleinste y0) |
| BH2 + EC4 | low | uitsnedenamen pas in `beeldGeladen()`; bij traag/mislukt beeld naamloos; directe correctie | patch |
| BH3 | medium | `toon()` wiste `#melding`, dus een opslagfout van het vorige etiket verdween bij de volgende `b` | patch (module-variabele `fout`) |
| BH4 | medium | `.regel2` 190 px: stand (±140 px) + "gewijzigd" (±64 px) → stand afgekapt in juist de gewijzigde rijen; CAP-3 vraagt de stand | patch (gewijzigd/AI naar naamregel) |
| BH5 | low | `body` `overflow:hidden`: in een kort venster knoppen onbereikbaar; de schermtest toetst wél elk vlak binnen het venster (bewering "triviaal" deels onjuist) | patch (`#keuzes` `overflow-y:auto`) |
| BH6 + VG2 | gap | ↑/↓ op een radio met focus niet getoetst; zonder `preventDefault` zou de keuze stil wijzigen en opslaan | patch (test) |
| BH7 | low | sneltoetsentekst "Cmd/Ctrl-klik"; Ctrl-klik is op macOS een rechterklik (gemeten in de bouw) | patch (tekst) |
| BH8 | low | titel en etiketcode krompen gelijk op, DESIGN zegt titel eerst | patch (`flex-shrink`) |
| BH9 | low | checklist-tabel "1 (2)" terwijl de functie 1 geval heeft (`--co`: 1) | patch (checklist) |
| BH10 | low | boekhouding: checklist "Na de bouw" en memlog-events ronde 7 ontbraken | patch (na de trace bijgewerkt) |
| BH11a + EC2 | low | Enter op de beeldlink geeft `clientX/Y` 0 → zoom linksboven | patch (`e.detail === 0` → midden) |
| BH11b | low | uitsneden niet met toetsenbord te openen; zelden (Friso zoomt met de muis), fix vraagt extra handlers en rollen | verworpen |
| BH11c | low | pijlen kunnen niet pannen in ingezoomd beeld; pannen met muis/trackpad werkt, pijlen zijn bewust etiket/rij-navigatie | verworpen |
| BH12 + EC1 | medium | letters en "letter onleesbaar" tegelijk aan, alleen "onleesbaar" opgeslagen; ook via klik (bestond al) maar de sneltoets maakt het makkelijker | patch (letter zet onleesbaar uit, letters gedempt) |
| BH13 | low | DESIGN noemde 1440×900 en ±660/±1140 px; contract en CSS: venster 1440×800, ±690/±1170 | patch (DESIGN.md) |
| BH14 + EC3 | low | resize zette in `breedte` de scroll terug naar het eerste kader | patch (alleen `passend` herberekenen) |
| EC5 | false | `items.json` zonder `beeld`: `toets.py` schrijft altijd `beeld` (regel 416); niet bereikbaar | verworpen |
| EC6 | low | uitsnede 404 → gebroken icoon; alle 528 uitsneden bestaan (gemeten 02-11), fix vraagt extra handler | verworpen |
| VG1 | gap | uitsnedekolom/`beeld-fout` alleen via `hidden`-eigenschap getoetst; zonder de `[hidden]`-regel bleef een lege kolom staan | patch (test `to_be_hidden`) |
| VG3 | gap | herhaalde `b`/Esc niet getoetst | patch (test) |
| VG4 | gap | zichtbare tekst "AI" (`::after`) niet getoetst | patch (test) |
| VG5 | gap | geslaagde-opslagmelding met etiketcode niet getoetst; laag, maar één assert | patch (test) |
| VG-overig | low | lokale `stand` in `start()` overschaduwde de beeldstand | patch (hernoemd) |
| eigen meting | low | `test_cap03…::test_p0_gewijzigde_keuze_gaat_mee_met_opslaan` faalde 1 van 7 runs (KeyError 'status'): wedloop in de test, de tweede tussenstand-POST wordt pas na de eerste verstuurd | patch (testfout) |

## Verification

**Uitkomst (02-11-2026):** na de reviewpatches 800 passed, 2 skipped, 0 failed (2× na elkaar); `git status` alleen toegestane paden. Step-05 "commit": door de orchestrator na `bmad-testarch-trace` (briefing).

**Commands:**
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev pytest -q -p no:cacheprovider` -- expected: 0 failed
- `git status --porcelain` -- expected: alleen `invul/index.html` plus de bestanden van deze keten (spec, spines, checklist, tests, memlogs)
