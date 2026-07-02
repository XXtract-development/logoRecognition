# Adversarial Review — Architecture Spine "Referentie-vliegwiel zonder review"

**Reviewer-lens:** adversarial spine-attack — construeer per aanval twee units één niveau lager (epics/stories, mogelijk door verschillende agents gebouwd) die elk élke AD naar de letter gehoorzamen en tóch incompatibel bouwen.
**Target:** `ARCHITECTURE-SPINE.md` (2026-07-02, status draft)
**Datum review:** 2026-07-02

---

## Verdict

Het paradigma en de eigenaarschapsgrenzen (AD-1, AD-2, AD-6) zijn sterk en houden de grote klappen tegen — maar de spine is nog niet bouw-dicht: er zijn **twee kritieke en drie hoge** incompatibele-paren gevonden waarbij onafhankelijke story-teams binnen de letter van de AD's uiteenlopende, botsende implementaties bouwen. Alle gaten zijn te dichten met nieuwe of aangescherpte AD's; geen enkel gat vergt een paradigma-wijziging.

---

## Aanvalsmethode

Per aanval: (1) twee concrete units één niveau lager, (2) bewijs dat beide élke relevante AD naleven, (3) de botsing, (4) severity, (5) de AD-fix die het gat dicht. De units zijn gekozen langs de verwachte epic-snijlijnen: promotielus, guardrails/dedup/outlier, gold-set-groei, bootstrap, mismatch-triggers, dashboard+endpoints, kruischeck-vlag, GLN-backfill.

---

## Finding F1 — Twee definities van de inhouds-hash (KRITIEK)

**AD's in het geding:** AD-9 × AD-12 (+ AD-3 schema `@@unique([contentHash, t3777Code])`, `hard_negatives.contentHash` uniek)

**Unit A — Nominatie-story (crosscheck-hook, API).** AD-12 eist nominatie-uniciteit op `(inhouds-hash, t3777Code)` — die uniciteit moet **synchron bij INSERT** in `reference_candidates` afgedwongen worden, in de API (AD-2: API bezit de state). Team A redeneert: een SHA-256 over de crop-bestandsbytes is "geen beeld- of vectorberekening" (AD-9 noemt imagehash/pHash, cosine, centroid), dus berekent de contentHash in Node bij nominatie. Elke AD naar de letter nageleefd.

