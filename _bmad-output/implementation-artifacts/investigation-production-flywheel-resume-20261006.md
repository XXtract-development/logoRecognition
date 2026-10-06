# Investigation: production flywheel resume readiness

The installed skill catalog and searched skill directories contain no bmad-investigate skill. This case follows the required investigation method explicitly before any code/configuration fix.

## Symptom and evidence

The production dashboard shows a persistent migration pause. Actual deployed code inspection also confirms FLYWHEEL_NOMINATION_ENABLED=false and FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED=false. Therefore clearing flywheel.paused alone would not activate candidate nomination. The production compose does not forward either variable. All four flywheel schedulers exist; no active, waiting or failed jobs, candidates or batches exist. Eighteen classes already reach the preserved default cap of10.

A real read-only baseline through the deployed API gate.measureBatch -> deployed ML /ml/regression-eval completed twice (18.84s/18.562s). It evaluated all654 active crop records with self-match exclusion and threshold0.90:397 correct/654=60.7034%. Positive ECHT:318/564 correct,246 missed. Negative VALS:79/90 correct,11 incorrectly recognized. This is the flywheel crop embedding correctness metric, not accuracy of strict public /detect and not PPV of predicted positives. Provenance labels describe stored sources, not newly verified human gold. No crop, gold record, weight or reference was modified.

The existing gate is a relative regression guard: it prevents deterioration against a baseline, not an absolute quality floor. Passing its measurement does not prove readiness for unattended automatic expansion.66 isolated existing tests pass across pause control, nomination, caps/dedup/outlier guardrails, promotion loop and regression gate.

## Hypotheses

Confirmed: migration pause is persisted and survives restarts; nomination flag is independently disabled; paused=false alone is insufficient. Confirmed: current embedding-based gold evaluation returns11 negative false matches at0.90. Refuted: absence of a dashboard precision means there are no usable crop records (654 were actually evaluated). Open: whether individual false matches arise from embedding separation, mislabeled/ambiguous gold, crop framing or source-family leakage; each needs pixel/provenance review before label correction or model retraining. Open: class caps/source attribution limit useful new nominations; no cap raised. Separate confirmed dashboard defects: missing optional flywheel index and mismatch-trends SQL group-by error; neither prevented the baseline evaluation and neither is repaired ad hoc.

## Owner and structural direction

Owner: apps/api/services/flywheel configuration and quality policy, apps/ml-service regression evaluation/reference embeddings, production deployment compose. First review all11 failing negatives with provenance and separately assess246 positive misses by class/family. Never relabel based on model disagreement alone. Then select an evidence-backed threshold/reference/model correction and validate on independent production-family negatives and positives. Preserve relative regression, dedup, caps, outliers, automatic pause, GHS exclusion and stale-baseline recalculation. Enable nomination only through reviewed production configuration; runtime activation requires explicit manual container approval under AGENTS.md. No production restart, pause clearance, flag write, threshold lowering, reference promotion or database mutation was performed. Migration aftercare remains active.

## Outcome

SAFE STOP for unattended flywheel expansion. Production recognition is unchanged.66 tests pass; actual quality measurements and configuration blocker retained. Resume is not reported as executed. Next coordinator step: provenance/pixel review of false-match negatives before deciding a correction; then configuration activation and controlled real queue verification.

## Follow-up: pixel and nearest-reference investigation

All11 negative crop files retrieved read-only, exact downloaded file hashes retained privately. Root and an independent AI pixel reviewer confirm nine genuine RECYCLABLE negatives (blank/technical artwork). All nine match ONE active blank/dieline reference f1a85af9-c845-49a9-8ce3-90457da6e759; reference04 has no recycling mark. Six scores1 are embedding collapse, NOT pixel identity: recomputed gold canonical hashes are correct and distinct from reference canonical hash d7214796e3f896897ac9a665117531bdd7e8ed79d1dbecdd0249191e8fec6ad3. Hash exclusion alone does not fix these nine. Negative01 contains the older Rainforest Certified seal against the People & Nature class. Negative09 has generic V-label without Vegan qualifier. Both must remain subtype challenge cases; do not relabel from model agreement. Model-manager embed preprocessing can differ from regression canonical phash load; nearest-vector diagnostic V-label score0.896 vs actual full baseline0.908 is not decisive for the original winning reference.

