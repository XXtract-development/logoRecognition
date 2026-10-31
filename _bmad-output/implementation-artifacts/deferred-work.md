# Deferred Work

## Deferred from: code review of story-19-5 (2026-07-06)

- **Normaliseer `t3777Code` in de flywheel-declaratie-guard.** In `apps/api/src/services/flywheel/bootstrap-run.ts:253` vergelijkt de guard `m.code === t3777Code` strikt. `m.code` is via `parseDeclaredMarks` altijd `trim().toUpperCase()`, maar de `t3777Code`-kant (uit `bootstrap_queue`-seed) is niet expliciet genormaliseerd. Bestaand gedrag (geen 19.5-regressie; identiek aan de oude `codes.includes`); de sampler-caller is veilig omdat `buildIndex` de code uppercaset. Rest-risico: een lowercase/ongetrimde `bootstrap_queue.t3777Code` → guard matcht niet → GTIN onterecht overgeslagen. Fix-optie: `t3777Code.trim().toUpperCase()` in de guard, of uppercase borgen bij de queue-seed. Bron: Edge Case Hunter, code review 19.5.

## Deferred from: code review of 19-14-ivfflat-index-onder-fetch (2026-07-11)

- Schema-drift: de ivfflat-index `idx_reference_embeddings_embedding` staat niet in de Prisma-migraties (alleen ad-hoc op ACC + `infrastructure/docker/postgres/init.sql` op het dev-schema `logos.`). Een schone Prisma-provisioning heeft geen ivfflat-index → seqscan (correct, maar de `lists`-tuning is niet reproduceerbaar). Opvolg: index via migratie definiëren met `lists≈√N` óf bewust op seqscan leunen bij deze schaal.
- `find_similar_logos` (`apps/ml-service/app/services/database.py:351`, tabel `logo_embeddings`) deelt exact hetzelfde `ORDER BY <=> LIMIT`-patroon zonder de probes-fix. `logo_embeddings` heeft nu géén ivfflat-index (detector niet geraakt), maar zodra die ooit wordt toegevoegd keert dezelfde onder-fetch terug — ongepatcht en ongetest.
- Performance: `probes = lists` schakelt het sublineaire ivfflat-voordeel uit (brute-force door de index). Prima bij ~215 referenties; bij duizenden scant elke classify/harvest-call de hele index. Overweeg telemetrie/bovengrens bij groei.
- Geen lege/verkeerd-gedimensioneerde-embedding-guard op de queryvector in `find_similar_references` (pre-existing; ook in `find_similar_logos`).

## Deferred from: code review of 19-12-menselijke-accept-directe-referentie (2026-07-11)

- **promoteOne mist een storage_path-idempotentie-guard** (`apps/api/src/services/flywheel/promotion.ts:173-182`): maakt een `flywheel-promotion`-ref met alleen een class-cap-check, geen storage_path/near-dup-guard. Voor 19.12 opgelost door de nominatie bij accept te laten vervallen, maar als defensieve invariant voor de promotie-transactie waardevol (voorkomt duplicaten uit élke toekomstige nominatiebron). Eigen story + test.
- **"Altijd een referentie" faalt stil bij een ml-hapering** (`artwork-pipeline.ts` accept/annotate registerReference best-effort try/catch): bij ml-service down blijft het item `registered` zonder ref en zonder retry/backfill; herstel kan alleen via reopen (dat deactiveert juist). Overweeg een retry-/backfill-pad voor mislukte registraties.
- **Gecorrigeerde her-annotatie wordt stil genegeerd**: deterministische cropkey `annot_{id}.png` + idempotente `register_crop_as_reference` (storage_path-guard) → een tweede annotatie met gecorrigeerd kader overschrijft het object maar krijgt `added:false` en behoudt de oude embedding als actieve referentie. Overweeg een reset/vervang-pad bij her-annotatie.
- **`t3777Code`-override niet gevalideerd** vóór registratie (`artwork-pipeline.ts:1061/1177`): een typefout/onbekende code wordt direct een actieve referentieklasse. Pre-existing (override werd altijd toegepast), maar de altijd-aan registratie omzeilt nu de vroegere nominatie-crosscheck. Overweeg codelijst-validatie.
- **Accept-pad mist een idempotentie-guard equivalent aan het reject-pad** (M1): een crop-met-maar-zonder-sourceFile blijft `accepted` (niet `registered`) → retry/dubbelklik dubbel-telt de gold-set-aanwas (14.2-bewaking). ml-registratie zelf is idempotent.
- **AC-dekking source='review-confirmed' + embedding**: geverifieerd op codeniveau in de ml-service (`similarity.py` register_crop_as_reference default source + embedding-insert), maar niet in een test (Node-routetests mocken de ml-grens; ml-service heeft geen register-test). Wordt post-deploy read-only bevestigd (Task 4).

