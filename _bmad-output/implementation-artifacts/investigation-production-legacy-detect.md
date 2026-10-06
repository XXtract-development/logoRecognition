# Onderzoek: bestaande productieaanroep behouden

## Symptoom en bewijs
De huidige productieconsument gebruikt POST /detect met X-API-Key, image_url en product_id. Bron: logo/src/main.py en logo/src/models/detection.py. De nieuwe applicatie heeft alleen /api/v1/recognize met JWT/base64. Rechtstreeks omschakelen breekt deze consument.

## Hypothesen
- Bevestigd: route, invoer en authenticatie verschillen.
- Bevestigd: oud antwoord heeft genormaliseerde xyxy-boxen; nieuwe detector gebruikt pixel-xywh.
- Weerlegd: dezelfde numerieke confidence betekent hetzelfde model. Scores moeten ongewijzigd met hun nieuwe betekenis worden behouden.
- Open: live eind-tot-eind vergelijking; pas na productieproef aantoonbaar.

## Eigenaar en fixrichting
logoRecognition API: aparte compatibiliteitsroute zonder JWT-hook, met dezelfde geheime sleutel, veilige publieke HTTPS-afbeeldingsdownload en echte ML-aanroep. Alleen geaccepteerde resultaten, hoogste per code; twijfelresultaten niet omzetten naar positieve herkenning. Geen productieactie tijdens implementatie.

## Follow-up: eerste gerichte tests
38 tests uitgevoerd, 37 slagen. De fixture beschouwde GHS01 als ongeldig, maar de gedeelde contractmapping definieert dit expliciet als alias van EXPLODING_BOMB. Hypothese bevestigd door reference-code-mapping.json; eigenaar testfixture. Correcte richting: ongeldige GHS99 testen en geldige alias apart bewijzen, geen productiecode aanpassen om correcte normalisatie te breken.

Reviewfollow-up: sevenconcretegapsconfirmed. ExistingMLclassification attachesdetectorscore but classmatchcanbe0.8; adapterexposesthatmismatch. ComponentMLdetector/response andAPIcompatibilityclassification. Fixdirectioncarryactualmatchconfidence, rejectinsufficientclassificationevidence; constraincodeuniverse/downloaddecodeconcurrency andtestEXIFpositivecodes. Imagepairmustberebuiltaftercode andfreezeupdatedbyroot. Noproductionroutehaschanged.

## Follow-up: actual trained model route acceptance
The source image inventory proves no generic EfficientDet ONNX artifact. Independent read-only route audit confirms ModelManager therefore chooses MockDetectionModel: only mock_logo at 0.95, which the legacy adapter's 0.99 gate removes. /ml/detect does not run the trained reference/NutriScore path; its GHS specialist correctly retains requires_review. Transport-fixture tests did not establish a positive trained-model call. Confirmed cause is wrong runtime integration route, not missing transferred reference files or a legitimate empty image.

Existing working server recognition flows call /ml/artwork/localize then /ml/artwork/classify, using reference_embeddings, the NutriScore reader and A2 fallback. Owner is the newly added API legacy adapter/ML-client integration; minimum fix preserves key validation, safe image fetch/orientation/concurrency, canonical code/category mapping and honest score/uncertainty handling, while using the existing inline-image localize/classify trajectory without storage/queues. Invalid/partial localization must be explicit, not silently empty success. All GHS remain review-required under source policy.

Production public routing and recognition runtime remain unchanged. The new dedicated database is restored with genuine ledger and real limited-role proofs; storage transfer is separate. Mandatory release evidence now includes actual public /detect positives for a real reference and A2 sample, a negative, GHS review behavior and proof that no generic mock detector is called. The UI's subscription-only WebSocket handler is not evidence of working recognition.

## Trained-route review follow-up: partial responses and hidden operational failures
Two independent reviewers confirm actual classification.py catches embedding/classifier exceptions and returns UNKNOWN/0/uncertain; artwork localization skips unreadable reference templates, and an empty library returns regions:[] successfully. The adapter therefore still could report HTTP200 empty for a backend outage, unlike the promised failure contract. Transport-rejection fixtures do not cover these service internals. Reviewer also found classification result coverage is not proven: missing/duplicate/invalid/unrequested result boxes are silently discarded.

