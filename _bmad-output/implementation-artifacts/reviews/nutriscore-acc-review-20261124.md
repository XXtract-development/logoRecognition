---
titel: Review PR #32 + #33 (Nutri-Score testbaar op ACC)
datum: 2026-11-24
skill: bmad-review (lenzen adversarial, edge-case-hunter, verification-gap, structure; één gebundelde ronde, verse Opus-agent)
inhoud: git diff b07d008..1ee454c (origin/acc), 9 bestanden
also_consider: sleutel nooit in logs/uitvoer; lege of ongeldige EXTRA; botsende consumer-ids; timing-safe vergelijken; n8n-acc onaangetast
---

# Review Nutri-Score ACC-test (PR #32, #33)

Plan: inhoud = diff (code + documenten). Lenzen: adversarial, edge-case-hunter, verification-gap, structure (de laatste op de documenten in de diff).

Overlap tussen lenzen is signaal: de naambotsing tussen `LOGO_PIPELINE_KEYS` en `LOGO_PIPELINE_KEYS_EXTRA` kwam uit drie lenzen (A1, E1, V3); de niet-atomaire opslag uit twee (A8, E6/E7); de ontbrekende groottecontrole na JPEG uit drie (A13, E12, E13).

Afhandeling per bevinding staat onderaan in **Triage**.

## adversarial

- **A1** `logo-pipeline-keys.ts:34-37` — Een EXTRA-item mag een naam uit de hoofdlijst hergebruiken (bv. `n8n-acc:<nieuwe sleutel>`). De naam is de autorisatiegrens voor `GET /logo-scans/:scanId` (`logo-scans.ts:100`) en voor hergebruik (`logo-scan-store.ts:93`). Guard: EXTRA-items met een naam uit de hoofdlijst weigeren en waarschuwen (alleen naam). Gevolg: een testsleutel leest alle scans van n8n-acc.
- **A2** `logo-pipeline-keys.ts:41-43` — Dezelfde sleutel in beide lijsten onder verschillende namen: de hoofdlijst wint stil. Guard: bij inlezen waarschuwen met de namen, nooit de sleutel. Gevolg: scans van de EXTRA-afnemer vallen onder de naam van de hoofdafnemer.
- **A3** `.env.example:61`, `api-specification.md:359` — Tekst zegt nog "lege LOGO_PIPELINE_KEYS = elke aanvraag 401" en "sleutel uit LOGO_PIPELINE_KEYS". Onjuist zodra EXTRA gezet is. Guard: "beide leeg = 401; sleutel uit een van beide lijsten". Gevolg: wie de hoofdlijst leegmaakt om af te sluiten, laat EXTRA open.
- **A4** `logo-pipeline-keys.ts:20,24,36` — Waarschuwingen voor kapotte EXTRA-items heten "LOGO_PIPELINE_KEYS entry ignored"; omdat per aanvraag wordt ingelezen logt een spatie-waarde of komma aan het eind bij elke aanvraag. Guard: label per variabele, lege waarde/lege delen stil overslaan. Gevolg: verkeerde lijst gerepareerd, logs lopen vol.
- **A5** `nutriscore_measure.py:38-40` + trace — Oordeel is gebaseerd op ruwe `detections` (ook onder drempel/twijfel), terwijl afnemers `items` (met `uitkomststand`) gebruiken. Guard: ook scoren op `items`. Gevolg: de uitspraak beschrijft een oppervlak dat geen afnemer ziet.
- **A6** `nutriscore_measure.py:77-86`, trace r.38 — JPEG q90 met chroma-subsampling heet "zelfde pixels"; JPEG is verliesgevend. Guard: hogere kwaliteit zonder subsampling, herschaalde etiketten vastleggen en apart rapporteren, tekst corrigeren. Gevolg: kleur-lezer krijgt ongemeten afwijking op 45% van de set.
- **A7** `nutriscore_measure.py:95-97` — Hervatten hergebruikt `done`-antwoorden zonder modelversie te vergelijken. Guard: versie vastleggen en verschillen melden. Gevolg: twee modelversies in één score.
- **A8** `nutriscore_measure.py:96,106` — `json.dump(r, open(p,'w'))` niet atomair; `json.load` zonder vangnet. Guard: tmp + `os.replace`; corrupt bestand = afwezig. Gevolg: één onderbroken schrijfactie blokkeert elk hervatten.
- **A9** `nutriscore_measure.py:145-152` vs SPEC CAP-3 — Rapport mist aantal per `method` en de voorbehoud-regel, terwijl de trace per-methode-cijfers toont. Guard: telling per methode + per-methode-tabellen + voorbehoud. Gevolg: hoofdconclusie van de trace niet reproduceerbaar.
- **A10** trace r.4-5 — Gate PASS terwijl ATDD, bouw en trace met de hand en de spec-review door de werker zelf zijn gedaan. Guard: gate pas na echte skills; afwijking in de tekst. Gevolg: PASS zonder onafhankelijke review.
- **A11** trace r.15 vs SPEC r.28 — CAP-4 vraagt "202 → done met nieuwe sleutel" en "zonder sleutel 401"; trace citeert "400 zonder bestand" en "foute sleutel 401". Guard: concreet scanId 202→done en een 401 zonder header. Gevolg: PASS op ander bewijs dan gevraagd.
- **A12** `nutriscore_measure.py:99-112` — 503/429/netwerkhapering = meteen "geen antwoord", zonder herhaling of vastgelegde statuscode. Guard: herhalen bij 503/429, fout per etiket vastleggen (nooit de sleutel). Gevolg: oorzaak van de 16 zonder antwoord blijft onbekend.
- **A13** `nutriscore_measure.py:77-86` — `shrink()` controleert niet of de JPEG onder de limiet past. Guard: kwaliteit stapsgewijs omlaag; lukt het niet, niet versturen. Gevolg: 413 telt stil als "geen antwoord".
- **A14** `nutriscore_measure.py:119-123` — urllib volgt redirects en stuurt `x-api-key` mee naar het doel, ook op een andere host. Guard: opener zonder redirects. Gevolg: sleutel kan bij een derde belanden.
- **A15** SPEC r.32,35 — Constraints zeggen "geen schrijfacties op ACC-databases" en "EXTRA verwijderen zet de test volledig terug", maar de meting schrijft 352+ `logo_scans`-rijen. Guard: rijen benoemen en terugdraai-regel corrigeren. Gevolg: spec spreekt zichzelf tegen.
- **A16** `nutriscore_measure.py:24-35` — `LOGO_KEY` gaat door dezelfde "alles na de eerste `:`"-ontleding; een sleutel mag `:` bevatten. Guard: `LOGO_KEY` als kale sleutel, `parse_key` alleen voor de Keychain. Gevolg: afgekapte sleutel, overal 401.

