---
case: acc-top15-logoherkenning-slecht-20261012
status: confirmed
created: 2026-10-12T12:05:00+02:00
owner_repo: logoRecognition
affected_repos: [logoRecognition, n8n]
environment: ACC
trigger: "Na maanden trainen meldde het systeem dat een aantal logo's goed genoeg getraind waren voor automatische herkenning. Sinds n8n op ACC de logoherkenning aanroept, blijken de resultaten ineens slecht. Waar zit het echte probleem voor de top 15?"
severity: high
---

# Onderzoek: logoherkenning op ACC slecht voor de top 15

> [!note] Alleen lezen
> Dit onderzoek wijzigt niets op ACC: geen herstart, geen migratie, geen schrijfactie. Elke bevinding draagt het commando of de query waarmee hij is gedaan.

## Hand-off Brief

De logoherkenning op ACC herkent gedeclareerde keurmerken in 17% van de gevallen boven de drempel (43 van 247, steekproef van 180 etiketten, 12-10-2026). Dat is geen plotselinge terugval maar de eerste meting op volledige etiketten door de echte pijplijn; alle eerdere "goed genoeg"-signalen waren structureel (genoeg referenties) of gemeten op losse uitsneden. Vier oorzaken zijn bewezen:

1. **Er is geen getraind model.** De classificatie is "dichtstbijzijnde referentie" met een onbewerkt ImageNet-EfficientNet-B0; de ±740 gevalideerde trainingscrops worden in deze route niet gebruikt en `model_versions` is leeg. "Trainen" heeft alleen referenties opgeleverd.
2. **Stap 1 (lokalisatie) vindt de logo's vaak niet.** Bij 78 van de 94 gemiste top-15-declaraties is er geen enkel vakje met die soort; 43 van 180 etiketten krijgen nul vakjes. Stap 1 is één vraag aan Sonnet op een tot 2400 px verkleind beeld.
3. **Een lege referentie voor RECYCLABLE_GENERAL_CLAIM** (vliegwiel-promotie 22-07, nog actief op ACC) matcht elke witte uitsnede met zekerheid 1,0. Dit is dezelfde fout die op 06-10 voor productie is gerepareerd (admission) maar op ACC niet is opgeruimd.
4. **"Automatisch" kan in deze code nooit bereikt worden:** `referenceVersion` is bij embedding-treffers altijd `unknown`, en de versiecontrole vereist een exacte match. Bovendien zet de pijplijn `confidence_threshold 0.99`, waardoor elk item de vlag `twijfelachtig` krijgt.

Daarnaast: de steekproef liep (anders dan de overdracht zei) op 12-10 06:00–09:13Z over een uitrol heen; 9 scans faalden met een ingeslikte fout in stap 1 en 6 beelden werden geweigerd op de 80-megapixelgrens.

## Case Info

- **Omgeving:** ACC (vanilla, 78.47.244.169), app-container `app-qsookwow8koko0kwg00g0cwk-*`, ml-service poort 8011, Postgres `logo_recognition`.
- **Stand code:** `acc` op 31ff627 (live sinds 12-10-2026).
- **Methode:** steekproef 195 etiketten via ACC API (11/12-10), vergelijking met GS1-declaraties, lees-queries op ACC-database en -containers, code-lezing op `acc`.
- **Schrijfacties uitgevoerd:** één, na goedkeuring van Friso (12-10-2026): referentie `f1a85af9` op ACC gedeactiveerd; zie sectie Uitvoering.
- **Top 15:** RAINFOREST_ALLIANCE_PEOPLE_NATURE, WEIDEMELK, EU_ORGANIC_FARMING, RECYCLABLE_GENERAL_CLAIM, BETER_LEVEN_1_STER, PREGNANCY_WARNING, GREEN_DOT, VEGAN, NUTRISCORE_A, EUROPEAN_V_LABEL_VEGAN, FOREST_STEWARDSHIP_COUNCIL_MIX, MARINE_STEWARDSHIP_COUNCIL_LABEL, NUTRISCORE_C, NUTRISCORE_B, VEGAN_SOCIETY_VEGAN_LOGO.

## Evidence Inventory

