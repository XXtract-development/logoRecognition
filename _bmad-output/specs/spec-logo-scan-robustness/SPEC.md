---
id: SPEC-logo-scan-robustness
companions: []
sources:
  - ../../implementation-artifacts/investigations/acc-top15-logoherkenning-slecht-20261012.md
created: '2026-10-12'
baseline_commit: 31ff627
branch: fix/logo-scan-robustness
---

> **Canonical contract.** This SPEC is the complete, preservation-validated contract for what to build, test, and validate. The source document is for traceability (evidence E5–E35, F3, F4, F7); consult it only for rationale.

# Logo-scanpijplijn robuuster en meetbaar

## Why

De eerste meting van de echte scanpijplijn op volledige etiketten (ACC, 12-10-2026, 180 etiketten) legde drie codefouten bloot die los van de modelkwaliteit staan: lege uitsneden worden ingebed en matchen een lege referentie met 1,0 (F3); stap 1 faalt zonder spoor en bewaart niets over zijn voorstellen (F2, F7); `referenceVersion` is altijd `unknown` en een drempel van 0,99 zet `twijfelachtig` op bijna elk item (F4). Zonder deze reparaties is elke volgende meting van de logoherkenning vertekend en blijft `automatisch` onbereikbaar.

**Naamgeving:** velden in het ml-service-contract en in logs zijn Engels (`proposals`, `raw`, `refined`, `ghs`, `blank_crops`, foutklassen); velden die de API in `logo_scans` opslaat zijn Nederlands (`stap1`, `voorstellen`, `verfijnd`, `ghs`, `vakjes`, `fout`), zoals de rest van `logoResults`. Een bouwer normaliseert geen van beide.

## Capabilities

- **CAP-1** — Lege uitsneden afwijzen vóór embedding (onderzoek actie 2)
  - **intent:** De classificatie herkent een uitsnede zonder zichtbare inhoud en geeft daarvoor een expliciete, telbare uitkomst in plaats van een referentiematch.
  - **success:**
    - AC-1.1 Een uitsnede die uniform is (wit, zwart, één kleur) of alleen een dunne buitenrand heeft, krijgt in het classify-antwoord `t3777_code=UNKNOWN`, `confidence=0.0`, `method="embedding"`, `uncertain=true`, `evidence={"reason":"blank_crop"}`; `classify_crop` (en dus embedding, gate, GHS- en Nutri-Score-route) wordt voor die uitsnede niet aangeroepen.
    - AC-1.2 Een uitsnede met een echt centraal teken — ook dun (1 px), ook gekleurd, ook op zwarte achtergrond — doorloopt de bestaande keten byte-gelijk.
    - AC-1.3 De regel is dezelfde als de toelatingscontrole voor referenties (centrale 80 %, kanaalbereik > 8 op het op wit samengestelde beeld) en komt uit één gedeelde helper `has_visible_content(image)` in `reference_content.py`; `assert_reference_content` gebruikt die helper (geen tweede definitie van "leeg").
    - AC-1.4 De controle staat in de classify-endpointlus (`artwork.py classify_artwork`, de enige productie-aanroeper van `classify_crop`), vóór de aanroep van `classify_crop`. Ze geldt voor 3-kanaals uint8-uitsneden; faalt de controle zelf (uitzondering), dan logt het endpoint één waarschuwing en gaat de uitsnede de bestaande keten in (fail-open, ook in strikte runtime).
    - AC-1.5 Het logevent `Artwork classification complete` draagt `blank_crops` (aantal uitsneden met `blank_crop`).
    - AC-1.6 In de API maakt een `blank_crop`-resultaat de scan niet `partial`: het heeft een geldige `method` en bbox en valt als `UNKNOWN` buiten de omzettabel (geen item), terwijl de ruwe detectie met `evidence.reason="blank_crop"` en `confidence=0` in `detections` bewaard blijft.

- **CAP-2** — Stap 1 faalt zichtbaar (onderzoek actie 4a)
  - **intent:** Een mislukte visuele lokalisatie laat in het ml-service-log en in het 503-antwoord zien wélke klasse fout optrad, zonder sleutels of beeldbytes prijs te geven.
  - **success:**
    - AC-2.1 Elke uitzondering die de visuele route verlaat als 503 krijgt één logregel (`logger.error`, "Visual localization failed") met `error_class`, `error_type` (klassenaam) en `error` (boodschap afgekapt op 200 tekens, geen `exc_info`); het 503-detail luidt `Visual localization unavailable (<error_class>)`.
    - AC-2.2 Foutklasse volgt uit één mappingtabel, in deze volgorde: `time_budget` (`asyncio.TimeoutError`, `httpx.TimeoutException`), `provider_status_<code>` (`httpx.HTTPStatusError`), `provider_transport` (overige `httpx.HTTPError`), `template_library_empty` (boodschap bevat "reference library is empty"), `runtime_not_ready` (boodschap "Embedding model is not ready" of "not ready"), `proposal_capacity` ("exceeds capacity"), `proposal_response_size` ("exceeds size limit"), `proposal_image_bounds` ("Proposal image exceeds bounds"), `refinement_error` (boodschap bevat "refinement"), `proposal_parse_error` (overige `ValueError`, `KeyError`, `TypeError`, `json.JSONDecodeError`), anders `unexpected_<Type>`.
    - AC-2.3 Een `HTTPException` uit de strikte runtime (504 deadline, 503 capaciteit, 499 afgebroken) wordt ongewijzigd doorgegeven, maar krijgt dezelfde logregel met `error_class=http_<status>`.
    - AC-2.4 Log en antwoord bevatten nooit de providersleutel, `Bearer`, een URL met sleutel of een base64-beeld (negatieve test op caplog en responsetekst).

