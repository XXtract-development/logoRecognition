---
title: 'Logo-scanpijplijn robuuster en meetbaar'
type: 'bugfix'
created: '2026-10-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 31ff6273c2b3a8ef5186b99a05f94feaa96d915b
context:
  - '{project-root}/_bmad-output/specs/spec-logo-scan-robustness/SPEC.md'
---

<frozen-after-approval reason="opdracht van de coördinator: onderzoek acc-top15-logoherkenning-slecht-20261012, acties 2, 4 en 6; kernel in _bmad-output/specs/spec-logo-scan-robustness/SPEC.md">

## Intent

**Problem:** De scanpijplijn bedt lege uitsneden in (één lege referentie gaf 23 treffers met zekerheid 1,0), stap 1 faalt met een 503 zonder log en zonder dat per scan bewaard wordt wat het visuele model voorstelde, en `referenceVersion` is altijd `unknown` terwijl een drempel van 0,99 elk item `twijfelachtig` maakt — `automatisch` is onbereikbaar en elke meting vertekend.

**Approach:** Vijf afgebakende reparaties in ml-service en API (CAP-1..CAP-5 in de kernel-spec): lege uitsneden vóór `classify_crop` afwijzen met een expliciete uitkomst; de visuele lokalisatie laat zijn foutklasse zien in log en 503; de localize-respons telt voorstellen en de API bewaart `stap1` in de rij `logo_scans` (nooit in het antwoord); de poolversie vult `referenceVersion`; de pijplijn stuurt geen `confidence_threshold` meer.

## Boundaries & Constraints

**Always:** `logoResults.v1.json` en zijn sha256 ongewijzigd; `stap1` alleen in de databaserij, nooit in het GET-antwoord; `validateLogoResults` draait op het object zonder `stap1`. Eén gedeelde "leeg"-regel (`reference_content.has_visible_content`, centrale 80 %, kanaalbereik > 8, op wit gecomponeerd). Uitsneden mét inhoud byte-gelijk gedrag. Fail-open bij een fout in de blank-controle (één waarschuwing). Geen sleutel, `Bearer`-token, URL met sleutel of base64-beeld in log of antwoord; foutboodschap in het log ≤ 200 tekens, geen `exc_info`. Engelse veldnamen in het ml-contract en logs (`proposals.raw/refined/ghs`, `blank_crops`, foutklassen), Nederlandse in `logo_scans` (`stap1.voorstellen/verfijnd/ghs/vakjes/fase/fout`). Bestaande tests blijven groen, behalve de in de kernel benoemde die mee veranderen.