| # | Bron | Commando / query | Uitkomst |
|---|---|---|---|
| E1 | Steekproefresultaten `acc-out/*.json` (195 bestanden) | `python3 vergelijk.py` (scratchpad) | 180 `done/ok`, 9 `failed/recognition_unavailable`, 6 `POSTFOUT 400`. |
| E2 | idem | tel `logoResults.referenceVersion` | 179× `unknown`, 10× GHS-versie; `modelVersion` 189× `acc-20261006`. |
| E3 | idem + `declaraties-prod-basiseenheden-20261008.tsv` | vergelijk.py | 247 gedeclareerde soorten die de pijplijn kent; 43 boven drempel 0,80 (18 zonder twijfelvlag, 25 met); 204 niet boven de drempel. |
| E4 | idem | tel items | 463 items, allemaal `voorstel`; redenen: `onder_drempel` 367, `twijfelachtig` 418, `tegenstrijdig` 15. Methode: embedding 433, nutriscore-a2 19, ghs 11. |
| E5 | idem + `gecombineerd/*.png` | PIL stddev van de uitsnede binnen `bbox` < 8 | 37 van 463 vakjes op een lege plek; 29 RECYCLABLE_GENERAL_CLAIM; 23 daarvan met zekerheid 1,0. Van 32 RECYCLABLE-items ≥ 0,99 liggen er 23 op leeg. |
| E6 | idem | bbox-items vs `detections` | 463 van 463 items passen op een detectie (afwijking < 0,02). De vakjes zijn dus niet verschoven door de parser. |
| E7 | `api-invoer/` van de 6 geweigerde beelden | PIL `size` | hoogtes 20.863 tot 40.507 px, verhouding 1:5 tot 1:16, 81 tot 125 MP; allemaal boven de 80 MP-grens (E30). |
| E35 | Lokale herberekening (scratchpad `h4-test.py`, torch 2.14 / torchvision 0.29, effb0 DEFAULT, Identity, Resize 256 / CenterCrop 224 / ImageNet-norm, eerste 512 dims; 10 referentiebestanden via de ml-service uit MinIO `training-images` gelezen, host en container daarna opgeruimd) | `python h4-test.py` | Referentie `artwork-crops/00731509919691/17_1_bootstrap_5708_3654_810_239.png` (RECYCLABLE, `flywheel-promotion`, actief): 810×239 px, stddev 14,1 — een wit vlak met randlijn. Cosinus wit vlak → deze referentie **1,000**; zwart 0,648; grijs 0,736; twee echte lege boxen uit de steekproef 1,000. Cosinus wit vlak → RECYCLABLE gids-referentie 0,123. De overige 9 referenties zijn echte logo's (stddev 18–106). |

| E8 | idem, per top-15-soort over de 180 gemeten etiketten | script (sectie "per top-15 code") | Gedeclareerd → boven 0,80 / item onder 0,80 / géén item voor de soort: RECYCLABLE 33 → 12/22/11 (mediaan max-zekerheid 0,91); FSC_MIX 15 → 1/5/10 (0,59); VEGAN 13 → 2/5/8 (0,68); GREEN_DOT 11 → 1/2/9 (0,66); BETER_LEVEN_1 9 → 0/0/9; EU_ORGANIC 7 → 1/3/4 (0,63); NUTRISCORE_C 16 → 7/8/8 (1,0); NUTRISCORE_B 6 → 3/3/3 (1,0); NUTRISCORE_A 6 → 1/2/4; WEIDEMELK 5 → 1/2/3; RAINFOREST 4 → 1/1/3; MSC 4 → 0/2/2; VEGAN_SOCIETY 3 → 0/0/3; EU_V_LABEL 1 → 0/0/1; PREGNANCY_WARNING 0 gedeclareerd. |
| E9 | idem | tel `detections` per etiket | 881 detecties op 180 etiketten (mediaan 3, max 33); 43 etiketten met 0 detecties; 774 van 881 `uncertain=true`. 881 detecties → 463 items. |
| E10 | idem | gemist-zonder-item (78 top-15-paren) gesplitst | 13 op een etiket met 0 detecties; 65 op een etiket waar wél vakjes gevonden zijn, maar met een andere code (meest RECYCLABLE, VEGAN, EU_ORGANIC, UNKNOWN). |
| E11 | idem | zekerheidsdecielen | gedeclareerde items (n=73): 0,42 / 0,58 / 0,69 / 0,78 / 0,94 / 1,0…; niet-gedeclareerde (n=390): 0,32 / 0,38 / 0,44 / 0,49 / 0,55 / 0,60 / 0,65 / 0,71 / 0,86. Boven 0,80: 42 gedeclareerd, 48 niet-gedeclareerd (26 zonder de RECYCLABLE-1,0-gevallen). |
| E12 | idem | `processingTimeMs`, `zoekruimte` | mediaan 14,6 s, p90 38,5 s, max 82,9 s; zoekruimte altijd `{aantalSoorten: 70, beperkt: false}` (categoriefilter stond dus niet aan). |
| E13 | vanilla `docker inspect`; ACC `logo_scans` | `docker inspect --format '{{.State.StartedAt}}'`; `select date_trunc('hour', created_at), status, count(*) from logo_scans where created_at >= '2026-10-10' group by 1,2` | Beide containers aangemaakt 2026-10-12T07:33Z (image 31ff627). **Correctie op de overdracht:** de steekproef draaide niet op 11-10 's avonds maar op **12-10 tussen 06:xx en 09:13Z** (12 scans in het uur 06Z, 115 in 08Z, 75 in 09Z; lokale kopieën 08:38–09:13Z). De 9 mislukte scans vielen om 08:44–09:07Z, allemaal ná de uitrol van 31ff627. Containerlogs van dit venster bestaan dus wél. |
| E14 | `git log origin/acc -- apps/ml-service` | | Laatste ml-service-wijzigingen: 19995af (06-10, "reject blank references … blank production artwork was accepted as a recycling reference and caused nine false matches"), f247881 (06-10, "real trained models"), a364d85 (11-10, JSON-parser), 31ff627 (12-10, box-clip). |
| E15 | Eerdere stap-1-meting (scratchpad `gold/evalueer-localisatie.py`) | kop van het script | Die meting riep OpenRouter rechtstreeks aan met een eigen prompt en `--max-px 1600` (beeld verkleind tot 1600 px) op 83 bronbeelden/91 crops uit "oogst-run + prod-media, high-confidence ≥0,5". Dat is níet de ACC-pijplijnroute. |