## edge-case-hunter

- **E1** `logo-pipeline-keys.ts:34-37` — EXTRA-naam gelijk aan hoofdlijst-naam erft GET- en hergebruik-scope. Guard: `extra.filter(e => !mainNames.has(e.name))`.
- **E2** `logo-pipeline-keys.ts:41-43` — Sleutel dubbel over de lijsten: hoofdlijst wint zonder waarschuwing. Guard: waarschuwen met namen.
- **E3** `logo-pipeline-keys.ts:15-20` — Spatie-waarde of komma aan het eind in EXTRA logt bij elke aanvraag. Guard: `if (!raw?.trim()) return []`; lege delen overslaan.
- **E4** `logo-pipeline-keys.ts:20,24` — Waarschuwingen voor EXTRA dragen het label LOGO_PIPELINE_KEYS. Guard: label-parameter.
- **E5** `nutriscore_measure.py:39-40` — `t3777_code: null` of `detections: null` geeft AttributeError/TypeError; één vreemd antwoord breekt de hele run. Guard: `or []` / `or ''`.
- **E6** `nutriscore_measure.py:96` — Corrupt antwoordbestand: `json.load` gooit in de worker; elke hervatting crasht. Guard: `ValueError` = afwezig.
- **E7** `nutriscore_measure.py:106` — Niet-atomair schrijven laat een half bestand achter. Guard: tmp + `os.replace`.
- **E8** `nutriscore_measure.py:99,78` — Waarheid-id zonder `<id>.png` geeft FileNotFoundError; hele pool stopt. Guard: ontbrekend beeld = geen antwoord.
- **E9** `nutriscore_measure.py:85` — RGBA-PNG via `convert('RGB')` zonder samenvoegen op een achtergrond: transparante delen worden zwart. Guard: op wit plakken met alfamasker.
- **E10** `nutriscore_measure.py:51` — Waarheidsletter buiten A–E (kleine letter, ander teken) geeft KeyError na de hele run. Guard: normaliseren naar hoofdletters binnen A–E.
- **E11** `nutriscore_measure.py:91,165` — Etiketten zonder status `bevestigd` worden niet gefilterd. Guard: `status == 'bevestigd'`.
- **E12** `nutriscore_measure.py:24-26,30` — Kale `LOGO_KEY` met `:` wordt afgekapt. Guard: `LOGO_KEY` ongewijzigd gebruiken.
- **E13** `nutriscore_measure.py:77-86` (claim) — "verkleint >10 MB-etiketten" suggereert dat het resultaat past; er is geen controle na het opslaan. kind: claim, confidence: medium.