**Never:** Geen Prisma-migratie, geen nieuwe kolom, geen `prisma migrate` tegen welke omgeving dan ook; geen containeracties; geen wijziging aan `legacy-detect.ts` (blijft 0,99 sturen), `gs1-mapping.json`, drempelwaarden, gate, zoekruimte, 80-MP-grens; geen minimumafmeting voor uitsneden; geen hermeting van de poolversie in de worker; geen commit/push door de implementatieagent.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Lege uitsnede (AC-1.1, 1.5) | classify met wit/zwart/éénkleurig vakje | `UNKNOWN`, 0.0, `embedding`, `uncertain=true`, `evidence={"reason":"blank_crop"}`; `classify_crop` niet aangeroepen; log `blank_crops=1` | n.v.t. |
| Uitsnede met teken (AC-1.2) | dunne lijn, ook gekleurd of op zwart | bestaande keten, `blank_crops=0` | n.v.t. |
| Blank-controle gooit (AC-1.4) | helper raise | waarschuwing, uitsnede gaat de bestaande keten in, 200 | fail-open, ook strict |
| Visuele fout (AC-2.1, 2.2) | `visual_proposals` gooit X | `logger.error("Visual localization failed", extra={error_class, error_type, error≤200})`; 503 `Visual localization unavailable (<klasse>)` | klasse per tabel in kernel AC-2.2 |
| Strikte HTTPException (AC-2.3) | 504/503/499 uit de runtime | ongewijzigd doorgegeven, wél logregel `error_class=http_<status>` | passthrough |
| Lek (AC-2.4) | boodschap met `Bearer …`, `data:image/…;base64,…`, >200 tekens | geredigeerd en afgekapt in log; niets ervan in antwoord | n.v.t. |
| Visuele tellingen (AC-3.1) | 1 voorstel, 2 verfijnd, 1 GHS | `proposals={"raw":1,"refined":2,"ghs":1}`; 0 voorstellen → alle 0; templateroute → `proposals: null` | n.v.t. |
| Geslaagde scan (AC-3.2, 3.4) | localize geeft `proposals` | rij `logo_results.stap1={voorstellen,verfijnd,ghs,vakjes}`; GET zonder `stap1`, schema-geldig (Redis- én tabelpad, oude rij zonder `stap1`) | n.v.t. |
| Ml zonder `proposals` (AC-3.2) | oudere ml-image | `{voorstellen:null,verfijnd:null,ghs:null,vakjes:n}` | n.v.t. |
| Lege lokalisatie (AC-3.2) | 0 vakjes | `vakjes:0`, classify niet aangeroepen, scan `done` | n.v.t. |
| Mislukte scan (AC-3.3) | localize `MLServiceError` detail `… (proposal_parse_error)` | `stap1={fase:"lokalisatie",fout:"proposal_parse_error"}`; `MLServiceError` zonder klasse → `ml_status_<n>`; `Error` → boodschap ≤ 100 tekens | reden blijft `recognition_unavailable` |
| Classify faalt (AC-3.3) | classify `MLServiceError` 503 | `stap1={fase:"classificatie",fout:"ml_status_503",voorstellen,verfijnd,ghs,vakjes}` | idem |
| Onbruikbare regio's / malformed (AC-3.3) | dubbele vakjes; classify-antwoord past niet | `fout:"unusable_regions"` (fase lokalisatie) / `fout:"malformed_results"` (fase classificatie), tellingen erbij | idem |
| Poolversie (AC-4.1–4.4) | staat met `referenceVersion` | item `bewijs.referentieversie` en top-level = poolversie; GHS-detectie houdt eigen versie, top-level unie gesorteerd; mislukte scan ook poolversie; database uit → `unknown` | n.v.t. |
| Geen drempel (AC-5.1) | pijplijn-classify | aanroep zonder `confidence_threshold` | n.v.t. |

</frozen-after-approval>

## Code Map

Werkmap: `/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/logo-scan-robustness` (tak `fix/logo-scan-robustness`). Raak de hoofdmap niet aan.

- `apps/ml-service/app/services/reference_content.py` -- `assert_reference_content(image)`: compositie op wit, centrale 80 %, `getextrema()` bereik > 8. Splits in `has_visible_content(image) -> bool` (zelfde regel) en laat `assert_reference_content` die aanroepen. Enige definitie van "leeg".
- `apps/ml-service/app/api/artwork.py` --
  - r. 1088-1105 `classify_artwork` bouwt `regions` (`crop` = BGR-slice van `cv2.imdecode(IMREAD_COLOR)`); r. 1122-1146 lus roept `classify_crop` aan. Voeg vóór die aanroep de blank-controle toe: alleen voor `ndim==3 and shape[2]==3 and dtype==uint8`; PIL via `classification._to_pil(crop)` (BGR→RGB); `import app.services.reference_content as reference_content` en `reference_content.has_visible_content(...)` aanroepen via het módule-attribuut (tests monkeypatchen het). Bij `False`: `outcome = {"t3777_code": CLASSIFY_UNKNOWN_CODE, "confidence": 0.0, "method": "embedding", "uncertain": True, "evidence": {"reason": "blank_crop"}}` en `classify_crop` overslaan (ook `_strict_checkpoint` blijft). Bij uitzondering: `logger.warning("Blank-crop check failed; classifying anyway", extra={"error": str(exc)[:200]})` en doorgaan. Tel `blank_crops` en zet hem in `extra` van `logger.info("Artwork classification complete", …)` (r. 1204-1207). `CLASSIFY_UNKNOWN_CODE` komt uit `app.services.classification`.
  - r. 657-659 `LocalizeResponse`: voeg `proposals: Optional[Dict[str, int]] = None` toe.
  - r. 781-820 visuele route: tel `raw=len(proposed)`, `refined=len(refined)`, `ghs=len(ghs_detections)`; return `LocalizeResponse(detections=…, truncated=False, proposals={…})`. Vervang de catch-all (r. 815-820): `except HTTPException as exc: _log_visual_failure(exc, f"http_{exc.status_code}"); raise` en `except Exception as exc: cls = _visual_error_class(exc); _log_visual_failure(exc, cls); raise HTTPException(503, f"Visual localization unavailable ({cls})") from exc`. Nieuwe modulehelpers: `_visual_error_class(exc) -> str` (mappingtabel in volgorde van kernel AC-2.2; `httpx.TimeoutException` vóór `HTTPStatusError` vóór `HTTPError`; `template_library_empty` als "reference library is empty" in de boodschap; `runtime_not_ready` bij "not ready"; `proposal_capacity` bij "exceeds capacity"; `proposal_response_size` bij "exceeds size limit"; `proposal_image_bounds` bij "Proposal image exceeds bounds"; `refinement_error` bij "refinement"; `proposal_parse_error` voor overige `ValueError`/`KeyError`/`TypeError`; anders `f"unexpected_{type(exc).__name__}"`) en `_redact(text) -> str` (regex `Bearer\s+\S+` → `Bearer [redacted]`, `data:image/[\w+.-]+;base64,\S+` → `data:image/[redacted]`, daarna `[:200]`). `_log_visual_failure` logt `logger.error("Visual localization failed", extra={"error_class": cls, "error_type": type(exc).__name__, "error": _redact(str(exc))})` — géén `exc_info`. `httpx` is al een afhankelijkheid (import lokaal in de helper of bovenin).
  - r. 697 `localize_artwork`: templateroute retourneert ongewijzigd (zonder `proposals` → `null`).
