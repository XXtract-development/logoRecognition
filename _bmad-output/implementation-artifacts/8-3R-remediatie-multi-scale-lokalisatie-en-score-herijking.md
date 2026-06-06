# Story 8.3R: Remediatie — multi-scale lokalisatie en score-herijking

Status: done — alle AC's vervuld; AC4-gate 9/9 ná ground-truth-herstel (optie A, akkoord Friso 2026-06-06; zie `8-3R-meetrapport.md`)

## Story

As a datamanager,
I want dat de keurmerk-lokalisatie templates intern over een realistisch groottebereik schaalt en een discriminerende match-score gebruikt,
so that productie-detectie op echte artwork daadwerkelijk keurmerken vindt zonder caller-side workarounds en zonder honderden false positives.

## Waarom (bewijs uit fase B, 2026-06-05/06)

- 🔴 `match_templates` is **single-scale**; de docstring claimt multi-scale maar er is geen schaal-lus. Story 8.3 Task 1 schreef multi-scale (0,5×–2,0×) voor — nooit geïmplementeerd.
- 🔴 **Gemeten op ACC (2026-06-06):** referenties zijn 500–960 px max-dim (EU_ORGANIC 960×644, V-LABEL 687×915, FSC 960×960, GREEN_DOT 960×960, RAINFOREST 500×369); echte instanties op artwork zijn ~110 px breed (review-bboxes 110×73 t/m 110×146). Werkelijke ratio ≈ **0,11×–0,22×** — zelfs het originele 0,5×–2,0×-bereik had dit NIET gedekt. Templates > tile (640) worden nu geskipt ("Template larger than tile") → 0 detecties op productie-invoer.
- 🟠 Score: `TM_SQDIFF` genormaliseerd als `1 − min/max` discrimineert zwak → 1446 FP's op 13 afbeeldingen bij `min_score=0.8` (met de caller-side multi-scale workaround). NB: dit getal is **context, geen vergelijkbare baseline** — andere metric, andere scaling-route (reviewbevinding 6).
- 🟡 Contract-inconsistentie: localize leest `image_path` van het bestandssysteem (`cv2.imread`); classify leest `storage_path` uit MinIO. Tunables ontbreken in de request-body.

**Scope-afbakening (verwachtingsmanagement):** deze story fixt de matching-*engine*. "Productie-detectie vindt niets" heeft twéé oorzaken: single-scale (deze story) én het ontbreken van een server-side caller — er is geen enkele Node-aanroep van `/ml/artwork/localize` (bevinding 4). End-to-end auto-detectie vereist dus óók story 8.3O (orkestratie, apart). De REINDEX-hook (bevinding 3) is een apart subsysteem (pgvector) en zit níét in deze story.

## Ontwerpbeslissingen (vastgelegd ná adversarial review — niet heronderhandelen tijdens implementatie)

