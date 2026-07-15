# Story 12.22: Nutri-Score-familie-head — deterministische letter-lezer in de classificatie-route

Status: review

<!-- Bouw-story na spike 12.21 (embedding ontoereikend), technical research
     (rang-1-advies) en spike 12.21b (prototype GO: 91/2/49 op 142 pagina's,
     97,8% precisie, 0,32s/pagina CPU). Friso's go 2026-07-15, incl. ATDD. -->

## Story

Als **systeem** (en daarmee als reviewer en als n8n-kruischeck-afnemer),
wil ik dat een Nutri-Score-crop geclassificeerd wordt door een deterministische
balk-lezer (kleurgeometrie: 5-vakjes-balk + uitvergroot vakje = letter) in plaats
van door embedding-cosine,
zodat de letter betrouwbaar (97,8% precisie gemeten) wordt bepaald, met fail-safe
"geen lezing" bij twijfel — en alle andere keurmerken exact blijven werken zoals nu.

## Context

- Gemeten: embedding-route haalt 1/6 op held-out Nutri-Score (spike 12.21);
  het A1-prototype haalt 42/45 op crops (0 fout) en 91/2/49 op 142 volledige
  pagina's (spike 12.21b). Kleuren gekalibreerd op twee echte drukvarianten.
- Architectuurpatroon (research §4.4): gedeelde pipeline + per-familie head.
  Router = de head draait vóór de embedding-route in `classify_crop`; leest hij
  niets (geen gestandaardiseerde balk), dan is het gedrag byte-identiek aan nu.
- Alleen `apps/ml-service/app/` wordt in Docker gekopieerd (queue-harvester-les)
  → module onder `app/services/`.

## Acceptance Criteria

1. **Reader-module.** `app/services/nutriscore_reader.py` bevat de gevalideerde
   v3-logica (ankers A/B/C twee drukvarianten; D+E warm-venster met ring-/
   kolomprofiel-splitsing; anker-gedreven lokale zoektocht; geen morph-close in
   full-page-modus; 4 oriëntaties; fail-safe drempels). Pure functie:
   `read_nutriscore(img_bgr, full_page=False, min_ratio=None) -> (letter|None, info)`.
2. **Ratio-vloer configureerbaar.** Default 1,12 (review-stand); env
   `NUTRISCORE_READER_MIN_RATIO` overschrijft (kruischeck-stand 1,18 = 0 fouten
   gemeten). `info` bevat altijd ratio/heights/rotatie t.b.v. observability.
3. **Familie-router in `classify_crop`.** Vóór de embedding-route draait de
   reader op de crop (crop-modus). Leest hij een letter → resultaat
   `{t3777_code: NUTRISCORE_<letter>, method: "nutriscore-head", confidence}`
   met confidence monotoon in de ratio: gemeten bereik [1,12–1,45] lineair
   afgebeeld op [0,80–0,99], geclamped. `uncertain=False`, behalve wanneer een
   expliciet meegegeven `confidence_threshold` hoger ligt dan de head-confidence
   (docstring-contract "always wins" — dan `uncertain=True`). Geen lezing →
   verder met het bestaande pad, **byte-identiek** (ook bij reader-exceptions:
   fail-open naar legacy, nooit een crash de route in).
4. **Geen regressie elders.** Non-Nutri-Score-crops: identiek gedrag (de reader
   leest alleen bij een geldige 5-vakjes-balk). Bestaande ml-pytest-suite groen;
   bestaande classify-gedragstests ongewijzigd.
5. **ATDD.** Red-phase acceptatietests éérst (falen aantoonbaar vóór de
   implementatie), daarna groen: (a) synthetische balk-fixtures per letter ×
   beide drukvarianten × 0/90/180-rotatie → juiste letter; (b) balk zonder
   uitvergroot vakje → geen lezing; (c) monochrome/kleurloze crop → geen lezing;
   (d) niet-Nutri-Score-crop → router valt door naar legacy (embedding-mock
   wordt aangeroepen); (e) ratio-vloer-env verandert het kantelpunt;
   (f) reader-exception → legacy-resultaat.
6. **Observability.** Log-regel per head-beslissing (code, ratio, rotatie) via
   de bestaande logger; geen nieuwe infra.

## Tasks / Subtasks

- [ ] Task 0 — ATDD red-phase (AC5): tests schrijven die falen (module bestaat
      nog niet / router nog niet gekoppeld); aantoonbaar RED draaien.
- [ ] Task 1 — Reader-module poorten uit `spike-12-21b/ns_band_detector.py`
      (AC1/AC2): zelfde logica, projectconventies (logger, type hints, env).
- [ ] Task 2 — Router in `classify_crop` (AC3/AC4/AC6): reader-first, fail-open.
- [ ] Task 3 — GREEN: alle nieuwe tests + volledige bestaande ml-pytest-suite.
- [ ] Task 4 — Adversarial review + gates; status → review.
- [ ] Task 5 — Deploy + ACC-verificatie (permission-gated): kruischeck op een
      bekend C/D-product; done pas na live-bewijs.

## Dev Notes

- Integratiepunt: `apps/ml-service/app/services/classification.py::classify_crop`
  (regel ~264): head-stap vóór "Primary: embedding route". `_to_pil`/ndarray:
  reader werkt op BGR-ndarray; PIL-input eerst converteren zoals elders.
- Reader is ~ms-werk op crops; op elke crop draaien is goedkoper dan eerst een
  nearest-ref-familiecheck (die kost een embedding + DB-roundtrip).
