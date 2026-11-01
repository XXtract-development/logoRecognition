---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-11-01'
story_id: spike-getrainde-detector
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md
  - _bmad-output/planning-artifacts/spike-getrainde-detector/meetregels.md
  - _bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md
  - _bmad-output/planning-artifacts/spike-getrainde-detector/trainingsset-en-herkenning.md
  - _bmad-output/planning-artifacts/spike-getrainde-detector/randvoorwaarden.md
  - _bmad-output/planning-artifacts/spike-architectuurkeuze-logoherkenning/fase-b/tel.py
  - _bmad-output/planning-artifacts/spike-architectuurkeuze-logoherkenning/fase-b/test_tel.py
  - apps/ml-service/app/services/k4aa.py
  - _bmad/tea/testarch/knowledge/{test-quality,test-levels-framework,test-priorities-matrix,data-factories,test-healing-patterns,component-tdd,ci-burn-in}.md
  - _bmad-output/planning-artifacts/spike-getrainde-detector/DRAAIPLAN.md (ronde 2)
  - git show c86a067 (ronde 2: besluiten Friso 01-11-2026)
---

# ATDD-checklist: proef getrainde detector

## Stap 1 — Preflight en context

- **Stack:** `backend` voor de proef (Python 3.12, pytest via `uv`, plat in de specmap zoals `fase-b/tel.py`), plus één browsertest (Playwright voor Python) voor de invulpagina. De apps in de repo (Node/Playwright) worden niet geraakt.
- **Testframework opgezet in deze stap:** `_bmad-output/planning-artifacts/spike-getrainde-detector/pyproject.toml` (groepen `dev` = pytest + playwright, `detector` = `rfdetr[train]==1.11.2`) en `tests/conftest.py` (specmap op `sys.path`). Chromium staat al in `~/Library/Caches/ms-playwright`.
- **Acceptatiecriteria:** de `success`-regels van CAP-1 t/m CAP-15 in SPEC.md, met de regels uit de vier companions.
- **Bestaande patronen:** `fase-b/test_tel.py` (verzonnen mini-sets met bekende uitkomst, `pytest`), `apps/ml-service/tests/test_k4aa_atdd.py` (verzoekvorm en zdr-gedrag vastpinnen met een nagebootste aanbieder).
- **Kennisfragmenten:** kern (`test-quality`, `data-factories`, `test-healing-patterns`, `component-tdd`) en backend (`test-levels-framework`, `test-priorities-matrix`, `ci-burn-in`). In de hoofddraad zijn alleen de kernregels gelezen (deterministisch, geïsoleerd, expliciete asserts, < 300 regels per test, < 1,5 min, geen harde wachttijden, geen voorwaardelijke testpaden); de testschrijvende subagents laden de fragmenten volledig.
- **TEA-instellingen:** `tea_use_playwright_utils: true` (geldt voor de Node-suite; hier niet van toepassing), `tea_use_pactjs_utils: false`, `tea_browser_automation: auto`, `test_stack_type: auto`.

## Stap 2 — Generatiemodus

**AI-generatie.** De invulpagina bestaat nog niet, dus opnemen in een browser kan niet; de criteria zijn eenduidig genoeg om tests uit te schrijven.

## Stap 3 — Teststrategie

### Niveaus en prioriteit

| CAP | onderwerp | niveau | prioriteit |
|---|---|---|---|
| 1 | scheiding | unit (+ lokaal: echte invoer, overgeslagen zonder `PROEF_MAP`) | P0 |
| 2 | kandidaten, voorinvulling | unit (nagebootste client) | P1 |
| 3 | invulpagina | integratie (echte server op poort 0) + browser (Playwright) | P0 |
| 4 | generator | unit op kleine verzonnen beelden | P1 |
| 5 | echte voorbeelden | unit | P1 |
| 6 | training | unit (configuratie) + rooktest `zwaar` | P2 |
| 7 | herkenning | unit | P1 |
| 8 | beoordelaar | unit (nagebootste transport) | P0 |
| 9 | telling | unit + integratie server → telscript | P0 |
| 10 | draaiplan | documentcontrole | P2 |
| 11 | bevriezing | unit | P0 |
| 12 | K4-aa-runner | unit (nagebootste `k4aa`-module) | P1 |
| 13 | licenties | unit + lokaal (echte omgeving) | P0 |
| 14 | uitgaven | unit | P0 |
| 15 | beelden | unit (nagebootste opdrachtuitvoerder) | P1 |
| — | gedeelde OpenRouter-client | unit, per aanroeper geparametriseerd | P0 |

Alle tests falen nu, omdat geen enkele module bestaat. Elke test importeert zijn module in de test of in een fixture (zodat elke test afzonderlijk rood is, niet één verzamelfout per bestand).

### Interfacecontract (bindend voor tests én bouw)

Modules plat in `_bmad-output/planning-artifacts/spike-getrainde-detector/`. Alleen standaardbibliotheek + Pillow + numpy, tenzij anders vermeld. Alle schrijvers gaan via `beelden.veilig_doel`.

**`kosten.py`** — `TARIEF = {model: (per_token_in, per_token_uit)}` (minstens `anthropic/claude-sonnet-5.5` (2e-6, 10e-6) en `google/gemini-3.8-flash` (0.825e-6, 4.125e-6)); `kosten_uit(envelope: dict, model: str) -> float` (`usage.cost` als getal, anders tokens × tarief); `class BudgetOverschreden(Exception)`; `class Bewaker(post: str, raming: float, factor: float = 1.5)` met `.grens`, `.uitgegeven`, `.controleer_start(verwacht: float)` (gooit `BudgetOverschreden` als `verwacht > grens`), `.mag(volgende: float) -> bool` (`uitgegeven + volgende <= grens`), `.boek(bedrag: float)`.