Fix direction: adapter-specific strict runtime contract in existing artwork endpoints, preserving default behavior for existing callers. Explicitly distinguish operational failure/unusable required reference state from legitimate unknown negatives; require complete structurally valid classification coverage before threshold/uncertainty filtering. Reject an empty active code library before upstream calls. Add real ML endpoint tests for storage/classifier failures and adapter tests for coverage failures. Ownership expands only to the relevant artwork/classification service functions and their tests. No public production cutover before repaired review and actual trained positive/negative checks.

## Edge review follow-up: time budget and real worker capacity
Independent edge review finds the 165-second gateway budget does not bound Prisma reference lookup, and Axios connection timeouts do not automatically stop Python crop processing. Two stalled DB lookups can retain gateway slots indefinitely; timed-out upstream work can continue after gateway admission is released. Fix direction: bounded reference query with an actual database-side statement deadline and bounded transaction/queue wait; propagate remaining runtime budget to strict ML endpoints, check deadline/disconnect between bounded operations and preserve real ML admission until processing actually ends. Existing callers retain default behavior. Test unavailable/stalled lookup and timed-out/disconnected strict processing; no unbounded background inference after acknowledged timeout.


### Confirmed follow-up: actual synchronous classification work (6 October 2026)

Evidence: `model_manager.generate_embedding` is declared async but executes preprocessing/Torch inference synchronously without yielding; strict `asyncio.wait_for(classify_crop(...))` cannot interrupt this event-loop work. A2 lazy loading calls the unrestricted global MinIO reader twice, outside the strict per-request storage client. GHS detection catches specialist/photo-recovery exceptions internally, so the strict outer classification catch cannot distinguish a failed required model from a real negative. The async-sleep/mock tests do not exercise these paths.

Hypotheses confirmed: event-loop starvation defeats prompt deadlines/admission; missing A2/GHS artifacts can be concealed or stall. Legitimate UNKNOWN is not itself a failure and remains a successful result after functioning required backends. Owner: ML classification/model/GHS/A2 helpers. Fix: opt-in strict synchronous work dispatched through the shared bounded, shielded artwork worker helper, bounded artifact readers, opt-in nested GHS exception propagation. Existing non-strict calls retain their behavior. No live action.


### Actual production-label baseline: fixed localization budget truncates (2026-10-06)

Symptom: two full-label PNGs joined to MongoDB production were passed read-only to the isolated new production ML runtime on source release 814f6cd. Even with a single requested class, GREEN_DOT returned one region with `truncated=true` after 36.08 seconds, and NutriScore B returned zero regions with `truncated=true` after 31.88 seconds. No public API cutover or product writes occurred. Private evidence: `source-ml-positive-baseline.json`. This does not prove either positive recognition or a legitimate negative.

Confirmed cause: artwork localization uses its independent 30-second matching deadline (`LOCALIZE_TIME_BUDGET_S`) rather than the strict caller's remaining whole-request budget. The complete label matching workload can exceed that bound. Owner: ML artwork/localization and the legacy adapter's image preparation. Next direction: honor a bounded caller budget, retain explicit truncation failure, measure dimensions and template workload before selecting a resolution/candidate strategy. Do not assert endpoint readiness from transport tests or filtered reference crops alone.

Lower-helper regression first run: 3 tests failed before helper execution because importing services initializes TrainerService with production default `/app/models` on macOS read-only root. This confirms a test-isolation setup failure, not a live model defect. Fix direction: per-test MODEL_PATH points to pytest temporary directory before service import, matching the existing ASGI fixture. No production path creation.

Lower-helper second regression run: GHS photo-error test patched `regions` before genuine official-reference validation, so the test itself made official templates invalid. Confirmed fixture ordering issue; load/validate real references before isolating empty image-region proposals. Application behavior unchanged.

### Follow-up: strict crop persistence
Symptom/evidence: independent helper review identified synchronous cv2.imencode and unbounded storage write in classify_artwork when strict_runtime=true, persist_crops=true and gtin are supplied. The legacy adapter always sets persist_crops=false, but the opt-in strict endpoint otherwise exposes an unsupported blocking write path. Confirmed owner: ML artwork endpoint. Root authorized the minimal correction: reject strict persistence with 422 before any processing, keeping default callers unchanged; no new storage-write pipeline.


### Production label dimensions and exhaustive template cost (2026-10-06)

Both downloaded production controls exceed the adapter's initial 8-million decoded-pixel cap: GreenDot 4356×8417 (13,779,502 compressed bytes), Nutri-Score B 7557×5445 (9,434,385 bytes). These are genuine public production label pages, not generated fixtures. A measured local full-coverage 542-template/61-class search at max-side 1600, scales32–256/step1.5/tile1024 completed GreenDot in 100.364s with 40 merged proposals but missed GREEN_DOT. A missing result is therefore not evidence of absence. Simply increasing the deadline or reducing image dimensions is insufficient.