- `apps/ml-service/app/services/classification.py` -- `_to_pil` (r. 83) en `CLASSIFY_UNKNOWN_CODE` (r. 64) hergebruiken; `classify_crop` zelf niet wijzigen.
- `apps/ml-service/tests/test_artwork_strict_runtime.py` -- `image_b64()` (r. 67-70) levert een effen wit 20×20-beeld dat nu als `blank_crop` zou eindigen; teken er een centraal zwart streepje in (bijv. `ImageDraw.line((4,10,16,10), width=2)`) zodat alle bestaande strict-tests de echte keten blijven raken. r. 545: verwacht `{"detections": [], "truncated": False, "proposals": {"raw": 0, "refined": 0, "ghs": 0}}`.
- `apps/ml-service/tests/test_logo_scan_robustness_atdd.py` -- ATDD (RED, 24 failed / 3 passed); niet versoepelen.
- `apps/api/src/services/ml-client.ts` -- r. 404-425 `localizeArtwork` return-type: voeg `proposals?: { raw: number; refined: number; ghs: number } | null` toe. `MLServiceError` (r. 867) heeft `statusCode` en `detail`. Niets anders.
- `apps/api/src/services/pipeline/gs1-block.ts` -- `BuildInput` (r. 40-44): `referenceVersion?: string | null`. r. 65: `refs` = unie van `input.referenceVersion` (indien truthy) en detectieversies, gesorteerd. r. 71: `resolve(code, { modelVersion, referenceVersion: d.reference_version ?? input.referenceVersion ?? null })`. r. 101: `referentieversie: d.reference_version ?? input.referenceVersion ?? null`. r. 127 ongewijzigd (`refs.join(',') || UNKNOWN`). `LogoItem.bewijs.referentieversie` blijft `string | null`.
- `apps/api/src/services/pipeline/logo-scan-flow.ts` --
  - `LogoScanState` (r. 62-77): `referenceVersion?: string` en `stap1?: Stap1`. Exporteer `type Stap1 = { voorstellen?: number | null; verfijnd?: number | null; ghs?: number | null; vakjes?: number; fase?: 'lokalisatie' | 'classificatie' | 'beeld' | 'wachtrij' | 'resultaat'; fout?: string }`.
  - `submitLogoScan` r. 129-133 `base`: `referenceVersion: referenceVersion || undefined`.
  - `stateFromRow` (r. 189-196): `referenceVersion: row.referenceVersion ?? undefined`; `const { stap1, ...logoResults } = (row.logoResults ?? {}) as …` → `logoResults` zonder `stap1`, `stap1` apart (alleen als de rij `logoResults` had).
  - `failedState` (r. 228-236): geef `referenceVersion: state.referenceVersion` mee aan `buildLogoResults`.
  - `recognize` (r. 249-288): houd `stap1` bij: na localize `stap1 = { voorstellen: p?.raw ?? null, verfijnd: p?.refined ?? null, ghs: p?.ghs ?? null, vakjes: crops.length }` (bij ontbrekende `proposals` null-tellingen; `vakjes` pas na de filterstap, bij "unusable regions" `localized.detections.length`). Fouten krijgen fase+fout: maak `class RecognizeError extends Error { constructor(message, public stap1: Stap1) }` of hang `stap1` als eigenschap aan de gegooide fout; localize-fout → `fase:'lokalisatie'`, classify-fout → `fase:'classificatie'`, 'Localization returned unusable regions' → `fout:'unusable_regions'`, 'Classification response/evidence is malformed' → `fout:'malformed_results'`; voor een `MLServiceError`-achtige fout (duck-type: `typeof err.statusCode === 'number' && typeof err.detail === 'string'`, want de test mockt de module) `fout` = match van `/\(([a-z0-9_]+)\)$/` op `detail`, anders `ml_status_${statusCode}`; andere `Error` → `message.slice(0, 100)`. Verwijder `confidence_threshold: 0.99` uit de classify-aanroep (r. 274). Retourneer `stap1` naast `results`.
  - `runLogoScanJob` (r. 290-333): geef `referenceVersion: state.referenceVersion` aan `buildLogoResults`; `validateLogoResults(logoResults)` vóór het toevoegen van `stap1`; `saveOutcome(scanId, { status: 'done', processingTimeMs, logoResults: { ...logoResults, stap1 } })` en `finish({ status: 'done', processingTimeMs, logoResults, stap1 })` (Redis-staat: `stap1` apart veld, `logoResults` schoon). In de catch: `stap1` uit de fout (`err.stap1`) of `{ fase, fout }` afgeleid: `TimeoutError` → `{fase:'wachtrij'|'lokalisatie', fout:'timeout'}` (kies `wachtrij` als `started >= deadline`, anders `lokalisatie`), `InvalidImageError` → `{fase:'beeld', fout:'invalid_image'}`, `ResultInvalidError` → `{fase:'resultaat', fout:'result_invalid'}`, overig → `{fase:'lokalisatie', fout: message.slice(0,100)}`; `saveOutcome(..., logoResults: { ...failed.logoResults, stap1 })`, Redis-staat `stap1` apart.
  - `getLogoScan` r. 213-223 (lees-timeout): `saveOutcome` met `{ ...failed.logoResults, stap1: { fase: 'wachtrij', fout: 'timeout' } }`.