**Unit B — Dedup/guardrails-story (poort, ml-service).** AD-9 zegt: álle beeldberekeningen in ml-service; het spine-endpoint `/ml/phash` levert expliciet "inhouds-hash + perceptual hash". Team B berekent de inhouds-hash als hash over **genormaliseerde crop-pixels** (AD-12's eigen definitie: resize? kleurruimte? welke normalisatie?) in Python en gebruikt die voor dedup-checks én voor `hard_negatives.contentHash`. Ook elke AD naar de letter nageleefd.

**Botsing.** Dezelfde crop krijgt twee verschillende hashes (byte-hash ≠ pixel-hash; en zelfs twee pixel-hashes verschillen als "genormaliseerd" niet gepind is — PIL vs torchvision resize geeft andere pixels). Gevolgen: (a) de idempotentie-uniciteit van AD-12 vangt herverwerkte GTINs niet — duplicaat-nominaties glippen door; (b) hard-negative-blokkade werkt niet: een eerder afgekeurde crop matcht nooit tegen `hard_negatives.contentHash`. De kern-guardrail faalt **stil**.

**Onderliggende spanning in de spine zelf:** AD-12 heeft de hash synchroon nodig bij nominatie in de API; AD-9 verbiedt de berekening in Node. De spine spreekt zichzelf bijna tegen en laat de resolutie aan de bouwers.

**Severity: KRITIEK** — stil falende dedup/idempotentie/hard-negatives, precies de guardrails waarvoor het reviewloze vliegwiel zijn bestaansrecht ontleent.

**Dicht het gat — nieuw AD (voorstel AD-14):**
> De inhouds-hash heeft exact één implementatie: ml-service `/ml/phash` (functie `app/services/phash.py::content_hash`), gedefinieerd als SHA-256 over de pixel-buffer na vaste normalisatie (pin: RGB, resize naar N×N met vastgelegde interpolatie, vastgelegde bibliotheek+versie). De API berekent nóóit zelf een inhouds-hash; nominatie roept `/ml/phash` synchroon aan vóór de INSERT en slaat de geretourneerde hash op. Alle tabellen (`reference_candidates`, `hard_negatives`) gebruiken uitsluitend deze hash. Faalt `/ml/phash`, dan faalt de nominatie (fail-closed, conform AD-11) — geen fallback-hash in Node.

---

## Finding F2 — Wat gebeurt er met `candidate_embeddings` ná promotie? (KRITIEK)

**AD's in het geding:** AD-3 × AD-5 (+ ER-diagram: `REFERENCE_LOGO ||--o{ REFERENCE_EMBEDDING : bestaand`)

**Unit A — Promotie-story (batch passed → INSERT `ReferenceLogo`).** AD-3 zegt: promotie = INSERT in `ReferenceLogo`. AD-5 zegt: de eval bevraagt actieve `ReferenceEmbedding` UNION schaduwset. Team A leest: de embedding staat al in `candidate_embeddings`, de eval UNION-t hem er toch bij, dus een INSERT in `ReferenceLogo` volstaat — geen rij in `ReferenceEmbedding`. Elke AD naar de letter: nergens staat dat promotie óók een embedding-verhuizing is.

**Unit B — Live-detectie / bestaande engine.** De live-detectiestroom (buiten deze feature, AD-1: volledig gescheiden) matcht uitsluitend tegen `ReferenceEmbedding`. Team B wijzigt daar per AD-1/AD-8 helemaal niets aan — correct.

**Botsing, variant 1 (Unit A hierboven):** de gepromoveerde referentie bestaat in `ReferenceLogo` maar heeft geen `ReferenceEmbedding`-rij → **de promotie is inert**: live-detectie ziet hem nooit. Het vliegwiel draait, het dashboard toont "promoted", en er verandert productief niets. Onzichtbaar falen van de hele feature-missie.

**Botsing, variant 2 (Team A kopieert wél naar `ReferenceEmbedding` maar laat `candidate_embeddings` staan):** de volgende batch-eval UNION-t "actief + schaduw" en telt de gepromoveerde embedding nu **dubbel** (één keer actief, één keer schaduw) — top-k-matching en de regressiemeting raken vertekend; de 1-procentpunt-tolerantie van AD-5 wordt tegen een scheve meting getoetst.

**Severity: KRITIEK** — variant 1 maakt de feature stilletjes betekenisloos; variant 2 corrumpeert de poortmeting.

**Dicht het gat — scherp AD-3/AD-5 aan (voorstel):**
> Promotie is een atomaire transactie: INSERT `ReferenceLogo` + INSERT `ReferenceEmbedding` (kopie van de kandidaat-embedding) + markeer de kandidaat `promoted` + **verwijder of markeer** de `candidate_embeddings`-rij als geconsumeerd. De schaduwset in de regressie-eval is per definitie: `candidate_embeddings` van kandidaten in de batch-onder-meting met status `candidate` — nooit gepromoveerde of afgewezen kandidaten.

---

## Finding F3 — Quarantaine-vrijgave: wie instantieert de "nieuwe batch"? (HOOG)

**AD's in het geding:** AD-1 × AD-6 (+ Structural Seed: `DM -->|vrijgeven| PB2[Nieuwe batch]` en endpoint `candidates/:id/decision`)

**Unit A — Dashboard-story (besturing, FR-17/19).** Het seed-diagram zegt: datamanager geeft vrij → nieuwe batch → opnieuw door de poort. Het endpoint-lijstje biedt alleen `candidates/:id/decision`. Team A bouwt: de decision-handler zet de kandidaat terug op `candidate`, maakt **synchroon** een nieuwe `promotion_batch` aan en draait de poort inline in het HTTP-request (alle poortlogica woont in `services/flywheel/`, dus importeerbaar; AD-6 zegt alleen dat de *nachtelijke lus* een BullMQ-job is — nergens staat dat de poort uitsluitend vanuit de worker mag draaien). Elke AD naar de letter.

**Unit B — Promotielus-story (nachtelijke job).** Team B bouwt de job als: sweep álle `reference_candidates` met status `candidate` zonder batch → bundel in een nieuwe batch → poort. Ook naar de letter (AD-1: batch is de enige eenheid; AD-6: repeatable job).

**Botsing.** (a) De vrijgegeven kandidaat heeft status `candidate` en wordt door **beide** paden opgepikt: het decision-endpoint stopt hem in PB2 én de nachtelijke sweep bundelt hem opnieuw — `promotionBatchId` is één FK, dus de laatste schrijver wint en de eerdere batch rekent met een kandidaat die er administratief niet meer in zit; poort-uitkomsten en batch-tellingen kloppen niet meer. (b) Twee gelijktijdige poort-executies (HTTP-inline + worker) op overlappende kandidaten racen op dedup-, cap- en regressiemeting.

**Severity: HOOG** — batch-integriteit (het énige promotie-/rollback-anker van AD-1) is niet meer betrouwbaar.

**Dicht het gat — scherp AD-6 aan (voorstel):**
> Batches worden uitsluitend geïnstantieerd en door de poort gevoerd door de BullMQ-worker (queue `flywheel`). Het dashboard-decision-endpoint muteert alleen kandidaat-status en enqueue-t hoogstens een job; het draait nooit poortlogica in het request-pad. Een kandidaat kan alleen gebundeld worden als `status = 'candidate' AND promotionBatchId IS NULL`; bundeling zet de FK in dezelfde transactie (claim-semantiek).

---

## Finding F4 — Decision-endpoint en batch-job muteren dezelfde kandidaat (HOOG)

**AD's in het geding:** AD-2 (letter vs. geest) × AD-1

**Unit A — Dashboard-story.** `candidates/:id/decision` (afkeuren → `rejected` + rij in `hard_negatives`, conform seed-flow "DM afkeuren → HN"). Team A bouwt een rechttoe-rechtaan UPDATE; AD-2 is nageleefd — het endpoint zit in `apps/api`.

**Unit B — Promotielus-story.** De nachtelijke job leest de batch-kandidaten in het geheugen, draait guardrails + regressie-eval (minuten werk: ml-service-roundtrips), en schrijft daarna promoties terug. Ook volledig binnen AD-2 — de worker zit óók in `apps/api`.

**Botsing.** AD-2 verhindert "twee schrijvers op één entiteit" alleen **tussen services** — beide schrijvers hier zitten binnen de API (HTTP-handler vs. BullMQ-worker), waar de AD niets over zegt. Interleaving: job leest kandidaat X (status `candidate`), datamanager rejects X via het endpoint (→ `rejected` + hard_negative), job promoveert X alsnog (→ `promoted` + `ReferenceLogo`-INSERT). Eindstand: X is tegelijk hard-negative én actieve referentie — een zelf-tegensprekende referentieset, en de datamanager-beslissing is zonder spoor overschreven (AD-13-herleidbaarheid de facto gebroken).

**Severity: HOOG** — corrupte referentieset + genegeerde menselijke beslissing, de twee dingen die het vertrouwensmodel van "zonder review" moeten dragen.

**Dicht het gat — nieuw AD (voorstel AD-15, kandidaat-status-machine):**
> `reference_candidates.status` heeft een expliciete status-machine met vergrendeling: zodra een kandidaat in een batch met status `pending` zit (poort onderweg), zijn dashboard-decisions op die kandidaat geblokkeerd (HTTP 409, "batch in verwerking") — en omgekeerd schrijft de job elke statusovergang als conditional UPDATE (`WHERE status = 'candidate'`); 0 rows affected = kandidaat overslaan, nooit overschrijven. Elke overgang logt oude+nieuwe status in evidence (AD-13).

---

## Finding F5 — Cap-race: bootstrap-job en promotie-job raken dezelfde klasse (HOOG)

**AD's in het geding:** AD-6 × AD-9 (caps als env-drempel) × AD-1

**Unit A — Bootstrap-story (FR-12/13).** `flywheel-bootstrap` is per AD-6 een **aparte** job "on-demand / gequeued per lege klasse" met eigen cadans. Team A bouwt: check cap-per-klasse (env `FLYWHEEL_*`), zit klasse onder de cap → nomineer/promoveer tot de cap. AD's nageleefd.

**Unit B — Promotielus-story.** `flywheel-promotion` checkt in de guardrail-stap (G1: "drempel, cap, dedup, outlier") dezelfde cap met dezelfde read-then-write-logica. AD's nageleefd.

**Botsing.** Niets in de spine dwingt af dat deze twee jobs elkaar uitsluiten: aparte jobs in dezelfde queue kunnen overlappen (on-demand bootstrap start terwijl de nachtelijke lus draait; of worker-concurrency > 1). Beide lezen "klasse Y heeft 3/5 referenties", beide voegen er 2 toe → 7/5. De cap — een kern-guardrail tegen klasse-vervuiling — is niet race-vrij, en geen enkele AD benoemt de uitsluiting of het afdwing-niveau (applicatie-check vs. database-constraint).

**Severity: HOOG** — de cap is precies de rem die klassedrift zonder menselijke review moet voorkomen; een race maakt hem adviserend in plaats van bindend.

**Dicht het gat — scherp AD-6 aan (voorstel):**
> De queue `flywheel` draait met worker-concurrency 1: promotielus, bootstrap en outlier-audit sluiten elkaar per definitie uit (seriële uitvoering is bij deze volumes ruim voldoende). Aanvullend wordt de cap bij promotie afgedwongen in dezelfde transactie als de `ReferenceLogo`-INSERT (`SELECT COUNT ... FOR UPDATE` of equivalent), zodat ook toekomstige parallellisatie de cap niet kan breken.

---

## Finding F6 — Eigenaarschap van de baseline bij rollback (MIDDEL)

**AD's in het geding:** AD-5 × AD-1 (rollback per batch) × schema (`promotion_batches.baselineMeasurement`)

**Unit A — Rollback-story.** Seed: "passed → INSERT ReferenceLogo + **nieuwe baseline**". Team A bouwt rollback van batch N als: verwijder/deactiveer de referenties van N én herstel de baseline naar `baselineMeasurement` van batch N (de meting van vóór N's promotie). Letterlijk consistent met "de batch is de eenheid van rollback" (AD-1).

**Unit B — Promotielus-story.** Team B definieert de vergelijkings-baseline voor batch N+2 als: de meting van "de meest recente batch met status `passed`". Ook letterlijk consistent.

**Botsing.** Scenario: N passed, N+1 passed, daarna wordt N teruggerold. N+1's baseline is gemeten tégen een referentieset die N's referenties bevatte — die set bestaat niet meer. Unit B pakt N+1's (nu besmette) baseline; Unit A vindt dat na de rollback N's pre-baseline geldt. Twee lezers van "de huidige baseline" geven verschillende antwoorden, en de 1-procentpunt-tolerantie wordt getoetst tegen een meting die de werkelijke actieve set niet representeert — de poort kan zowel vals blokkeren als vals doorlaten.

**Severity: MIDDEL** — geen datacorruptie, wel een poort die na de eerste rollback stuurloos meet; ontdekking pas bij incident.

**Dicht het gat — scherp AD-5/AD-11 aan (voorstel):**
> Er is exact één "huidige baseline", als record in `system_settings` (of eigen tabel), geschreven door precies één actor: de promotie-job bij batch-status `passed` én de rollback-flow direct ná een rollback (die verplicht een **verse hermeting** van de actieve set draait — nooit een oude baseline terugzetten). Batches vergelijken altijd tegen dit ene record, nooit tegen `baselineMeasurement` van een vorige batch.

---

## Finding F7 — Gold-set-vervangingsketen: twee resoluties van "de actieve set" (MIDDEL)

**AD's in het geding:** AD-4 × AD-5 × AD-13 (immutable + `replacesId FK→self?`) × afhankelijkheidsdiagram ("ML leest alléén embeddings")

**Unit A — Gold-set-groei-story (reviewstation-hook, API).** Actieve set = "records waarnaar géén ander record via `replacesId` wijst" (tombstone-keten, keten-traversal bij vervanging-van-vervanging). Team A merkt ook: een fout bevonden record **zonder** vervanger kan niet gedeactiveerd worden — het schema kent geen status/`supersededAt` — dus bouwt een work-around (self-replace of dummy-vervanger).

**Unit B — Eval-runner-story (ml-service `/ml/regression-eval`).** Team B moet labels (ECHT/VALS) hebben om precisie te meten, maar het afhankelijkheidsdiagram staat ml-service alleen "lezen: embeddings" toe. Dus: de API stuurt de gold-set mee in de request-payload, en Team B (of Team A's endpoint-story) resolvet de keten — mogelijk simpeler: "nieuwste record per (t3777Code, cropPath)".

**Botsing.** Twee keten-resoluties (tombstone-traversal vs. nieuwste-per-sleutel) geven een verschillende actieve gold-set zodra een record twee keer vervangen is of een work-around-record bestaat → **de poortmeting is niet reproduceerbaar** tussen implementaties, en een dashboard dat "gold-set-omvang" toont spreekt de eval tegen. Bovendien is onbeslist wíe resolvet (API of ml-service) en of ml-service gold-set-rijen überhaupt mag lezen.

**Severity: MIDDEL** — meting blijft draaien maar is definitie-afhankelijk; drift is sluipend en lastig te debuggen.

**Dicht het gat — scherp AD-4 aan (voorstel):**
> De actieve gold-set is een view/query met één canonieke definitie in `apps/api` (`services/flywheel/gold-set.ts`): records zonder inkomende `replacesId`-verwijzing, plus een expliciete `retiredAt`-kolom voor intrekking-zonder-vervanging (schema-aanvulling). ml-service ontvangt de geresolvede set altijd als request-payload van `/ml/regression-eval` en leest de gold-set-tabellen nooit zelf.

---

## Finding F8 — Pauze-scope: welke jobs gehoorzamen de pauzestand? (LAAG/MIDDEL)

**AD's in het geding:** AD-11 (bindt FR-3, FR-19) × AD-6 (drie jobs)

**Unit A — Besturing-story** bouwt `pause` als vlag in `system_settings`, gecheckt bij de start van `flywheel-promotion` (AD-11 bindt immers de regressie/poort-FR's). **Unit B — Bootstrap-story** checkt de vlag niet: AD-11 noemt bootstrap nergens, en FR-12/13 vallen buiten zijn binds. Resultaat: "vliegwiel gepauzeerd" op het dashboard terwijl bootstrap vrolijk klasse-referenties blijft promoveren. Datamanager-verwachting gebroken. Ook onbeslist: onderbreekt pauze een lopende batch of alleen nieuwe runs?

**Severity: LAAG/MIDDEL.**

**Dicht het gat:** breid AD-11 uit — de pauzestand geldt voor álle drie de `flywheel`-jobs (check bij job-start; lopende batch maakt zijn poortstap af maar promoveert niet — of definieer expliciet anders), en het dashboard toont de scope van de pauze.

---

## Samenvattend oordeel

| # | Paar | AD-frictie | Severity |
| --- | --- | --- | --- |
| F1 | Nominatie-hash (Node) × dedup-hash (ml-service) | AD-9 × AD-12 | **Kritiek** |
| F2 | Promotie-INSERT × live-detectie/eval-UNION | AD-3 × AD-5 | **Kritiek** |
| F3 | Dashboard-vrijgave × nachtelijke batch-sweep | AD-1 × AD-6 | **Hoog** |
| F4 | Decision-endpoint × batch-job op zelfde kandidaat | AD-2 (intra-API-gat) | **Hoog** |
| F5 | Bootstrap-cap-check × promotie-cap-check | AD-6 × AD-9 | **Hoog** |
| F6 | Rollback-baseline × volgende-batch-baseline | AD-5 × AD-1 | Middel |
| F7 | Gold-set-ketenresolutie API × eval-runner | AD-4 × AD-5 × AD-13 | Middel |
| F8 | Pauze-check promotie × bootstrap | AD-11 × AD-6 | Laag/Middel |

**Aanbeveling:** dicht F1 en F2 met de voorgestelde nieuwe/aangescherpte AD's vóórdat epics gesneden worden (beide falen stil en raken de kern-missie); F3–F5 kunnen desnoods als bindende regels in de betreffende story-specs landen, maar horen thuis in de spine omdat ze epic-overstijgend zijn (dashboard-epic × lus-epic × bootstrap-epic). F6–F8 mogen op epic-niveau, mits expliciet belegd.

Geen van de findings vereist een ander paradigma; het skelet (batch-poortwachter, API-owns-state, stateless ml-compute) overleeft alle aanvallen — de gaten zitten in de naden tussen de AD's, niet in de AD's zelf.
