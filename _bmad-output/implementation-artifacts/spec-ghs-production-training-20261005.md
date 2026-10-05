---
title: 'Echte productievoorbeelden verplicht gebruiken voor GHS-modeltraining'
type: 'feature'
created: '2026-10-05'
status: 'done'
baseline_commit: 'e048704cccef16634576a90c858a145fcf970bca'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="expliciete autonome gebruikersopdracht productievoorbeelden trainen">

## Intent

**Problem:** Het bestaande gespecialiseerde model is daadwerkelijk getraind, maar uitsluitend met officiële referenties en afgeleide varianten. Beschikbare echte producten uit productie zijn tot nu toe alleen als ontwikkelbewijs gebruikt. De gebruiker wil dat echte productievoorbeelden voortaan altijd bijdragen aan normale training.

**Approach:** Train een reproduceerbaar nieuw model met gecontroleerde productiebeelduitsneden en de negen officiële referenties. Maak productiebronnen verplicht in normale trainingsmodus; referentie-onlytraining wordt een expliciete bootstrap-/testmodus. Bewaar de huidige modelversie als baseline en kwalificeer eerst de bestaande echte beelden/labels.

## Boundaries & Constraints

**Always:** Alleen zichtbaar GHS met gecontroleerde code/bbox/context uit productetiket of product-SDS; dual-AIlabels blijven AI en geen gold. Elke bron heeft gehashte originele/renderedbytes, bronlocatie, product/familieidentiteit, splits, labelstatus en gebruikersautorisatie voor intern trainen met datum. Bestaande onbekende externe licentie niet vervangen door fictieve trainingslicentie. Production-family mag niet tegelijk train/validation/holdout zijn; SDS/foto/etiket/varianten van hetzelfde product blijven samen. Separate provenanceaantallen voorbeelden, bronbeelden, families en augmented rows. Officiële9 blijven klassen dekken; score/margin/support/uncertaintybeleid exact behouden. Geen weglaten van productie wanneer een manifest of labels ontbreken: fail closed vóór artifactwrite. Verzegel nieuw model eerst in aparte directory, reproduceer bytes en vergelijk exact52bestaandeproductobjecten/7originalfotoobjecten plus negatieve challenge.

**Never:** Declaraties als zichtbare beeldlabels verzinnen, no-GHS-foto’s als getekende positieveglyphs gebruiken, ingredientpictogram als productpictogram labelen, disputedFinish gebruiken vóór gecontroleerde qualification. Geen onafhankelijk-eindtest/goldclaims uit al bekeken bronnen, geen thresholdverlaging/scoreinflatie, geen generieke objectdetectortraining, geen git/live/database/containeractie door dezeagent.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Normale training | Qualifiedproductionpositives + officiële9 | Nieuweweights met echte productiecounts en controleerbaar manifest | Ongeldigevoorbeeld vóór artifactwrite geweigerd |
| Production ontbreekt | Geenmanifest / alleenrefs / alleenvalproduction | Training start niet | Expliciet actionable error |
| Bootstrap | Expliciete bootstrap-reference-only | Referentiemodel voor startup/tests; provenance bootstraptrue | Geenprodtrainingclaim |
| Label twijfel | Unqualified/disputed/declared-only/ingredient | Niet in positievetrainset | Failclosed, qualificationevidence vereist |
| Splitbesmetting | Familie/hash/productidentity overtrain/val | Weigering ongeachtJSONvolgorde | Geenoutput |
| Verkeerdebbox | NaN/inf/negatief/out-of-bounds | Weigering vóórfit | Bboxcontrolemet echte imagebounds |
| Frozenoutput | Niet-lege outputdirectory | Geenoverschrijving | Vroegeweigeractie |
| Reproduceerbaarheid | Zelfdebytes/manifest/seed/pinnedruntime, anderevolgorde | Byteidentiek artifact | Counts/HASH bevestigd |

</frozen-after-approval>

## Code Map