- `apps/api/src/services/pipeline/logo-scan-store.ts` -- `ScanRow` (r. 40-43): `referenceVersion?: string | null` toevoegen (de kolom bestaat al). Geen andere wijziging; `logoResults` blijft `unknown`.
- `apps/api/src/api/v1/logo-scans.ts` r. 102-103 -- GET retourneert alleen `{scanId,status,reason,logoResults,processingTimeMs}`; ongewijzigd laten (daardoor lekt `stap1` uit de staat nooit).
- `apps/api/src/__tests__/routes/logo-scans-stap1.atdd.test.ts`, `apps/api/src/__tests__/services/gs1-block-robustness.atdd.test.ts` -- ATDD (RED, 14 failed / 8 passed); niet versoepelen. Bestaande `gs1-block.test.ts`, `logo-scans-gs1.test.ts`, `logo-scans-dedupe.test.ts`, `logo-scans-flow.test.ts`: moeten groen blijven (hun mocks zonder `aggregate` geven `referenceVersion` undefined → `unknown`).
- `apps/api/src/api/legacy-detect.ts` r. 145 -- NIET wijzigen.

## Tasks & Acceptance

**Execution:**
- [x] `apps/ml-service/app/services/reference_content.py` -- `has_visible_content` toevoegen, `assert_reference_content` eromheen -- één regel voor "leeg" (AC-1.3)
- [x] `apps/ml-service/app/api/artwork.py` -- blank-controle in de classify-lus + `blank_crops` in het logevent -- AC-1.1, 1.4, 1.5
- [x] `apps/ml-service/app/api/artwork.py` -- `proposals` in `LocalizeResponse` en de visuele route; `_visual_error_class`, `_redact`, `_log_visual_failure`; nieuwe except-blokken -- AC-2.1–2.4, AC-3.1
- [x] `apps/ml-service/tests/test_artwork_strict_runtime.py` -- fixture met teken; r. 545 verwachting met `proposals` -- bestaande tests blijven de echte keten raken
- [x] `apps/api/src/services/ml-client.ts` -- `proposals` in het localize-retourtype -- AC-3.1
- [x] `apps/api/src/services/pipeline/gs1-block.ts` -- `referenceVersion` in `BuildInput`, per-detectie-terugval, top-level unie -- AC-4.2, 4.3, 4.5
- [x] `apps/api/src/services/pipeline/logo-scan-store.ts` -- `ScanRow.referenceVersion` -- AC-4.1
- [x] `apps/api/src/services/pipeline/logo-scan-flow.ts` -- staat met `referenceVersion`/`stap1`, `stateFromRow` stript, `recognize` telt en classificeert fouten, geen 0,99, `failedState` met poolversie -- AC-3.2–3.4, AC-4.1, 4.4, AC-5.1
- [x] Verificatie draaien (zie Verification) en de ATDD-bestanden groen krijgen zonder hun verwachtingen te versoepelen