**`openrouter.py`** — `URL = "https://openrouter.ai/api/v1/chat/completions"`, `PROVIDER = {"zdr": True, "data_collection": "deny"}`, `K4AA_MODEL = "google/gemini-3.8-flash"`, `ROLLEN = ("voorinvulling", "voorlabels", "beoordelaar")`.
`class RunStop(Exception)` met `.reden` ∈ {`geen_zdr`, `auth`, `tegoed`, `rechten`, `zdr_proef_ontbreekt`, `zdr_proef_mislukt`, `budget`}; `class EtiketFout(Exception)` met `.klasse`.
`class Client(model, rol, sleutel=None, transport=None, bewaker=None, slaap=time.sleep)`: sleutel standaard uit `os.environ["OPENROUTER_API_KEY"]` (ontbreekt → `RunStop("auth")`); `rol="voorinvulling"` met `model == K4AA_MODEL` → `ValueError`. `transport(url: str, body: dict, headers: dict, timeout: float) -> tuple[int, dict | None]`; verbindingsfout/tijd op = `OSError`.
- `.zdr_proef(beeld_png: bytes) -> dict` (`{"model", "tijd", "ok"}`); mislukt → `RunStop("zdr_proef_mislukt")`. `.vraag` vóór een geslaagde proef → `RunStop("zdr_proef_ontbreekt")`.
- `.vraag(tekst: str, beelden: list[bytes], schema: dict, verwacht: float = 0.0) -> tuple[dict, float]`: body = `{"model", "temperature": 0, "messages": [{"role": "user", "content": [{"type": "text", ...}, {"type": "image_url", "image_url": {"url": "data:image/png;base64,…"}} per beeld]}], "response_format": {"type": "json_schema", "json_schema": {"name": "antwoord", "strict": True, "schema": schema}}, "provider": PROVIDER, "usage": {"include": True}}`; header `Authorization: Bearer <sleutel>`; altijd naar `URL`.
- Statustabel uit randvoorwaarden §2: 200 + geldig JSON-antwoord in `choices[0].message.content` met `finish_reason == "stop"` → `(antwoord, kosten)`; 200 ongeldig/geweigerd/ander `finish_reason` → `EtiketFout("antwoord_ongeldig")`; 429/5xx/`OSError` → opnieuw, hoogstens 2 keer, `slaap(2 * poging)`, daarna `EtiketFout("aanbieder")`; 404 → `RunStop("geen_zdr")`; 401 → `RunStop("auth")`; 402 → `RunStop("tegoed")`; 403 → `RunStop("rechten")`; andere 4xx → `EtiketFout("geweigerd")`.
- Met `bewaker`: vóór het versturen `bewaker.mag(verwacht)`, anders `RunStop("budget")` zonder te versturen; na een antwoord `bewaker.boek(kosten)`.
- Logger `proef.openrouter`: nooit sleutel, tekst, beelddata of antwoordinhoud, ook niet op DEBUG.