1. **Schaal-ladder leeft in de localize-flow (endpoint), NIET in `match_templates`** (reviewbevinding 2). `prepare_scaled_templates(...)` berekent de varianten één keer per request; `match_templates(tile, templates, min_score)` houdt zijn **byte-identieke publieke signatuur** en blijft per aangeleverde template single-scale. De 4 bestaande ATDD-tests raken de service-functies direct en moeten ongewijzigd groen blijven.
2. **Ladder-definitie** (reviewbevinding 9): doel-instantiegroottes in px van `LOCALIZE_SCALE_MIN_PX` (default 48) t/m `LOCALIZE_SCALE_MAX_PX` (default 512, geclamped op tile-grootte), stapfactor `LOCALIZE_SCALE_STEP` (default 1,25). **Schaalfactor = doelgrootte / max(ref_breedte, ref_hoogte); aspect-ratio behouden.** AR-afwijkingen tussen echt logo en referentie zijn buiten scope (geen affine zoek). De ladder dekt aantoonbaar de gemeten ratio 0,11×–0,22×.
3. **Score-metric** (reviewbevinding 1 — empirisch onderbouwd): primair `TM_CCOEFF_NORMED`, geclipt naar [0,1]. **Verplichte fallback-tak, alléén voor écht degenerate templates:** als de template-stddev (van de geschaalde, alpha-geneutraliseerde variant) < `LOCALIZE_DEGENERATE_STD` (default **1,0** — bewust ONTKOPPELD van `LOCALIZE_MIN_VARIANCE`), dan het bestaande `TM_SQDIFF` `1−min/max`-pad. Rationale: CCOEFF_NORMED degenereert op (bijna-)uniforme templates (hele map = 1.0, locatie (0,0)) — de bestaande zwarte-template-fixture (stddev exact 0) bewijst dit en neemt de fallback. **Waarom ontkoppeld van de 12-drempel (gemeten 2026-06-06):** echte referenties op de kleinste ladder-schaal (48px, ná alpha-neutralisatie) hebben stddev 14,0 (EU_ORGANIC) t/m 59,8 (RAINFOREST) — bij een trigger op 12 zou EU_ORGANIC op 48px maar 2 punten van een stille metric-omslag midden in de ladder zitten, waarna de beste-schaal-collapse (beslissing 5) onvergelijkbare scores zou maximaliseren. Met trigger 1,0 is de fallback een puur test-shim die op het productiepad nooit vuurt → het productiepad is gegarandeerd single-metric. Score-semantiek per tak documenteren in code én meetrapport (reviewbevinding 12).
4. **Alpha-neutralisatie** (reviewbevinding 4): referenties met alpha-kanaal worden bij decodering NIET geplat naar zwart; transparante pixels krijgen de **gemiddelde waarde van de opake pixels** (deviatie ≈ 0 onder CCOEFF → dragen niet bij aan de correlatie). GREEN_DOT (rond, transparante hoeken) is verplicht onderdeel van de kalibratie-validatie.
5. **Beste-schaal-collapse vóór NMS** (reviewbevinding 3): per (t3777_code, tegel) wordt over alle schaal-varianten alléén de hoogst scorende match behouden, vóórdat de detectie in `raw_detections` belandt. NMS alleen redt dit niet (48px- en 286px-box op zelfde centrum hebben IoU ≈ 0,03).
6. **Variance-guard op de geschaalde variant** (reviewbevinding 10): guards (uniform-bright op template én matchregio) gelden per geschaalde variant; weigeringen worden per schaal gelogd zodat de kalibratie zichtbaar maakt wat de guard kost.
7. **Request-budget** (reviewbevinding 7): `LOCALIZE_TIME_BUDGET_S` (default 30) — graceful afkap mét warning in log en `"truncated": true` in de response. Kostenmodel: **kleine schalen domineren** (48px-template op 640px-tegel → ~593×593 correlatiemap per ref per tegel); de ladder-onderkant is het duurst.

## Acceptance Criteria