**Acceptance Criteria:**
- Given een scan waarvan één vakje een leeg vlak is, when de ml-service classificeert, then krijgt dat vakje `blank_crop` zonder embedding en wordt de scan niet `partial` (AC-1.1, 1.6).
- Given een scan waarvan stap 1 faalt met een parsebare foutklasse, when de worker het opslaat, then staat `{fase:"lokalisatie", fout:"<klasse>"}` in de rij en bevat het GET-antwoord geen `stap1` en valideert het (AC-3.3, 3.4).
- Given een poolversie bij toelating, when een embedding-detectie zonder eigen versie wordt omgezet, then dragen item en top-level die poolversie en kan `validForReferenceVersion` erop slagen (AC-4.2, 4.3, 4.5).
- Given de pijplijn, when zij classify aanroept, then ontbreekt `confidence_threshold` (AC-5.1).

## Implementation Notes

- **Blank-controle als aparte helper `_is_blank_crop(crop)` in `artwork.py`** (niet inline in de lus): de kanaal/dtype-poort, de BGR→RGB-omzetting via `classification._to_pil` en de fail-open-waarschuwing zitten op één plek; de lus kiest alleen tussen `blank_crop`-uitkomst en `classify_crop`. `reference_content` wordt als module geïmporteerd en via het attribuut aangeroepen, zodat de monkeypatch in AC-1.4 werkt.
- **Fixture-verrassing:** het voorgestelde streepje `line((4,10,16,10), width=2)` viel buiten de centrale 80 % van het standaard 10×10-vakje van `payload()` — vier strict-tests kregen opeens `blank_crop` en raakten de keten niet meer. Het streepje staat nu op `(2,5,18,5)`, zichtbaar in zowel het 10×10-vakje als het hele 20×20-beeld.
- **Foutklasse in de API** via `foutklasse(err)` + `RecognizeError(message, stap1)`; `recognize` houdt één `stap1`-object bij en een lokale `fail(fase, err, fout?)` gooit met de tot dan toe bekende tellingen. `vakjes` staat eerst op `detections.length` (zodat `unusable_regions` het ruwe aantal draagt) en daarna op het gefilterde aantal.
- **Poolversie in `gs1-block.ts`:** `poolVersion = input.referenceVersion || null` — een lege string telt als onbekend, gelijk aan `submitLogoScan` dat `''` als `undefined` in de staat zet.
- **Vooraf bestaand, niet aangeraakt:** `tsc --noEmit` meldt twee Ajv-typefouten in `gs1-block.ts` (r. 52 `strict`, r. 56 `instancePath`) — bevestigd op de baseline met de gewijzigde regels weggestasht. De volledige ml-suite heeft 48 failures + 3 collectiefouten (ontbrekende modellen/data, read-only bestandssysteem in de sandbox); de verzameling is vóór en ná identiek (`comm` leeg).
- Linters (`ruff`, `black --check`, `isort --check-only`) uit de venv: schoon op de drie gewijzigde Python-bestanden.