## Deferred from: code review of 19-13-recyclable-referenties-herstellen (2026-07-12)

- **Near-dup dedup RECYCLABLE-refs**: 22 van de 26 herstelde refs komen uit één GTIN (near-duplicaten). Bewuste keuze om alle 26 te herstellen (POC-staat, precisie spot-gecheckt). Overweeg dedup tot een representatieve subset als de outlier-audit (14.3) de cluster flagt of als vals-positieven toenemen.
- **Herbruikbaar gold-set-meetscript** (top-1 + valse-match-telling voor RECYCLABLE): 19.13 mat AC3/AC4 via ad-hoc classify-probes; een gecommit, herbruikbaar meetscript + gold-set-crop-lijst ontbreekt (nuttig voor toekomstige regressiemeting).
- **`run()`-orchestratie unittest**: de dry-run/apply/counts/REINDEX-orkestratie van `restore_recyclable_refs.run()` is live op ACC gevalideerd maar niet in een unittest (vergt db_service-mock). `_load_and_embed`/`_write_ref` zijn wél gedekt.
- **Model-identiteitscheck**: het script valideert de embedding-shape maar niet dat het huidige model dezelfde ruimte is als waarmee de actieve refs zijn gemaakt (model bleek NIET-stale in de diagnose, cosine 1,0). Overweeg een expliciete guard bij toekomstige model-wissels.
- **`print` → `logger`** en een **dry-run crop-laadbaarheid-preflight** in `restore_recyclable_refs.py` (operationele netheid; laag).

- source_spec: `spec-review-reference-categories.md`
  summary: Investigate historical active references lacking embeddings before any recovery.
  evidence: Original insert and embedding writes were outside a transaction; current path transaction prevents future partials, metadata-only re-registration intentionally cannot recover old embeddings.
- source_spec: `spec-review-reference-categories.md`
  summary: Repair existing ML CI pytest failure masking in a separate investigation.
  evidence: Existing pytest command ends with || echo "No tests yet"; root explicitly deferred general CI repair, so CI-green is not acceptance evidence.

- source_spec: `spec-flywheel-reference-content-integrity.md`
  summary: Onderzoek één consistent alpha/SVG-contract voor referentieopname, hashing en modelinput vóór gecontroleerde herbouw.
  evidence: Bestaande registratie convertRGB negeert alpha; SVGupload bestaat maar daadwerkelijke542embeddedreferenties zijnPNG. Geen aangetoonde actieveSVG; toekomstcontract verificatie nodig.
- source_spec: `spec-flywheel-reference-content-integrity.md`
  summary: Behoud expliciete deactivatie bij guide-reseed of vereis een gecontroleerd reactivatiebesluit.
  evidence: Pre-existente seedGuideEntry update active=true; nonblankinhoud bewijst geen label/goedkeuring. Script is niet uitgevoerd.

- source_spec: `_bmad-output/implementation-artifacts/spec-logo-scan-robustness.md`
  summary: De `failed`-handler van de logo-scan-worker (gecrashte of vastgelopen job) schrijft alleen de Redis-staat en nooit de rij in `logo_scans`; zulke scans ontbreken in de tabel en krijgen dus ook geen `stap1`.
  evidence: `apps/api/src/services/pipeline/logo-scan-flow.ts` registerLogoScanWorker → `logoScanWorker.on('failed', …)` roept `writeIfOpen(failedState(...))` aan zonder `saveOutcome`; vooraf bestaand gedrag (Story 1.3), door de review van spec-logo-scan-robustness (Edge6) gesignaleerd.

- source_spec: `_bmad-output/implementation-artifacts/spec-scan-reuse-code-version.md`
  summary: De commit van de herkenningscode in de image zelf vastleggen (build-arg naar een omgevingsvariabele), zodat de hergebruiksleutel niet van de uitrolbedrading (`LOGO_IMAGE_TAG` in `.env`, `SOURCE_COMMIT`) afhangt; ook de route om hergebruik op productie veilig aan te zetten.
  evidence: Blind Hunter-review 13-10-2026; nu werkt het op ACC (VERIFIED: `LOGO_IMAGE_TAG` = image-revisie in app en ml-service), maar productie geeft geen commit-variabele door en een lege `LOGO_IMAGE_TAG` op ACC laat de sleutel op `SOURCE_COMMIT` (compose-checkout) leunen terwijl de `:acc`-image zweeft.

