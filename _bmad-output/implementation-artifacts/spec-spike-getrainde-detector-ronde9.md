---
title: 'Proef getrainde detector ronde 9: vier extra keurmerken, nalopen op de invulpagina, nachttraining met hervatten'
type: 'feature'
created: '2026-11-02'
status: 'in-progress'
baseline_commit: '47edcb190b9da6b9fe4db0b7dd568cb7c4fed042'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/proef-ronde9/_bmad-output/test-artifacts/atdd-checklist-spike-getrainde-detector.md'
  - '/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/proef-ronde9/_bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md'
  - '/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/proef-ronde9/_bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md'
  - '/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/proef-ronde9/_bmad-output/planning-artifacts/spike-getrainde-detector/trainingsset-en-herkenning.md'
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

Route-poort (step-02, 02-11-2026): **intent gaps 0** voor de bouw (de enige open keuze, de grens van de voorinvulling ronde 9, raakt alleen het uitvoeren, niet wat gebouwd wordt); **onomkeerbaar 0** (geen migratie, geen extern verkeer tijdens de bouw; scheiding opnieuw schrijven, OFF ophalen en de voorinvulling zijn uitvoerstappen na de keten); **omvang groot** (±15 bestanden, nieuwe module `nacht.py` die het draaiplan aanroept) → route **dispatch**. Meer-doelencheck: A (vier keurmerken), B (nachttraining) en C (correctie) zijn in één besluit van Friso als ronde 9 gebundeld; aangehouden als één spec. Tokenomvang ±1.500 (contract staat in de ATDD-checklist).

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev pytest -q -p no:cacheprovider tests/test_ronde9_20261102.py tests/test_ronde9_browser_20261102.py` -- expected: alles groen
- `uv run --group dev pytest -q -p no:cacheprovider` -- expected: volle suite groen (±57 min)
- `uv run --group dev --group detector pytest -q -p no:cacheprovider -m zwaar` -- expected: zware tests groen, incl. de hervat-rooktest