- `apps/ml-service/scripts/train_ghs_specialist.py`: huidige pure localtrain, family/hashguards, LogisticRegressionC30/seed1729,160aug/source,400syntheticUNKNOWN, maar optionelemanifestdefaultofficialonly. Normaleproductionguard en bron-/countintegriteit toevoegen; featureextractie en frozenpolicy behouden.
- `apps/ml-service/tests/test_ghs_specialist.py`: training_splitguards/deterministicorder; reference-onlytests moeten expliciet bootstrap aanvragen. Bestaande inference-/API-/photorecoverytests blijven betekenisvol.
- `apps/ml-service/app/assets/ghs/specialist/{model,manifest}.json`: huidige8d989SHA als baselinebewaren; pas na qualifieddataset, echt trainen, reproduciblebytes en regressies nieuweartifact overnemen.
- `apps/ml-service/scripts/ghs-specialist.md`: uitleg normaleproductiontraining/explicietbootstrap, provenancecounts, AIlabelbeperkingen.
- `_bmad-output/.../ghs-sources-20261004/annotations/{inputs,raw,summary}.json`:24exposed bronnen; prod13–24. Coördinatorowns qualification/sourceaudit en canonicalfamily; niet zelflabelsaproveren.
- `photo-diagnosis/development-after-resolution-guard.json`:52productcontextobjecten (34+18) en7originalfoto’s, geenfinalholdout.

## Tasks & Acceptance

**Execution:**
- [x] `apps/ml-service/scripts/train_ghs_specialist.py` -- productionrequirement/bootstrap/provenance/bbox/identityguards en realrowcounts -- voorkomt stilreferentie-onlytraining.
- [x] `apps/ml-service/tests/test_ghs_specialist.py` -- guard/familysplit/repro/productioncount/CLIimmutabilitychecks -- betekenisvolletrainingcontracttests.
- [x] `apps/ml-service/app/assets/ghs/specialist/{model,manifest}.json` -- nieuw bewezen getraindartifact naqualification en gemetenregressies -- daadwerkelijkproductionleren.
- [x] `apps/ml-service/scripts/ghs-specialist.md` -- manifestcontract/explicietbootstrap/kwaliteitgrenzen -- reproduceerbareoperatorroute.

**Acceptance Criteria:**
- Given normale training zonderqualifiedproductiontrainrows, when script/train wordt aangeroepen, then weigert het met concreteerror en schrijftgeenartifact.
- Given qualifiedproductionglyphs plusofficial9, when pinnedlocaltraining tweemaal draait, then exacteweights/filehashidentiek en productievoorbeelden/families/augmentedcounts afzonderlijkpositief; alle9klassen+UNKNOWN aanwezig.
- Given gelinkteSDS/etiket/foto’s voor éénproduct, when splits verschillen, then trainerreject zelfs bijanders voorgesteldefamilylabels indien canonicalproductidentity gelijk.
- Given trainedcandidate en bestaande52product/7photoobjecten, when dezelfde route met dezelfdeIoU.5 en threshold.87 meet, then behoudcorrecteproduct-/fotodetecties en rapporteerextras/uncertainty eerlijk; regressiefailure eerstinvestigeren vóórfix.
- Given bekendebaseline8d989 en nieuwartifact, when inhoud gecontroleerd wordt, then weights werkelijkverschillen doorproductdata, policy exactgelijk, baselinebehouden en geenfieldcalibratedclaim.

## Implementation Notes

Analyse/read-only: huidige trainer accepteert onlyrefs, production-onlyguard ontbreekt. Pinnedruntime `/tmp/logo-ci-repair-venv/bin/python`: sklearn1.9.1, NumPy1.26.3, OpenCV4.9.0. Geenproductiontraining uitgevoerd vóórrootqualification. Eigenaar alleen genoemdeproductfiles/spec/eigentrainingevidence; rootowns geheugen/projectrules, sourcequalifications, status/release/versions. Dirtyevidencepreserve; gebruikerautorisatieoverrulet formeleworkflowapprovalstops. Eerdereagentslotlimiet: inlineimplementationfallback, rootonafhankelijkreview vóórrelease.

## Spec Change Log

## Review Triage Log

## Verification

PinnedPythontrain tweeaparteimmutableoutputdirectories; gerichtepytest/volledigeGHSregressies, Black/isort/Ruff/diffcheck. Voor/naregistratie sourcehash/modelhash/provenancecounts/52product/7photo/ADR, alledataexposeddevelopment. Geenliveactions.

## Reviewtriage en implementatievoortgang