| E16 | Coolify `list_deployments_by_application qsookwow8koko0kwg00g0cwk` | | Uitrollen: 608df91 06-10 21:45Z · 48bc29e 07-10 · 52636c6 07-10 en 11-10 19:34Z · **a364d85 11-10 20:30Z** · 31ff627 12-10 07:33Z. De steekproef (11-10 ±22:00–23:30Z) draaide dus op a364d85 (#22), niet op 31ff627 (#23, box-clip aan de beeldrand). |
| E17 | ACC Postgres `logo_recognition` (native op cherry 10.0.0.6) via agent, `ssh cherry sudo -u postgres psql` | `select count(*), count(*) filter (where is_active) from model_versions` + `pg_stat_user_tables` | **0 rijen** in `model_versions` en `model_activation_logs` (twee routes). |
| E18 | idem, ml-service-container | `find / -maxdepth 8 \( -name '*.pt' -o -name '*.pth' -o -name '*.onnx' -o -name '*.safetensors' \) -not -path '*/site-packages/*'` | Precies één gewichtbestand: `/app/models/torch/hub/checkpoints/efficientnet_b0_rwightman-7f5810bc.pth` (21 MB, mtime = containerstart 07:33). Geen volume-mounts (`.Mounts` leeg). Dit is het standaard ImageNet-backbone van torchvision. |
| E19 | idem | `select r.t3777_code, count(*), count(*) filter (where r.active), count(e.id), string_agg(distinct r.source, ',') … from reference_logos r left join reference_embeddings e … where r.t3777_code in (top 15) group by 1` | Elke top-15-soort heeft 11–39 actieve referenties mét embedding (bron vrijwel altijd `review-confirmed`, 1 `gs1-packaging-label-guide`, enkele `realref-live-poc`). RECYCLABLE: 67 rijen, 39 actief, **26 `realref-live-poc` allemaal inactief zonder embedding**. Nutri-Score A/B/C: 12/15/11 actief. Nieuwste referentie van deze 15 soorten: 26-08-2026. |
| E20 | idem | `select label, count(*), count(*) filter (where active), count(*) filter (where holdout) … from training_data where label in (top 15) group by 1` | 20–86 gevalideerde trainingscrops per soort (totaal ±740), `holdout` overal 0, geen split- of modelversiekolom. |
| E21 | idem | `select key, value from system_settings` | `flywheel.baselineStale = {"stale": true, "at": "2026-08-26T06:14:43Z", "reason": "review-accept-registratie"}`; `flywheel.paused` bestaat niet (twee routes). |
| E22 | idem, `docker inspect` env (alleen namen + niet-geheime waarden) | | app én ml-service: `LOGO_MODEL_VERSION=acc-20261006`, `CLASSIFY_THRESHOLD_EMBEDDING=0.75`, `CROSSCHECK_THRESHOLD_EMBEDDING=0.80`, `LOCALIZE_CLASS_THRESHOLDS={"RAINFOREST_ALLIANCE":0.70}`, `GHS_REVIEW_MODEL_A=anthropic/claude-sonnet-5.5`, `GHS_REVIEW_MODEL_B=gemini-3.1-pro-preview`, `MODEL_PATH=/app/models`. `LOGO_SCAN_MAX_MS` ontbreekt. 604 referenties totaal, 542 actief, 542 met embedding. |

| E23 | `git show origin/acc:apps/api/src/services/gs1-mapping.json` | tel `opnamestand` | 951 entries: 883 `uit`, 68 `voorstel`, 0 `automatisch`; `validForModelVersion`/`validForReferenceVersion` overal null; bron van de 68 is "logodekking-2026-10-02 (actieve referenties)" — dus aanwezigheid van referenties, geen gemeten nauwkeurigheid. Alle top 15 staan op `voorstel`. |
| E24 | Geheugen `project_keurmerk_status_matrix` (22-07-2026) | | De statusmatrix die per keurmerk "Gereed" meldde, definieert Gereed als *structureel compleet* (≥3 echte crops), met de vaste kanttekening "GEEN gemeten nauwkeurigheid … niet 'X% accuraat' claimen". |
| E25 | Steekproef, 9 scans `failed/recognition_unavailable` | `processingTimeMs` per scan | 0,6 s tot 6,7 s; beelden 6,5–25 MP. Geen time-out (budget 165 s / 240 s) maar een snelle fout uit de ml-service. Oorzaak alleen nog uit `logo_scans` te halen (logs weg, E13). |

| E26 | Code `acc`@31ff627 via agent (`git archive`) | `apps/ml-service/app/ml/model_manager.py:88-93`, `app/core/config.py:63` | Embedder = `torchvision.models.efficientnet_b0(weights=DEFAULT)` met `classifier = Identity`, vector 1280 → eerste 512. Geen `load_state_dict`/fine-tune/`training_data` in `app/ml/` (grep nul). De getrainde ONNX-classifier is een secundaire route die alleen draait als `db_service.get_active_model()` iets geeft (`classification.py:207-209, 238-257`) — en `model_versions` is leeg (E17). Logregel bij start: `"ONNX runtime not available, using mock model"`. |
| E27 | idem | `logo-scan-flow.ts:122,233,308`; `gs1-block.ts:63,65,127`; `classification.py:184-188` | `modelVersion` komt uitsluitend uit env `LOGO_MODEL_VERSION`. `referenceVersion` = set van `detection.reference_version`; de embedding-route zet dat veld nooit → bij embedding-treffers altijd `unknown`. Alleen GHS-routes vullen het. |
| E28 | idem | `database.py:641-660`; `classification.py:165-190`; `logo-scan-flow.ts:258-275` | Classificatie = pgvector-cosinus top-1 (`limit=1, threshold=0.0`) over **alle** 542 actieve referenties van 70 soorten; de zoekruimte/codes gaan alleen naar localize, niet naar classify. `confidence = similarity`. De pijplijn stuurt `confidence_threshold: 0.99` (`logo-scan-flow.ts:274`) → vrijwel elke detectie `uncertain=true` → API-reden `twijfelachtig` (`gs1-block.ts:91`). Drempel `onder_drempel` embedding = 0,80 (`artwork-crosscheck.ts:31-33`). Gate-v2 (`keurmerk_gate.py`, drempel 0,2) zit vóór de zoektocht; fail-open als gate ontbreekt. |
| E29 | idem | `artwork.py:677-678, 1080-1103`; `model_manager.py:183-200`; `similarity.py:224,274` | Uitsnede = ruwe slice uit `cv2.imdecode(IMREAD_COLOR)` (alpha weg) → `convert("RGB")`, `Resize(256)/CenterCrop(224)`. **Geen** variantie-, wit-, alpha- of minimumgrootte-controle in de classify-keten (greps nul); de variantie-guards (`localization.py:284-301`, `artwork_template_refinement.py:81-89`) gelden alleen voor de templatematcher, niet voor de Sonnet-box zelf (`artwork.py:807`). Referenties worden met PIL `convert("RGB")` ingelezen (alpha weg zonder compositing). |
| E30 | idem | `artwork_proposals.py:17-32, 57-93, 109-133`; `artwork.py:772-820`; `logo-scan-flow.ts:263-265` | Stap 1 = één chat-completion naar OpenRouter (`GHS_REVIEW_MODEL_A`) met het beeld **verkleind tot max 2400 px, JPEG q85 ≤ 4 MB**; prompt vraagt alleen `box_2d` 0..1000, max 64 regio's. Klassieke region proposer wordt in dit pad niet aangeroepen. Daarna templateverfijning per voorstel; unie > 64 → 503. Geen grootte-/aspectfilter op de Sonnet-box. HTTP 400 = `LOGO_SCAN_MAX_PIXELS = 80.000.000` (`logo-scan-flow.ts:42`, `logo-scans.ts:78-83`): de 6 geweigerde beelden (81–125 MP) vallen daar precies boven. |
| E31 | idem | `gs1-block.ts:97`; `gs1-mapping.ts:100-121`; `flywheel/gate.ts:68,314`; `promotion.ts:193-199` | `automatisch` vereist `stand === 'automatisch'` én `validForModelVersion === modelVersion && validForReferenceVersion === referenceVersion`; met `referenceVersion = unknown` (E27) kan die check nooit slagen. Geen code of script dat "goed genoeg getraind" vaststelt of de omzettabel bijwerkt (greps nul); het enige meetmechanisme is de vliegwiel-poort `runRegressionGate` op de **gold-set van uitsneden** (`cropOnly: true`), die kandidaat-referenties activeert en de soort-stand niet raakt. |
| E32 | ml-service-log sinds 07:33Z (`docker logs`, json-file 3×10 MB) | `grep -v /health \| sed … \| sort \| uniq -c` | 186× OpenRouter `200 OK`; 179× `/ml/artwork/localize 200`; **7× localize `503`**; 137× `/ml/artwork/classify 200` (dus 42 localize-antwoorden zonder regio's → geen classify). Regio's per classify: mediaan 4, max 33. Geen enkele error-/traceback-regel; vóór elke 503 staat een OpenRouter `200 OK`. App-log: 7× `"ML Service response error … 503" → "Artwork localization failed: Visual localization unavailable"`, 2× `write EPIPE` → samen de 9 `recognition_unavailable`. Verder 770× `Redis is loading the dataset in memory` (bij start) en 516× `Too many requests` (de runner liep tegen de 429-limiet). |
| E33 | Steekproef, verkleiningsfactor per etiket (2400 px / langste zijde) | script (sectie "verkleining") | Mediaan langste zijde 4.366 px; 75 van 180 etiketten > 4.800 px (factor < 0,5). Vindkans boven 0,80 is 17% in alle drie de buckets (≤4800 / 4800–9600 / >9600 px) — verkleining verklaart het verschil dus **niet**. Gevonden vakjes meten ná verkleining mediaan 75 px (decielen 20…173 px). |
| E34 | ACC `logo_scans`, run van vandaag | `select consumer, count(*) … where created_at >= '2026-10-12 06:00+00'` | 202 scans, consumer `n8n-acc`; alle rijen `model_version=acc-20261006`, `reference_version=542:2026-08-26T06:14:43Z`, `policy_version=d65b1556…`. Per scan is alleen het eindresultaat opgeslagen (detections, items), **geen** ruwe ml-respons of aantal voorstellen vóór classificatie. |

| E36 | Leegte-audit van alle 542 actieve referenties (lokaal, scratchpad `ref-audit.py`; bestanden via de ml-service uit MinIO `training-images` gelezen, host en container opgeruimd) | exact de toelatingsregel uit `reference_content.py` (centrale 80%, kanaalbereik > 8) + stddev | **1 lege referentie**: `f1a85af9-c845-49a9-8ce3-90457da6e759` (RECYCLABLE, flywheel-promotion, bereik 0, stddev 14,1). 1 zwakke maar geldige: `6d77e66d-b619-4d62-a690-8939ca972fcc` (EU_ORGANIC_FARMING, review-confirmed, bereik 201, stddev 11,6). 540 in orde, 0 onleesbaar. De lege referentie is gekoppeld aan kandidaat `713add2d-…` (status `promoted`, batch `788eeea6-…`); embedding-rij `3b22e43e-…` is vanochtend 07:33:26Z bij de herstart opnieuw aangemaakt. |

## Confirmed Findings

**F1 — De classificatie gebruikt geen getraind model (E17, E18, E26).** De embedder is `efficientnet_b0(weights=DEFAULT)` met de classifier vervangen door `Identity`; het enige gewichtbestand in de container is het torchvision-ImageNet-checkpoint (gedownload bij containerstart). De classifier-route die een getraind ONNX-model zou gebruiken draait alleen bij een actieve rij in `model_versions`, en die tabel heeft 0 rijen; de ml-service logt bij start "ONNX runtime not available, using mock model". `training_data` (±740 gevalideerde crops voor de top 15, E20) speelt in de live route geen rol. `LOGO_MODEL_VERSION=acc-20261006` is een env-label, geen modelversie.

**F2 — Het grootste verlies zit vóór de classificatie, in stap 1 (E8, E9, E10, E30, E32).** Van 94 gemiste top-15-declaraties hebben er 78 géén item voor die soort (ook niet onder de drempel); 65 daarvan op etiketten waar Sonnet wél vakjes gaf, 13 op etiketten met nul vakjes. 43 van 180 etiketten kregen nul vakjes (42 localize-antwoorden zonder regio's in het log). Stap 1 is één OpenRouter-aanroep op een tot 2400 px verkleind JPEG; de klassieke region-proposer wordt in dit pad niet gebruikt. Of een gemist logo door Sonnet niet is aangewezen of wél is aangewezen maar een andere code kreeg, is uit de opgeslagen gegevens niet te scheiden (E34: ruwe voorstellen worden niet bewaard); dat vraagt de menselijke beoordeling op de beoordelingspagina.

**F3 — Een lege referentie veroorzaakt de RECYCLABLE-1,0-meldingen (E5, E19, E29, E35).** De actieve referentie `artwork-crops/00731509919691/17_1_bootstrap_5708_3654_810_239.png` (id `f1a85af9-…`, bron `flywheel-promotion`, 22-07-2026) is een wit vlak van 810×239 px met alleen een randlijn (stddev 14). Lokaal nagerekend met dezelfde keten (effb0 DEFAULT, Resize 256/CenterCrop 224, eerste 512 dimensies): een wit vlak en twee echte lege boxen uit de steekproef geven cosinus **1,000** met deze referentie, en 0,12 met de echte RECYCLABLE-gids-referentie. Commit 19995af (06-10) beschrijft precies dit ("blank production artwork was accepted as a recycling reference and caused nine false matches") en repareert de **toelating** van nieuwe referenties; de bestaande lege referentie op ACC is niet gedeactiveerd. Omdat de classify-keten geen variantie- of witcontrole op uitsneden heeft, wint deze referentie bij elke lege box: 23 van de 32 RECYCLABLE-items ≥ 0,99 liggen op een lege plek.

**F4 — "Automatisch" is in de huidige code onbereikbaar en elk item krijgt `twijfelachtig` (E23, E27, E28, E31).** `referenceVersion` wordt alleen door GHS-routes gezet; bij embedding-treffers is hij `unknown`, terwijl `effectiveStand` een exacte match op `validForReferenceVersion` eist. De omzettabel heeft 0 soorten op `automatisch` en overal `validFor…=null`. De pijplijn stuurt `confidence_threshold: 0.99` naar de ml-service, waardoor 774 van 881 detecties `uncertain=true` zijn en 418 van 463 items `twijfelachtig` — ook de 42 die boven 0,80 zitten.

**F5 — De classificatie zoekt zonder categoriefilter in alle 70 soorten, met een zwakke poort (E12, E28).** De zoekruimte (`beperkt: false, aantalSoorten: 70`) gaat alleen naar de prompt van stap 1; classify vergelijkt elke uitsnede met alle 542 actieve referenties (top-1). Gate-v2 wijst af onder 0,2. Gevolg: 390 van de 463 items zijn soorten die niet gedeclareerd zijn, met mediaan zekerheid 0,55; daarvan 26 boven 0,80 (buiten de lege-referentie-gevallen). Of dat echte logo's zijn (declaratie onvolledig) of fouten, vraagt de menselijke beoordeling.

**F6 — Het "goed genoeg"-signaal was nooit een nauwkeurigheidsmeting op etiketten (E15, E23, E24, E31).** De statusmatrix noemde een soort "Gereed" bij ≥ 3 echte crops, met de expliciete kanttekening "geen gemeten nauwkeurigheid". De 68 soorten op `voorstel` komen uit "logodekking-2026-10-02 (actieve referenties)". De enige meetpoort (vliegwiel-regressie) meet op uitsneden en raakt de soort-stand niet. De eerdere stap-1-meting (±77%) liep buiten de pijplijn om, op 1600 px, met een eigen prompt, op een gold-set die uit de eigen oogst komt.

**F7 — Storingen in de run (E7, E13, E25, E30, E32).** 9 scans faalden in 0,6–6,7 s: 7× een 503 uit `/ml/artwork/localize` (catch-all `except Exception → 503 "Visual localization unavailable"`, `artwork.py:811-820`; de onderliggende fout wordt niet gelogd, OpenRouter gaf steeds 200) en 2× `write EPIPE`. 6 beelden werden geweigerd omdat ze boven `LOGO_SCAN_MAX_PIXELS = 80.000.000` liggen (81–125 MP; de verticaal gestapelde lagen van de eindtest-bouw). De run liep bovendien over de uitrol van 31ff627 heen (12 scans ervoor, 190 erna) en tegen de 429-limiet van de API (516× "Too many requests").

## Deduced Conclusions

- INFERENCE: de resultaten zijn niet "ineens slecht geworden"; dit is de eerste keer dat de echte pijplijn op volledige etiketten is gemeten. Niets in code, referenties (laatste wijziging 26-08) of configuratie wijst op een regressie tussen "goed genoeg" en nu.
- INFERENCE: F1 verklaart waarom maanden "trainen" geen effect hadden op de herkenning: de validaties werden referenties, geen modelgewichten. De werkelijke hefboom zit dus in (a) de kwaliteit en dekking van de referentieset per soort, (b) stap 1, of (c) alsnog een getraind model inzetten.
- INFERENCE: F2 is waarschijnlijk de grootste bijdrage aan de 83% gemist, maar het aandeel "niet aangewezen" versus "verkeerd geclassificeerd" is pas te splitsen na menselijke beoordeling (beoordelingspagina deel C, 204 kaarten) of na een run die de ruwe voorstellen van stap 1 bewaart.
- INFERENCE: F3 verklaart minstens 23 van de 48 niet-gedeclareerde items boven 0,80 en vertekent elke valse-meldingsmeting voor RECYCLABLE; het vliegwiel kan dit opnieuw veroorzaken zolang alleen de toelating en niet de bestaande set is gecontroleerd.
- INFERENCE: de verkleining tot 2400 px kost zichtbaarheid (vakjes mediaan 75 px na verkleining) maar verklaart niet het verschil tussen etiketten (E33: 17% in alle grootteklassen).

## Hypothesized Paths

| # | Hypothese | Voorspelt | Dodelijke test | Uitkomst |
|---|---|---|---|---|
| H1 | Referentieset op ACC leeg/inactief/zonder embeddings voor (een deel van) de top 15 | weinig of geen actieve referenties met embedding per code | E19: per soort 11–39 actieve referenties, elk met embedding | **REJECTED** — de set is gevuld; wel 26 inactieve RECYCLABLE-realrefs zonder embedding en geen nieuwe referenties sinds 26-08 |
| H2 | Het getrainde model wordt op ACC niet gebruikt; classify draait op basismodel-embeddings | geen gewichten, `model_versions` leeg | E17, E18, E26 | **CONFIRMED** (F1) |
| H3 | Lokalisatie (stap 1) mist vakken op volledige etiketten | gemist zonder enig item voor de soort | E8–E10, E32 | **CONFIRMED** als hoofdbijdrage (F2); splitsing "niet aangewezen" vs "verkeerd geclassificeerd" UNTESTABLE uit de opgeslagen data |
| H4 | Lege uitsneden geven constante embedding die RECYCLABLE 1,0 matcht | een actieve RECYCLABLE-referentie is zelf leeg | E35 (lokale herberekening, cosinus 1,000 met referentie `f1a85af9`) | **CONFIRMED** (F3) |
| H5 | Drempel 0,80 is afgesteld op uitsneden, niet op pijplijn-uitsneden | echte positieven zitten net onder 0,80 | E11: gedeclareerde items decielen 0,42–0,78 onder de mediaan, daarboven 0,94–1,0 | **PARTIEEL** — ±40% van de gedeclareerde items zit tussen 0,42 en 0,78; een lagere drempel helpt die, maar lost F2 (geen item) niet op en verhoogt de valse meldingen (niet-gedeclareerd mediaan 0,55) |
| H6 | "Goed genoeg"-conclusie was opgeblazen door train/test-overlap | eerdere meting op gold-set met 51/83 bronnen in training | E15, E24, E31 | **CONFIRMED in bredere zin** (F6): niet alleen overlap, het signaal was nooit een etiketmeting |

## Recommended actions

| # | Actie | Type | Prioriteit |
|---|---|---|---|
| 1 | Lege referentie `f1a85af9-c845-49a9-8ce3-90457da6e759` (RECYCLABLE, flywheel-promotion) op ACC deactiveren en de embedding verwijderen; daarna de 542 actieve referenties eenmalig op leegte/variantie controleren (de check uit 19995af bestaat al, alleen voor toelating). | ACC-schrijfactie, vraagt akkoord per geval met manifest | hoog |
| 2 | Witte/lege uitsneden in de classify-keten afwijzen vóór embedding (variantie/alpha-controle, zoals de templatematcher al doet), zodat één slechte referentie nooit meer 1,0 kan scoren. | codewijziging via BMAD (spec → review → bouw) | hoog |
| 3 | Menselijke beoordeling van de 204 gemiste en 41 extra kaarten (beoordelingspagina, lokaal) om F2 te splitsen in "niet aangewezen" en "verkeerd geclassificeerd", en om de echte valse-meldingskans te meten. | mens, read-only | hoog |
| 4 | Stap 1 bewaren en meetbaar maken: ruwe voorstellen van Sonnet (vóór verfijning) en de onderliggende fout bij een 503 opslaan in `logo_scans`; de catch-all in `artwork.py:811-820` logt nu niets. | codewijziging via BMAD | hoog |
| 5 | Besluit over de modelstrategie: (a) referentiegedreven blijven en per soort de referentieset uitbreiden en meten, (b) de bestaande `training_data` daadwerkelijk gebruiken voor een getraind classifier/embedder en die in `model_versions` registreren, of (c) de classificatie óók aan het visuele model vragen. Dit is een productkeuze. | besluit Friso | hoog |
| 6 | `referenceVersion` ook voor embedding-treffers vullen (bijv. uit `referencePoolVersion()`), anders kan `automatisch` nooit gelden; en `confidence_threshold 0.99` in `logo-scan-flow.ts:274` vervangen door de echte drempel per methode, zodat `twijfelachtig` iets betekent. | codewijziging via BMAD | middel |
| 7 | De categoriezoekruimte ook in classify toepassen (nu alleen in de prompt van stap 1), en gate-v2/drempel per soort pas afstellen ná actie 3. | codewijziging via BMAD | middel |
| 8 | Eindtest-bouw: lagen niet verticaal stapelen tot > 80 MP (6 weigeringen) of per laag scannen; runner onder de 429-limiet houden en niet over een uitrol heen laten lopen. | meetprocedure | middel |
| 9 | Overdracht corrigeren: steekproef liep 12-10 06:00–09:13Z op a364d85→31ff627, niet 11-10 's avonds. | documentatie | laag |

## Out of scope

- Pictogram-categorie gescheiden inzameling (SEPARATE_COLLECTION) en de afvalpictogrammen die als GREEN_DOT/biologisch worden herkend.
- GHS-specialist (EXCLAMATION_MARK e.d.): aparte route, heeft geen referenties in `reference_logos` (bevestigd via twee routes) en valt buiten de top 15.
- Productie: niet gemeten; de lege referentie uit 19995af was daar al gevonden ("exactly one blank reference") — of die daar gedeactiveerd is, is hier niet gecontroleerd.

## Opruiming

Op vanilla: `/tmp/haal-refs.py` en `/tmp/refs-uit` verwijderd (gecontroleerd met `ls`: niet aanwezig). In de ml-service-container: `/tmp/refs-uit` en `/tmp/haal-refs.py` verwijderd. Lokaal staan de 10 referentieplaatjes en de steekproefbeelden alleen in de scratchpad.

## Uitvoering (12-10-2026, 10:38Z, goedgekeurd door Friso: alleen manifest-actie 1)

| Stap | Commando / query | Uitkomst |
|---|---|---|
| Deactiveren | vanilla: `curl -X PATCH http://127.0.0.1:8010/api/v1/reference-logos/f1a85af9-c845-49a9-8ce3-90457da6e759/deactivate` | HTTP 200, antwoord `{"id":"f1a85af9-…","t3777Code":"RECYCLABLE_GENERAL_CLAIM","variantLabel":"auto-788eeea6-4","active":false}` |
| Controle rij | cherry: `select id, active from reference_logos where id='f1a85af9-c845-49a9-8ce3-90457da6e759'` | `active = f` |
| Controle set | `select count(*) filter (where active), count(*) from reference_logos` | 541 actief van 604 (was 542); actieve referenties met embedding: 541 |
| Bijwerking | `select value from system_settings where key='flywheel.baselineStale'` | `{"stale": true, "reason": "reference-curatie", "at": "2026-10-12T10:38:04Z"}` (stond al op stale sinds 26-08) |
| Logs | app: "Reference logo deactivated", "Baseline gemarkeerd als verouderd"; ml-service: "Reference-template cache invalidated via reload-templates", `POST /ml/artwork/reload-templates 200` | geslaagd |

**Terugdraaien:** op cherry `update reference_logos set active = true where id = 'f1a85af9-c845-49a9-8ce3-90457da6e759';` (de app heeft geen activeer-route). De embedding-rij `3b22e43e-d5a7-4a7f-af78-c115c664178a` is niet verwijderd en wordt bij de volgende rebuild (containerstart) vanzelf opgeruimd omdat alleen actieve referenties worden ingebed.

**Niet uitgevoerd:** manifest-actie 2 (controlescan) — niet goedgekeurd. De `reference_pool_version` in `logo_scans` wordt vanaf nu `541:…`, dus eerdere scans worden niet meer als duplicaat hergebruikt (bedoeld effect).