**`scheiding.py`** — `RIJEN` (10 codes: `EU_ORGANIC_FARMING`, `GREEN_DOT`, `RECYCLABLE_GENERAL_CLAIM`, `NUTRISCORE_A`, `NUTRISCORE_B`, `NUTRISCORE_C`, `PREGNANCY_WARNING`, `MARINE_STEWARDSHIP_COUNCIL_LABEL`, `WEIDEMELK`, `VEGAN_SOCIETY_VEGAN_LOGO`).
`lees_declaraties(pad) -> list[tuple[doc_id, gln, gtin, frozenset[codes]]]` (codes = `t3777` ∪ `dieet` ∪ `NUTRISCORE_<letter>`; regels met `#` of zonder drie delen in `doc_id` overgeslagen); `lees_alcohol(pad) -> list[tuple[gln, gtin]]`; `gtins_uit_paden(regels: Iterable[str]) -> set[str]` (14 cijfers tussen `/`); `bouw_rijen(declaraties, alcohol) -> dict[rij, dict[gln, set[gtin]]]` (zwangerschap = alcohol);
`kies(rijen, uitgesloten: set[str]) -> dict` met `"trainingsleveranciers"` (gesorteerde lijst), `"per_rij"` (`{rij: {"train", "toets", "train_glns", "toets_glns"}}`, tellingen op unieke GTIN, toets zonder `uitgesloten`), `"score"` (gesorteerde lijst `min(toets/2, train)`), `"uitgesloten_gtins"` (aantal uitgesloten GTIN's dat in de rijen voorkomt; 0 → `ValueError`). Kandidaten = per rij top-2 leveranciers; uitputtend; gelijkspel: kleinste verzameling, dan laagste gesorteerde GLN-rij.
`dhash(beeld: Image) -> int` (64 bit, grijs, 9×8); `hamming(a, b) -> int`; `bijna_gelijk(train: dict[id, int], toets: dict[id, int], max_afstand: int = 6) -> set[id]` (trainings-id's die eruit moeten).

**`beelden.py`** — `class BinnenRepo(Exception)`; `veilig_doel(pad) -> Path` (gooit `BinnenRepo` als het pad, of zijn dichtstbijzijnde bestaande ouder, in een git-werkboom ligt); `ophaalquery(paren: list[tuple[gln, gtin]], doelmarkt: str = "528") -> str` (één `SELECT` op `xxtractdbmedia.media` ⨝ `xxtractdbmedia.converted`, geen ander SQL-werkwoord); `rsync_opdracht(lijst: Path, doel: Path) -> list[str]` (bron `banana:/media/Xmedia/`, `--files-from`, `--rsync-path=nice -n 19 rsync`, geen `--delete`/`--remove-source-files`/`--remove-*`); `class TeGroot(Exception)`; `samenvoegen(paden: list[Path]) -> Image` (regels van `bouw.py`: laag > 4096 px of > 20 MB eerst verkleinen binnen 4096; onder elkaar op wit, links; > 250 MP → `TeGroot`); `naar_rgb(beeld) -> Image` (alfa plat op wit, CMYK/P/L → RGB); `render_pdf(pdf: Path, uitvoerder) -> list[Image]` (`["pdftoppm", "-r", "150", "-png", …]`); `uitvoerder(args: list[str]) -> bytes` is het enige pad naar externe programma's.

**`toets.py`** — `kandidaten(rijen_toets: dict[rij, dict[gln, set[gtin]]], gelijkend: dict[keurmerk, dict[gln, set[gtin]]], max_per: int = 40, max_gelijkend: int = 10, seed: str = "20261031") -> list[dict]` (`{"gtin", "gln", "reden"}`; om de beurt per leverancier, binnen een leverancier op `sha256(seed + gtin)`; Nutri-Score A/B/C samen 40, gelijk verdeeld (13/13/14); elke GTIN één keer); `ontdubbel(items: list[dict{"gtin", "sha256", "dhash"}]) -> list[str]` (gtins; zelfde sha256 of dHash ≤ 6 → één blijft); `SCHEMA_VOORINVULLING`; `voorinvulling(client, beeld_png: bytes, tegels: list[bytes]) -> dict` (`{"keurmerken": {code: bool} voor de 7 codes, "nutriscore": sorted list, "hinttegels": {code: [index]}, "gelijkend": [codes], "model", "kosten"}`); `rapport(voorinvullingen: dict[doc, dict]) -> dict[keurmerk, int]` (8 keurmerken; `NUTRISCORE` = A/B/C samen); `stoppunt2(rapport, minimum: int = 16) -> list[keurmerk]`.

**`uitslag.py`** — `KEURMERKEN7` (de 7 codes behalve Nutri-Score), `KEURMERKEN8` (= `KEURMERKEN7` + `"NUTRISCORE"`); `valideer(invoer: dict, bekend: set[str]) -> dict` (`ValueError` bij onbekend etiket, onbekende waarde, of `status == "bevestigd"` zonder alle 7 keuzes + `nutriscore`); `per_keurmerk(uitslag: dict) -> dict[keurmerk, {"met": set, "zonder": set}]` (meetregels §3 en §5; per letter ook `NUTRISCORE_A/B/C`); `stand(uitslag) -> dict[keurmerk, {"met": int, "zonder": int}]`.

**`invul/server.py` + `invul/index.html`** — `maak_server(map: Path, poort: int = 0) -> http.server.HTTPServer` (bediend in een thread door de test); bestanden in `map`: `items.json` (lijst `{"id", "beeld", "hint": [...], "voorinvulling": {...}}`), `uitslag.json`; `GET /` → pagina; `GET /items.json`; `GET /stand` → `{"uitslag": {...}, "stand": uitslag.stand(...)}`; `POST /opslaan` met JSON `{"id": …, "waarde": {schema van één etiket}}` → 200 `{"ok": true}` of 400; één lock rond lezen-wijzigen-schrijven; atomisch schrijven. Pagina: elementen met `id="opmerking"` (tekstveld), `id="voortgang"`, `id="opslaan"`, sneltoetsen `ArrowLeft`/`ArrowRight`/`b` (bevestigd zoals voorgevuld); concepten in `sessionStorage` onder `concept:<id>`.

**`generator.py`** — `varianten(logo: Image) -> dict[str, Image]` (sleutels `kleur`, `zwartwit`, `lijn`, `negatief`); `genereer(achtergronden: list[dict{"beeld", "gtin"}], logos: dict[klasse, list[dict{"beeld", "gtin" | None}]], gelijkend: list[dict{"beeld", "gtin" | None}], trainings_gtins: set[str], n_tegels: int, seed: int, uit: Path, tegel: int = 1024, leeg_fractie: float = 0.05) -> dict` (manifest; schrijft `uit/train/_annotations.coco.json` + beelden; `ValueError` als een bron-GTIN niet in `trainings_gtins` zit; geplakte vakjes overlappen niet; gelijkend nooit gelabeld).

**`echt.py`** — `naar_tegels(etiketten: list[dict{"doc_id", "gln", "beeld", "vakjes": [{"code", "box", "onzeker"}]}], trainings_glns: set[str], tegel: int = 1024, overlap: int = 256) -> list[dict{"doc_id", "tegel": (x0, y0, x1, y1), "vakjes": [...]}]` (`ValueError` bij een toetsleverancier; tegels die een onzeker vakje raken vallen af; vakjes in tegelcoördinaten); `valsplit(etiketten: list[dict{"doc_id", "codes", "dhash"}], fractie: float = 0.3, seed: int = 20261031) -> tuple[set, set]` (per klasse; etiketten met dHash ≤ 6 in één cluster, cluster nooit gesplitst).

**`train.py`** — `MATEN = {"N": "RFDETRNano", "S": "RFDETRSmall", "M": "RFDETRMedium", "L": "RFDETRLarge"}`; `config(fase: str, maat: str, dataset: Path, uit: Path, epochs: int, seed: int) -> dict` (`ValueError` bij een andere maat of fase ∉ {`nagemaakt`, `echt`}; `uit` via `veilig_doel`); `train(cfg) -> dict` en `snelheid(maat, dataset, uit, iteraties: int = 50) -> dict{"s_per_iteratie", "verwacht_uur"}` (alleen met groep `detector`).

**`herken.py`** — `tegels(w, h, tegel=1024, overlap=256) -> list[tuple]`; `naar_etiket(box, tegel) -> box`; `nms(kandidaten: list[dict{"code", "box", "score"}], iou: float = 0.5) -> list` (per klasse; Nutri-Score A/B/C als één groep); `band(score, laag, hoog) -> "melding" | "beoordelaar" | "niets"` (`>= hoog`, `laag <= s < hoog`); `drempels(validatie: list[dict{"codes": set, "kandidaten": [{"code", "score"}]}], codes: list[str]) -> dict[code, tuple[laag, hoog]]` (regels trainingsset §6); `certificaten(tekst: str | None) -> set[code] | None`; `beslis(kandidaten, drempels, certificaten: set | None, beoordeel: Callable[[dict], str], max_beoordelingen: int = 10) -> dict{"meldingen": set, "beoordeeld": int}`.

**`beoordelaar.py`** — `SCHEMA`; `uitsnede(beeld: Image, box) -> Image` (50% marge, minstens 256 px); `beoordeel(client, uitsnede_png: bytes, referentie_png: bytes, code: str) -> "ja" | "nee" | "twijfel"` (twee losse beelden via `client.vraag`; ander antwoord → `openrouter.EtiketFout("antwoord_ongeldig")`).

**`tel_proef.py`** — `besluit(gevonden: int, met: int, vals: int, zonder: int) -> "automatisch" | "mens bevestigt" | "te weinig voorbeelden"`; `tel(uitslag: dict, meldingen: dict[doc, set[code] | dict{"fout": klasse}]) -> dict` (per keurmerk `{"met", "gevonden", "zonder", "vals", "ondergrens", "bovengrens", "besluit", "verkeerde_letter"}` + `"fouten"`, `"foutpercentage"`, `"geldig"`); een record met fout `geen_zdr` → `ValueError`; `nakijklijst(uitslag, routes: dict[naam, meldingen], seed) -> list[dict]` (geen routenamen; vervangen door Ronde 2: `nakijklijst(uitslag, routes) -> (lijst, sleutel)`); `main(argv)`.

**`bevries.py`** — `VERPLICHT` (8 namen uit meetregels §6: `scheiding`, `uitslag`, `model`, `drempels`, `beoordelaar`, `k4aa`, `telcode`, `gewichten`); `class Gewijzigd(Exception)`, `class AlGedraaid(Exception)`; `bevries(onderdelen: dict[naam, Path], uit: Path) -> dict` (`ValueError` als er een verplicht onderdeel ontbreekt); `controleer(bevroren: Path, onderdelen: dict[naam, Path])` (gooit `Gewijzigd`); `registreer_run(map: Path, route: str, herhaling: bool = False, reden: str | None = None) -> Path` (eerste run → `<route>-run1.json`; tweede zonder `herhaling` + reden → `AlGedraaid`; eerste blijft).

**`k4aa_lokaal.py`** — `PUBLIEK = {"gs1-packaging-label-guide", "synthetic-nutriscore-bootstrap"}` plus bronnen die met `http` beginnen; `filter_referenties(refs: list[dict{"id", "code", "source", "path"}], gtin_naar_gln: dict[str, str], trainings_glns: set[str]) -> list`; `meldingen_uit(resultaat: dict) -> set[code]` (alle `detections[*].t3777_code` binnen de 8 keurmerken, ook `requires_review`); `draai_etiket(k4aa, data: bytes, budget_s: float = 300) -> dict` (synchroon, draait `k4aa.scan(data, remaining)`; `{"meldingen", "kosten", "tijd", "requires_review"}`; `K4aaError` → `{"fout": klasse}`, behalve `no_zdr_provider` → `openrouter.RunStop("geen_zdr")`).

**`licenties.py`** — `VERBODEN` (pakketnamen, case-ongevoelig: `ultralytics`, `pymupdf`, `fitz`, `albumentationsx`, `rfdetr_plus`, `rfdetr-plus`, `deimv2`, `yoloe`, `dinov3`) + `albumentations` ≥ 2.0.9; `EXTERN = {"pdftoppm", "pdftotext", "rsync", "ssh"}`; `beoordeel(uitdrukking: str) -> "toegestaan" | "ruim" | "verboden" | "onbekend"`; `controleer(pakketten: list[dict{"naam", "versie", "licentie", "tekst"}]) -> dict{"overtredingen": [...], "ruim": [...]}` (leeg `licentie` → eerste regels van `tekst`); `pakketten_uit_omgeving() -> list[dict]`.

**`DRAAIPLAN.md`** — stappen in de vaste volgorde (toetsset §4): scheiding, kandidaten, voorinvulling, stoppunt 2, bevestiging, aanvullen, dHash-controle, scheiding bevriezen, snelheidsmeting, training, bevriezen, toetsrun D+A, toetsrun K4-aa, telling, blind nakijken. Elke stap een kop `### Stap N — <naam>` met regels `Commando:`, `Uitvoer:`, `Kosten:`, `Tijd:`, `Stoppunt:`; elk genoemd `python <bestand>.py` bestaat in de specmap; een ongeteste stap draagt `ongetest:` met reden.

### Rode fase

Alle tests zijn zo geschreven dat ze nu falen (module ontbreekt) en pas groen worden door de bouw. Geen test wordt overgeslagen om rood te verbergen; `lokaal`- en `zwaar`-tests slaan alleen over als `PROEF_MAP` resp. `rfdetr` ontbreekt, en dat staat in de uitvoer.


## Stap 4 — Falende tests genereren (rode fase)

**Uitvoeringsmodus:** `subagent` (`tea_execution_mode: auto`; subagents beschikbaar). Worker A (step-04a) schreef de backendtests, Worker B (step-04b) de browsertest. Bewuste afwijkingen van de stapbestanden:
- De workers schreven hun testbestanden zelf en leverden een JSON-samenvatting (`/tmp/tea-atdd-api-tests-proef.json`, `/tmp/tea-atdd-e2e-tests-proef.json`) in plaats van alleen JSON met bestandsinhoud.
- Geen `test.skip()`: dat is het Playwright-JS-patroon om rode tests te parkeren. Hier moeten de tests juist rood draaien (de keten vraagt een rode run met aantal falende tests). Elke test importeert zijn module in de test of een fixture, zodat elke test afzonderlijk rood is.

**Incident (31-10, 23:14–23:26).** Een andere sessie draaide in dezelfde map een eigen ATDD-ronde op deze spec. Na vergelijking op inhoud en tijdstip (afgestemd met de coördinator): gehouden zijn haar herberekening van de toets-kolom in `toetsset.md` §2 (gelijk aan de onafhankelijke telling van Worker A: EU 127/14, GD 272/46, REC 648/54, NS-A 171/15, NS-B 106/13, NS-C 199/12, PREG 878/52) en haar logregel daarover; vervangen zijn haar 18 testbestanden en haar stap-4-tekst in dit bestand. Het browsertestbestand van Worker B, dat zij had verwijderd, is ongewijzigd teruggezet.

### Aanvullingen op het interfacecontract (bindend)

Uit de keuzes van Worker A (waar het contract open was):
- `scheiding.kies`: `per_rij[*]["train_glns"/"toets_glns"]` zijn aantallen; een leverancier telt aan de toetskant alleen met minstens één niet-uitgesloten GTIN.
- `toets.SCHEMA_VOORINVULLING`-antwoord: `{"keurmerken": [{"code", "aanwezig", "tegels"}], "nutriscore": [letters], "gelijkend": [codes]}`; beelden in de aanroep: eerst het hele etiket, dan de tegels; `hinttegels` = indexen in de tegels; mislukt → `keurmerken {}`, `nutriscore []`, `hinttegels {}`.
- Invulserver: een tussenstand zonder `status` mag; atomisch schrijven via `os.replace`; na opslaan staan alleen `items.json`, `uitslag.json` en de beeldmap in de map.
- `generator`: een achtergrond mag `meldingen` dragen (gemeld keurmerk → niet gebruikt); `leeg_fractie > 0,1` → `ValueError`; COCO-uitvoer byte-gelijk bij zelfde seed; manifest met sha256 van elk uitvoerbeeld en de variantnamen.
- `herken.drempels`: voor `hoog` telt alleen een kandidaat van dezelfde code op een etiket zonder die code. `herken.beslis` laat een `EtiketFout` van de beoordelaar door (routefout), nooit een stille `nee`.
- `tel_proef`: `fouten` = aantal of `{klasse: n}`; nakijklijst-items bevatten `doc_id`.
- `bevries(onderdelen, uit)`: `uit` is het pad van `bevroren.json`; `registreer_run` legt de reden vast in een bestand in de map.
- `k4aa_lokaal`: `requires_review` = verzameling codes; vangt `K4aaError` van de meegegeven module; `scan` is async.
- `licenties`: items in `overtredingen`/`ruim` zijn dicts met `naam`; `MIT-CMU` (Pillow) telt als toegestaan of ruim.
- `beelden.ophaalquery` weigert niet-numerieke GLN/GTIN/doelmarkt (`ValueError`); `render_pdf` geeft `pdftoppm` een uitvoervoorvoegsel na het pdf-pad.
- `train.train`-resultaat bevat checkpoint, sha256, seed, log en gewichtslicentie `Apache-2.0`.
- `openrouter.Client` controleert de verplichte sleutels van het schema in het antwoord.

Toegevoegd om dekkingsgaten te sluiten:
- `scheiding.schrijf(uitkomst, pad, invoerhashes) -> Path` (sleutels `regel`, `trainingsleveranciers`, `per_rij`, `score`, `uitgesloten_gtins`, `invoer`; via `veilig_doel`; byte-gelijk bij zelfde invoer).
- `echt.SCHEMA_VOORLABELS`; `echt.voorlabels(client, beeld_png, tegels: list[tuple[bytes, box]]) -> list[{"code", "box", "onzeker"}]` (één aanroep, eerst het hele etiket; vakjes in etiketcoördinaten; alleen de 10 klassen); `echt.rapport(train, valid) -> {klasse: {"train_etiketten", "train_vakjes", "valid_etiketten", "valid_vakjes"}}`.
- `tel_proef.tabel(uitslag, meldingen, meta, seed=20261030, n_trekkingen=2000)` met per keurmerk `spreiding` (GLN-bootstrap) en `leveranciers`, en per route `tijd` (mediaan/p90/max), `kosten` (gemiddeld/totaal), `beoordelaar_aanroepen`; `tel_proef.verschil(a, b)`; `tel_proef.verschil_etiketten(a, b)`; `tel_proef.main(argv)` (`--uitslag`, `--route NAAM=PAD`, `--meta NAAM=PAD`, `--uit`; schrijft `tabellen.json` + `tabellen.md`; `geen_zdr` in een route → niet-nul en geen tabellen).
- `beelden.ssh_opdracht(args, host="banana") == ["ssh", host, "nice", "-n", "19", *args]`; constanten `MAX_ZIJDE`, `MAX_LAAG_BYTES`, `MAX_PNG_BYTES`, `MAX_PIXELS`; `beelden.opslaan(beeld, pad) -> {"sha256", "w", "h", "bytes", "verkleind_procent"}` (PNG boven `MAX_PNG_BYTES` verkleinen met factor √(max/grootte)).
- `herken.laad_model(checkpoint, maat)`; `herken.voorspel(model, tegel, drempel) -> list[{"code", "box", "score"}]`.

Uit Worker B (pagina):
- `data-testid="etiket-id"` (tekst = id van het getoonde etiket); `data-testid="stand-<KEURMERK>"` per keurmerk uit `KEURMERKEN8`, met `data-met`/`data-zonder` uit `/stand` en zichtbare tekst met 16 en 50.
- Bij laden `GET /items.json` en `GET /stand`; opslaan met `POST /opslaan`. Met lege uitslag opent de pagina op het eerste item; `ArrowLeft` op het eerste item blijft daar.
- `#opslaan` (klik) en `b` (buiten een tekstveld) slaan het getoonde etiket op als `bevestigd` met de huidige keuzes en de `#opmerking`-tekst; `b` = zoals voorgevuld → `veranderd: []`. Navigeren mag alleen direct bij klik of toets, nooit bij binnenkomst van het antwoord.
- `#voortgang` toont de door de server bevestigde stand (na het antwoord, niet bij de klik). Typen in `#opmerking` stuurt nooit een POST.
- `concept:<id>` bij elk `input`-event; weg na een 200 van `/opslaan` voor dat id; gaat ook bij terugnavigeren vóór op de serverstand. Geen `focus()` en geen `autofocus` bij laden.
- Per keurmerk uit `KEURMERKEN7` een radiogroep `data-testid="keuze-<CODE>"` (aanwezig/afwezig/onzeker); Nutri-Score-letters als vinkvakjes `data-testid="ns-<A..E>"` plus `data-testid="ns-onleesbaar"`; een gewijzigde keuze komt in `veranderd`. Overzichtsbeeld `data-testid="overzicht"` in een link `data-testid="volledig"` naar het beeld op volle resolutie.

- `beelden.samenvoegen`: binnen de grenzen precies `bouw.py` (`convert("RGB")`, dus transparantie vervalt zoals in de pijplijn); boven de grenzen plat op wit en JPEG q85. `naar_rgb` (alfa plat op wit) geldt voor beelden uit het origineel.
- `echt.voorlabels`-antwoord: `{"vakjes": [{"beeld", "code", "box", "onzeker"}]}` (`beeld` 0 = heel etiket, 1… = tegels; omrekening met de schaal van elke tegel); `echt.rapport` telt onzekere vakjes niet.
- `tel_proef.tabel`: leverancierstrekkingen over de leveranciers van de toetsetiketten; `verschil` = route a min route b in procentpunten; `tabellen.json` = één tabel per routenaam.

### Wijzigingen in het contract na de code review (01-11-2026, bindend)

Op aanwijzing van de review (bmad-build step-04); drie bestaande tests zijn daarop aangepast (reden in de specfile):
- `toets.voorinvulling`: `keurmerken` bevat alleen de codes die het model teruggaf (een ontbrekende code blijft zonder voorinvulling); hoogstens het hele etiket + 16 tegels per aanroep, meer tegels in extra aanroepen, samengevoegd; een antwoord in een andere vorm → `fout: antwoord_ongeldig`.
- `bevries.VERPLICHT` = 11: de 8 van meetregels §6 plus `referentieplaatjes` (hash over de inhoud van elk beeld in de index), `instellingen` (`maat`, `tegel`, `overlap`, `drempel`, `beoordelaar_model`, `k4aa_budget`) en `code` (vult `bevries` zelf). Nieuw: `lees_run`, `schrijf_run`, `laatste`, `bevroren_instellingen`.
- Run-bestanden (D+A, D, K4-aa) zijn `{"status": "gestart"|"voltooid"|"afgebroken", "reden"?, "etiketten": {doc: [codes] | {"fout": klasse}}}`; `tel_proef` weigert een run die niet voltooid is, en een afgebroken run met reden `geen_zdr` is de zdr-stop.
- `tel_proef`: Nutri-Score gevonden alleen als alle gemelde letters in de ware verzameling zitten (meetregels §3, bijgewerkt); `corrigeer` valideert de correcties.
- `kosten.Bewaker(post, raming, factor=1.5, grootboek=None)`: met een grootboek telt de grens per post over processen en herstarts; `controleer_start` rekent het al uitgegeven bedrag mee.
- `openrouter.Client` weigert een model zonder tarief in `kosten.TARIEF`.
- `echt.valsplit(..., overgeslagen=None)`, `echt.schoon(vakjes)`; `validatie-waarheid.json` = `{doc: {"aanwezig": [...], "onzeker": [...]}}`.
- `herken.tegels`: `ValueError` tenzij `0 <= overlap < tegel`.
- Invulserver: tussenstand houdt de status; vreemde Host of Origin → 403. Pagina: opslagen één voor één; `b`/opslaan alleen met een keuze bij alle 7 keurmerken en Nutri-Score.
- Nieuwe tests: `tests/test_review_20261101.py`.

### Testbestanden (rode fase)

| bestand | tests | CAP |
|---|---:|---|
| `tests/test_cap01_scheiding.py` | 20 | 1 |
| `tests/test_cap02_kandidaten.py` | 15 | 2 |
| `tests/test_cap03_invulpagina.py` | 34 | 3 (server, `uitslag`) |
| `tests/test_cap03_invulpagina_browser.py` | 12 | 3 (browser) |
| `tests/test_cap04_generator.py` | 10 | 4 |
| `tests/test_cap05_echt.py` | 12 | 5 |
| `tests/test_cap06_training.py` | 10 | 6 |
| `tests/test_cap07_herkenning.py` | 35 | 7 |
| `tests/test_cap08_beoordelaar.py` | 15 | 8 |
| `tests/test_cap09_telling.py` | 47 | 9 |
| `tests/test_cap10_draaiplan.py` | 4 | 10 |
| `tests/test_cap11_bevriezing.py` | 7 | 11 |
| `tests/test_cap12_k4aa_runner.py` | 12 | 12 |
| `tests/test_cap13_licenties.py` | 47 | 13 |
| `tests/test_cap14_uitgaven.py` | 9 | 14 |
| `tests/test_cap15_beelden.py` | 30 | 15 |
| `tests/test_openrouter.py` | 47 | gedeelde client (2, 5, 8, 14; randvoorwaarden §1–2) |
| **totaal** | **366** | |

Gemarkeerd: `lokaal` (CAP-1 echte invoer reproduceert de tabel; CAP-13 echte omgeving zonder overtredingen), `zwaar` (CAP-6 snelheidsmeting en rooktest), `browser` (12). Ze importeren hun module vóór een eventuele overslag, dus ze zijn nu ook rood.

**Rode run (31-10-2026, 23:5x):**

```
cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev pytest -q -p no:cacheprovider
366 errors in 3.44s
```

Redenen (gegroepeerd): 362 × `ModuleNotFoundError` (17 nog te bouwen modules) en 4 × `FileNotFoundError: DRAAIPLAN.md`. Geen enkele test faalt om een andere reden.

**Nog niet gedekt (bewust):** of de snelheidsmeting echt op MPS draait (de test controleert alleen positieve getallen en de verwachte duur); het tonen van de ingezoomde hinttegels op de pagina (cosmetisch).

## Stap 5 — Validatie en afronding

- **Voorwaarden:** spec met toetsbare criteria, testframework opgezet (`pyproject.toml`, `tests/conftest.py`), omgeving draait (`uv sync --group dev`). Voldaan.
- **Dekking:** elke success-regel van CAP-1 t/m CAP-15 heeft minstens één test; de dekkingsgaten uit de eerste ronde (scheiding wegschrijven, voorlabels en rapport, tabel met spreiding/tijd/kosten/verschil/`main`, `ssh` en de groottegrenzen, model laden) zijn in een tweede ronde gesloten.
- **Rood om de juiste reden:** zie de rode run. Geen placeholders; elke test toetst verwacht gedrag.
- **Geen achtergebleven browsers of sessies;** tijdelijke JSON-samenvattingen staan in `/tmp` (buiten de repo, alleen werkgeheugen van de workers).
- **Klantdata:** alleen verzonnen GLN/GTIN en gegenereerde beelden in de tests; de twee `lokaal`-tests lezen echte invoer uitsluitend buiten de repo.
- **Volgende stap:** `bmad-build` op SPEC.md met deze checklist als bindend contract; groen maken zonder een test aan te passen om hem te laten slagen (een test wijzigen mag alleen bij een aantoonbare testfout, met reden in het buildverslag).

## Ronde 2 (besluiten Friso 01-11-2026)

Bron: commit `c86a067` (spec-update na `bmad-review`, 25 bevindingen doorgevoerd). Alleen de criteria die daarin veranderden: CAP-13 (randvoorwaarden §4), CAP-6 (trainingsset §5), CAP-9 (meetregels §6–§7) en CAP-10 (DRAAIPLAN stap 10, 14–15, licentieblok). De rest van deze checklist blijft bindend.

### Stap 1–3 — context, modus en strategie

- **Werkwijze:** `bmad-testarch-atdd` in Create-modus, headless (geen mens; voor de hand liggende keuzes zelf gemaakt en hieronder vastgelegd). Uitvoeringsmodus **sequentieel**: geen worker-subagents; de hoofddraad schreef de tests zelf (toegestaan door de opdrachtgever). Worker B (E2E) is niet van toepassing: puur backend.
- **Stack:** `backend` (Python 3.12, pytest via `uv`). Uitgangstoestand: 418 tests, alles groen behalve `test_cap13_lokaal_echte_omgeving_zonder_overtredingen` (torch `… AND BSL-1.0 AND …`, regex `Apache-2.0 AND CNRI-Python`).
- **Gelezen:** SPEC.md, meetregels §6–§7, randvoorwaarden §4, trainingsset §5, `tel_proef.py`, `licenties.py`, `train.py`, `bevries.py`, `uitslag.py`, `beelden.veilig_doel`, `DRAAIPLAN.md`, de bestaande tests en kennisfragmenten `test-quality`, `data-factories`, `test-levels-framework`, `test-healing-patterns` (kernregels; de rest is Playwright/JS-gericht).
- **Generatiemodus:** AI-generatie (backend, geen opname).
- **Niveaus en prioriteit:** CAP-13 unit, P0. CAP-6 unit + opdrachtregel (training gemonkeypatcht), P1. CAP-9 unit (`nakijklijst`) + integratie (`main` met bestanden, twee echte processen met verschillende `PYTHONHASHSEED`), P0. CAP-10 documenttest, P2.
- **Bewuste afwijking van de stapbestanden:** geen `test.skip()` (Playwright-patroon); de tests draaien rood, want de keten vraagt een rode run met aantallen.

### Aanvullingen op het interfacecontract (bindend)

**`licenties.py`** — `beoordeel("BSL-1.0") == beoordeel("CNRI-Python") == "toegestaan"` als exacte SPDX-id, voor elk pakket (geen uitzondering per pakketnaam); ze staan niet onder "ruim". `BUSL-1.1`, `BSL-1.1`, `CNRI-Jython` en vrije tekst als "Business Source License 1.1" blijven niet toegestaan. Samengesteld volgens de bestaande regel (AND = zwaarste deel, OR = lichtste): torch 2.15.0 (`Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause AND BSL-1.0 AND ISC AND MIT AND Zlib`) → `"ruim"` (door ISC en Zlib) en dus vermeld onder `ruim`; regex → `"toegestaan"`.

**`train.py`** — `config(fase, maat, dataset, uit, epochs, seed, start=None, besluit=None)`: maat `S`/`M`/`L` zonder besluit (`None`, leeg of alleen spaties) → `ValueError` waarvan de melding "besluit" noemt; met besluit → `cfg["besluit"]` = de verwijzing (komt zo ook in `train-resultaat.json`, dat de config bevat). Maat `N` mag zonder besluit; `cfg["besluit"]` is dan `None`. `snelheid(maat, dataset, uit, iteraties=50, tegels_per_epoch=5000, epochs=20, besluit=None)` hanteert dezelfde regel en weigert vóór enig werk (geen map, geen dataset lezen). Opdrachtregel: `train` en `snelheid` krijgen `--besluit "<verwijzing>"`; `train --maat S` zonder `--besluit` start niets en eindigt niet-nul (`ValueError` of exitcode ≠ 0).

**`tel_proef.py`** (meetregels §6–§7):
- `STEEKPROEF_SEED = 20261101` (moduleconstante; geen opdrachtregeloptie). `--seed` blijft alleen voor de leveranciersbootstrap en verandert lijst en sleutel niet.
- `nakijklijst(uitslag, routes) -> (lijst, sleutel)` (geen `seed`-parameter meer). Paren die tellen: (bevestigd etiket, keurmerk uit `KEURMERKEN8`) met oordeel aanwezig/afwezig, Nutri-Score als groep met leesbare letters (zelfde indeling als `uitslag.per_keurmerk`). Een route stemt overeen als ze bij "mét" meldt (Nutri-Score: `_ns_goed`) en bij "zonder" niet meldt; een fout of ontbrekend record = geen melding. **Verschil** = minstens één route wijkt af. **Steekproef** = per keurmerk en kant de paren waar alle routes overeenkomen, `ceil(10%)`, dus minstens 1 bij een niet-lege kant en 0 bij 0; getrokken uit de gesorteerde paren, onafhankelijk van de volgorde van de invoer en van `PYTHONHASHSEED`. De routes die tellen zijn de `--route`-routes; de informatieve K4-aa-run met alle referenties wordt niet als `--route` meegegeven (afgedwongen in DRAAIPLAN stap 14, documenttest). Overgeslagen: een aparte optie voor informatieve routes; toevoegen als die tabel in dezelfde run nodig is.
- Elke regel heeft precies de velden `nr`, `doc_id`, `keurmerk`, `waarheid` (Friso's eerdere oordeel zoals in `uitslag.json`); `nr` = 1…n in lijstvolgorde; verschillen en steekproef door elkaar geschud (deterministisch); geen routenaam en geen herkomstveld. `sleutel` = `{str(nr): "verschil" | "steekproef"}` voor precies de regels van de lijst.
- `main` (stap 14) schrijft `<uit>/nakijklijst.json`, `<uit>/niet-voor-nakijker/nakijk-sleutel.json`, `<uit>/niet-voor-nakijker/verschil.json` (niet meer in `<uit>` zelf) en `<uit>/nakijk-sha256.json` = `{"nakijklijst.json": sha256, "nakijk-sleutel.json": sha256}` over de bytes van die bestanden. Overgeslagen: de hashes bij het nakijken controleren; vastleggen is wat de spec vraagt.
- `--nakijken <pad>` (vervangt `--correcties`, dat vervalt): `{str(nr): oordeel}` voor **elke** regel van de lijst; Nutri-Score-regel: lijst letters A–E of `"onleesbaar"`, andere: `"aanwezig"`/`"afwezig"`/`"onzeker"`. Ontbrekende regel, regel buiten de lijst of ongeldige waarde → `main` geeft niet-nul terug en schrijft geen `tabellen-na-nakijken.*`. Correcties gelden voor alle routes gelijk (zelfde toepassing als het oude `corrigeer`).
- **Fout in de waarheid** = elk oordeel dat afwijkt van de eerdere waarheid: ook naar `onzeker`/`onleesbaar`; bij Nutri-Score elke andere letterverzameling (volgorde telt niet: `["B","A"]` = `["A","B"]`).
- `tabellen-na-nakijken.json`: per route per keurmerk (`KEURMERKEN8`) ook `"steekproef": {"met": {"nagekeken", "fouten", "bovengrens"}, "zonder": {…}}` (bovengrens = Wilson-bovengrens van fouten/nagekeken, `None` bij 0 nagekeken; in de md "–"), voor alle routes gelijk; en `"gevoeligheid"` = het besluit (`automatisch` / `mens bevestigt` / `te weinig voorbeelden`) als de steekproefbovengrens per kant in het nadeel van de route op de overeenkomende paren wordt toegepast (informatief; de test eist alleen dat een bovengrens van ±66% een "automatisch" onmogelijk maakt). De md noemt de steekproef en de gevoeligheid.
- **Besluitregel:** minstens één fout in de steekproef van keurmerk K → besluit voor K in alle routes `"mens bevestigt (voorlopig)"` en `<uit>/nakijklijst-ronde2-<K>.json` met alle overige overeenkomende paren van K (overeenkomend volgens de eerdere waarheid, min de steekproefregels; zelfde vier velden, `nr` 1…n). Geen fout → geen tweede-rondebestand. Voorrang: `te weinig voorbeelden` (op de gecorrigeerde waarheid) > `voorlopig` > tabel.
- `--nakijken-ronde2 <K>=<pad>` (herhaalbaar): antwoorden op de tweede ronde van K, zelfde vorm en volledigheidseis (anders niet-nul, geen tabellen ná nakijken); daarna geldt voor K het gewone besluit op de waarheid na beide rondes.
- `--ronde2-overgeslagen <K>` (herhaalbaar): de expliciete keuze om de tweede ronde van K niet na te kijken → `"mens bevestigt"` (definitief), tenzij te weinig voorbeelden. Zonder antwoord en zonder deze optie blijft K op "voorlopig".

**`DRAAIPLAN.md`** — het licentieblok ("tot dan geen training") vervalt; `MAAT=N`, en elke `--maat` anders dan `N`/`$MAAT` staat alleen in een commando met `--besluit` (raakt ook stap 9: de meting van S vervalt of krijgt een besluit); stap 10 zonder "herhaal met een andere maat" en met stoppunt 1 bij tekortschieten van N op de validatieset; stap 14 telt precies `--route D+A`, `D` en `K4-aa` en noemt steekproef, `niet-voor-nakijker`, `nakijk-sleutel.json`, `nakijk-sha256.json`; stap 15 noemt `nakijken.json`, `--nakijken`, "elke regel", `nakijklijst-ronde2-`, `--nakijken-ronde2`, `--ronde2-overgeslagen` en "voorlopig", zonder `--correcties` en zonder "Kijkt Friso niet na".

### Testlijst per criterium (`tests/test_besluiten_20261101.py`, 52 tests)

| criterium | tests | aantal |
|---|---|---:|
| CAP-13 BSL-1.0/CNRI-Python toegestaan | `test_cap13_bsl_1_0_en_cnri_python_zijn_toegestaan` (5 uitdrukkingen), `…_torch_samengesteld_…_even_ruim`, `…_torch_regex_en_elk_ander_pakket_…` | 7 |
| CAP-13 grens blijft | `test_cap13_busl_bsl_1_1_en_cnri_jython_blijven_verboden` (6; al groen, bewaakt een te ruime bouw) | 6 |
| CAP-6 maat N / besluit | `test_cap06_andere_maat_dan_n_zonder_besluit_wordt_geweigerd` (S/M/L × None/""/spaties), `…_zonder_besluit_parameter_weigert_config_s`, `…_maat_n_zonder_besluit_mag_en_een_besluit_wordt_vastgelegd`, `…_snelheidsmeting_…_weigert_voor_het_werk` (3), `…_opdrachtregel_train_vraagt_besluit…`, `…_opdrachtregel_snelheid_geeft_besluit_door` | 16 |
| CAP-9 steekproef en sleutel | `test_cap09_steekproef_seed_ligt_vast_in_de_telcode`, `…_nakijklijst_verschillen_plus_steekproef_per_keurmerk_en_kant`, `…_regels_gelijk_van_vorm_geschud_en_zonder_herkomst`, `…_hangt_niet_af_van_de_volgorde_van_de_invoer`, `…_zelfde_trekking_in_elk_proces` (2 processen, PYTHONHASHSEED 1/4242), `…_opdrachtregeloptie_seed_verandert_de_steekproef_niet`, `…_sleutel_en_verschil_in_aparte_map_met_sha256_vooraf` | 7 |
| CAP-9 nakijken en besluitregel | `test_cap09_nakijken_vraagt_een_oordeel_voor_precies_elke_regel` (2), `…_oude_correctievorm_wordt_niet_meer_aangenomen`, `…_correcties_gelden_voor_alle_routes_gelijk`, `…_fout_is_elk_afwijkend_oordeel_…`, `…_steekproef_apart_gerapporteerd_met_wilson_bovengrens_en_gevoeligheid`, `…_fout_in_steekproef_geeft_voorlopig_en_een_tweede_ronde_…`, `…_tweede_ronde_nagekeken_geeft_het_gewone_besluit`, `…_tweede_ronde_vraagt_ook_een_oordeel_voor_elke_regel`, `…_tweede_ronde_uitdrukkelijk_overgeslagen_geeft_mens_bevestigt`, `…_te_weinig_voorbeelden_gaat_voor_voorlopig` | 11 |
| CAP-10 draaiplan | `test_cap10_licentieblok_is_vervallen`, `…_maat_n_en_nergens_een_andere_maat_zonder_besluit`, `…_stap_10_…`, `…_stap_14_…`, `…_stap_15_…` | 5 |

Verzonnen werelden met nagerekende uitkomst. Steekproefwereld: 6 verschillen en 42 steekproefregels (o.a. GD mét 11 → 2, GD zonder 29 → 3, EU mét 1 → 1, Nutri-Score zonder 31 → 4: `ceil`, niet afronden); de verschillen en strata zijn nagerekend met de bestaande `nakijklijst` en `uitslag.per_keurmerk`. Telwereld: 20 mét GD (+ Nutri-Score A, B) en 40 zonder; D+A mist GD op één etiket; vóór nakijken GD D+A "mens bevestigt", D en K4-aa "automatisch" (nagerekend met `tel`).

### Bestaande tests aangepast aan het nieuwe contract

| test | wijziging | reden |
|---|---|---|
| `tests/test_cap09_telling.py::test_cap09_blinde_nakijklijst_zonder_routenamen` | `nakijklijst(uitslag, routes)` zonder `seed`, pakt `(lijst, sleutel)` uit en toetst de verschilregels via de sleutel | seed staat vast in de code; de lijst bevat nu ook de steekproef |
| `tests/test_cap06_training.py::test_cap06_configuratie_legt_fase_maat_seed_epochs_en_mappen_vast` (2) | maat S met `besluit=`, en `cfg["besluit"]` getoetst | S zonder besluitverwijzing wordt geweigerd |
| `tests/test_review_20261101.py::test_correcties_voor_een_keurmerk_en_nutriscore` → `test_nakijken_voor_een_keurmerk_en_nutriscore` | eerst stap 14 (lijst uitgeven), dan `--nakijken` met `{nr: oordeel}` voor elke regel; zelfde verwachte tabellen | `--correcties` (per doc_id) vervalt |
| `tests/test_review_20261101.py::test_ongeldige_correcties_geven_geen_tabellen` (4) → `test_ongeldig_nakijken_geeft_geen_tabellen_na_nakijken` (4) | ongeldige waarden in de nieuwe vorm (Nutri-Score als keurmerkoordeel, letter F, letters bij een keurmerk, "ja"); toetst dat `tabellen-na-nakijken.json` ontbreekt | regels worden per nummer aangewezen (onbekend etiket/keurmerk kan niet meer); de tabellen van vóór nakijken bestaan al uit stap 14 |

Ongewijzigd en nu rood tot de bouw: `tests/test_cap13_licenties.py::test_cap13_lokaal_echte_omgeving_zonder_overtredingen` (het bewijs op de echte omgeving).

### Rode run (01-11-2026, 09:15)

```
cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev pytest -q -p no:cacheprovider
55 failed, 415 passed, 18 warnings in 63.09s
```

470 tests (418 + 52 nieuw; de vervangen tests in `test_review_20261101.py` houden hun aantal). Geen errors. Per bestand rood: `test_besluiten_20261101.py` 46, `test_review_20261101.py` 5, `test_cap06_training.py` 2, `test_cap09_telling.py` 1, `test_cap13_licenties.py` 1 (lokaal). Redenen, allemaal ontbrekend nieuw gedrag:
- licenties: `beoordeel` geeft `onbekend` voor BSL-1.0/CNRI-Python (6×), `controleer` meldt torch/regex als overtreding (2×, waarvan 1 de lokaal-test);
- training: `config()` kent `besluit` niet (11× `TypeError`), S wordt aangenomen (`DID NOT RAISE`, `KeyError: 'besluit'`), `snelheid` begint aan het werk (3× `FileNotFoundError` op de dataset in plaats van een weigering), de opdrachtregel start S zonder besluit en kent `--besluit` niet;
- telling: `STEEKPROEF_SEED` ontbreekt, `nakijklijst` geeft nog één lijst (4× "too many values to unpack"), `niet-voor-nakijker/nakijk-sleutel.json` ontbreekt (13×), `--correcties` wordt nog aangenomen, `--nakijken` bestaat niet (5× `SystemExit: 2`);
- draaiplan: oude tekst (licentieblok, `--maat S` in stap 9, "Herhaal met een andere maat", geen steekproef in stap 14, geen `--nakijken` in stap 15).

Al groen vóór de bouw (6): de grenzen BUSL-1.1, BSL-1.1, CNRI-Jython, "MIT AND BUSL-1.1", "Apache-2.0 AND CNRI-Jython", "Business Source License 1.1" — bewaking tegen een te ruime regel, moet groen blijven. Testfouten gevonden en hersteld vóór deze run: een K4-aa-record in de steekproefwereld liet Groene Punt weg (zou een zevende verschil geven); de volgordetest was zonder het nieuwe retourformaat vacuüm groen en pakt nu `(lijst, sleutel)` uit.

### Validatie en volgende stap

- Voorwaarden voldaan (spec-update gereviewd, framework en omgeving aanwezig); elke gewijzigde regel uit `c86a067` voor CAP-6/9/10/13 heeft minstens één test; geen placeholders; geen browsers of tijdelijke bestanden buiten `tmp_path`; alleen verzonnen GLN's/GTIN's; `~/logo-meetset-20261018/` niet gelezen.
- Niet gedekt (bewust): de exacte formule van de gevoeligheid (alleen de richting is getoetst); het tekortschieten van N wordt uit de validatietabel afgelezen, zonder eigen gereedschap (alleen de vermelding in DRAAIPLAN stap 10 is getoetst); correctiepercentage-logging (niet veranderd in `c86a067`).
- **Volgende stap:** `bmad-build` op deze sectie als bindend contract; groen maken zonder een test aan te passen, behalve bij een aantoonbare testfout (met reden in het buildverslag).