Confirmed structural gaps: active-reference hash is omitted at DB→regression endpoint; upload/ML registration/seed/promotion paths lack a conservative minimum-image-content admission check. The actual reference needs audited soft-deactivation in serving and evaluation, not eval-only filtering. A complete unchanged-gold counterfactual is being evaluated without database writes. BMad-build implementation spec records the narrow structural controls; no production admission flags or pause changed.

### Follow-up testharness tijdens implementatie
Nieuwe Python-endpointintegratietest verzamelde niet met pytest importlibmodus door een ontbrekende testmodule-importkoppeling. Symptoom betreft testverzameling, niet de productieruntime. Implementatieagent bevestigt eigenaar testfixture/importpad, oorzaak bevestigd, corrigeert uitsluitend testharness vóór opnieuw draaien; geen productfix op basis van deze harnessfailure. Gerichte API-suite29tests geslaagd.

### Gecontroleerde productiepreview en bibliotheekaudit

De volledige ongewijzigde goldset van654beelden opnieuw gemeten met exact de bestaande preprocessing, bij0,90. Het uitsluitend in het geheugen weglaten van de bewezen lege referentie verandert397→405correct; negatieven79→88van90, positieven318→317van564. Eén eerder correct positief beeld is eveneens leeg; root en onafhankelijke pixelreview bevestigen dit. Dit bestaande goldlabel is behouden, niet opportunistisch omgezet. Rainforest oud/nieuw en V-label zonder Vegan blijven de twee foutmatches.

Drempelpreview op dezelfde654beelden en541referenties:0,95 levert240/564positieven en89/90negatieven;0,97 levert166/564 en89/90;0,99 levert100/564 en90/90. Een algemene verhoging maskeert het probleem door zeer veel echte logo’s te missen en wordt niet uitgevoerd. Geen claim van onafhankelijke nieuwe eindtest.

Read-only bibliotheekaudit gebruikt de daadwerkelijk geïmplementeerde Python-opnamecontrole:542/542PNG-bestanden leesbaar,541toegelaten, precies f1a85af9-c845-49a9-8ce3-90457da6e759 geweigerd (hash d7214796e3f896897ac9a665117531bdd7e8ed79d1dbecdd0249191e8fec6ad3). Geen SVG/decodefout.56API-tests,94Python-tests,typecheck geslaagd. Alle remote diagnostische processen lezen uitsluitend de eigen productievoorziening; geen writes, geen vervangende referentie en geen modeltraining. Werkelijke curatie/vrijgave en baselinerebinding moeten nog apart gecontroleerd plaatsvinden; het vliegwiel blijft gepauzeerd.

### Follow-up uit onafhankelijke review vóór correcties
Bevestigd nieuw codepad: synchrone referentiedownload/hashwerk blokkeert asyncregressieroute; eigenaarML/flywheel. Bevestigd ref-IDtestshape wijkt af van echte DB-accessor. Bevestigd nieuwe volledige rawdecode/loop vergroot uploadwerklast; eigenaarAPI/reference-content. Contrastboundary8/9 en echte positievefixture ontbreken inverificatie. Kleinste correcties: thread-offload, juisteID, expliciete decoded-pixelbound en gedeelde fixtures. Bestaande transparantie-embeddingnormalisatie en guide-reactivatie worden apart geregistreerd; geen automatische gewicht-/normalisatiewijziging ofcuratie.

### Werkelijke canonieke self-matchpreview
Alle542referentiehashes én654queryhashes uit de oorspronkelijke pixels recomputeren en doorbestaandepureguard sturen (uitsluitend geheugen) geeft373/654correct vóórcuratie en382/654 daarna. Positief294/564 inbeidegevallen; negatief79/90→88/90. Dit verschilt bewust van oude397/405 doordat dezelfde pixels onder anderpad nu werkelijk alszelfmatch uitgeslotenworden. Het verlies van eerder kunstmatig correcte zelfmatches is eerlijke meetcorrectie, geen wijzigingen aan modelgewichten/serving. Alle654queries/labels behouden. Bestaande baseline moet bij later deploy/curatie expliciet stale en gecontroleerd opnieuwgemeten worden; geen vergelijkingen metoude hashloze baseline alsvrijgavebewijs.
