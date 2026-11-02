---
title: 'Proef getrainde detector ronde 9: vier extra keurmerken, nalopen op de invulpagina, nachttraining met hervatten'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: '47edcb190b9da6b9fe4db0b7dd568cb7c4fed042'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/.claude/worktrees/proef-ronde9/_bmad-output/test-artifacts/atdd-checklist-spike-getrainde-detector.md'
  - '{project-root}/.claude/worktrees/proef-ronde9/_bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md'
  - '{project-root}/.claude/worktrees/proef-ronde9/_bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md'
  - '{project-root}/.claude/worktrees/proef-ronde9/_bmad-output/planning-artifacts/spike-getrainde-detector/trainingsset-en-herkenning.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Friso besliste op 02-11-2026: FSC, Triman, kunststofcode en PlanetProof worden het 10e–13e gemeten keurmerk (op de bestaande 352 toetsetiketten; al bevestigde etiketten krijgen alleen de vier nieuwe rijen ter controle, eerdere antwoorden onaangetast), en fase 2 traint 20 epochs maar alleen tussen 22:00 en 07:30, met pauzeren en hervatten. Het gereedschap kent 13 klassen en 9 keurmerken, kan niet hervatten en heeft geen planner.

**Approach:** Klassenlijst naar 17 (id 1–13 gelijk, FSC-varianten als variant), alle gereedschappen erop mee; uitslag/server/pagina met 13 keurmerken, `bevestigde_codes` en "na te lopen"; een aparte voorinvulling voor de vier (lege tegels overgeslagen, kostenmodel als startprojectie, uitvoer naast de live bestanden); nieuw `nacht.py` (venster, hervatten, SIGTERM/SIGKILL, status, zelfbewaking stoppunt 1, launchd-plist) en `train.py --hervat` met checkpoint per epoch; OFF-tabel, scheidingsrijen, referentieplaatjes, beoordelaar, certificaatnummer, K4-aa-referenties per klasse en draaiplan bijgewerkt. Contract: "Interfacecontract ronde 9" + aanvullingen in de ATDD-checklist.

## Boundaries & Constraints

**Always:**
- Contract: ATDD-checklist, sectie "Ronde 9" (incl. "Aanvullingen op het contract na de workers"); de rest van de checklist blijft bindend.
- De rode tests (99 nieuw + 69 aangepast) groen maken; tests alleen wijzigen bij een aantoonbare testfout, met reden in Implementation Notes.
- Alleen standaardbibliotheek, Pillow en numpy (en `rfdetr` alleen in de bestaande zware paden); schrijven alleen via `beelden.veilig_doel`.
- Concepten `concept:<id>` van de live pagina en bestaande records in `uitslag.json` blijven bruikbaar.

**Never:**
- Tijdens de bouw geen OpenRouter- of OFF-verkeer; niets schrijven onder `~/logo-meetset-20261018/`; de live server (:8767), zijn `items.json` en `uitslag.json` niet aanraken; geen training of planner starten.
- Geen productiecode, geen ACC, geen migraties; geen Roboflow.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| oud bevestigd etiket | record met 8 codes, geen `bevestigde_codes` | telt voor de 9 oude; na te lopen; tussenstand houdt `bevestigd` | — |
| keuze op nieuwe rij zonder bevestigen | tussenstand met FSC | opgeslagen, niet geteld | — |
| bevestigen zonder vier keuzes | geen voorinvulling voor de vier | pagina weigert met nieuwe melding; server 400 | invoer blijft staan |
| startprojectie boven grens | raming + grootboek > $65 | `voorinvulling-r9` start niet | stoppunt 5, exit ≠ 0 |
| buiten venster | 12:00 | `draai` start niets | — |
| 07:30 bereikt | training loopt | SIGTERM, na 300 s SIGKILL; status gepauzeerd | — |
| nieuwste checkpoint kapot | `checkpoint_3.ckpt` geen zip | hervat vanaf het vorige leesbare | — |
| geen voortgang | volledig venster zonder nieuw checkpoint | `stoppunt_1` in status; volgende draai start niet | `vrijgeven` na besluit |

</frozen-after-approval>

