---
title: 'Proef getrainde detector ronde 3: verzoekgrootte, grens voorinvulling $65, klaar-teken invulpagina'
type: 'bugfix'
created: '2026-11-01'
status: 'done'
baseline_commit: '89887f2561469346367f23c00c3c03c2e2f3dcc0'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/test-artifacts/atdd-checklist-spike-getrainde-detector.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/randvoorwaarden.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 21 van 232 toetsetiketten kregen geen voorinvulling omdat hun verzoek 30–40 MB was (elk geslaagd verzoek ≤ 29,8 MB); de uitgavengrens van de voorinvulling staat nog op 1,5 × $21 = $31,50 terwijl Friso op 01-11-2026 (±14:05) $65 hard besliste; en een browsertest is wankel omdat de fixtures na het laden alleen op `/stand` wachten, terwijl de pagina haar sneltoetsen pas na `items.json` koppelt.

**Approach:** Voorinvulling en voorlabels sturen JPEG (kwaliteit 90) en verdelen tegels over aanroepen op hoogstens 16 tegels en 20.000.000 beeldbytes; de grens per post wordt vast instelbaar met besluitverwijzing ($65 standaard voor de voorinvulling) met een startprojectie per aanroep; de invulpagina geeft een klaar-teken (`#keuzes` is `inert` tot eerste tonen en koppelen) waarop elke browsertest wacht. Contract: "Interfacecontract ronde 3" in de ATDD-checklist.

## Boundaries & Constraints

**Always:**
- Contract: ATDD-checklist, sectie "Ronde 3", plus randvoorwaarden §3 en §5 en toetsset §6. De rest van de checklist blijft bindend.
- Tests alleen wijzigen bij een aantoonbare testfout, met reden in Implementation Notes.
- Bestaand gedrag houden: samenvoegen van uitkomsten, 16-tegelgrens, herstart (alleen etiketten met `fout`), vijf weigeringen op rij stoppen, PNG voor hinttegels en paginabeelden, de paginaregels (geen `focus()`/`select()` elders, geen ouder van een invoerveld vervangen, concepten in `sessionStorage`).
- Alleen standaardbibliotheek en Pillow; geen nieuwe afhankelijkheid.

**Never:**
- Niets buiten de specmap, de ATDD-checklist, deze specfile, `deferred-work.md` (één afsluitregel, bestaande regel niet wijzigen) en de tracebestanden; niet committen of pushen.
- Geen klantartwork naar een dienst tijdens de bouw; geen schrijfactie op ACC of productie; geen klantdata in de repository; het grootboek `~/logo-meetset-20261018/proef-detector/uitgaven.json` niet aanraken.
- Geen grens die stil verhoogd kan worden (een andere grens alleen met niet-leeg `--besluit`); geen wijziging aan beoordelaar- en K4-aa-posten.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| groot etiket | tegels samen > 20.000.000 bytes | extra aanroepen, elk met overzicht; hinttegels/vakjes op etiketindex | — |
| één tegel te groot | overzicht + tegel > grens | niets verstuurd | fout `te_groot`; telt niet als weigering op rij |
| onbekend beeldtype | bytes niet PNG/JPEG | niets verstuurd | `ValueError` |
| grens | geen `--grens` | voorinvulling $65, voorlabels 1,5 × raming | — |
| andere grens | `--grens X` zonder of met leeg `--besluit` | niets gestart, geen uitvoerbestand | exit ≠ 0, melding noemt "besluit" |
| projectie | grootboek + Σ open etiketten (1 aanroep per 16 tegels, min. 1) × $0,06 / $0,012 > grens | post start niet, geen zdr-proef | `BudgetOverschreden` |
| laden pagina | `items.json` leeg / laden mislukt | formulier blijft `inert` | `#voortgang`: "geen etiketten" / "laden mislukt" |

</frozen-after-approval>

## Code Map