## Spec Change Log

## Review Triage Log

Ronde 1 (12-10-2026): blind-hunter 11, edge-case-hunter 10, verification-gap 2 + 2. Alle verdicts na eigen controle in de code.

| Bron | Bevinding | Verdict en bewijs | Route |
|---|---|---|---|
| Blind1, Edge1, Edge10, VGap2 | `foutklasse`-regex `[a-z0-9_]` mist `unexpected_<Type>` | **high** — `artwork.py` zendt `type(exc).__name__`; regex getest: `(unexpected_OSError)` matcht niet → `ml_status_503`; precies de onverwachte fouten verdwijnen uit de meting | patch |
| Blind2, Edge2, VGap-other | timeout/result_invalid na geslaagde localize verliest tellingen; classify-timeout geboekt als `lokalisatie` | **medium** — `stap1` leeft in `recognize`; `withDeadline`-timeout is geen `RecognizeError` | patch |
| Blind3 | lees-timeout in `getLogoScan` altijd `wachtrij`, ook bij `running` | **medium** — r. 233 kijkt niet naar status | patch |
| Blind4, Edge3 | `'image no longer available'` als lokalisatiefout | **low** — gegooid vóór `recognize`; directe correctie | patch |
| Blind5 | `stap1.vakjes = crops.length` dood na de guard | **low** — guard dwingt gelijkheid af; deletie | patch |
| Blind6 | `blank_crop` loopt door `persist_crops` en schrijft lege PNG | **medium** — persist-blok r. 1250+ kijkt niet naar de uitkomst; lege vlakken in trainingsmateriaal | patch |
| Blind7 | passthrough-HTTPException op ERROR, ook 504 deadline | **false** — een verstreken deadline ís een mislukte scan; het onderzoek (F7) vroeg juist luid falen; AC-2.3 schrijft deze logregel voor | verworpen |
| Blind8, VGap-other | AC-1.6 alleen op `buildLogoResults` getoetst, niet door `recognize` | **medium** — filter r. 320-323 beslist `partial`; geen test stuurt een blank-resultaat erdoorheen | patch (test) |
| Blind9 | `versions.md` ontbreekt in de diff | **low** — hoort bij de commit (briefing stap 7), niet bij de implementatie-subagent | afgehandeld bij commit |
| Blind10 | `ScanRow.referenceVersion: string \| null` vs NOT NULL-kolom | **low** — schema r. 920; directe correctie | patch |
| Blind11 | top-level `referenceVersion`-formaat (unie) niet in consumentencontract | **medium** — `docs/02-architecture/api-specification.md:388` beschrijft nog "alleen detectieversies" | patch (doc) |
| Edge4 | `.catch(err => fail(…))` met `null` → TypeError in `foutklasse` | **low** — axios geeft nooit `null`; guard is `?? {}` (triviaal) | patch |
| Edge5 | 'Localization did not complete' als vrije tekst | **low** — andere paden hebben stabiele klassen; directe correctie | patch |
| Edge6 | worker-`failed`-handler zonder `stap1` | **defer** — die handler schrijft alleen Redis (`writeIfOpen`), nooit `saveOutcome`: gecrashte jobs komen al vóór deze wijziging niet in de rij; vooraf bestaand | defer |
| Edge7 | `d.reference_version ?? poolVersion` laat `''` door | **low** — `''` zou als versie in `bewijs` komen en versiecontrole laten falen; `\|\|` | patch |
| Edge8 | `_is_blank_crop` blokkeert de event loop (hele beeld tot 80 MP) | **medium** — PIL-composite synchroon op de loop, buiten `strict_blocking`; whole-image-pad bestaat (geen crops) | patch |
| Edge9 | sleutel zonder `Bearer`-prefix (`sk-or-…`) niet geredigeerd | **low** — OpenRouter-sleutels hebben die vorm; één regex | patch |
| VGap1 | timeout-rijen krijgen `stap1` dat geen test ziet | **medium** — GET stript `stap1`; de drie timeout-tests kijken alleen naar GET | patch (test) |