## Code Map

- `train.py` -- `KLASSEN`/`VARIANTEN`/`CATEGORIEEN`; `config`; `_train` (rfdetr `model.train`); `controleer_klassen` meldingtekst
- `uitslag.py` -- gedeelde lezer; `valideer`, `per_keurmerk`, `stand`
- `invul/server.py` -- `do_POST` tussenstand-pad; `/stand`
- `invul/index.html` -- `LOS`, `NAAM`, `getoond`, `zetStand`, `start`, `toon`, `slaHuidigeOp`; CSS `.rij`
- `toets.py` -- `GELIJKEND`, `OMSCHRIJVING`, `voorinvulling`, `met_v_label`, `rapport`, opdrachtregel
- `scheiding.py` -- `RIJEN_EXTRA`, `schrijf`, opdrachtregel `kies`
- `nacht.py` -- nieuw
- `echt.py` -- `GELIJKEND`, `SCHEMA_VOORLABELS`, `PROMPT`
- `generator.py` -- `_logos` (referentieplaatjes)
- `beoordelaar.py` -- `vraag_voor`; `herken.py` -- `CERTIFICAAT`; `off.py` -- `ZOEK`; `k4aa_lokaal.py` -- referentieset-json; `tel_proef.py` -- `tel`, `tabel`, opdrachtregel
- `DRAAIPLAN.md` -- stap 1/3/4/10, Snelheid, wisselplan
- Niet wijzigen: `openrouter.py` (zdr-patroon), `kosten.py`, `beelden.py`

## Tasks & Acceptance

**Execution:**
- [ ] `train.py` -- 17 klassen, varianten, `hervat`, `train_argumenten` -- contract
- [ ] `uitslag.py`, `invul/server.py`, `invul/index.html` -- 13 keurmerken, `bevestigde_codes`, na te lopen, rij 32 px -- antwoorden Friso veilig
- [ ] `toets.py` -- ronde-9-voorinvulling, samenvoegen, raming, rapport, opdrachtregel `voorinvulling-r9` -- kosten en live pagina
- [ ] `scheiding.py` -- vier rijen, `kies --reden` -- nieuwe versie zonder andere leveranciers
- [ ] `nacht.py` -- planner, status, zelfbewaking -- nachten zonder toezicht
- [ ] `echt.py`, `generator.py`, `beoordelaar.py`, `herken.py`, `off.py`, `k4aa_lokaal.py`, `tel_proef.py` -- klassen, referenties, OFF, n.v.t.
- [ ] `DRAAIPLAN.md` -- ronde-9-stappen, nachttraining, wisselplan
- [ ] rooktest hervatten met `rfdetr` (zwaar): SIGTERM via `nacht.py` midden in epoch 2, hervat tot klaar -- bewijs CAP-6/18

**Acceptance Criteria:**
- Given de rode tests van ronde 9, when de bouw klaar is, then zijn ze groen en is de volle suite groen.
- Given een kleine COCO-set, when `nacht.py draai` SIGTERM stuurt midden in epoch 2 en daarna opnieuw draait, then gaat de training verder vanaf checkpoint epoch 1 en eindigt met `train-resultaat.json`.

## Implementation Notes

Route-poort (step-02, 02-11-2026): **intent gaps 0** voor de bouw (de enige open keuze, de grens van de voorinvulling ronde 9, raakt alleen het uitvoeren, niet wat gebouwd wordt); **onomkeerbaar 0** (geen migratie, geen extern verkeer tijdens de bouw; scheiding opnieuw schrijven, OFF ophalen en de voorinvulling zijn uitvoerstappen na de keten); **omvang groot** (±15 bestanden, nieuwe module `nacht.py` die het draaiplan aanroept) → route **dispatch**. Meer-doelencheck: A (vier keurmerken), B (nachttraining) en C (correctie) zijn in één besluit van Friso als ronde 9 gebundeld; aangehouden als één spec.

Bouwgeschiedenis (lokale tussenpunten, niet gepusht): `cc4c6e7` (wip: spec, ATDD-tests, deel van de bouw), `cdebb15` (review-patches). De bouwsubagent is na het tussenpunt niet als afgerond gerapporteerd; de code en tests stonden op `cc4c6e7` al groen (483 backend, 114 browser); de rest is door de reviewpatches gedaan.