Map: `_bmad-output/planning-artifacts/spike-getrainde-detector/` (hierna `./`).
- `./openrouter.py` -- `Client._body` (r.96): `data:image/png` vast → type uit de eerste bytes; nieuw `MAX_BEELD_BYTES`, `delen` (naast `EtiketFout`). `zdr_proef`/`vraag` lopen via `_body`, dus de typecontrole valt vóór elke transport.
- `./kosten.py` -- `Bewaker.__init__` (r.31): parameter `grens=None`; `controleer_start`/`mag`/`boek` ongewijzigd.
- `./toets.py` -- `MAX_TEGELS` (r.130) houden; `voorinvulling` (r.133): de lus `range(0, …, MAX_TEGELS)` vervangen door `openrouter.delen`, `te_groot` via de bestaande `except EtiketFout`; `_png` (r.210) blijft voor hinttegels; `main voorinvulling` (r.236 `--raming`, r.264–317): JPEG-encoder voor overzicht/tegels, `beeldtype`, `--grens`/`--besluit`, `GRENS_VOORINVULLING = 65.0`, projectie per aanroep (maat via `Image.open(pad).size`, niet het manifest) vóór de `Client`.
- `./echt.py` -- `MAX_TEGELS` (r.59); `voorlabels` (r.162): `delen` op tegelbytes met het overzicht als `vast`; `_png` (r.203) → JPEG voor de voorlabels; `main voorlabels` (r.255, r.289–318): `--grens`/`--besluit`, projectie per aanroep met `herken.tegels`.
- `./herken.py` -- `tegels(w, h)` hergebruiken voor het aantal tegels; niet wijzigen.
- `./invul/index.html` -- `<form id="keuzes">` (r.52) krijgt `inert`; `start()` (r.287): na `toon(); koppel();` `inert` weg; `ok`-controle en `try/catch` met "laden mislukt" in `#voortgang`.
- `./DRAAIPLAN.md` -- kostennotitie (r.21), stap 3 (r.56), stap 6 (r.82), stap 9 (r.114, commando r.123).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- laatste regel (wankele browsertest): afsluitregel eronder.
- `./tests/` -- `test_ronde3_20261101.py` (36), `test_ronde3_browser_20261101.py` (8); hulp `laad_klaar`/`wacht_klaar` in `conftest.py`.

## Tasks & Acceptance

