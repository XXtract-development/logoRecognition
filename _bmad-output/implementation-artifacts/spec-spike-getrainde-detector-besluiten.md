---
title: 'Proef getrainde detector: besluiten Friso 01-11-2026 in gereedschap en draaiplan'
type: 'feature'
created: '2026-11-01'
status: 'done'
baseline_commit: '79f6ce1e3770ff7a0e845334cf137586816acf49'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/test-artifacts/atdd-checklist-spike-getrainde-detector.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/meetregels.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/randvoorwaarden.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/trainingsset-en-herkenning.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Friso besliste op 01-11-2026 (commit `c86a067`): BSL-1.0 en CNRI-Python zijn toegestane licenties; de detector traint alleen in maat N (S/M/L alleen met een vastgelegd besluit); het blinde nakijken krijgt een gestratificeerde steekproef van 10% van de overeenkomende paren, een verborgen sleutel, een verplicht oordeel per regel en een tweede ronde. Het gereedschap en het draaiplan volgen nog de oude regels: 55 acceptatietests uit ATDD-ronde 2 zijn rood en de licentiecontrole blokkeert de training (stoppunt 4).

**Approach:** `licenties.py`, `train.py`, `tel_proef.py` en `DRAAIPLAN.md` (plus het voorbeeld in de docstring van `herken.py`) aanpassen volgens de sectie "Ronde 2 (besluiten Friso 01-11-2026)" van de ATDD-checklist, het bindende interfacecontract, tot de hele suite groen is; daarna de licentiecontrole opnieuw draaien op de echte detectoromgeving. Vastgelegde keuzes van de opdrachtgever: stap 9 meet alleen maat N (de regel voor S vervalt); de informatieve K4-aa-run met alle referenties wordt in stap 14 niet als `--route` meegegeven.

## Boundaries & Constraints

**Always:**
- Contract: ATDD-checklist "Ronde 2" plus meetregels §6–§7, randvoorwaarden §4, trainingsset §5. De rest van de checklist blijft bindend.
- Tests alleen wijzigen bij een aantoonbare testfout, met de reden in Implementation Notes.
- Bestaande bouwstenen hergebruiken (zie Code Map); alleen standaardbibliotheek in `tel_proef.py` en `licenties.py`.
- Steekproef en lijstvolgorde onafhankelijk van de invoervolgorde en van `PYTHONHASHSEED`.

**Never:**
- Niets wijzigen buiten de specmap, de ATDD-checklist, deze specfile en één regel in `spec-spike-getrainde-detector.md`; niet committen of pushen.
- Geen schrijfactie op ACC of productie, geen klantartwork naar een dienst, geen klantdata in de repository (`~/logo-meetset-20261018/` niet kopiëren).
- Geen opdrachtregeloptie voor de steekproefseed; geen licentie-uitzondering per pakketnaam; geen nieuwe afhankelijkheid.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| ruime licentie | `BSL-1.0`, `CNRI-Python` (hele term, hoofdletterongevoelig) | `toegestaan`, niet onder `ruim` | `BUSL-1.1`, `BSL-1.1`, `CNRI-Jython`, vrije tekst blijven overtreding |
| andere maat | S/M/L zonder besluit (`None`, leeg, spaties) | niets gestart, geen map, geen dataset gelezen | `ValueError` met "besluit"; opdrachtregel exit ≠ 0 |
| steekproef | kant met n overeenkomende paren | `(n + 9) // 10` regels (0 bij 0) | — |
| nakijken | regel ontbreekt, nr buiten de lijst, ongeldige waarde | geen `tabellen-na-nakijken.*` | exit ≠ 0 |
| fout in steekproef K | ≥ 1 afwijkend oordeel | K in alle routes "mens bevestigt (voorlopig)" en `nakijklijst-ronde2-<K>.json` | "te weinig voorbeelden" gaat voor |
| tweede ronde | `--nakijken-ronde2 K=pad` volledig | gewoon besluit op de waarheid na beide rondes | onvolledig → exit ≠ 0, geen tabellen ná nakijken |
| ronde 2 overgeslagen | `--ronde2-overgeslagen K` | "mens bevestigt" | — |
| ongeldige ronde-2-optie | K zonder tweede ronde, onbekende K, beide opties voor K, ronde-2-optie zonder `--nakijken` | geen tabellen ná nakijken | exit ≠ 0 |

