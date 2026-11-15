---
title: 'Ronde 13: samenvoeging van de nieuwe etiketten van ronde 12 in de uitslag (CAP-22)'
type: 'feature'
created: '2026-11-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5b5833ea54a4480dc99382efd82a22c6ac99aac1'
context:
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** De 53 nieuwe etiketten van ronde 12 worden op de artefactpagina (versie 14) volledig beoordeeld, maar er is geen gereedschap dat hun oordelen in `toets/uitslag.json` zet; `samenvoeg_glutenvrij.py` raakt alleen glutenvrij en weigert onbekende id's. Besluit Friso 15-11-2026: "Ja, nu klaarzetten".

**Approach:** Volgens toetsset §6c: een nieuw script `samenvoeg_r12.py` (`--uitslag --export --items [--droog]`) dat bevestigde en onleesbare exportrecords van de items-id's als nieuwe uitslagrecords achteraan toevoegt (vaste sleutelvolgorde, `tijd` = `bijgewerkt`, `herkomst_etiket` artefact-r12), herhaalbaar (gelijk / nieuwer / ouder / ingetrokken / vreemde sleutels), met byte-garantie voor alle andere records, droogloop, reservekopie `voor-r12`, atomisch schrijven, alle fouten in één melding en een rapport met categorieën, `uitslag.stand` vóór/na en gate C vóór/na. Het schrijfblok van `samenvoeg_glutenvrij.samenvoeg` wordt een gedeelde functie zonder gedragswijziging. De acceptatietests in `tests/test_ronde13_samenvoeg_r12_20261115.py` zijn rood en moeten groen worden zonder de tests te wijzigen.

## Boundaries & Constraints

**Always:** `samenvoeg_glutenvrij.py` houdt zijn gedrag, meldingen en achtervoegsel `voor-glutenvrij` (alle tests in `tests/test_ronde11c_samenvoeg_20261112.py` blijven groen, ook de monkeypatches op `_herlees`, `datetime` en `os.replace` van die module); `uitslag.py`, `tel_proef.py`, `train.py`, scheiding en `toets-docs.json` blijven ongewijzigd; alleen standaardbibliotheek plus `uitslag` en `samenvoeg_glutenvrij`.

**Never:** echte proefmap in tests; etiketcodes of reeksen van 13+ cijfers in het script; andere velden van bestaande records aanraken.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Eerste run | export met bevestigd, onleesbaar, open; één item zonder record | bevestigd + onleesbaar achteraan in items-volgorde; open/ontbreekt gemeld | N/A |
| Tweede run gelijk | zelfde export | niets geschreven, geen kopie, al_gelijk | N/A |
| Nieuwer | strikt nieuwer bevestigd | vervangen op zijn plek | N/A |
| Ingetrokken | nieuwer onleesbaar/open over bevestigd | laten staan, ingetrokken | N/A |
| Vreemde export/items | zie toetsset §6c Weigeren | niets geschreven | ValueError met alle fouten en id's |

</frozen-after-approval>

## Code Map

- `samenvoeg_glutenvrij.py` -- herbruikbaar: `_lees_object`, `_herlees`, `_tijd`, `_status` (met `STATUSSEN` incl. open), `_gate`, `FORMATEN`. Het blok in `samenvoeg()` vanaf `if _herlees(uitslag) != origineel` tot en met `os.replace` (reservekopie `xb`, tijdelijk bestand, chmod, herlezen, opruimen) wordt `schrijf(uitslag, origineel, tekst, achtervoegsel) -> kopiepad`; `samenvoeg()` roept die aan met `"voor-glutenvrij"`; de functie gebruikt de module-globals `_herlees`, `datetime`, `os` zodat bestaande patches blijven werken. Meldingen ongewijzigd laten (tests matchen op "veranderd", "bestaat al").
- `uitslag.py` -- `valideer(invoer, bekend, vereist)` (velden status, keurmerken, nutriscore, veranderd, opmerking, tijd), `stand`, `per_keurmerk`, `KEURMERKEN_LOS`, `NIEUW_R10`; niet wijzigen.
- Nieuw `samenvoeg_r12.py` -- `samenvoeg(uitslag, export, items, droog=False)`, `main(argv)`; rapportsleutels en categorieën zoals de docstring van het testbestand; byte-controle zoals toetsset §6c; tekst schrijven met `json.dumps(na, **fmt)` van het gevonden formaat.
- Tests: `tests/test_ronde13_samenvoeg_r12_20261115.py` (contract), `tests/test_ronde11c_samenvoeg_20261112.py` (regressie).

## Tasks & Acceptance

**Execution:**
- [x] `_bmad-output/planning-artifacts/spike-getrainde-detector/samenvoeg_glutenvrij.py` -- schrijfblok naar `schrijf()`, zonder gedragswijziging.
- [x] `_bmad-output/planning-artifacts/spike-getrainde-detector/samenvoeg_r12.py` -- nieuw volgens toetsset §6c.

**Acceptance Criteria:**
- Given de tests in `tests/test_ronde13_samenvoeg_r12_20261115.py`, when ze draaien, then zijn ze groen zonder wijziging aan de tests.
- Given `tests/test_ronde11c_samenvoeg_20261112.py` en de volle suite `-m "not zwaar"`, when ze draaien, then zijn ze groen.

## Verification