**Execution:**
- [x] `./openrouter.py` -- `MAX_BEELD_BYTES`, `delen`, beeldtype uit de eerste bytes -- randvoorwaarden §5.
- [x] `./kosten.py` -- `Bewaker(grens=None)` -- randvoorwaarden §3.
- [x] `./toets.py` -- `voorinvulling` via `delen`; opdrachtregel JPEG 90, `beeldtype`, `--grens`/`--besluit`, standaard $65, projectie per aanroep -- CAP-2, CAP-14.
- [x] `./echt.py` -- `voorlabels` via `delen`; opdrachtregel JPEG 90, `--grens`/`--besluit`, projectie per aanroep -- CAP-5, CAP-14.
- [x] `./invul/index.html` -- `inert` tot klaar; laadfout en lege lijst gemeld -- CAP-3, toetsset §6.
- [x] `./DRAAIPLAN.md` -- kostennotitie, stap 3 (`--grens 65 --besluit "…"`, $0,12, $65), stap 6 ($0,12 per extra etiket), stap 9 (voorlabels pas na Friso's besluit, commando met `--grens`/`--besluit`) -- CAP-10.
- [x] `deferred-work.md` -- afsluitregel onder de laatste regel: oorzaak in de test, bewijs en fix.

**Acceptance Criteria:**
- Given de dev-omgeving, when de volledige suite draait, then 0 failed (ook de 44 rode tests van ATDD ronde 3), in twee volledige runs na elkaar.
- Given de wankele browsertest, when hij 20× los en in elke volledige run draait, then elke keer groen.
- Given de afgeronde bouw, when `git status --porcelain`, then alleen paden uit Boundaries.

## Verification

**Commands:**
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev pytest -q -p no:cacheprovider` -- expected: 0 failed (543 tests na de reviewpatches; 538 vóór)
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && for i in $(seq 20); do uv run --group dev pytest -q -p no:cacheprovider "tests/test_review_20261101.py::test_pagina_b_zonder_alle_keuzes_slaat_niets_op_en_blijft_staan" || break; done` -- expected: 20× passed
- `uvx ruff check --select F,E9 openrouter.py kosten.py toets.py echt.py` -- expected: schoon

## Implementation Notes

**Versiebeheer (step-01, 01-11-2026):** tak `spike/proef-getrainde-detector` past bij de intent; de werkboom is niet schoon, maar bevat alleen de eigen paden van deze keten (spec-update via `bmad-spec`/`bmad-review`, ATDD-tests en -checklist van ronde 3; `git status --porcelain` nagelopen). Doorgegaan zonder te stoppen op de staande afspraak van de eigenaar (bouwen tot review op een schone tak zonder vooraf te vragen) en de opdracht van de orchestrator; geen mens aanwezig.

**Meerdoelencontrole (step-01):** drie los op te leveren doelen (verzoekgrootte, grens voorinvulling, klaar-teken/wankele test). Gekozen: alle drie houden ("Keep all goals"). Basis: de opdracht van de orchestrator (één keten voor drie kleine wijzigingen) en dezelfde staande afspraak; ATDD ronde 3 bindt ze als één rode suite. Vastgelegd als besluit, niet als antwoord van Friso.

**Route-poort (step-02, 01-11-2026):** intent gaps = geen (de grens van $65 is Friso's besluit met bron; JPEG 90, 20.000.000 bytes, 16 tegels, `te_groot`, besluitverwijzing en klaar-teken liggen vast in randvoorwaarden §3/§5, toetsset §6 en het ATDD-contract; wat open bleef merkt de gebruiker niet: JPEG-subsampling standaard, namen van hulpfuncties, tekst van de meldingen buiten "besluit"/"laden mislukt"/"geen etiketten"); irreversibles = geen (alleen lokale bestanden; geen migratie, geen schrijfactie op ACC of productie, geen klantartwork naar een dienst tijdens de bouw — de herhaalrun van de 21 etiketten valt buiten deze bouw en volgt pas na de keten); footprint = middelgroot (zes bestanden in één map; nieuw publiek: `openrouter.delen`, `MAX_BEELD_BYTES`, `Bewaker(grens=)`, twee nieuwe opdrachtregelopties per betaalde post, het klaar-teken waar alle browsertests op leunen; 44 tests). Niet klein, dus route **dispatch**.

**Omvangpoort (step-02):** ±2.150 tokens (7.531 tekens), boven 1.600. Risico: details uit het midden worden gemist; beperkt doordat het bindende contract en de 44 tests in de ATDD-checklist staan. Gekozen: volledige spec houden (zelfde basis als hierboven). Open Questions: geen.

**Checkpoint 1 (01-11-2026):** goedgekeurd en doorgegaan ("Approve and continue") op de staande afspraak van de eigenaar; geen mens aanwezig. Spec vóór goedkeuring opnieuw van schijf gelezen. Status `ready-for-dev`.

**Bouw (step-03, 01-11-2026):** alle zeven taken uitgevoerd; geen test gewijzigd. Keuzes binnen het contract: `te_groot` breekt in beide gereedschappen de reeks van vijf weigeringen (bestaande regel: elke andere fout dan `geweigerd` zet de teller op 0); `--raming` blijft bij de voorinvulling bestaan maar bepaalt de grens niet meer (standaard $65); `toets.jpeg`, `toets.aanroepen` (1 per 16 tegels, minstens 1, maat uit het bestand) en `toets.grens_uit` (`--grens` zonder niet-leeg `--besluit` → `ap.error`, exit 2, melding noemt "besluit") worden door `echt.py` hergebruikt; de gebruikte grens staat op stdout vóór de startcontrole. DRAAIPLAN stap 9 zet de grens van de voorlabels via `$GRENS_VOORLABELS`/`$BESLUIT_VOORLABELS`, zodat het commando zonder besluit weigert (lege waarde → argparse-fout of weigering). Verificatie: volledige suite 2× na elkaar 538 passed, 0 failed (114,8 s en 62,8 s); `test_pagina_b_zonder_alle_keuzes_slaat_niets_op_en_blijft_staan` 20× los groen; `uvx ruff check --select F,E9` schoon.

**Reviewbevindingen doorgevoerd (01-11-2026):** `toets.grens_uit` weigert een `--grens` die niet eindig of < 0 is (`ap.error`, geldt ook voor `echt.py`); de gebruikte grens en het besluit (of `null`) staan nu ook in `toets/zdr-proef.json` en in `_zdr_proef` van de voorlabels; `--raming` is weg bij de voorinvulling (raming §3 $42 vast en alleen informatief aan `Bewaker`); `start()` in `invul/index.html` roept `zetStand`, `toon` en `koppel` binnen de `try` aan, zodat een `/stand` in de verkeerde vorm "laden mislukt" geeft; DRAAIPLAN stap 3 en 9 met tijden voor 2,6 aanroepen per etiket (INFERENCE), stap 9 overal "±$25–30", met de weigering bij een lege variabele en de route `GRENS_VOORLABELS=15` voor de standaardgrens. Tests (dekking op verzoek van de review, geen testfout): in `test_ronde3_20261101.py` nieuw `test_r3_toets_grens_niet_eindig_of_negatief_weigert_voor_elke_aanroep` (inf/nan/-1) en `test_r3_toets_main_laat_beeldtype_weg_bij_overgenomen_etiket`, en de twee `--grens … --besluit`-tests toetsen het vastgelegde besluit; in `test_ronde3_browser_20261101.py` het geval `stand-null`. Daarmee 49 tests van ronde 3 en 543 in totaal. Gedraaid: de dekkende bestanden, 149 passed.

**Na de reviewpatches (01-11-2026, orchestrator van de build):** Verification opnieuw gedraaid op de gepatchte boom: volledige suite 2× na elkaar 543 passed, 0 failed (79,6 s en 73,7 s; 538 + 5 reviewtests); `test_pagina_b_zonder_alle_keuzes_slaat_niets_op_en_blijft_staan` 20/20 los groen; `uvx ruff check --select F,E9` op de vier modules schoon. Twee reviewpunten (B2 zin, B9 bedragen) raakten de planningsspec en zijn via `bmad-spec` doorgevoerd (memlog + randvoorwaarden §3, SPEC Constraints/stoppunt 5), niet met de hand. Diff herschreven: `/tmp/bmad-build-ronde3-diff.RBtEyS`.

**Step-05:** status `done`. Geen commit: de opdracht van de orchestrator ("do NOT commit or push; the orchestrator does that") gaat voor de commitstap van de workflow. Uitgesteld: niets (geen defer-route in de triage). Volgende schakel: `bmad-testarch-trace`.

**Na de keten: herhaalrun voorinvulling (01-11-2026, orchestrator):** alleen de 21 mislukte etiketten via de herstart (`--grens 65 --besluit "besluit Friso 01-11-2026 ±14:05 (randvoorwaarden §3)"`, zdr-proef geslaagd): 21/21 nu met voorinvulling (0 met `fout`), de 211 eerdere ongewijzigd; kosten $1,39, grootboek post "voorinvulling toets" $25,52 → $26,91. Review #11 (JPEG-kosten): JPEG $0,0431 per aanroep (21 etiketten, gem. 17,1 tegels, 1,62 aanroepen) tegen PNG $0,0451 (71 etiketten met 12–22 tegels, 1,52 aanroepen): geen meerkosten, de aanname klopt. `toets.py rapport` → exit 2, stoppunt 2 voor PREGNANCY_WARNING (14 < 16); keuze voor Friso.

## Spec Change Log

## Review Triage Log

Ronde 1 (01-11-2026): Blind Hunter (B, 14), Edge Case Hunter (E, 6), Verification Gap (V, 1 gat + 2 overige). Diff: `/tmp/bmad-build-ronde3-diff.RBtEyS` (112 kB, zonder memlog en deze spec).

| # | bevinding | verdict | bewijs | route |
|---|---|---|---|---|
| B1 | DRAAIPLAN-tijden (stap 3 ±3 uur, stap 9 voorlabels ±2 uur) niet geschaald naar 2,6 aanroepen per etiket | low | stap 3 rekent ±30 s per aanroep voor ±350 etiketten, de kostenregel ernaast 2,6 aanroepen: ±910 aanroepen ≈ 7,6 uur | patch |
| B2/E5 | startprojectie telt geen extra aanroepen door de bytegrens en rekent vlak per aanroep; randvoorwaarden §3 belooft "kan niet halverwege op de grens stuiten" | low | `toets.aanroepen` = ceil(tegels/16); met JPEG gemeten hoogstens 5,1 MB per aanroep van 17 beelden tegen 20 MB, dus een bytesplitsing komt praktisch niet voor; de belofte is te sterk | patch (zin verzachten via `bmad-spec`); codedeel verworpen: onwaarschijnlijk en de oplossing voegt logica toe |
| B3/E2 | `--grens inf`/`nan`/negatief met een besluit wordt aangenomen | medium | argparse `float` neemt `inf`/`nan`; `inf` heft de harde grens op, `nan` laat de startcontrole altijd door en houdt dan elke aanroep tegen | patch |
| B4 | het besluit bij `--grens` staat alleen op stdout, nergens blijvend | low | `print(...)` is de enige plek; `snelheid.json` legt het besluit wel vast (CAP-6) | patch (één regel: grens en besluit in het zdr-proefrecord) |
| B5 | `--raming` van de voorinvulling doet niets meer en staat op 21 terwijl §3 ±$42 zegt | low | `Bewaker(grens=…)` negeert de raming voor de grens; geen ander gebruik | patch (optie weg) |
| B6/V-o2/E3 | `ValueError` voor een onbekend beeldtype wordt in `voorinvulling`/`voorlabels` als `antwoord_ongeldig` geboekt | low | beide aanroepers sturen altijd uitvoer van `jpeg()`; onbereikbaar | verworpen: onbereikbaar, de oplossing voegt een tak toe |
| B7/E6 | pagina blijft op "laden…" als `/stand` geldige JSON van de verkeerde vorm geeft (`zetStand`/`toon` buiten de `try`) | low | `zetStand(null)` gooit; de eigen server stuurt dat nooit, maar SPEC CAP-3 belooft de melding bij elk mislukt laden | patch (regels in de `try` zetten) |
| B8 | `echt.py` importeert hulpfuncties uit `toets.py`; `aanroepen` gebruikt `toets.MAX_TEGELS` | low | beide 16; afwijken kan alleen als iemand één constante wijzigt | verworpen: onwaarschijnlijk, oplossing is een verplaatsing/extra parameter |
| B9 | verwachting voorlabels op vier manieren (±$30, ±$25, ±$25–30, totaal ±$83 op $30) | low | randvoorwaarden §3 noemt ±$30 en ±$25 in één punt; 800 × 2,6 × $0,012 = $24,96 | patch (overal ±$25–30; spec via `bmad-spec`) |
| B10 | `beeldtype: jpeg` ook op foutrecords (ook `te_groot`, niets verstuurd) | low | foutrecords worden bij elke herstart opnieuw geprobeerd en tellen niet mee in de vergelijking | verworpen: cosmetisch, de oplossing voegt een tak toe |
| B11 | grenstests controleren alleen de laatste lus | false | "gestart" volgt uit `Gestart` bij de zdr-proef (de startcontrole is dus gepasseerd); "geweigerd" kan alleen als de zdr-proef niet liep, want anders zou `Gestart` zijn gegooid; de grens 65 zelf staat in `test_r3_toets_standaardgrens_65_…` | verworpen |
| B12 | `from conftest import laad_klaar` | low | werkt in de standaard importmodus van dit project (geen `--import-mode` in `pyproject.toml`); testmodules importeren elkaar al | verworpen: alleen bij een andere importmodus, oplossing is een nieuw bestand |
| B13 | stap 9: lege `GRENS_VOORLABELS` geeft een argparse-melding in plaats van "besluit"; geen route om de $15 te houden | low | `--grens ""` → `invalid float value` → exit 2, niets gestart (veilig), maar onduidelijk | patch (tekst) |
| B14/E1 | `delen([], vast > grens)` geeft een aanroep in plaats van `te_groot` | low | `herken.tegels` geeft altijd minstens één tegel en het overzicht is een JPEG van ≤ 1500 px (enkele MB) | verworpen: onbereikbaar, de oplossing is een extra wacht |
| E4/V-o1 | onbekend beeldtype bij referentieplaatjes van de beoordelaar laat `herken beslis` crashen | false | alle 540 referenties zijn PNG; een luide fout vóór verzenden is wat randvoorwaarden §5 voorschrijft | verworpen |
| V1 | geen test dat een overgenomen PNG-voorinvulling zonder `beeldtype` blijft | medium (gat) | alleen nieuwe etiketten worden getoetst; `setdefault` buiten het blok zou groen blijven en de 211 PNG-etiketten als `jpeg` merken | patch (test) |