</frozen-after-approval>

## Code Map

Map: `_bmad-output/planning-artifacts/spike-getrainde-detector/` (hierna `./`).
- `./licenties.py` -- `_blad` (r.45–55): exacte ids na de `_NIET`-controle; docstring r.4. `beoordeel`/`controleer` ongewijzigd (AND = zwaarste, OR = lichtste).
- `./train.py` -- `config` (r.34), `snelheid` (r.157; controle vóór `veilig_doel` en vóór elk bestand), `main` (r.197), docstring r.1–8.
- `./tel_proef.py` -- `nakijklijst` (r.162; de afwijkingslogica per route r.165–171 hergebruiken), `corrigeer` (r.222; hergebruiken om antwoorden toe te passen na omzetten `{nr: oordeel}` → `{doc: {K: w}}`), `tel`/`tabel`/`besluit` (r.36–131; tabellen van vóór nakijken ongewijzigd), `_md` (r.185), `main` (r.244), docstring r.1–16. `wilson` uit `fase-b/tel.py`.
- `./uitslag.py` -- `per_keurmerk`, `KEURMERKEN7/8`, `LETTERS`, `KEUZES`: hergebruiken, niet wijzigen.
- `./bevries.py` -- geen wijziging: `train-resultaat.json` (met `config.besluit`) is al het onderdeel `gewichten`.
- `./herken.py` -- docstring r.6: voorbeeld `--maat S` → `--maat N`.
- `./DRAAIPLAN.md` -- r.16 (MAAT), r.21–25 (licentieblok), stap 9 r.131–138, stap 10 r.152 en r.163, stap 14 r.223–236, stap 15 r.238–245, waarschuwing "Snelheid" r.272–275.
- `./tests/` -- `test_besluiten_20261101.py` (52) plus de aangepaste tests in `test_cap06_training.py`, `test_cap09_telling.py`, `test_review_20261101.py`; `test_cap13_licenties.py::…lokaal…` (echte omgeving).

## Tasks & Acceptance

**Execution:**
- [x] `./licenties.py` -- `BSL-1.0` en `CNRI-Python` als exacte SPDX-id toegestaan -- randvoorwaarden §4.
- [x] `./train.py` -- gedeelde maatcontrole (N vrij; S/M/L alleen met niet-leeg besluit) in `config` en `snelheid`; `cfg["besluit"]` = gestript besluit of `None`; `snelheid` geeft het besluit door en zet het in `snelheid.json`; `--besluit` op `train` en `snelheid`; een geweigerde maat geeft een melding op stderr en exit ≠ 0; docstring -- trainingsset §5.
- [x] `./tel_proef.py` -- `STEEKPROEF_SEED = 20261101`; `nakijklijst(uitslag, routes) -> (lijst, sleutel)`; `main` schrijft `nakijklijst.json`, `niet-voor-nakijker/{nakijk-sleutel.json, verschil.json}`, `nakijk-sha256.json`; `--nakijken`, `--nakijken-ronde2 K=pad`, `--ronde2-overgeslagen K`; `--correcties` vervalt; steekproefrapport, gevoeligheid en besluitregel in `tabellen-na-nakijken.json/.md`; docstring -- meetregels §6–§7.
- [x] `./DRAAIPLAN.md` -- licentieblok weg; MAAT=N met besluit van 01-11; stap 9 alleen N; stap 10 zonder maatlus, stoppunt 1 met de definitie van tekortschieten op de validatieset; stap 14 drie routes, steekproef, aparte map, sha256, informatieve K4-aa-run niet als `--route`; stap 15 `nakijken.json` per regel, tweede ronde, "voorlopig"; waarschuwing "Snelheid" naar het besluit -- CAP-10.
- [x] `./herken.py` -- docstringvoorbeeld maat N.
- [x] licentiecontrole op de echte omgeving (`uv run --group dev --group detector python licenties.py`): aantal pakketten, overtredingen en de lijst "ruim" in Implementation Notes -- randvoorwaarden §4.