- source_spec: `_bmad-output/implementation-artifacts/spec-scan-reuse-code-version.md`
  summary: Een scan die vóór een uitrol in de wachtrij stond en daarna door de nieuwe code wordt uitgevoerd, wordt opgeslagen onder de sleutel van de oude code; bij terugrollen naar die oude code binnen 24 uur kan dat resultaat hergebruikt worden.
  evidence: Edge Case Hunter-review 13-10-2026: sleutel wordt bij toelating vastgezet (`submitLogoScan`), `runLogoScanJob` controleert de codeversie niet. Severiteit laag-middel, alleen bij terugrollen binnen 24 uur; bewijs zou een test zijn die toelaat onder A, uitvoert onder B en daarna onder A opnieuw aanvraagt.

- source_spec: `_bmad-output/implementation-artifacts/spec-spike-fase-b-cap3-telscript.md`
  summary: De omrekening van tegel naar etiketpixels in `fb_k1.parse` heeft geen eigen toets; `test_tel.py` dekt alleen dat `tel.py` K1-vakken niet nog eens omrekent (meetopzet §3.10 noemt "omrekening tegel → etiket" als toetsgeval).
  evidence: Blind Hunter-review 30-10-2026; `tel.lees_k1` neemt de vakken uit `fb_k1` over zoals ze zijn, en geen toets roept `fb_k1.parse` aan. Valt buiten deze spec (één nieuw bestand `tel.py`).

- source_spec: `_bmad-output/implementation-artifacts/spec-spike-fase-b-cap3-telscript.md`
  summary: De uitsluitregel van meetopzet §5.1 (>1% etiketten boven 165 s, of boven 8 GB) zit niet in de rangorde van `tel.py`; die gegevens komen uit `fb_kostentijd.py` (CAP-4) en moeten na de adjudicatie in het rapport naast de rangorde worden gelegd.
  evidence: Blind Hunter-review 30-10-2026; `tel.py` leest geen `sec_etiket`/`piek_rss_mb`. Vóór adjudicatie geldt §0 (geen §5.1); de regel telt pas bij de rangorde ná adjudicatie.

- source_spec: `_bmad-output/implementation-artifacts/spec-spike-fase-b-cap3-telscript.md`
  summary: Paren die door een "ja" in de adjudicatie nieuw in de waarheid komen, zijn niet op lekken getoetst; `tel.py` noemt ze nu in `adjudicatie.niet_lekgetoetst`, maar de echte controle (cosinus ≥ 0,98 tegen de momentopname, `fb_lek.py`) moet daarna nog draaien.
  evidence: Blind Hunter-review 30-10-2026; `lekparen.json` komt uit de originele waarheid. Bewijs: `fb_lek.py` opnieuw draaien op de toegevoegde vakken en de tabel "zonder lekparen" herberekenen.

- source_spec: `_bmad-output/implementation-artifacts/spec-logo-scan-k4aa.md`
  summary: De hergebruiksleutel (`referencePoolVersion` = aantal + jongste createdAt) ziet een vervangen referentiebestand of een wissel deactiveren/heractiveren niet; legacy en K4-aa kunnen dan een oud resultaat hergebruiken.
  evidence: `logo-scan-store.ts:50`; bestond al vóór K4-aa (review B5, 31-10-2026); oplossing = id/pad-hash van de actieve set in de sleutel.
- source_spec: `_bmad-output/implementation-artifacts/spec-logo-scan-k4aa.md`
  summary: Integratietest voor `get_siglip_references`/`upsert_siglip_embedding` tegen een echte database (TEST_DATABASE_URL), zoals `tests/unit/test_ivfflat_probes_19_14.py`, vóór migratie 0023 naar ACC gaat.
  evidence: review VG8: de SQL (LEFT JOIN op model, embedded_path) is alleen via mocks getoetst.
- source_spec: `_bmad-output/implementation-artifacts/spec-logo-scan-k4aa-2.md`
  summary: De ml-service-limiet op ACC staat op 12G voor de K4-aa-proeven; herzien of terugzetten naar 8G zodra de proeven klaar zijn of de route weer uit blijft.
  evidence: review F11 (31-10-2026); besluit Friso noemt geen einddatum; ACC-host 30 GB, 11 GB vrij.