- **CAP-3** — Stap 1 meetbaar per scan (onderzoek actie 4b)
  - **intent:** Per scan is achteraf uit `logo_scans` te lezen hoeveel vakjes het visuele model gaf vóór verfijning, hoeveel verfijnde vakjes daaruit kwamen, en — bij een mislukte scan — in welke fase en met welke foutklasse hij faalde.
  - **success:**
    - AC-3.1 `LocalizeResponse` krijgt `proposals: Optional[{raw, refined, ghs}]`; de visuele route vult het altijd (`raw` = aantal voorstellen uit `parse_proposals` ná clipping/dedupe, `refined` = aantal verfijnde vakjes, `ghs` = aantal GHS-detecties); de templateroute laat het `null`. `ml-client.ts` typeert het veld mee.
    - AC-3.2 De worker bewaart `stap1` in de Redis-staat als apart veld (nooit in `logoResults`) en in de rij `logo_scans.logo_results` als extra sleutel naast de schema-velden. Bij succes: `{voorstellen, verfijnd, ghs, vakjes}` met `vakjes` = aantal vakjes dat naar classify ging (0 bij een lege lokalisatie); ontbreekt `proposals` in de ml-respons (oudere ml-image), dan `null` voor de drie tellingen.
    - AC-3.3 Bij een mislukte scan: `{fase, fout}` met `fase` ∈ `lokalisatie|classificatie|beeld|wachtrij|resultaat` en `fout` = de foutklasse uit het ml-503-detail wanneer parsebaar (`\(([a-z0-9_]+)\)$`), anders `ml_status_<n>` bij een `MLServiceError`, anders `timeout`, `invalid_image`, `unusable_regions` (lokalisatie gaf dubbele of ongeldige vakjes), `malformed_results` (classify-antwoord past niet op de vakjes), `result_invalid` of de afgekapte foutboodschap (≤ 100 tekens). Slaagde stap 1 wél, dan blijven de tellingen erbij.
    - AC-3.4 `validateLogoResults` draait op het object zónder `stap1`; `stap1` wordt pas toegevoegd aan het op te slaan rij-object. Het GET-antwoord bevat nooit `stap1` (Redis-pad, tabelpad via `stateFromRow` dat de sleutel stript, dedupe-hit en een oude rij zonder `stap1`), en `validateLogoResults` op dat antwoord blijft leeg.

- **CAP-4** — `referenceVersion` gevuld voor embedding-treffers (onderzoek actie 6a)
  - **intent:** Elke scan en elk item dragen de versie van de referentieset waartegen gescand is, zodat de versiecontrole voor `automatisch` kan slagen.
  - **success:**
    - AC-4.1 `submitLogoScan` zet de bij toelating gemeten poolversie (`referencePoolVersion()`, `<count>:<max createdAt>`) als `referenceVersion` in de Redis-staat, alleen wanneer die niet leeg is; `stateFromRow` leest hem uit de rijkolom.
    - AC-4.2 `buildLogoResults` krijgt `referenceVersion?` mee; per detectie geldt `d.reference_version ?? input.referenceVersion ?? null` zowel voor `resolveSoort` als voor `bewijs.referentieversie`.
    - AC-4.3 Top-level `referenceVersion` = gesorteerde, komma-gescheiden unie van poolversie en detectieversies; `unknown` alleen als de poolversie onbekend is én geen detectie een versie draagt. Een scan met alleen GHS-detecties geeft `<pool>,<ghs-versie>`.
    - AC-4.4 Ook `failedState` geeft de poolversie uit de staat mee. Een staat zonder `referenceVersion` (job van vóór de uitrol, database uit) gedraagt zich als vandaag.
    - AC-4.5 Een soort met `validForModelVersion` = modelversie en `validForReferenceVersion` = poolversie krijgt bij een embedding-detectie zonder eigen versie geen `versie_wijkt_af` meer.