1. **Multi-scale in de localize-flow:** Given een referentie van willekeurige resolutie (incl. groter dan de tile) en een artwork, When `/ml/artwork/localize` draait, Then worden alle templates één keer per request geschaald volgens ontwerpbeslissing 2 And templates groter dan de tile worden gedownscaled in plaats van geskipt And de teruggegeven bbox heeft de gematchte (geschaalde) afmetingen And de caller hoeft NIET te pre-schalen And per (t3777_code, tegel) overleeft alleen de beste schaal (collapse vóór NMS, ontwerpbeslissing 5). Ladder via env én request-body instelbaar.
2. **Score-herijking:** Given de matching, When een score wordt berekend, Then volgt die ontwerpbeslissing 3 (CCOEFF_NORMED [0,1] + gedocumenteerde fallback-tak) And blijven de variance-guards van kracht op de geschaalde variant (ontwerpbeslissing 6) And is alpha geneutraliseerd volgens ontwerpbeslissing 4 And is de score-semantiek per tak gedocumenteerd.
3. **API-consistentie localize:** Given het `/ml/artwork/localize`-endpoint, When een request binnenkomt, Then accepteert het `storage_path` (MinIO-objectkey in de training-bucket, zelfde semantiek als classify) naast `image_b64` And is `image_path` (bestandssysteem-pad) verwijderd And zijn `tile_size`, `overlap`, `min_score` en de schaal-parameters optioneel in de body met env-defaults And geeft een onvindbare `storage_path` een 4xx met duidelijke melding.
4. **Empirische validatie als done-criterium (geen synthetische facade):** Given de gefixte engine en de gepinde ACC-meetset (5 referenties; **12 geïmporteerde artworks; 9 composiet-reviewitems over 3 GTIN's**), When de hermeting draait via het reproduceerbare script `apps/ml-service/scripts/remeasure_localization.py` (deliverable van deze story; ADMIN-vrij; read-only m.u.v. bestaande applicatiepaden), Then:
   - (a) **composiet-recall-gate:** alle 9 geplante logo's worden gevonden mét native-size referenties als input (geen caller-side pre-scaling). Deze gate is haalbaar én falsifieerbaar: de composieten zijn uit dezelfde referentie-PNG's opgebouwd én hun plak-groottes (max-dim 110 en 146 px, geverifieerd 2026-06-06) liggen binnen de ladder, naast de stappen 117 (Δ6%) en 146,5 (Δ0,3%) — een schaal-mismatch ≤ 6% mag de match niet breken;
   - (b) **kalibratie:** score-distributies (matches én afgewezen kandidaten, incl. guard-weigeringen per schaal) worden gelogd; de drempel is een *output* van deze kalibratie en wordt met onderbouwing vastgelegd; het FP-aantal wordt gerapporteerd **bij de drempel die de composiet-recall-gate haalt** op de gepinde set. De oude 1446 is context, geen vergelijkingscriterium;
   - Rapport: `_bmad-output/implementation-artifacts/8-3R-meetrapport.md`. AC-bewijs = rapport + script, onafhankelijk gereproduceerd door de orchestrator.
5. **Tests:** Given de pytest-suite, When de wijziging af is, Then blijven de bestaande 4 lokalisatie-tests **ongewijzigd** groen (beide metric-takken geverifieerd tegen de fixtures: zwart template → fallback-tak → score 1.0 op (100,150); wit template → bright-guard-skip) And zijn er nieuwe tests voor: (i) instance op ~0,15× van template-grootte wordt via de flow gevonden, (ii) template groter dan tile wordt gedownscaled i.p.v. geskipt, (iii) metric-takken + alpha-neutralisatie (GREEN_DOT-achtig rond fixture), (iv) beste-schaal-collapse per tegel + NMS over tegelgrenzen, (v) **endpoint-handler-test** voor `localize_artwork` analoog aan de rasterize-handler-tests: `storage_path` via MinIO-mock, 4xx bij fetch-fail, tunables-doorgifte (reviewbevinding 5). De synthetische tests bewijzen het mechanisme; AC4 bewijst de werking — beide verplicht.

## Tasks / Subtasks

- [ ] Task 1: Multi-scale + score-herijking in `apps/ml-service/app/services/localization.py` (AC 1, 2)
  - [ ] `prepare_scaled_templates(templates, *, scale_min_px, scale_max_px, scale_step, tile_size) -> list[dict]` — varianten met `{t3777_code, image, scale, source_max_dim}`; alpha-neutralisatie hier (ontwerpbeslissing 4)
  - [ ] Metric-implementatie met fallback-tak (ontwerpbeslissing 3); `match_templates`-signatuur byte-identiek
  - [ ] Variance-guards per geschaalde variant + weigering-logging per schaal (ontwerpbeslissing 6)
  - [ ] Docstrings waarheidsgetrouw (de huidige multi-scale-claim was de facade)
  - [ ] Env-vars: `LOCALIZE_SCALE_MIN_PX=48`, `LOCALIZE_SCALE_MAX_PX=512`, `LOCALIZE_SCALE_STEP=1.25`, `LOCALIZE_TIME_BUDGET_S=30`, `LOCALIZE_DEGENERATE_STD=1.0`
- [ ] Task 2: Endpoint `apps/ml-service/app/api/artwork.py` (AC 1, 3)
  - [ ] Ladder + collapse in de flow; budget-afkap met `"truncated"`-veld (ontwerpbeslissing 7)
  - [ ] `storage_path` via `storage_service.get_training_image` (zelfde pad als classify); `image_path` verwijderen; tunables in body (Pydantic)
- [ ] Task 3: Kalibratie + hermeting op ACC (AC 4) + metingen zonder gate
  - [ ] Script `apps/ml-service/scripts/remeasure_localization.py` (deliverable, reproduceerbaar, ADMIN-vrij)
  - [ ] **Meting (geen gate, reviewbevinding 8): natuurlijke opbrengst** op de 12 echte artworks rapporteren — beantwoordt open bevinding 6 (dragen de 6 testproducten echte keurmerken?)
  - [ ] **Facade-guard op de kalibratie:** rapporteer óók de score-distributie van de natuurlijke-opbrengst-run naast de composiet-distributie — zichtbaar maken of echte (kleinere, lager-contrast) keurmerken de composiet-gekalibreerde drempel zouden overleven. Een drempel die alleen op synthetisch-makkelijke composieten is afgesteld kan zelf een facade zijn
  - [ ] Throughput per bestand loggen (tegels × refs × schalen, tijd) met extrapolatie naar de 39k-voorraad
  - [ ] Meetrapport `8-3R-meetrapport.md`
  - [ ] ⚠️ Geen DB-mutaties buiten bestaande applicatiepaden; geen migraties; nieuwe review-items uit de opbrengst-run zijn toegestaan (bestaand crosscheck-pad)
- [ ] Task 4: Tests (AC 5)
  - [ ] 4 bestaande tests ongewijzigd groen — beide metric-takken expliciet tegen de fixtures verifiëren vóór sign-off (reviewbevinding 1/12)
  - [ ] Nieuwe tests (i)–(v); pytest lokaal via `/tmp/ml-venv` vanuit /tmp (handover-les)

## Expliciet buiten scope (aparte items)

| Item | Waar |
|---|---|
| Server-side detectie-orkestratie (localize→classify→crosscheck) + templates uit referentiebibliotheek laden i.p.v. caller-supplied b64 | Story 8.3O — backlog, vereist deze story |
| REINDEX-hook in `rebuild_reference_embeddings` (ivfflat-les) | Mini-fix, eigen item |
| Baseline-recall-meting op prod-Mongo pilot-crops (origineel 8.3 AC2, nooit uitgevoerd) | Beslismoment PO ná deze fix + 8.3O |
| Per-klasse drempels in ReferenceLogo-metadata | Kalibratie-vervolg, pas zinvol mét 8.3O |

## Dev Notes

- **Domeinvoordeel blijft:** drukwerk staat recht — alleen schaal, géén rotatie.
- **Coördinaten-discipline:** match in tegel-ruimte + offsets → terugrekenen naar bronbeeld vóór NMS (bestaand gedrag behouden).
- **Performance (gecorrigeerd na review):** kleine schalen domineren de kosten — een 48px-template op een 640px-tegel geeft een ~593×593 map per ref per tegel; 512px geeft ~129×129. Budget-afkap is daarom verplicht (ontwerpbeslissing 7). Grijswaarden eerste pass (bestaand); geschaalde templates één keer per request.
- **Kalibratie-realisme:** de composieten zijn geplakt op 110 px — echte keurmerken kunnen kleiner/groter zijn; de natuurlijke-opbrengst-meting (Task 3) is de eerste echte toets.
- **Facade-les (Epic 8 én 9.3):** groene synthetische tests zijn GEEN bewijs van werking — AC 4 is het done-criterium; de orchestrator verifieert onafhankelijk met bestand+regel+meetuitvoer.

### Referenties

- `review-8-3R-voorwerk.md` (adversarial review, 12 bevindingen — alle verwerkt)
- `fase-b-bevindingen-2026-06-05.md` (bevindingen 1, 2, 3-API, 6)
- `8-3-keurmerk-lokalisatie-op-artwork.md` (origineel contract + ATDD)
- `apps/ml-service/app/services/localization.py` · `apps/ml-service/app/api/artwork.py`
- ACC-metingen 2026-06-06: referentie-groottes + review-bboxes (sectie Waarom)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 — orchestrator-inline (agent-infra instabiel; 2× socket-crash, daarna inline conform watchdog-protocol), 2026-06-06.

### Completion Notes List

- AC1 (multi-scale flow): `apps/ml-service/app/services/localization.py` — `prepare_scaled_templates` (ladder + AR-behoud + alpha-neutralisatie, regels ~130–215); collapse per (code, tegel) vóór NMS in `apps/ml-service/app/api/artwork.py` handler; tests (i)/(ii)/(iv) groen
- AC2 (score-herijking): CCOEFF_NORMED [0,1] op max_loc + degenerate-fallback (< `LOCALIZE_DEGENERATE_STD`=1.0) naar legacy SQDIFF-pad op min_loc; guards per geschaalde variant + weigering-logging; tests (iii) + beide beschermde metric-fixtures groen
- AC3 (API): `LocalizeRequest` zonder `image_path`, mét `storage_path` + 6 tunables; `truncated`-veld; 422-pad; endpoint-handler-tests (v) groen
- AC4 (empirische validatie): **gate 9/9 PASSED** (run 3) ná herstel van 5/9 corrupte fase-B-items (1 mislabel + 4 witte crops; kruisproef-bewijs in rapport) via optie A mét expliciet akkoord; gekalibreerde drempel 0,55 bij stap 1,10 (FP=3 op schone set); eerste natuurlijke detectie (RAINFOREST op Theunisse-koffie, 0,68); throughput 11,6 s/bestand → 39k ≈ 126 uur
- AC5 (tests): 11 nieuwe ontskipt + groen; 4 beschermde byte-identiek groen; volledige suite: delta t.o.v. baseline = exact +11 passed, 0 nieuwe failures
- Mock-state-lek gefixt in de 2 nieuwe endpoint-tests (gedeelde conftest-mock resetten i.p.v. vervangen — aantoonbare testfout, gedocumenteerd)

### File List

- apps/ml-service/app/services/localization.py (herschreven: ladder, metric, guards, docstrings)
- apps/ml-service/app/api/artwork.py (LocalizeRequest/Response + handler-flow + docstring)
- apps/ml-service/scripts/remeasure_localization.py (nieuw, AC4-deliverable)
- tests/test_localization_multiscale.py (11 ontskipt + mock-lek-fix)
- _bmad-output/implementation-artifacts/8-3R-meetrapport.md (nieuw)