Next direction under read-only measurement: bounded large-page decoding, a downscaled coarse proposer retaining every active class and deterministic representative visual variants, followed by original-resolution ROI classification against the entire active embedding library. Localized representatives are discovery examples, not a claim that all542 reference variants were exhaustively searched. Keep the .99 confirmation requirement, fail visibly for incomplete execution, and preserve GHS review. Require actual full-label positive and negative measurements before implementation/release/cutover.


### Candidate-proposal alternatives under measurement

The representative prototype retains all61 classes but still takes39.576s on the giant GreenDot page and106.905s on the giant Nutri-Score B page, yielding383/316 cross-class proposals. It has not located the visible GreenDot; do not ship unchanged or silently trim to64. A smaller603×1295 declared-GreenDot product image is visually only a front label, so it is a valid potential negative rather than positive evidence. A smaller2492×2933 Nutri-Score B artwork visibly contains a 90-degree rotated Nutri-Score B panel; scale-only generic template localization misses it, while the existing Nutri-Score reader supports four orientations.

Additional hypothesis: reuse the already-configured visual review provider ONLY to propose tight spatial regions on public production labels, with classification decisions still made by the actual transferred reference/A2/GHS models and .99 confirmation threshold. A private read-only prototype is being measured before any runtime implementation. Provider guesses must never become confirmed logo codes or model confidence. Validate bounded responses/deadlines, original-resolution coordinate projection, expected positives and real negatives before considering this architectural option.

### Confirmed follow-up: strict Nutri-Score head prevents trained corroboration

Actual production B crop measured by the coordinator: deterministic reader B, ratio 1.24, head score 0.875; trained A2 model agrees B with unrotated score 0.999698877 (90-degree result 0.999223709). Private evidence: `actual-roi-refinement-classifier-proof.json`. The current early head return prevents the trained same-letter corroboration from running. Confirmed owner: classification.py. Narrow fix: only strict requests with an explicit threshold above the head score may ask the bounded trained A2 route for same-letter corroboration; disagreement, abstention or weak score cannot confirm or replace the head. Preserve non-strict behavior and actual score, not threshold inflation. A2 operational errors remain explicit failures. This is routing evidence for this example, not probability calibration or general logo quality proof.


### Actual visual-proposal + trained-classifier measurements

Configured provider gemini-3.8-flash returned valid region proposals for the giant production GreenDot artwork in5.77s and the visibly rotated Nutri-Score B artwork in8.90s. Proposals alone are not model decisions. Original-resolution region classification by the actual new production source runtime correctly read Nutri-Score B but its geometric head reported0.875 (ratio1.24); early return prevents the trained A2 model from running. Direct actual A2 inference on that same original crop returned B with raw softmax0.999698877 (other orientations also B>0.997). The actual trained A2 is therefore present and functional; no score inflation or calibration claim is justified.

Owner classification direction: strict-only agreement corroboration when a readable but weak head is below caller threshold; only a same-letter A2 score above threshold may replace it, with unchanged raw model score. Disagreement/weak/none retains review; backend failure remains operational. Default existing callers unchanged.

The actual tightly located GreenDot crop classified as GREEN_DOT at0.974033674, remaining uncertain under.99. Four rotations do not clear the threshold. The broad visual recycling box misclassified as another class below0.8 and was correctly uncertain; region refinement is still necessary for that mark. Private model proof is `actual-roi-refinement-classifier-proof.json`. Do not describe these integration controls as independent all-logo field-quality validation.


### ROI refinement false geometry and recoverable test clipping

Actual full542-reference matching within the padded visual GreenDot region completed in44.09s but selected an8×8 near-solid region, not the actual147px glyph. Existing generic template matching deliberately permits degenerate dark templates, so a perfect low-information match can outrank a real mark. Owner new pure ROI refinement: retain the full reference library, but accept only spatially textured matches large enough to plausibly refine the already-tight provider region (at least1% padded-region area and a16px square floor). This is a geometry guard, not model confidence or dropping a class. Original provider boxes remain available; no matching geometry is a legitimate refinement abstention.