## verification-gap

- **V1** `scripts/test_nutriscore_measure.py` — Draait in geen enkele CI-workflow (gezocht in `.github/workflows/*`: pytest alleen op `tests/`-mappen). Guard: stap in de python-job van `ci-cd.yml`. gap_shape: broken-verification-gap; consumer: uitslagtabel in de trace.
- **V2** `nutriscore_measure.py:155-166` — De test "sleutel nooit in uitvoer" raakt alleen `run()` met een nep die de sleutel nooit terugkaatst; `main()`/`report()`/`sys.exit` niet. Guard: test met `LOGO_KEY`, nep die headers terugkaatst, `main()` draaien, stdout+stderr+bestanden doorzoeken. gap_shape: broken-verification-gap.
- **V3** `logo-pipeline-keys.ts:34-37` — Geen test voor naambotsing of dubbele sleutel over de lijsten. Guard: test `n8n-acc:k-x` in EXTRA → `null`, plus GET-test op route-niveau (404 op scan van n8n-acc). gap_shape: other.
- **V4** `report()` vs SPEC CAP-3 — Telling per methode en voorbehoud-regel ontbreken en zijn niet getest, terwijl CAP-3 PASS staat. gap_shape: other.
- **V5** trace r.15 — CAP-4-bewijs past niet op de succescriteria (zie A11). gap_shape: other.

## structure

- **S1** trace §Bevindingen — Uitkomst ("geen letter haalt de eis") staat onderaan; MOVE naar boven als "Uitkomst" (Pyramid-model).
- **S2** trace §Meting op ACC — Een trace bevat een volledig meetrapport onder een tweede H1; QUESTION/MOVE naar een onderzoeksverslag en verwijzen.
- **S3** trace r.32-33 — Per-methode-cijfers als vette lopende regels zonder teller/noemer; CONDENSE tot tabellen met hetzelfde schema.
- **S4** trace frontmatter — Procesafwijking zit verstopt in `route:`; MOVE naar een `> [!warning]` bij de gate.
- **S5** SPEC CAP-2 intent — Uitvoeringsdetails (Keychain, pollritme, ontleding) in de intent; CONDENSE + MOVE naar een uitvoeringsnotitie.
- **S6** SPEC CAP-4 success — Bekende beperking (n8n-acc afgeleid) in een bijzin; MOVE naar Constraints als "Bekende beperking".
- **S7** SPEC r.33 — Runbook-commando in Constraints; MOVE naar een uitrolnotitie, alleen de eis houden.
- **S8** SPEC r.7 — Callout herhaalt titel en "alleen ACC"; CONDENSE tot de pauze-uitzondering.
- **S9** `api-specification.md:359-360` — Sub-bullet spreekt de ouder tegen en bevat Coolify-uitleg; MERGE in de Authenticatie-bullet, CUT de uitleg.
- **S10** `.env.example:61-65` — Nieuwe regel staat onder een fail-closed-zin die ze tegenspreekt; MERGE: "beide leeg = 401", namen moeten verschillen.
- **S11** `versions.md:3-8` — PRESERVE (volgt het huispatroon).
- **S12** algemeen — Samenvatting: alle aanbevelingen samen verplaatsen of schrappen ~400 woorden, vooral door het meetdeel uit de trace te halen.

## Triage

Doorgevoerd via `bmad-build` (spec `spec-nutriscore-acc-review-fixes.md`), met eerst een rode test per codebevinding (ATDD-checklist `atdd-checklist-nutriscore-acc-review-fixes.md`). Tracebevindingen zijn doorgevoerd via `bmad-testarch-trace`.

