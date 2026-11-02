---
title: 'Proef getrainde detector ronde 8: hele etiket passend in beeld, inzoomen op verzoek'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: 'a7a729b6fdac954234c3a29e2f6502f991aa6928'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/test-artifacts/atdd-checklist-spike-getrainde-detector.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/invul-ux/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Op de live invulpagina toont het grote beeld bij een hoog etiket alleen een ingezoomd stuk (beginstand "breedte" van ronde 7: de koe vult het vak). Friso: "Het etiket is te groot, deze moet inzoomen tot 100% breedte of hoogte."

**Approach:** In `invul/index.html` is de beginstand altijd `passend`: het hele etiket geschaald tot 100% van de binnenbreedte of -hoogte van het beeldvak, in beide richtingen gecentreerd, geen scrollbalk; alle AI-kaders van de actieve rij duidelijk gemarkeerd (rand + vulling, bovenop); inzoomen alleen op verzoek (klik binnen het beeld of op een uitsnede; klik naast het etiket doet niets; Esc of klik op het ingezoomde beeld terug). Contract: "Interfacecontract ronde 8" in de ATDD-checklist; antwoordmodel, opslag, server en conceptsleutel ongewijzigd.

</frozen-after-approval>

## Implementation Notes

- Basis (step-01): vuile werkboom = de spec-update, spines en ATDD-tests van deze keten in de eigen worktree `.claude/worktrees/proef-invulpagina-r8` (tak `spike/proef-invulpagina-ux-r8`, push naar `origin spike/proef-invulpagina-ux`); eigen worktree omdat de live server `invul/index.html` uit worktree `proef-invulpagina` per aanvraag leest. Staande toestemming van de eigenaar om tot review te bouwen (headless). Eén doel.
- Route-poort (step-02): intent gaps 0 (besluit Friso letterlijk, contract ronde 8 na twee reviews); irreversibles 0 (alleen HTML, server en opslag ongewijzigd, live server niet aangeraakt); footprint klein: 1 bestand, ±30 regels in `beginstand()`, de klikafhandeling, de resize-afhandeling en CSS van kaders en beeldvak, niets nieuws waar andere code van afhangt → `oneshot`.
- Rode run (ATDD): 23 failed, 807 passed, 2 skipped.
- Correctie route-poort-notitie (na review): gewijzigd zijn `beginstand()` (nieuw `passendeMaat()`), `zoomIn()`, `toon()`, de klikafhandeling van het beeld en de CSS van kaders en cursor; de resize-afhandeling en de CSS van het beeldvak bleven gelijk. Footprint blijft klein (1 bestand, ±35 regels).
- Bouw (step-oneshot): beginstand altijd `passend` met schaal = min(binnenbreedte/breedte, binnenhoogte/hoogte), zonder afronding (afronden maakte een smalle strook 5 px te laag), verticaal gecentreerd via `margin-top`; `breedte` en `w0` verwijderd; klik buiten de beeldbox doet niets; actieve kaders 3 px navy, navy-vulling 18 % (`color-mix` op `--navy`), `z-index` 2 boven 1. Ronde 8 23/23 en ronde 7 38/38 groen; suite 830 passed, 2 skipped.
- Na review (Blind Hunter): passende maat wordt gemeten nadat het beeld eerst is gekrompen, zodat scrollbalken van een ingezoomd beeld niet meetellen (bij Esc, klik terug en tweede uitsnede); zoomcursor alleen op het etiket (`#omhulsel`), niet op de witte rand. Tests erbij: met echte scrollbalken (eigen Chromium zonder `--hide-scrollbars` via dezelfde Playwright-instantie) terug naar passend en tweede uitsnede bij een klein etiket (mutatie: zonder krimpen → 2 rood), uitsnedekader zo veel mogelijk in het midden, zoomcursor alleen op het etiket (mutatie → rood); ronde-7-testnaam `…passend_of_breedte` kreeg een docstring met verwijzing naar de volledige ronde-8-test. EXPERIENCE: naam van een uitsnede alleen bij geldige code én tegel; klik in de witte rand zonder zoomcursor. DESIGN: token `navy-vulling`.
- Live wissel: de live server leest `invul/index.html` per aanvraag uit worktree `proef-invulpagina`; een `git pull --ff-only` daar (server.py ongewijzigd) plus herladen van Friso's tabblad is genoeg; concepten blijven (zelfde sleutel en vorm, `test_r8_concept_van_ronde_7_gaat_voor_op_serverstand`).

## Review Triage Log

Laag: Blind Hunter (oneshot; edge-case- en verificatielaag horen niet bij de route `oneshot`). 12 bevindingen: 10 patch (doorgevoerd), 2 verworpen.

| # | verdict | bewijs | route |
|---|---|---|---|
| 1 | medium | `beginstand()` mat `clientWidth/Height` terwijl het ingezoomde beeld nog scrollbalken gaf → na Esc ±15 px te klein, niet gecentreerd (zichtbaar met klassieke scrollbalken) | patch (eerst krimpen) |
| 2 | medium | tests draaien met `--hide-scrollbars`, dus 1 bleef onzichtbaar | patch (test met echte scrollbalken; mutatie rood) |
| 3 | medium | tweede uitsnede vanuit `in` rekende 3× passend mét scrollbalken; geen test met kleine etiketten | patch (zelfde oorzaak als 1 + test `KLEIN2`) |
| 4 | low | "zo veel mogelijk in het midden" niet getoetst | patch (test) |
| 5 | low | zoomcursor op de witte rand waar een klik niets doet | patch (cursor op `#omhulsel`) |
| 6 | low | Cmd/Ctrl/middenklik in de witte rand opent de volledige resolutie; onschuldig en bedoeld als link | verworpen |
| 7 | low | EXPERIENCE beloofde een naam bij een tegel buiten het tegelvlak; de code wist hem (contract ronde 7) | patch (EXPERIENCE) |
| 8 | low | boekhouding ronde 8 nog niet bijgewerkt | patch (na de trace) |
| 9 | low | live wissel niet beschreven | patch (notitie hierboven) |
| 10 | low | route-poort-notitie noemde onjuiste onderdelen | patch (correctie hierboven) |
| 11 | low | vulkleur als losse literal | patch (`color-mix` op `--navy`, token `navy-vulling`) |
| 12 | low | ronde-7-testnaam `…passend_of_breedte` misleidend; hernoemen breekt de trace | patch (docstring), hernoemen verworpen |