Ronde 1 doorgevoerd (12-10-2026): API-patches door de hoofdsessie (terugvalroute; de implementatie-subagent liep parallel en voerde de ml- en doc-patches door, dubbelingen verwijderd), extra tests voor blank-opslag en kale `sk-or-`-sleutel (mutatiecheck: 2 rood zonder reparatie). Volgorde-afhankelijke timeout-test gerepareerd (lokalisatietest wacht op zijn eigen aanroep).

Ronde 2 review (edge-case-hunter op de Nutri-Score-wijziging):

| Bron | Bevinding | Verdict en bewijs | Route |
|---|---|---|---|
| Edge-r2-1 | reserveclassifier geeft een Nutri-Score-letter 0,85–0,99 zeker terug (oude 0,99-lat maakte hem onzeker) | **medium** — `classify_crop` classifier-tak; op ACC slapend (`model_versions` leeg) maar strijdig met AC-5.3 | patch: `_mark_nutriscore_below_bar` ook op het classifier-resultaat |
| Edge-r2-2 | kale familiecode `NUTRISCORE` glipt langs de `NUTRISCORE_`-prefix | **low** — oogst-placeholder (`queue_harvest_nutriscore.py:86`); directe correctie | patch: prefix `NUTRISCORE` |
| Edge-r2-3 | geen test voor de classifier-tak | **medium** — zou punt 1 laten passeren | patch: test (mutatiecheck: rood zonder reparatie) |

Ronde 2 (12-10-2026, besluit productowner): AC-5.3 omgekeerd — Nutri-Score houdt in strikte runtime zonder drempel de vaste lat 0,99 (head-corroboratie, A2-vangnet, embedding-letter), `NUTRISCORE_STRICT_THRESHOLD` in `classification.py`. RED vóór de fix: 5 rood / 8 groen in `test_nutriscore_strict_corroboration.py`; daarna 13 groen. Het geval `(strikt, geen drempel)` uit `test_existing_or_sufficient_head_never_invokes_a2` vervalt (pinde het afgewezen gedrag).

## Verification

**Commands** (vanuit de worktree):
- `cd apps/ml-service && /private/tmp/claude-501/-Users-frisovanweelden-Documents-projects-logoRecognition/ddabd0a8-fd23-4297-9060-17b4da492a60/scratchpad/venv-ml/bin/python -m pytest tests/test_logo_scan_robustness_atdd.py tests/test_artwork_strict_runtime.py tests/test_artwork_proposals.py tests/test_artwork_template_refinement.py tests/unit/test_reference_content.py tests/unit/test_classify_gate_19_11.py tests/test_ghs_images.py tests/test_nutriscore_strict_corroboration.py tests/unit/test_nutriscore_a2_12_25.py -q` -- expected: alles groen (27 nieuwe + bestaande).
- `cd apps/ml-service && .../venv-ml/bin/python -m pytest tests -q -p no:cacheprovider` -- expected: geen nieuwe failures t.o.v. de baseline (noteer vooraf bestaande failures apart).
- `cd apps/api && npx vitest run src/__tests__/services/gs1-block-robustness.atdd.test.ts src/__tests__/routes/logo-scans-stap1.atdd.test.ts src/__tests__/services/gs1-block.test.ts src/__tests__/services/gs1-mapping.test.ts src/__tests__/routes/logo-scans-flow.test.ts src/__tests__/routes/logo-scans-gs1.test.ts src/__tests__/routes/logo-scans-dedupe.test.ts src/__tests__/api/legacy-detect.test.ts` -- expected: alles groen (22 nieuwe + 124 bestaande + legacy).
- `cd apps/api && npx vitest run` -- expected: geen nieuwe failures.
- `cd apps/api && npx tsc --noEmit` -- expected: exit 0.
- `cd apps/ml-service && ruff check app tests && black --check app tests && isort --check-only app tests` (indien beschikbaar in de venv; anders melden) -- expected: schoon voor de gewijzigde bestanden.