| ID | Oordeel | Hoe / reden |
|---|---|---|
| A1, E1, V3 | doorgevoerd | Een EXTRA-item met een naam uit de hoofdlijst wordt genegeerd, met een waarschuwing die alleen de naam noemt. Getest op unit- en routeniveau: de botsende sleutel krijgt 401. |
| A2, E2 | doorgevoerd | Een EXTRA-item met een sleutel uit de hoofdlijst wordt genegeerd en gemeld met de namen. Een dubbele sleutel binnen EXTRA wordt ook genegeerd; binnen de hoofdlijst volgt alleen een waarschuwing. |
| A3, S9, S10 | doorgevoerd | `.env.example` en `api-specification.md`: beide lijsten leeg betekent 401, en een sleutel uit een van beide lijsten telt. |
| A4, E3, E4 | doorgevoerd | Een label per variabele. Een lege waarde of een leeg deel wordt stil overgeslagen. Het inlezen wordt onthouden, dus er komt één waarschuwing per configuratie. |
| A5 | teruggelegd | Een keuze over de meetdefinitie (`items` of `detections`). Ligt bij de orchestrator. Het rapport en de trace zeggen nu expliciet dat er op de ruwe `detections` gescoord is. |
| A6, E13 | doorgevoerd | JPEG q95 zonder chroma-subsampling, omlaag tot q60, anders niet versturen. Herschaalde etiketten worden apart gerapporteerd. Het tracewoord "zelfde pixels" is gecorrigeerd. |
| A7 | doorgevoerd | Het rapport telt `modelVersion` en de basis van `referenceVersion`, waarschuwt bij meer dan 1 en zegt dat een gewichtswissel zonder nieuw label niet zichtbaar is. |
| A8, E6, E7 | doorgevoerd | Atomair schrijven (tmp + `os.replace`). Een corrupt bestand telt als afwezig. |
| A9, V4 | doorgevoerd | Een telling per methode, tabellen per methode, de splitsing origineel/herschaald en een voorbehoud-regel, getest op concrete rijen. |
| A10, S4 | doorgevoerd (trace) | De gate is opnieuw beoordeeld na de echte skills. De procesafwijking van de eerste ronde staat in een waarschuwingsblok. |
| A11, V5 | doorgevoerd (trace) | CAP-4-bewijs: concreet scanId 202 → done met de testsleutel, en 401 zonder header. |
| A12 | doorgevoerd | 0/429/502/503/504 worden herhaald, met respect voor `Retry-After`. Een 401/403 stopt de run. Fouten per etiket staan in `_fouten/<id>.json`, zonder sleutel. |
| A14 | doorgevoerd | Een opener zonder redirects. Een 3xx wordt als fout vastgelegd, getest met een lokale HTTP-server. |
| A15, S5–S8 | doorgevoerd | SPEC: constraints gecorrigeerd (de meting schrijft `logo_scans`-rijen), een uitvoerings- en uitrolnotitie, de bekende beperking verplaatst en de callout ingekort. |
| A16, E12 | doorgevoerd | `LOGO_KEY` wordt kaal gebruikt; `parse_key` alleen voor de Keychain. |
| E5 | doorgevoerd | Null-veilig `extract_letters`. |
| E8 | doorgevoerd | Een ontbrekend beeld geeft geen antwoord en een vastgelegde fout. |
| E9 | verworpen | De server doet zelf `image.convert("RGB")` (`apps/ml-service/app/api/detection.py:101`). Op wit plakken zou het script een ander beeld laten meten dan de route ziet. |
| E10, E11 | doorgevoerd | `load_truth`: alleen `status == "bevestigd"`, letters genormaliseerd naar A–E (ook `NUTRISCORE_X`), weggevallen letters geteld op stderr. |
| V1 | doorgevoerd | Een pytest-stap voor het script in de python-job van `ci-cd.yml`. |
| V2 | doorgevoerd | Een `main()`-test met een nep die de sleutel terugkaatst. De sleutel staat niet in stdout, stderr of bestanden. |
| S1–S3 | doorgevoerd (trace) | De uitkomst staat bovenaan. De meting is ingekort tot de hoofdtabel plus tabellen per methode in hetzelfde teller/noemer-schema. |
| S11 | geen actie | PRESERVE. |
| S12 | geen actie | Een samenvatting, geen eigen bevinding. |

Tweede reviewronde (diff na de bouw, `bmad-build` stap 4): 16 bevindingen: 15 doorgevoerd; 1 vals (trace volgt in de keten); van #10 is het deel "memo-reset voor tests" verworpen. Zie de Review Triage Log in de spec.