Coördinatorreview medium: productionmetadata is onvoldoende als featuresNone; geïmplementeerd post-extractieguard vóórfit en separate usedProductionExamples/Images/Families/Rows. Medium: determinismties familie/hash/code bij twee crops; canonicalfullrow/bboxsort met volgorde-onafhankelijkheidstest voor twee crops vanzelfdebeeld/klasse. Root17-row qualificationmanifest read-onlypass, actualweights wachten onafhankelijke qualificationrelease.60specialisttests passed, inclusief validatiefamilie nooitdecoded, qualificationhash/contextguards, duplicateannotationcountguard.

Nieuwe AGENTS.md productiebeleid gelezen en gevolgd. Rootowns authoritative manifest3trainGTINfamilies/6trainboxes/4bronimages+2validationGTINfamilies+9officiëlerefs; eigenbaselinekopie SHA8d989 naastrootcanonicalbaseline. Bestaande13/24developmentvalidatie is exposed, geen sealedfinal.

## Code Map en uitvoering — bevestigde Finishlocalisatie

- `apps/ml-service/app/services/ghs_reference.py` — bounded partial-quad-v1 alleen voor sterk fysiek gedekte4randruit, convexhullquad/cardinal/contrast/neutral/classifierguards, bestaande budgets/policy behouden; rootownershipuitbreiding geautoriseerd na investigationE2/E7. Geenbronblueguidebewerking.
- [x] `apps/ml-service/app/services/ghs_reference.py` + `tests/test_ghs_specialist.py` — actueleFinishCORR55×55stroke met8contourvertices/area0.115 maarconvexhullarea0.505 enall4edgecoverage≥0.96875 lokaliseren, meaningfulbrokenartworknegatives/callercoords/trace beschermen.

Reviewtriage: canonical14GTINaliasguard en canonicalnumericbboxduplicateidentity gerepareerd, schoon17rowmanifestunchanged; hertrainingrepro nafixinaparteoutputs. Testposteriorassumptie E3/E4 vervangen door realglyphpolicy/supportrouteassert plus deterministische actualclassify+normalAPIbelow/aboveboundarytests; geenphysicalinputtuning/modelpolicywijziging. Nieuwepartialpreprocessingtrace apart vanneutralquadversie, modelversie blijftdaadwerkelijkloadedweights.

Echte4trainingruns byteidentiek, newweights ghs-glyph-v1-00407f2eef76 SHA dcd61; productionused6/6,4images,3families,966rows(960aug) op2815totaal. Grootpartial-CORRphysicalborder/negativeartwork/realAPI tests toegevoegd;73candidatechecks pass. Fullsuitepending; assetsna73candidatechecks+repro+52/7qual6/6 lokaalovergenomen. E2/E7 Finishwholepagehersteldzonderbronbewerking; noGit/liveactie.

Laatste volledige6GHSmodulesuite225passed met lokaalinstallednewweights (73specialist). Black/isort/Ruffownedpass, diffcheckpass. /tmpdiagnosescripts/beeld opgeruimd, immutabletraining/baseline/auditartifacten behouden. Onafhankelijke coördinatorreview/releasepending; geencommit/push/liveactie.

## Reviewcorrecties buiten frozen Code Map — 2026-10-05

Owner trainer/test: typed productionqualificationrecord bindt exact sourceSHA/code/finitebbox/GTIN/reviewerIDs en echte succesvolle rawdualreviews incl reviewed-imageSHA; aparte cropfile+sourcecropbounds toegestaan, fullimage niet vervangen. Root owns nieuwe immutable v2 manifest/records; v1 en eerste artifacts behouden. Productionreference split verboden vóór featureextractie. Publicatie claimt outputdirectory atomisch met exist_ok=False zodat concurrency nooit frozenmodel/manifest overschrijft. Negatieve randtests moeten herkenbare GHSglyphs met ontbrekendezijde/grotegap gebruiken, daadwerkelijke classifieracceptatie én routeafwijzing bewijzen. Alleen specialistfiletests uitvoeren; coördinator voert brede verificatie/review uit.