**Commands:**
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run pytest tests/test_ronde13_samenvoeg_r12_20261115.py tests/test_ronde11c_samenvoeg_20261112.py tests/test_cap10_draaiplan.py -q` -- groen.

## Implementation Notes

- **Route-poort (step-02), 15-11-2026:** intent gaps 0 (besluit Friso 15-11-2026 en de regels in toetsset §6c na de spec-review; de keuze "ingetrokken haalt niets weg" volgde het besluit van 12-11-2026 als aanname; bevestigd door Friso 15-11-2026, "Bevestigd blijft staan", via de orchestrator). Irreversibles 0 in de build (alleen bestanden in `tmp_path`; de echte samenvoeging draait de hoofdsessie later). Footprint niet klein (nieuwe module plus een gedeelde functie in een bestaand script). Route: dispatch. Checkpoint 1: goedkeuring volgt uit de opdracht van de orchestrator (15-11-2026, volledige keten).
- ATDD vooraf: `uv run pytest tests/test_ronde13_samenvoeg_r12_20261115.py -q` = 41 failed, 1 passed.
- Implementatie door een verse subagent (alleen de spec als bron): 42/42 groen. Na review: 10 tests door mij toegevoegd (52 in het bestand), twee codepatches door dezelfde subagent, documentpunten door mij. `uv run pytest tests/test_ronde13_samenvoeg_r12_20261115.py tests/test_ronde11c_samenvoeg_20261112.py tests/test_cap10_draaiplan.py -q` = 97 passed; volle suite `-m "not zwaar"` = 1195 passed, 4 deselected.

## Spec Change Log

- 15-11-2026, na de build: besluit Friso "Bevestigd blijft staan" (bron: orchestrator, keuzemenu op open punt 1 van ronde 13) bevestigt het gebouwde gedrag: een later onleesbaar of open over een eerder samengevoegd bevestigd ronde-12-etiket laat het bevestigde oordeel staan en wordt gemeld als ingetrokken. Geen code- of testwijziging; het commentaar in `samenvoeg_r12.py` ("AANNAME §6c") blijft staan tot de volgende codewijziging.

## Review Triage Log

Drie lagen (Blind Hunter 12, Edge Case Hunter 1, Verification Gap 2 + 1 overig), parallel, zelfde modelniveau; 16 bevindingen. Per bevinding:

| # | Laag | Bevinding | Oordeel | Route |
|---|---|---|---|---|
| 1 | Blind | regel "export zonder enig items-id" stond in §6b in plaats van §6c | medium (contract van het verkeerde script) | patch: naar §6c verplaatst |
| 2 | Blind | wachten-en-opnieuw bij een bestaande kopienaam wijkt af van "als §6b" | low | patch: in §6c vastgelegd (nooit overschrijven); gedekt door `test_strikt_nieuwer…` (VG bevestigt) |
| 3 | Blind | DRAAIPLAN: samenvoegen "vóór stap 11" laat de training (stap 10, `poort_glutenvrij`) zonder de 53 starten | medium | patch: "vóór stap 10" |
| 4 | Blind | DRAAIPLAN stap 6 noemde de samenvoeging nog "volgende ronde" | low | patch |
| 5 | Blind | `open` vraagt een geldige tijd, §6c zei "alleen de status" | low | patch: §6c volgt de code (tijd nodig voor nieuwer/ouder) |
| 6 | Blind | gelijk tijdstip met andere inhoud heet "ouder" | false | volgt §6c letterlijk; de id's van ouder worden gemeld; memlog-regel later bijgesteld (append-only) |
| 7 | Blind + VG | geen tests voor open/nieuwer over een samengevoegd onleesbaar record | medium (mutatie bleef groen, VG) | patch: 3 tests |
| 8 | Blind + VG | weigertak van `_controleer_bytes` nooit geraakt | medium (mutatie bleef groen, VG) | patch: 2 tests |
| 9 | Blind | geen tests voor onleesbaar met ongeldige keuze, onbekende status in de uitslag, onleesbare herkomsttijd | low | patch: 3 tests; TypeError-omzetting en tweede herlezing verworpen (gedekt in `test_ronde11c…` via de gedeelde functie, of alleen nog onbereikbare vorm) |
| 10 | Blind | memlog/checklist zonder groene run, review en trace | false | volgt in deze keten (stap 5, trace) |
| 11 | Blind | DRAAIPLAN zonder terugdraaistap en zonder controle dat de lokale server uit staat | low | patch: één zin met `cp` van de reservekopie en `lsof -i :8767` |
| 12 | Blind | `MELDEN` op positie; id's van vervangen niet getoond | low | patch: expliciete lijst incl. vervangen; test |
| 13 | Blind | SPEC `bijgewerkt` niet nieuwste eerst; `peildatum_code` niet bijgewerkt | low / false | patch volgorde; peildatum gaat over de ml-service-code, niet over dit script |
| 14 | Edge | `OSError` uit het schrijven geeft een traceback in plaats van "geweigerd" | medium | patch: omzetten naar weigering; test. In `samenvoeg_glutenvrij.py` al zo vóór deze ronde: niet aangeraakt (geen gedragswijziging) |
| 15 | VG overig | `_record` accepteert elke status | false | alleen bereikbaar voor bevestigd/onleesbaar (tak export_open ervoor) |

Uitgesteld: geen.