Roodcontrole (ATDD-tests tegen de oorspronkelijke bronnen `47edcb1`, 02-11-2026): backend `tests/test_ronde9_20261102.py` + aangepaste sets 135 failed / 348 passed (nieuw: 79 failed, 5 passed; de 79 falen op ontbrekend gedrag: `ModuleNotFoundError: nacht`, ontbrekende functies/constanten/argumenten); browser 33 failed / 81 passed (nieuw: 20 failed). Gelijk aan de ATDD-logging.

Review (review-loop 0, drie lagen: blind-hunter, edge-case-hunter, verification-gap): zie Review Triage Log. 28 patches doorgevoerd, 1 verworpen met refutatie (R12), 1 open vraag voor Friso (R16). Geen loopback naar intent of bad_spec.

Wijzigingen aan bestaande tests, met reden per geval (aantoonbare contractwijziging):
- `test_cap03_invulpagina.py`, `test_review_20261101.py`, `test_cap09_telling.py`: voorinvulling en bevestigd record vragen 12 keuzes (contract: bevestigen vraagt alle 12 losse keurmerken).
- `test_cap01_scheiding.py`: extra rijen (7 i.p.v. 3) met FSC, Triman, kunststofcode, PlanetProof.
- `test_cap02_kandidaten.py`: rapport telt 13 keurmerken.
- `test_cap04_generator.py`, `test_cap05_echt.py`: 17 klassen; gelijkend-voorbeeld TRIMAN → PEFC (Triman is nu klasse).
- `test_cap12_k4aa_runner.py`: code buiten de klassen FSC_MIX → PEFC (FSC Mix telt nu als FSC).
- `test_ronde5_20261101.py`, `test_ronde5_browser_20261101.py`, `test_ronde6_20261102.py`, `test_ronde7_browser_20261102.py`: 17 categorieën, 12 keuzes; OFF-tabel = de negen oude exact + de vier nieuwe; byte-gelijk-controle van de generator over categorieën 1–13; LOS/NEGEN 12/13 rijen.
- `test_cap03_invulpagina_browser.py`: voorinvulling en bevestigde POST met de vier codes.
- `test_cap06_training.py`: categorieën 17; `resume`-argument.
- `test_cap07_herkenning.py`: FSC® C123456 geeft nu FSC (certificaatpatroon van ronde 9; het oude "FSC hoort niet bij de 8" was een verouderde verwachting, die in de ATDD-ronde niet was aangepast).
- `test_ronde9_*`: de rooktest-assert kijkt naar het nieuwste checkpoint op het moment van hervatten (de pauze kan na epoch 0 of 1 vallen).

Afwijkingen en keuzes (gedocumenteerd, geen spec-wijziging):
- "Volledig venster" = duur ≥ 0,9 × 9,5 uur (10% marge). Met R10 zet elke run zonder nieuw checkpoint een stoppunt, dus de marge kan geen lus veroorzaken.
- Categorieën 14–17 zijn vastgepind in `test_r9_klassen_17`; de sha van ronde 6 dekt 1–13 omdat de generatoroutput die gebruikt.
- `vrijgeven` schrijft `nacht-status.json` (expliciet commando); `draai` blijft de enige writer tijdens een run.
- Het slot bevat het pid van het trainingsproces (niet van `draai`), zodat `ps` op `train.py` kan controleren.
- Starten vóór bevestiging Friso is een proces-poort (laden van de launchd-agent na bevestiging), geen codepoort (R12).

Rooktest hervatten (CAP-6/CAP-18, 02-11-2026, `nacht.py` met echte rfdetr-fase, N, kleine verzonnen set, scratchmap buiten de repo): `nacht.py draai` → checkpoint_0 en checkpoint_1 → `nacht.py stop` → `gepauzeerd` → `nacht.py draai` → `afgerond`, hervat vanaf `checkpoint_1.ckpt`, `checkpoint_2.ckpt` en `train-resultaat.json`. Geautomatiseerd als `zwaar`-test `test_r9_zwaar_rooktest_pauzeren_en_hervatten_met_rfdetr`: 1 passed (46 s).