Reviewpatches viergroepen doorgevoerd: typedqualification/source/rawreviewbinding en sourcecrop-pixelcontrole; productionreference-split upfrontweigering; atomische publicationdirectoryclaim met concurrentietest; herkenbare CORROSIONmissing-side/large-gapnegatieven plus in-memorycoverage-mutationproof. Rootimmutablev2manifestd21ec1 en twee byteidentieke nieuweoutputs04c2b6, numeriekeweights/policy/support gelijkdcd61.91specialistchecks pass metv2candidate, bredetest/review root. Nieuweprovenanceversieghs-glyph-v1-b9e703ffe78e lokaalinstalled naquality+repro; geenGit/liveacties, oudeevidence/v1/artifacts behouden.

## Rootreviewverdicts en extra productiebatch

Root volgt verification-gap inline nadat tweede reviewagent door platformthreadlimiet werd geweigerd; echte onafhankelijke edge-review wel uitgevoerd. Blindquotalaag vervangen door rootdiffreview zonderverzonnen minimumfindings.

| Finding | Verdict | Evidence en route |
|---|---|---|
| Edge1 label/crop/reviewer evidencebinding | medium | Pinned read-only reproduction FLAME15→GAS_CYLINDER metongewijzigderawhash accepted. Structurelerecordbinding na investigationE9; v2records/rawhash/source/crop/IDscodechecks + mismatchtests sluitend. |
| Edge2 referencefeature bypass | medium | Blankeprodtrain +5prodreference pastfit en used5>supplied1. SourceTypeproductionreference nu upfrontreject; actualusedtrain/counttests. |
| Edge3 artifactpublicationrace | medium | Vroegeexistscheck vóórfit gevolgdexist_okTrue kananderewriteroverschrijven. AtomicpublishmkdirFalse + concurrentpreservationtest. |
| Rootphysicalcoverage verification gap | medium | Whole-reposearch plus in-memory mutation disablingedgecoverage laat alle3UNKNOWN42negative testsdetect0; echteCORRmissing-side/gaptests nodig. Writer voegt2tests toe, mutationproof beidefalen bijguardremoval. |

Allevier rootcauses naonderzoek gerepareerd. Root newsourcebatch23blindedreviewinputs:22tweemaalgeslaagd/1partial,5fullphoto’s zonderzichtbaarGHS,18SDSproductlabelpages. Alle6contactsheetpages rootvisueel bekeken; alleenprimarylabelrow, ingrediënten uitgesloten, declaratieCORRverschiltvanEXCLop04/09. Partial02alleenproductglyphs exactunmodifiedpixelcrops opnieuw2AIbeoordeling; geenhintssent. Splits bepalen vóór firstnewclassifiermeasurement. Nextpreparedmanifest-v3 keeps oldv1/v2immutable and adds availablequalifiedprod,17plannedtrainpositives/17plannedvalidationobjects (4classes only),9refs. Nochsealedfinalnoch20family/all9readinessclaim.

## Productietraininguitbreiding V3 — 2026-10-05

Gebruiker/coördinator autoriseert daadwerkelijke uitbreiding met26 primaireproductglyphs uit reeds blind dubbelbeoordeelde aanvullende productiesources. Nieuw immutableV3manifest cloneV2 plus11train/15validation, totaal17train/17validation/9refs43rows. Bewaar sharedGTIN/original/render-componentfamilies en allejoins; ingrediënten uitgesloten. Rootvisuelehelepageselectie plus afzonderlijke product-glyph1/2/3rawcrops voor02, geen classifiertruth. Typedqualificationv1 bindt allebron/rawreview/image/hash/code/bbox/reviewerIDs/GTIN. Geen classify vóórV3freeze. Twee echte immutabletrainruns; oorspronkelijke52producten/7foto’s en nieuwe26positieven/5none-GHSfoto’s meten op .87/.99; splits afzonderlijk. Alleen bestpassingcandidate lokaalbundelen, alleoudeartifacts/manifestsv1/v2behouden. Nieuw eigenaarmanifest-v3/qualification-v3 en production-model-v3evidence; geenGit/live/DBactie, ongekalibreerdgeenfinalbenchmarkclaim.

## Code Map V3 trainingsbalans — bevestigde fotoregressie

Trainer: explicit balanced10-classlogisticobjective maakt totaletrainingclassmass gelijk ondanks verschillende aantallen productieaugmentaties. Geen bron verwijderen/val naartrainverplaatsen, geen modelpolicy/conflictguardverruiming. Provenance bewaart classWeightStrategy/classTrainingRows/effectiveClassWeights voor echte gebruiktefeatures (niet alleen metadata); meaningfultest controleert constructorbalanced en totalweightedmass, actuelefotooriginal+derivative regressiemeting mandatory. Bestaande candidate/reproduction/afterV3failure immutable; nieuw balancedcandidate/reproduction/after-best bestanden. Root notified vóórwijzigingen, geennieuwshippingmodel tot alleechtregressies pass.