**Acceptance Criteria:**
- Given de dev-omgeving, when de volledige suite draait, then 0 failed (ook de 55 tests die vóór de bouw rood waren).
- Given de detectoromgeving, when `-m "zwaar or lokaal"` draait, then 0 failed.
- Given de detectoromgeving, when `licenties.py` draait, then exitcode 0, nul overtredingen, en aantal en lijst "ruim" staan in deze spec.

## Design Notes

Trekking (deterministisch; `random.Random` met een int-seed hangt niet af van `PYTHONHASHSEED`):
```python
rng = random.Random(STEEKPROEF_SEED)
for k in us.KEURMERKEN8:
    for kant in ("met", "zonder"):
        eens = sorted(paren van k/kant waarop elke route met de waarheid overeenkomt)
        steek += rng.sample(eens, (len(eens) + 9) // 10)   # geen float-ceil (30 * 0.1 > 3)
regels = sorted(verschil | set(steek)); random.Random(STEEKPROEF_SEED).shuffle(regels)
```
Tweede ronde van K: alle overeenkomende paren van K (eerdere waarheid) min de steekproefregels, gesorteerd en geschud met dezelfde seed; `nr` 1…n. Fout = oordeel ≠ eerdere waarheid; Nutri-Score als verzameling.

Gevoeligheid (informatief), per route en keurmerk, per kant van de steekproef: `n` = overeenkomende paren die niet zijn nagekeken (niet in de steekproef en niet in een nagekeken tweede ronde), `e = ceil(bovengrens × n)` (0 als de bovengrens `None` is). Op de tabelgetallen ná nakijken: kant mét `met−e, gevonden−e, zonder+e, vals+e`; kant zonder `zonder−e, met+e`; gevoeligheid = `besluit(...)`.

## Verification