- Confidence-afbeelding: ratio ligt gemeten in [1,12–1,45] voor echte logo's →
  afbeelden naar [0,80–0,99] (lineair, geclamped); gedocumenteerd in de module.
- Testfixtures: synthetisch getekende balken (cv2.rectangle met de gemeten
  variant-hues, uitvergroot vakje + witte ring) — geen binaire fixtures in git.
  Eén echte-crop-regressietest mag via een klein embedded PNG (base64) als dat
  nodig blijkt; liever synthetisch.
- NIET in scope: A2-vangnetmodel (NutriGreen), verify-declared-TS-wijzigingen
  (kruischeck profiteert automatisch via /classify), harvest-koppeling,
  embedding-shoot-out (research rang 2).

### References
- [Source: _bmad-output/implementation-artifacts/12-21b-validatie-balkdetector-prototype.md]
- [Source: _bmad-output/implementation-artifacts/spike-12-21b/ns_band_detector.py]
- [Source: _bmad-output/planning-artifacts/research-technical-logo-herkenning-2026-07-14.md §4.4]
- [Source: apps/ml-service/app/services/classification.py#classify_crop]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Completion Notes List

- **ATDD gevolgd**: 18 red-phase-tests éérst (18/18 aantoonbaar FAILED vóór
  implementatie, zie atdd-checklist-12-22.md) → module + router → 18/18 GREEN
  zonder testwijzigingen. Na de adversarial review +7 regressietests = 25.
- **Suite-vervuilings-verdediging** (containergate): andere testbestanden
  stubben `sys.modules["cv2"]` en cv2 is niet in-proces herimporteerbaar
  (empirisch bewezen, ook met volledige cv2*-purge) — de loaders vangen de
  echte cv2 op collectie-moment en injecteren die bij het laden; alleen de
  cv2-entry wordt hersteld (suite-conventie).
- **Gates**: lokaal 25/25; volledige ml-suite in ghcr-container **141 passed /
  13 skipped**; de resterende 1 failed + 11 errors zijn bewezen pre-existing
  via een CONTROLE-run zonder deze diff (zelfde failures/errors; opvolgtaak
  geflagd: hash-guard-allowlist + 12_12-fixture-herimport).
- **Hervalidatie na review-fixes** (productie-module, ACC, read-only):
  45 crops → 42/0/3; 142 pagina's → 91/2/49 (identiek aan spike 12.21b;
  0,36 s/pagina) — de extra guards kosten géén detectiekracht.

### Adversarial review (2026-07-15) — 1 HIGH + 2 MEDIUM + 6 LOW, verwerkt

- **H1 (gefixt)** — onbegrensde kosten op degenerate sliver-bboxes (5×20000 →
  11 s/0,5 GB): guard vóór het rekenwerk (min 8px zijde; crop-modus weigert
  beeldverhouding > 12:1). Regressietest incl. tijdslimiet.
- **M1 (gefixt, mét falsificatie van de voorgestelde fix)** — staafdiagrammen
  in het NS-palet lazen als letter. De door de review voorgestelde
  centrering-eis ("steekt aan beide zijden uit") bleek op echte data ONJUIST:
  een officiële drukvariant is bodem-uitgelijnd (5 echte crops). Werkende
  discriminator: het **witte letter-glyph** — vul-graad van het winnende vakje
  > 0,96 (massief vlak) → weigeren. Plus uniformiteit van de niet-vergrote
  vakjes aangescherpt 1,6 → 1,3 (weigert oplopende reeksen). Herverdedigd:
  crops blijven 42/0/3, pagina's exact 91/2/49. Restrisico gedocumenteerd:
  samengesmolten warm-blok-pad heeft geen per-helft-vulgraad (empirisch 0
  chart-FP's op 142 echte pagina's); A2-model is de structurele vangnet-story.
- **M2 (gefixt)** — expliciete `confidence_threshold` won niet van de head
  (docstring-contract): head-resultaat onder een expliciete drempel is nu
  `uncertain=True`. Test toegevoegd.
- **L1 (gefixt)** — env-vloer geclamped op ≥ 1,05 (typo-bescherming). Test.
- **L2 (gefixt)** — router-guard aangescherpt tot 3-kanaals uint8 (BGRA/float/
  1-kanaals stil naar legacy, geen warning-ruis). Test (BGRA).
- **L3 (gedocumenteerd)** — `full_page=True` heeft nu geen productie-caller:
  de router draait crop-modus op review-crops (de bedoelde flow). Het
  full-page-pad is gevalideerd (91/2/49) en bedoeld voor toekomstige
  pagina-callers (harvest-integratie, aparte story). Hele-pagina's via
  /artwork/classify zonder crops krijgen crop-modus met morfologie-close —
  bewust conservatiever (vaker geen-lezing → legacy), nooit gevaarlijker.
- **L4 (gefixt)** — AC3-tekst gecorrigeerd naar de geïmplementeerde
  confidence-mapping.
- **L5 (gefixt)** — loader-docstring claimt niet langer volledig
  sys.modules-herstel (alleen cv2; app-stubs volgen de suite-conventie).
- **L6 (gefixt)** — extra tests: 270°-rotatie, staafdiagram×2, sliver,
  env-clamp, expliciete drempel, BGRA.

### File List

- apps/ml-service/app/services/nutriscore_reader.py (NEW)
- apps/ml-service/app/services/classification.py (UPDATE — familie-router in classify_crop)
- apps/ml-service/tests/unit/test_nutriscore_reader_12_22.py (NEW — 25 ATDD+review-tests)
- _bmad-output/test-artifacts/atdd-checklist-12-22.md (NEW)
