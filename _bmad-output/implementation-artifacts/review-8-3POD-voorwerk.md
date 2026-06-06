# Adversarial review — voorwerk 8-3P / 8-3O / 8-3D (2026-06-06)

Reviewer: onafhankelijke agent (verse context), bevindingen in code geverifieerd.
Verdicts vóór verwerking: 8-3P GO-MITS · 8-3O GO-MITS · **8-3D NO-GO** · alle bevindingen hieronder zijn verwerkt in de story-files.

| # | Ernst | Bevinding (kern, in code geverifieerd) | Verwerking |
|---|---|---|---|
| P1 | 🔴 | ReferenceLogo heeft GÉÉN metadata/JSON-veld — "geen migratie nodig" was onwaar | Per-klasse drempels uitsluitend via ML-side env-map `LOCALIZE_CLASS_THRESHOLDS` (JSON); metadata-framing geschrapt |
| P2 | 🔴 | Top-k over schaal-varianten levert geen tweede locatie (minMaxLoc single-peak; NMS collapst zelfde centrum) — AC3 kon by-construction slagen (facade) | Echte multi-peak-extractie gespecificeerd: lokale maxima per variant-resultaatmap met onderdrukkingsradius; test eist locatie-distincte centra |
| P3 | 🟠 | `LOCALIZE_MIN_INSTANCE_PX` dupliceert `LOCALIZE_SCALE_MIN_PX` | Geschrapt; default `LOCALIZE_SCALE_MIN_PX` 48→64 als kalibratie-parameter |
| P4 | 🟠 | AC4b niet falsifieerbaar (baseline niet gepind, instellingen circulair); AC4c bevatte eigennaam + geraden aantal | Baseline gepind (GTIN+storage-key+bevroren env-set vóór meting); AC4c geherformuleerd |
| P5 | 🟡 | Top-k was door 8-3R als 8.3O-fix gemarkeerd — scope-verschuiving | Traceerbaarheidsnotitie toegevoegd |
| O1 | 🔴 | classify persisteert geen crops, kent geen gtin/crop_path; 8.6-registratie EIST cropPath | Expliciete subtaak + AC: classify-uitbreiding (gtin-input, MinIO-crop-write, crop_path-output) |
| O2 | 🔴 | "Byte-identieke crosscheck" ∧ "idempotente herdraai" is tegenspraak (route insert altijd, skipDuplicates:false) | Dedup als pre-filter in de worker, crosscheck-service ongewijzigd |
| O3 | 🟠 | Dedup-sleutel broos: declared-not-found-items hebben null bbox/sourceFile; engine non-deterministisch bij truncatie/drempelwijziging | Gequantiseerde bbox in sleutel; declared-not-found op (gtin, code, reason-type); herdraai-semantiek gedocumenteerd |
| O4 | 🟠 | "Cache-invalidatie via bestaand rebuild-pad" — die hook bestaat niet (rebuild alleen bij startup; mutatieroutes triggeren niets) | TTL-cache + expliciet `POST /ml/artwork/reload-templates` |
| O5 | 🟠 | "Enqueue na rasterization" mist JPG/PNG (alleen PDFs rasterizen) en multi-page | Hook per geïmporteerd beeld; PDFs per page uit `pages.pages[].imagePath` |
| O6 | 🟠 | `getJobStatus` hardcoded op de `training`-queue | Expliciete taak: status-pad parametriseren op queue-naam |
| O7 | 🟡 | Crash-bewijs "test óf demo" te zwak | Test verplicht, demo optioneel |
| O8 | ℹ️ | Positief geverifieerd: registerCropsTx/processAcceptedReviewItems + get_active_reference_logos bestaan | Referenties in Dev Notes |
| D1 | 🔴 | `artwork_imports.gln` wordt NERGENS geschreven (permanent NULL) → provider structureel inert | gln-sourcing als taak in 8-3O (mediaserver levert gln); harde prerequisite in 8-3D |
| D2 | 🟠 | GS1-XML namespaces genegeerd | Local-name-parsing + AC met echte ACC-XML-fixture |
| D3 | 🟠 | TM-default 528 → stille fail-safes | Onderscheidende logging + AC pint GTIN met bekend TM 528 |
| D4 | 🟡 | In-memory cache deelt niet over processen | Redis-cache (bestaande infra) |
| S1 | 🔴 | P's body-param/metadata-drempels overleven O's ML-side template-loading niet | P committeert op ML-side env-map; resolutie ML-side |
| S2 | 🟠 | Verweesde hand-off "metadata-veld bij 8-3O" | Vervallen door S1; UI-beheer per-klasse drempels = later apart |
| S3 | 🟠 | D's gln-prerequisite hoort in O | gln-taak in O opgenomen |