**Commands:**
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev pytest -q -p no:cacheprovider` -- expected: 0 failed
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev --group detector pytest -q -p no:cacheprovider -m "zwaar or lokaal"` -- expected: 0 failed
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev --group detector python licenties.py` -- expected: exit 0, `"overtredingen": []`
- `git status --porcelain` -- expected: alleen de specmap, de ATDD-checklist en de twee buildspecs

## Implementation Notes

**Route-poort (step-02, 01-11-2026):** intent gaps = geen (alle drie besluiten liggen vast in `c86a067`; de ATDD-checklist legt namen, bestanden, opties en uitkomsten vast; de twee open details — stap 9 en de informatieve K4-aa-run — zijn door de opdrachtgever beslist; de rest, zoals de gevoeligheidsformule die de checklist alleen in richting toetst, de volgorde van de tweede ronde en de afhandeling van ongeldige ronde-2-opties, merkt de gebruiker niet of is informatief, en staat hierboven als keuze); irreversibles = geen (alleen lokale bestanden en een lokale, lezende licentiecontrole; geen migratie, geen schrijfactie op ACC of productie, geen klantartwork naar een dienst); footprint = middelgroot (vijf bestanden in één map, geen nieuwe module; de publieke vorm van `tel_proef.nakijklijst` en de opdrachtregel van `tel_proef`/`train` veranderen, alleen tests roepen ze aan; ±150–250 regels logica waarop 55 tests leunen). Niet klein, dus route **dispatch**.

**Meerdoelencontrole (step-01) en omvang (step-02):** licenties, maatcontrole, steekproef en draaiplan zijn elk los op te leveren; de spec is groter dan 1.600 tokens. Gekozen: alle doelen en de volledige spec houden. Basis: de opdracht van de orchestrator ("keep the full spec and all goals") op de staande afspraak van de eigenaar (bouwen tot review op een schone tak zonder vooraf te vragen), en ATDD-ronde 2 bindt de vier onderdelen als één rode suite. Geen mens aanwezig; vastgelegd als besluit, niet als antwoord van Friso.

**Rode run vóór de bouw (ATDD ronde 2, nagedraaid 01-11-2026):** `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev pytest -q -p no:cacheprovider` → 55 failed, 415 passed (twee keer; per bestand: `test_besluiten_20261101.py` 46, `test_review_20261101.py` 5, `test_cap06_training.py` 2, `test_cap09_telling.py` 1, `test_cap13_licenties.py` 1). Een eerste run gaf eenmalig 56 failed: één extra wankele test, niet te herleiden (alleen de staart van de uitvoer bewaard). Bij de eindverificatie letten op wankele tests.

**Omvangpoort (step-02):** ±3.300 tokens (11.287 tekens), boven de 1.600. Risico: een implementatieagent kan details uit het midden missen; beperkt doordat de bindende details in de ATDD-checklist en de tests staan. Gekozen: volledige spec houden (zelfde basis als hierboven). Open Questions: geen.

**Checkpoint 1 (01-11-2026):** goedgekeurd en doorgegaan op de staande afspraak van de eigenaar (bouwen tot review op een schone tak zonder vooraf te vragen), volledige spec en alle doelen gehouden; geen mens aanwezig. Spec vóór goedkeuring opnieuw van schijf gelezen: ongewijzigd. Status `ready-for-dev`.

**Bouw (step-03, 01-11-2026):** alle zes taken af; geen bestaande test gewijzigd (één nieuw testbestand, zie Verificatie).
- `licenties.py`: `_EXACT = {"BSL-1.0", "CNRI-PYTHON"}`, hele term na de `_NIET`-controle, hoofdletterongevoelig; geen uitzondering per pakket.
- `train.py`: gedeelde `_maat(maat, besluit)` in `config` en `snelheid` (vóór `veilig_doel` en vóór elk bestand); `cfg["besluit"]` en `snelheid.json` dragen het besluit; `--besluit` op beide subcommando's; een geweigerde maat → melding op stderr, exit 2.
- `tel_proef.py`: `_trekking` (verschil, overeenkomende paren per keurmerk en kant, steekproef volgens Design Notes), `_regels` (sorteren, schudden, nummeren), `nakijklijst -> (lijst, sleutel)`, `na_nakijken` (antwoorden per regel → `corrigeer`, steekproefrapport, tweede ronde, ronde-2-keuzes, gevoeligheid, besluitregel); `main` schrijft `niet-voor-nakijker/{nakijk-sleutel.json, verschil.json}` en `nakijk-sha256.json` (over de geschreven bytes); `allow_abbrev=False`; `--correcties` weg; `_paren` meldt een optie zonder `=` leesbaar.
- `DRAAIPLAN.md`: licentieblok weg; de licentiecontrole staat nu als commando in stap 9 met stoppunt 4. Stap 9 meet alleen `$MAAT`; stap 10 zonder maatlus, stoppunt 1 met de definitie van tekortschieten; stap 14 precies D+A/D/K4-aa, informatieve run in proza (los tellen in een eigen map); stap 15 per regel, tweede ronde, "voorlopig"; waarschuwing "Snelheid" → note met het besluit.

**Gekozen waar de spec open liet (informatief of onzichtbaar voor de gebruiker):**
- `nakijklijst-ronde2-<K>.json` wordt bij elke fout in de steekproef geschreven, ook als K al op "te weinig voorbeelden" staat (de voorrang regelt het besluit).
- Gevoeligheid volgt de formule in Design Notes letterlijk. Gevolg: een keurmerk met 0 mét kan als gevoeligheid "mens bevestigt" krijgen, omdat de bovengrens van de zonder-kant paren naar de mét-kant schuift. Alleen informatief.
- Bij `--nakijken` drukt `main` de tabellen ná nakijken af op stdout (in plaats van die van vóór).

**Verificatie (01-11-2026):**
- `uv run --group dev pytest -q -p no:cacheprovider` → 470 passed, 0 failed (de 55 rode tests van vóór de bouw zijn groen; geen wankele test gezien in 2 volledige runs); na het toevoegen van de matrixtests hieronder 478 passed, 0 failed.
- `uv run --group dev --group detector pytest -q -p no:cacheprovider -m "zwaar or lokaal"` → 4 passed, 0 skipped.
- `uvx ruff check --select F,E9` op de drie gewijzigde modules → schoon.
- Matrixrij "ongeldige ronde-2-optie" (gevonden in de matrixaudit van step-03): nieuw testbestand (sinds de reviewpatches `tests/test_review_besluiten_20261101.py`), toen 8 tests, geen bestaand testbestand gewijzigd. 7 geparametriseerde gevallen (`--ronde2-overgeslagen` en `--nakijken-ronde2` zonder `--nakijken`, K zonder tweede ronde met beide opties, onbekende K, beide opties voor K, `K` zonder `=pad`) → exitcode ≠ 0 en geen `tabellen-na-nakijken.json/.md`; plus geen fout in de steekproef → geen `nakijklijst-ronde2-*.json` en besluit gelijk aan de tabel. Controle tegen lege tests: met de drie ronde-2-controles in `tel_proef.py` tijdelijk uitgezet faalden 6 van de 7 ongeldige gevallen (het zevende bewaakt `_paren`); daarna teruggezet, 8 passed. Volledige suite daarna: 478 passed, 0 failed.

**Reviewpatches (01-11-2026):** `tel_proef.py`: `--nakijken` vergelijkt de sha256 van de herberekende lijst en sleutel met `nakijk-sha256.json` van stap 14 (ontbreekt of wijkt af → exit 1, geen tabellen ná nakijken) en schrijft die drie bestanden niet opnieuw; aan het begin van een `--nakijken`-run gaan oude `tabellen-na-nakijken.*` weg, en een geslaagde run verwijdert `nakijklijst-ronde2-<K>.json` van keurmerken zonder tweede ronde (een mislukte run laat ze staan); `--uitslag` en `--meta` worden binnen de `try` gelezen. `train.py`: alleen de maat/besluit-controle staat nog in de `try`, `train`/`snelheid` draaien erbuiten (een fout tijdens het werk houdt zijn traceback). `licenties.py`: docstring "blijven een overtreding". `DRAAIPLAN.md`: licentiecontrole in een eigen blok met stopinstructie vóór de betaalde voorlabels; validatietelling met `--route D+A=…`; stoppunt 1 positief geformuleerd (gevonden < 80% of vals ≥ 10%, k/n uit sectie `## D+A`, ook bij "te weinig voorbeelden"). Verwijsregel in `spec-spike-getrainde-detector.md` zonder aantallen; ATDD-checklist r.98 gemarkeerd als vervangen door Ronde 2. Testbestand hernoemd naar `tests/test_review_besluiten_20261101.py`, hulpfuncties nu geïmporteerd uit `test_besluiten_20261101.py` (geen dubbele verzameling: 52 + 15 = 67), **15 tests** (+7: correcties uit de tweede ronde, gevoeligheid met de hand nagerekend en na de tweede ronde, md-rij, hashcontrole, oude uitvoer, `snelheid` met besluit). Elk van de drie mutaties uit de review (tweede-rondecorrectie weg, geen nul na ronde 2, geen verschuiving aan de zonder-kant) laat precies één nieuwe test falen. Gedraaid: de tests van de gewijzigde bestanden, 182 passed.