The first real synthetic clipping test failed because the target extended12px beyond the supplied box while documented15% padding added only9px. Correct the fixture to a recoverable7px clipping; do not enlarge production padding just to fit that test. Local benchmark import initially hit the already-recorded /app/models fixture-path issue; temporary MODEL_PATH fixes local setup without runtime changes or retained temporary directories.

Validation follow-up: Ruff rejected the root-owned exact integer type comparison (E721). Preserve the geometry rule with isinstance(int) plus explicit bool rejection; no runtime behavior expansion.

Independent refinement review: a valid1×1 proposal pads to3×3 and cannot generate the8px minimum ladder. This is a legitimate refinement abstention, not missing model data. Early-abstain below supported ROI extent while preserving the preceding required-library guard; add a genuine tiny-valid-region regression.

Second actual full-library ROI probe completed25.08s but its1%-area floor still admitted a60×58 printer fragment ahead of the actual147px mark. A complete tight-mark refinement must cover at least5% of the padded provider region, while retaining the original region independently. This geometry constraint excludes that fragment and preserves the visibly located mark; verify actual geometry before claiming recovery. No classifier threshold/score changes.

Visual context resolves the latest ROI result: the provider region contains several REAL adjacent recycling marks (paper/foil/GreenDot), not a single mark. The5%-area probe14.76s selected the paper claim geometry, which is legitimate but cannot represent all adjacent marks. Preserve up to three location-distinct refined geometries per visual region, with originals retained and combined64-cap still fail-closed. Do not reinterpret one legitimate selected mark as absence of the others. Add actual matching two-mark regression; no class/score emitted by refinement.

The multi-region local probe selected two spatially overlapping variants of the same paper mark before the adjacent GreenDot. Their centers are101px apart within a231px-high mark. Use half the larger mark dimension as the location-collapse radius to remove those scale echoes while preserving separated neighboring marks; actual two-mark regression must remain green.

Final whole-app formatting check identified two missing standard-library/application import separators in the new A2 corroboration path. isort diff confirms whitespace only; normalize before release and repeat required lint checks.

Half-dimension collapse correctly retained separate paper/foil claims but the coarse1.4 scale ladder still did not propose the adjacent actual GreenDot. Prior full37-template GreenDot probe required a finer1.15 ladder to reach0.980 template match. Use1.2 ROI scaling as a bounded precision/cost compromise, retain actual classifier scores and measure the whole-page deadline. Geometry regressions should check high-overlap recovery rather than exact ladder-aligned pixels because proposals are approximate and projected to original resolution.

### Follow-up: GHS visibility independent of the embedding catalog
Symptom: the migrated catalog contains 542 active references across 61 codes, with no canonical GHS codes. Evidence: legacy-detect sends localize codes exclusively from referenceLogo and builds allowed result categories from those same rows. detect_ghs filters against requested codes, so all GHS detection is excluded; a returned GHS result would also be dropped by the adapter. Confirmed hypothesis: specialist model assets can be present while this catalog-only API contract suppresses their output. Refuted hypothesis: adding production database reference rows is required. Owner: API legacy adapter. Authorized fix direction: derive the nine positive canonical GHS classes from existing field-type mapping, independently include their GHSSymbolDescriptionCode category and upstream codes, exclude NO_PICTOGRAM and legacy aliases, retain ordinary reference/index readiness and mandatory GHS review. Regression must use a catalog containing ordinary logos only; no database writes.

### CI follow-up: corroboration fixture holds a stale artwork module

Symptom: full CI run 37386317076, ML job 112020356349, HEAD fa11075 failed only `test_strict_trained_same_letter_confirms_with_actual_score_and_bounded_reader` at the callback function-identity assertion. `/tmp/logo-production-ci-failure.log:1663-1692` shows actual result, score 0.999698877, method and head evidence all passed; callback and expected function share name/path but have distinct identities.

Evidence from source: `test_ghs_images.py` reloads `app.api.artwork` through `sys.modules` and removes/reinstates registry entries while the parent `app.api.artwork` package attribute can retain another imported module object. Corroboration fixture uses `from app.api import artwork`, whereas production classification performs lazy `from app.api.artwork import ...` lookup. Hypothesis confirmed from identity mismatch and import mechanics: fixture patches/asserts a stale parent-package attribute instead of current runtime module; hypothesis of wrong production score or missing strict callback is refuted by passing preceding assertions. Full-suite local reproduction has been started before modifications. Owner: corroboration test fixture only. Fix direction: resolve current modules with `importlib.import_module`, assert and patch the authoritative runtime bounded reader, retain strict keyword and actual outcome assertions; no runtime changes or weakened name-only comparison.