- **CAP-5** — Drempel per methode in plaats van 0,99 (onderzoek actie 6b)
  - **intent:** `twijfelachtig` betekent weer dat de herkenning zélf twijfelt, niet dat een kunstmatige drempel elk item raakt.
  - **success:**
    - AC-5.1 `logo-scan-flow.ts` stuurt geen `confidence_threshold` naar `/ml/artwork/classify` (test: `not.toHaveProperty('confidence_threshold')`); de ml-service past zijn drempel per methode toe (`CLASSIFY_THRESHOLD_EMBEDDING`, `CLASSIFY_THRESHOLD_CLASSIFIER`).
    - AC-5.2 Een embedding-detectie van 0,85 zonder `uncertain`/`requires_review` krijgt géén `twijfelachtig`; `onder_drempel` blijft uit `getThresholdForMethod` komen (embedding 0,80). GHS-items houden `twijfelachtig` via `requires_review`.
    - AC-5.3 Bewust aanvaard gevolg: zonder expliciete drempel is een Nutri-Score-head-lezing (0,80–0,99, gemeten 97,8 % precisie) nooit `uncertain`, de strikte A2-corroboratie (`classification.py:376-409`) slaapt voor de pijplijn, en het A2-vangnet achter de familiepoort levert `uncertain=false`. De classifier-tweedemening wordt alleen nog bij een onzekere embedding geraadpleegd (op ACC toch nooit: `model_versions` leeg).

## Constraints

- `logoResults.v1.json` en zijn sha256 blijven ongewijzigd (consumenten pinnen hem; `additionalProperties:false`).
- Geen nieuwe kolom en geen Prisma-migratie: ACC-migraties worden handmatig toegepast en een niet-toegepaste kolom zou `saveOutcome` laten falen.
- Geen `prisma migrate` tegen welke omgeving dan ook; geen containeracties; geen sleutels of klantbeelden in repo, log of test.
- Geen gedragswijziging voor uitsneden mét inhoud (CAP-1) en geen wijziging van de localize-uitkomst bij succes behalve `proposals` (CAP-3).
- `legacy-detect.ts` (`/detect`) blijft 0,99 sturen; alleen de scanpijplijn verandert.
- Tests die mee veranderen: ml-service tests die een uniform wit/zwart/grijs beeld door `/ml/artwork/classify` sturen krijgen één gedeelde niet-lege fixture (`test_artwork_strict_runtime.py` `image_b64()`); `test_artwork_strict_runtime.py` ~545 pint de visuele lege uitkomst mét `proposals`; API-tests die `referenceVersion` alleen uit detecties verwachten.

## Non-goals

- Geen deactivatie of audit van bestaande referenties (actie 1; op ACC uitgevoerd). Het succes-signaal voor CAP-1 geldt daarom op een omgeving waar die audit gedraaid is.
- Geen herijking van drempels (0,75 / 0,80) of van de gate; geen categoriezoekruimte in classify (actie 7).
- Geen wijziging aan `gs1-mapping.json`, `opnamestand` of `validFor…`-waarden; `automatisch` wordt mogelijk, niet ingeschakeld.
- Geen minimale afmeting voor uitsneden; geen JPEG-ruisfilter (de toelatingsregel is het contract, niet de E5-stddev-definitie).
- Geen modelstrategie (actie 5), geen wijziging aan de 80-megapixelgrens (actie 8), geen hermeting van de poolversie in de worker.

## Success signal

Op een herhaling van de steekproef van 12-10: elke detectie met `evidence.reason="blank_crop"` heeft `confidence=0` en geen item; elke mislukte scan heeft in `logo_scans` een `stap1.fase` en `stap1.fout`; elke geslaagde scan heeft `stap1.voorstellen/verfijnd/ghs/vakjes`; `referenceVersion` van elke scan bevat de poolversie; het aandeel items met `twijfelachtig` ligt ver onder de 418/463 van E4.

## Assumptions

- De ACC-waarden `CLASSIFY_THRESHOLD_EMBEDDING=0.75` en `CROSSCHECK_THRESHOLD_EMBEDDING=0.80` (E22) zijn de bedoelde drempels.
- De poolversie bij toelating is representatief voor de worker-run (max. 240 s later); dezelfde snapshot is al de dedupe-sleutel van de rij.
- Een ring- of kadervormig logo met alle inkt in de buitenste 10 % telt als leeg — aanvaard verlies, identiek aan de referentietoelating.

## Keuzes gemaakt

- **CAP-3 opslag:** jsonb-sleutel `stap1` in `logo_results`, geen kolom (geen migratie; stripping bij lezen houdt het antwoord schema-geldig).
- **CAP-5 vorm:** één regel weglaten in plaats van `twijfelachtig` anders afleiden; het Nutri-Score-gevolg (AC-5.3) is aanvaard en vastgelegd.
- **CAP-1 plek:** in de endpointlus, niet in `classify_crop`: de enige productie-aanroeper, en de unit-tests van `classify_crop` met uniforme stub-crops blijven zo geldig.