**Licentiecontrole op de echte omgeving (01-11-2026):** `uv run --group dev --group detector python licenties.py` → exitcode 0, **93 pakketten**, `"overtredingen": []`. `regex` 2026.9.29 (`Apache-2.0 AND CNRI-Python`) → toegestaan. Lijst "ruim" (8):
- `aiohappyeyeballs` 2.7.1 — `PSF-2.0`
- `defusedxml` 0.7.1 — `PSFL`
- `greenlet` 3.5.6 — `MIT AND PSF-2.0`
- `matplotlib` 3.11.2 — `(Python Software Foundation License)`
- `numpy` 2.5.4 — `BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0`
- `shellingham` 1.5.4 — `ISC License`
- `torch` 2.15.0 — `Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause AND BSL-1.0 AND ISC AND MIT AND Zlib`
- `typing_extensions` 4.16.0 — `PSF-2.0`

**Na de reviewpatches (01-11-2026, orchestrator van de build):** Verification opnieuw gedraaid op de gepatchte boom: `uv run --group dev pytest -q -p no:cacheprovider` → 485 passed, 0 failed; `uv run --group dev --group detector pytest -q -p no:cacheprovider -m "zwaar or lokaal"` → 4 passed, 0 failed; `uv run --group dev --group detector python licenties.py` → exitcode 0, 93 pakketten, 0 overtredingen, "ruim" = de 8 hierboven. `git status --porcelain`: alleen de specmap, de ATDD-checklist en de twee buildspecs. Diff herschreven: `/tmp/bmad-build-review-diff-besluiten.ooZOIo` (84,8 kB).