Local pre-fix full-suite reproduction confirmed the exact same callback identity failure (log `/tmp/logo-production-corroboration-before.log`). This first command ran from repository root and also exposed 12 unrelated tests whose relative fixture path requires the ML working directory. Those are invocation errors, not changes to fix. The final full-suite verification will run from `apps/ml-service`, matching CI.

Verification after fixture-only fix: from `apps/ml-service`, `PYTHONPATH=. MODEL_PATH=/tmp/logo-production-ci-investigation-models /tmp/logo-ci-repair-venv/bin/python -m pytest tests/ -q` completed with **679 passed, 14 skipped, 14 warnings in 53.89s**, matching CI test collection. Full-suite log: `/tmp/logo-production-corroboration-after.log`. Current runtime callback identity and strict kwargs are still asserted; Black/Ruff checks passed. No runtime source changes, live calls, commit or push.

### Production follow-up: Node 20 pinned DNS callback signature

Symptom: the deployed legacy adapter fails a real production PNG download with ERR_INVALID_IP_ADDRESS despite successful DNS validation. Parent read-only diagnosis `node-pinned-download-diagnosis.jsonl` confirms Node 20 invokes the custom lookup with `{hints:32,all:true}`; native HTTPS succeeds with status 200 and 446656 image/png bytes. The current callback always returns the scalar address/family signature, while Node requests an array of address/family objects when all is true. Confirmed hypothesis: custom callback shape, not media availability or TLS, causes the failure. Parent corrected read-only probe `node-pinned-download-corrected-probe.jsonl` returned HTTP 200 and the same 446656 bytes using the all-aware callback. Owner: API legacy-image-fetch and focused transport tests. Fix direction: honor both Node lookup signatures, returning only the previously validated pinned IPv4 destination. Keep hostname/TLS verification, public-address validation, redirect rejection and existing deadlines/byte limits. Add both callback-shape assertions and actual Node socket lookup regressions with connections destroyed before outbound traffic. No live changes in this writer task.

Focused verification: legacy-image-fetch.test.ts passes 12 tests, including real Node Socket callback validation in both autoSelectFamily modes; no outbound connection is made because the socket is destroyed in its lookup event. Local runtime is Node v22.22.3; the parent read-only corrected probe independently verified Node 20 in the actual application. API tsc --noEmit passes. ESLint source passes; explicit lint of the ordinarily ignored test passes with only its pre-existing 14 any-type warnings. git diff --check passes. No commit or live changes by this writer.

### Production follow-up: private storage previews use an internal hostname

Parent actual scoped production upload returned 201 and created its own logo image. Both original and thumbnail were independently read with HTTP 200 inside the container; returned presigned URL points at internal minio:9000, unreachable from a browser. Parent deleted the owned image with HTTP 200 and confirmed cleanup. Confirmed cause: signing the private storage endpoint leaks its internal network address into browser-facing URLs, not missing object data. Owner: storage signed URL generation and narrowly scoped public API preview registration/tests. Fix direction: same-origin relative preview links with domain-separated HMAC derived from JWT_SECRET, bound to exact allowed bucket/key/expiry. Never use authentication JWTs as preview tokens because generic JWT middleware could confuse privileges. Verify path, expiry and signature before any storage read, keep buckets private, accept raster image bytes only, bound concurrent readers, total read deadline and bytes, clean up late or aborted streams. Raw internal getObject/download behavior remains unchanged. No live action or commit by writer.

Preview verification: 24 new signed-preview tests and 18 storage-adapter tests pass. Explicit 24-hour export expiry remains supported, default stays one hour. Full API suite requested by coordinator: 98 files passed / 9 skipped; 1352 tests passed / 2 skipped / 67 todo in 12.25s (`/tmp/logo-api-preview-fullsuite.log`). API typecheck passes; source lint has zero errors and three pre-existing storage warnings, new test lint clean; diff whitespace check passes. Actual migrated manifest contains only PNG images plus one JSON and one PT, so raster-only preview does not exclude a migrated SVG. Independent review requested; no live calls, commit or push by writer.

### Follow-up: private concurrency probe preparation
The private acceptance runner failed static compilation before any live request: SyntaxError on its draft multiline shell string. Inspection confirmed surplus literal quote escapes in the Python declaration. Owner: release coordinator, private probe only; runtime application and production unchanged. Correct the declaration and recompile before executing; no application patch required.