Volle suite op `cdebb15` plus de twee wijzigingen hieronder: `960 passed, 0 failed` (4 min 18 s; `uv run --group dev pytest -q -p no:cacheprovider`). Eerste run 958 passed, 1 failed: `test_cap07_certificaatnummers[FSC]` (verouderde verwachting, aangepast).

OFF-ophalen ronde 9 (vier klassen, gestart 22:04 op 02-11-2026): zie resultaatblok.

Voorinvulling ronde 9: **niet gedraaid**. Raming ±$28,9 (660 aanroepen, zonder lege tegels), restant $28,61; stoppunt 5. Geen betaalde aanroep verstuurd.

Training: **niet gestart**, behalve de rooktest op de kleine scratchset. Startcommando staat in DRAAIPLAN stap 10.

## Spec Change Log

- 02-11-2026 (review-loop 0, geen loopback): de drie reviewlagen op de diff `47edcb1..cc4c6e7` leverden ±45 bevindingen; ontdubbeld tot de Review Triage Log. Geen intent_gap en geen bad_spec: de code volgt de spec; de spec-tekst was op enkele punten vaag of verouderd (doc-werk, zie R1–R19).

## Review Triage Log

| ID | bron | bevinding (kort) | verdict | route | bewijs / wat er gebeurt |
|---|---|---|---|---|---|
| R1 | blind | DRAAIPLAN stap 9 noemt voorlabels ±$25–35 en ±800 etiketten | medium | patch (doc) | SPEC/randvoorwaarden: ±$34–54 en ±1.100 etiketten; DRAAIPLAN bijwerken |
| R2 | blind | totaal ±$116–131 is rekenfout | low | patch (doc) | 78–88 + 9–19 (voorlabels) + 29 (voorinvulling r9) = ±116–136; SPEC, randvoorwaarden §3, DRAAIPLAN |
| R3 | blind | "voorinvulling ronde 9 binnen de grens" klopt niet (raming 28,9 > restant 28,61) | high | patch (doc) | DRAAIPLAN en randvoorwaarden: boven restant, stoppunt 5, keuze Friso |
| R4 | blind | aantal aanroepen ±600 vs 660 | low | patch (doc) | 660 (gemeten op de 352 zonder lege tegels) |
| R5 | blind | DRAAIPLAN stap 5/10 en testcommentaar noemen 9/13 klassen | low | patch (doc) | 13 keurmerken, 17 klassen; `tests/test_ronde5_20261101.py` commentaar |
| R6 | blind | bouwstatus niet herleidbaar (geen Implementation Notes, geen trace) | high | patch (proces) | Implementation Notes + trace-rapport + verificatie (zie resultaatblok) |
| R7 | blind | Triage/Change Log leeg | medium | patch (proces) | deze tabel |
| R8 | blind | gewijzigde bestaande tests zonder reden per geval | medium | patch (doc) | Implementation Notes: lijst per testbestand met reden |
| R9 | blind + edge | placeholder `--start <checkpoint uit $MAAT-1>`; combinatie start+hervat onbeschreven | medium | patch (doc) | DRAAIPLAN stap 10: concreet startcommando (fase 1: `checkpoint_best_total.pth`/`checkpoint` uit `train-resultaat.json`); hervatten gaat alleen via `nacht.py draai` binnen de eigen map |
| R10 | blind + edge + verif | fout vóór eerste checkpoint elke nacht opnieuw, nooit stoppunt 1 (crash-lus) | high | patch (code) | `nacht.py draai`: een afloop zonder nieuw checkpoint zet `stoppunt_1` (ook bij `fout`); test |
| R11 | blind | rooktest "SIGTERM midden in epoch 2 via nacht.py" niet uitvoerbaar | high | patch (code) | nieuw `nacht.py stop --uit U`: SIGTERM aan het pid in het slot, uitkomst "gepauzeerd"; rooktest gebruikt dat |
| R12 | blind | geen code-poort voor start vóór bevestiging Friso | false | — | refutatie: de spec legt de poort bij het laden van de launchd-agent door de hoofdsessie na bevestiging (CAP-18); `plan` en `draai` starten niets zonder die agent of een handmatige `draai` |
| R13 | blind + edge + verif | `plan` overschrijft nacht.json en plist; één gedeeld plist-label | medium | patch (code) | label per uit (`LABEL.<mapnaam>`); `plan` weigert als er al checkpoints of een status zijn; test |
| R14 | blind | "volledig venster" 0,9-marge ongedocumenteerd | low | patch (doc) | gedocumenteerd in Implementation Notes; onschadelijk door R10 |
| R15 | blind | `nacht.py status` schrijft nacht-status.json zonder lock | medium | patch (code) | `status` leest alleen; alleen `draai` schrijft (onder slot); test |
| R16 | blind | open vraag: voorlabels-bovenkant $54 raakt harde grens $50; wat met restant? | medium | open vraag Friso | Open Questions in de spec; geen code-loopback: stoppunt 5 is het ontworpen gedrag |
| R17 | edge | `_hints` maakt hintbeelden voor de oude acht codes | low | patch (code) | alleen de vier nieuwe codes; test |
| R18 | blind | referentieplaatje-volgorde FSC-variant vs handmatig.json | medium | patch (code) | variant-fallback na de handmatig-lus; docstring; test |
| R19 | blind | spec-frontmatter met absolute worktree-paden | low | patch (doc) | teruggezet naar `{project-root}` |
| R20 | edge + verif | NVT-besluit na nakijken niet getest | medium | patch (test) | test in `test_ronde9_20261102.py`: FSC met 0 referenties + afwijkend oordeel → NVT blijft |
| R21 | edge + verif | `per_klasse` producent en consument niet samen getest | medium | patch (test) | main-niveau test: k4aa `--alleen-referentieset` schrijft per_klasse; tel_proef `--referenties` gebruikt het |
| R22 | edge + verif | rfdetr-resume alleen in zwaar testbestand | medium | patch (test) | niet-zwaar test met gestubde rfdetr-klasse: `resume` en `checkpoint_interval=1` bereiken `train` |
| R23 | edge + verif | echt.py meldt "13 klassen" | low | patch (code) | bericht en docstring op `len(CATEGORIEEN)` |
| R24 | edge + verif | caffeinate-start mislukt na trainer-start: verweesde trainer | medium | patch (code) | trainer stoppen bij mislukte caffeinate; test met gefaalde popen |
| R25 | edge + verif | verouderd slot met hergebruikt pid blokkeert elke nacht | medium | patch (code) | slot telt alleen als het pid een `train.py`-proces is (ps-controle, injecteerbaar); test |
| R26 | edge + verif | kosten van een gefactureerde maar ongeldige aanroep niet in het etiket | low | patch (code) | `EtiketFout` draagt de kosten; voorinvulling telt ze op; grootboek was al correct; test |
| R27 | edge + verif | scheiding-archief met zelfde seconde overschreven | low | patch (code) | tijdstempel met microseconden; test |
| R28 | edge | test_ronde6 sha_train laat categorieën 14–17 weg | low | patch (doc/test) | namen 14–17 blijven vastgepind in `test_r9_klassen_17`; in Implementation Notes vermeld |
| R29 | blind | `nacht.py` plan/status: vergelijkbaar met R15 | — | samengevoegd met R15 | — |

Verdict-samenvatting: high 4 (R3, R6, R10, R11), medium 11, low 9, false 1 (R12), open vraag 1 (R16). Alle patches zijn code, test of document binnen de worktree; geen productiewijziging, geen voorinvulling, geen training.

## Verification

**Commands:**
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev pytest -q -p no:cacheprovider tests/test_ronde9_20261102.py tests/test_ronde9_browser_20261102.py` -- expected: alles groen
- `uv run --group dev pytest -q -p no:cacheprovider` -- expected: volle suite groen (±57 min)
- `uv run --group dev --group detector pytest -q -p no:cacheprovider -m zwaar` -- expected: zware tests groen, incl. de hervat-rooktest
