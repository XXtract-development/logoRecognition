# Story 20.4: Getekend kader indienen kan alléén via de hoofdknop (met keurmerk-keuze vooraf)

Status: review

<!-- UX-wijziging gemeld door Friso 2026-07-17: "Als ik een crop maak dan wordt deze
     direct goedgekeurd en gaat verder. In plaats daarvan moet de tekst van de
     goedkeurknop wijzigen en moet ik eerst bevestigen. Dit stelt mij in staat om
     ook een ander keurmerk te selecteren indien nodig."
     Diagnose: de hoofdknop deed dit AL (12.17: label -> "Bevestig getekend kader",
     accept routeert naar het kader). De lek-paden eromheen:
     (1) de in-stage "Bevestig kader"-knop (ImageStage, direct onder de afbeelding)
         dient WEL meteen in en springt door — die tikt Friso aan als onderdeel van
         "de crop maken";
     (2) een keurmerk kiezen (relabel-picker) terwijl een ONBEVESTIGD kader
         klaarstaat negeert dat kader volledig: pendingRel bestaat pas NA een
         eerste indiening, dus de pick dient direct acceptReviewItem(id, code) in
         — met de AUTO-crop, niet het getekende kader, en zonder bevestig-stap. -->

## Story

Als beoordelaar
wil ik dat een getekend kader pas wordt ingediend wanneer ik de (hertitelde) hoofdknop indruk — en dat een eventueel gekozen ander keurmerk tot dat moment alleen wordt klaargezet,
zodat ik kader én code in alle rust kan combineren en er nooit iets voortijdig wordt geregistreerd.

## Acceptatiecriteria

1. **AC1 — geen directe indiening vanuit de afbeelding.** Zolang een getekend kader onbevestigd is, bestaat er geen indien-knop in/onder de afbeelding (de in-stage "Bevestig kader"-knop is in de deck verborgen); tekenen zelf dient nooit iets in.
2. **AC2 — code klaarzetten i.p.v. indienen.** Een keurmerk kiezen via de picker terwijl een onbevestigd kader klaarstaat dient NIETS in: de code wordt klaargezet, de picker sluit, en de hoofdknop toont kader + code (bv. "Bevestig kader als {code}").
3. **AC3 — de hoofdknop is de enige bevestiging.** Indrukken van de hoofdknop (of sneltoets A / veeg-accept) met een klaarstaand kader dient kader (+ klaargezette code, indien aanwezig) in één annotate-aanroep in en gaat daarna pas verder.
4. **AC4 — klaargezette code raakt nooit stil verloren.** Wordt het kader gewist (×) terwijl een code klaarstaat, dan toont de hoofdknop "Accepteer als {code}" en dient hij bij bevestiging de code in (bestaand relabel-pad); afwijzen/ongedaan maken ruimt de klaargezette code op.
5. **AC5 — bestaand gedrag zonder kader byte-gelijk.** Zonder klaarstaand kader: picker-keuze = direct indienen + doorgaan (12.12/12.14-gedrag), accepteren/afwijzen ongewijzigd; het kader-dan-code-pad ná een eerdere indiening (pendingRel, 12.14) ongewijzigd.
6. **AC6 — tests.** RED→GREEN op de nieuwe flows + regressies; volledige web-suite groen; tsc 0.

## Dev Notes

- ImageStage: nieuw prop `hideConfirm` (default false — andere afnemers ongewijzigd); de deck zet hem op beide stages (uitsnede + context).
- Deck: nieuwe `stagedCode`-state (klaargezet, nog niet ingediend) naast `assignedCode` (ingediend). `relabel()` met onbevestigd kader → alleen stagen. `applyAnnotation` leest `stagedCode ?? assignedCode` en promoveert bij succes. `applyDecision('ECHT')` zonder kader maar mét stagedCode → bestaand relabel-indienpad.
- Opruimen van stagedCode overal waar assignedCode al wordt opgeruimd (beslissing-wissel, undo, afwijzen).

## Change Log

- 2026-07-17: aangemaakt + diagnose bevestigd op de code (stage-confirm-knop ImageStage ~332; relabel() zonder hasDraftBox-guard MobileReviewDeck ~535).
- 2026-07-17: geïmplementeerd (ATDD 4 RED→GREEN + 2 regressies groen vooraf): ImageStage-prop `hideConfirm` (deck verbergt de in-stage-knop op beide stages), `stagedCode`-state, relabel staget bij onbevestigd kader, applyAnnotation gebruikt/promoveert staged code, accept-zonder-kader-met-staged-code via relabel-indienpad (relabelRef), opruiming op 3 plekken, 4 hoofdknop-labelvarianten. Adversariële review PASS (10 eigen probes: volgorde-permutaties, pendingRel-doorsnijding, item-wissel, sneltoets/swipe-pariteit, hideConfirm-contract — alle correct) met 1 MEDIUM verwerkt: staged-code-tak kaapte de undo op een al-goedgekeurde kaart → prev!=='ECHT'-guard + regressietest (7/7). L: staged code overleeft navigatie terwijl het kader vervalt (knop toont dat eerlijk — geaccepteerd), comment-motivering hideConfirm gecorrigeerd. Gates: web-vitest 176 passed/0 failed, tsc 0. Deploy permission-gated.