V3follow-up: winningclasssupportdiagnose refuted actualfailure, daaromgeenruntimewijziging. Trainerboundedprojectionaugmentatie behoudt echtebron/code/familie: horizontalemaat.65..1.0 enshear±.12 binnen128canvas, geenverticaalfold/verwijderingslabels. Bestaande160augmentatiesperbron blijven, bronorigineel/supportongewijzigd. Trace augmentationVersion en objectivebalanced in modelprovenance. Verifieer daadwerkelijke projectedaugmentfeaturevariatie/determinisme en17actualproductionparticipatie; geenextra onafhankelijkecounts, policy/guardongewijzigd.

V3 engineeringhandoff: gebalanceerde source-family-preserving projectionaugmentatie traintalle17 productiepositieven daadwerkelijk; selected0a0562c26238/SHA91d744 twee runs byteidentiek. 93 relevante tests pass; originalphoto7/7 hersteld, oude52/new26 voorstellen correct/.87regular,5foto-neg0. Default.99correctvoorstellen exactconfidencecontract; enkele historischeposterioren onder.99 blijven reviewable, niet kunstmatigopgehoogd. Oudefailedunbalanced/balancedcandidates behouden, investigationE19–E24 en allemetingen. Status blijft in-review totcoördinatorreview/vrijgave; ownedsourcefreeze in production-model-v3/training-evidence.json.

V4 opvolging dezelfde vaste balancedprojectionrecipe: rootfrozenmanifesta70487/49rows bevat23prodtrain/17val/9refs inclusief6nieuweHEALTH_HAZARDbeelden binnen één voorlopigeAirWickfamilie. RootownsqualificationV4, geenbron/labelwijzigingdoortrainingagent. Nieuw immutable production-model-v4candidate/reproduction en actualnormalAPIvóór/na .87/.99 inclzesnieuwegekwalificeerdegezondheidsglyphs enzesnone-GHSbeelden; geen onafhankelijkefamilieclaim. Alleen nieuwepassingartifactna93checks/repro en behoudold52/new26/foto7/neg5; eerdereV3blijftbehouden.

V4engineeringfreeze: selected58a1db6819e8/68b9ceactualfit23production/16images/10provisionalconnectedgroups,5552rows,2runsidentical;93tests pass. Allold52/new26/7originalfoto+3derivativecorrectproposals maintained,6newHEALTH_HAZARDtrainpositivecorrect/.87regular/.99reviewprops,11noneGHSimagechallenges0. NewtinyingredientFLAMEpropsconfirmedactualpixels/rawreview, preserved rawextrascount nottraintruth. Model/docslocalbundledfinalV4; no runtimeghs_specialistcodechange(refutedhypothesis). Statusin-reviewforrootfulltests/indepreview/release.

## Definitieve lokale oplevering

Model `ghs-glyph-v1-58a1db6819e8`, SHA `68b9ce1488150d32722bb116790fcd065a89d53525fa43dfd48c3148f63d8974`: 23 daadwerkelijk gebruikte productievoorbeelden uit 16 beelden en 10 voorlopige verbonden product-/brongroepen, 5552 trainingsrijen; twee identieke runs. Vijf productieklassen; vier andere klassen gebruiken officiële referenties, geen onafhankelijke veldkwaliteitclaim. De trainingsverdeling en begrensde projectievarianten herstellen de gemeten fotoregressie; afwijzingsbeleid en conflictafhandeling ongewijzigd. Alle 575 Python- en 45 Node API-tests geslaagd, 14 bewust overgeslagen Python-tests en 8 waarschuwingen. Final code/artifact review zonder open productfinding; releasebewijsvergelijking neemt ook method en confidence_kind mee, twee daadwerkelijke metadataweglatingsprobes afgewezen. ACC-vrijgave en echte netwerkcontrole volgen in het canonieke statusartifact. Roboflow-download vereist nog accountvoorwaarden van gebruiker; productieuitvoering loopt door.