**Wankele test (triage #11, defer):** `tests/test_review_20261101.py::test_pagina_b_zonder_alle_keuzes_slaat_niets_op_en_blijft_staan` (invulpagina in de browser, niet geraakt door deze build) faalde 1× in een volledige run (477/478) en 1× in 5 losse herhalingen; de notitie "geen wankele test gezien" hierboven gold voor die twee runs. Niet in `deferred-work.md` gezet: dat bestand valt buiten de bestanden die deze build mocht raken; doorgegeven aan de orchestrator. Herhalen: `uv run --group dev pytest -q -p no:cacheprovider "tests/test_review_20261101.py::test_pagina_b_zonder_alle_keuzes_slaat_niets_op_en_blijft_staan"` vijf keer.

**Step-05:** status `done`. Geen commit: de opdracht van de orchestrator ("do not commit or push; the orchestrator does that") gaat voor de commitstap van de workflow. Volgende schakel in de keten: `bmad-testarch-trace` (niet in deze opdracht).

## Spec Change Log

## Review Triage Log

Ronde 1 (01-11-2026): lagen Blind Hunter (BH, 15), Edge Case Hunter (EC, 9) en Verification Gap (VG, 4 gaten + 2 overige) draaiden parallel en blokkerend als verse subagents op `/tmp/bmad-build-review-diff-besluiten.ooZOIo` (69,5 kB, ook de niet-gevolgde bestanden); de specfile alleen als claims voor EC. Geen laag overgeslagen. Geen intent_gap of bad_spec: elke afwijking heeft een kleine fix zonder nieuwe publieke oppervlakte, binnen wat de spec al zegt → patch.

| # | bevinding (lagen) | verdict en bewijs | route |
|---|---|---|---|
| 1 | Stap 15 herberekent lijst en sleutel, overschrijft `nakijk-sha256.json` en toetst niet tegen de vóór het nakijken vastgelegde hash; antwoorden per `nr` landen stil op andere paren als een route tussen stap 14 en 15 wijzigt (BH1, EC1, VG-overig 2) | medium: `main` schrijft lijst/sleutel/sha altijd opnieuw; `na_nakijken` bouwt de lijst uit de huidige routes; `_antwoorden` toetst alleen de verzameling nummers | patch |
| 2 | Oude `tabellen-na-nakijken.*` blijven na een mislukte run staan; oude `nakijklijst-ronde2-<K>.json` blijft na een herhaling zonder fout voor K (BH2, EC7) | medium: `main` verwijdert niets | patch |
| 3 | `train.py main`: `except ValueError` om de hele training meldt een fout na uren als "niet gestart", zonder traceback (BH4, EC2, VG-overig 1) | medium: `try` omvat `train(...)`/`snelheid(...)` | patch |
| 4 | Docstring `licenties.py`: "blijven verboden", maar `beoordeel` geeft `onbekend` (BH6) | low: nagelopen `_blad("BUSL-1.1")` → `onbekend`; directe tekstcorrectie | patch |
| 5 | DRAAIPLAN stap 10: de regel ≥ 10/≥ 30 botst met "te weinig voorbeelden" (16/35) in de tabel; de validatieroute heet `$MAAT`, niet D+A (BH7, EC3, EC8) | medium: `--route $MAAT=` en `tel_proef.besluit` 16/35 nagelezen; een keurmerk met 10–15 mét kan onterecht worden overgeslagen | patch |
| 6 | DRAAIPLAN stap 10: "haalt niet ≥ 80% gevonden of < 10% vals" is dubbel te lezen (BH8) | low: zin nagelezen; directe tekstcorrectie | patch |
| 7 | DRAAIPLAN stap 9: de licentiecontrole staat in hetzelfde plakblok als de betaalde voorlabels en houdt ze niet tegen (BH9) | low: blok zonder stop; directe tekstcorrectie (eigen blok vooraf) | patch |
| 8 | Verwijsregel in `spec-spike-getrainde-detector.md` noemt 470 passed (verouderd) (BH10) | low: nagelezen; regel wordt een kale verwijzing | patch |
| 9 | Idem: de status van de oude spec blijft `in-review` (BH10) | reject: de opdracht van de orchestrator sluit verdere wijzigingen aan die spec uit | reject |
| 10 | Nieuw testbestand kopieert ±50 regels hulpfuncties met een onjuiste reden (BH11) | low: importeren van niet-`test_`-namen laat pytest niets dubbel verzamelen; fix is verwijderen + importeren | patch |
| 11 | Vlakke test `test_review_20261101.py::test_pagina_b_zonder_alle_keuzes_slaat_niets_op_en_blijft_staan` (BH12) | medium (bestaand): faalde 1× in de suite en 1× in 5 losse herhalingen; paginatest, niet geraakt door deze build; waarschijnlijk ook de 56e van de eerste rode run | defer |
| 12 | `--uitslag`/`--meta` buiten de `try`: traceback in plaats van "telling gestopt" (BH13, EC6) | low: nagelezen; luide fout, fix is twee regels verplaatsen | patch |
| 13 | Niets dwingt precies D+A/D/K4-aa af; dubbele namen in `_paren` vallen stil weg; `verschil.json` labelt op volgorde (BH3, EC5) | reject: de drie routes zijn per contract in DRAAIPLAN stap 14 afgedwongen (documenttest; stap 10 gebruikt één route); dubbele namen low, onwaarschijnlijk bij geplakte commando's, fix voegt een bewaking toe; het label gebruikt de echte routenaam (false) | reject |
| 14 | BSL-1.0/CNRI-Python via classifiertekst niet herkend; Boost-licentietekst gelezen als MIT (BH5) | reject: Friso besliste "als exacte SPDX-id"; huidige omgeving 0 overtredingen; een classifier-pakket valt veilig op stoppunt 4; de MIT-lezing van Boost geeft hoe dan ook "toegestaan" | reject |
| 15 | `_trekking` draait drie keer per stap-15-run (BH14) | false: deterministisch, dezelfde uitkomst, verwaarloosbare tijd | reject |
| 16 | Geen `BESLUIT`-variabele in het draaiplan (BH15) | reject: alleen N tot een nieuw besluit, dat het draaiplan toch bijwerkt; geen schade nu | reject |
| 17 | Lege tweede ronde (elke kant ≤ 1 overeenkomend paar) laat K op "voorlopig" (EC4) | low: zelden (beide kanten ≤ 1 overeenkomend paar) en op te lossen met `--ronde2-overgeslagen`; fix voegt een tak toe → reject | reject |
| 18 | ATDD-checklist r.98 beschrijft nog `nakijklijst(..., seed) -> list[dict]` (EC9) | low: nagelezen; directe tekstcorrectie (vervangen door ronde 2) | patch |
| 19 | Antwoorden van de tweede ronde die de waarheid veranderen zijn nergens getoetst; mutatie (correctie weggooien) blijft groen (VG1) | medium (vooraf geverifieerd) | patch (test) |
| 20 | Gevoeligheid alleen in richting getoetst; nulstelling na ronde 2 en de formule niet vastgepind (VG2) | medium (vooraf geverifieerd) | patch (tests) |
| 21 | Md-test wordt gehaald door de voetnoot; de kolommen zijn niet getoetst (VG3) | low (vooraf geverifieerd) | patch (test) |
| 22 | `snelheid` met S + besluit (doorgeven en `snelheid.json`) nooit gedraaid (VG4) | medium (vooraf geverifieerd) | patch (test) |
