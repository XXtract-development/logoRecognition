---
datum: 2026-10-04
laatste_verificatie_utc: 2026-10-03T22:13:40Z
laatste_verificatie_scope: gerichte reviewfixchecks; brede verificatie bij root
status: implementatie lokaal geverifieerd; onafhankelijke review volgt
spec: spec-ghs-herkenning-implementatie.md
scope: uitsluitend offline code en tests
---
# GHS implementatiebewijs

> [!warning]
> Negen officiële starttemplates zijn geen onafhankelijke verpakkingsdataset. Geen klasse heeft nu bewijs voor het pilotdoel van20positievefamilies en100negatievefamilies. Geen training, DBimport, modelactivatie, deployment, commit, push of Zohoactie door deze worker.

## Uitgevoerde verificatie

Alle genoemde laatste opdrachten zijn afzonderlijk geëindigd met exitcode0.

- Vanuit repositoryroot: `npm test --workspace=@logo-recognition/api -- --run src/__tests__/services/field-type-mapping.test.ts src/__tests__/services/reference-registration-contract.test.ts src/__tests__/services/t3777-declarations.test.ts src/__tests__/services/t3777-declarations-19-16.test.ts src/__tests__/services/flywheel-promotion.test.ts src/__tests__/services/flywheel-crosscheck-hook.test.ts src/__tests__/services/ghs-contract.test.ts src/__tests__/api/artwork-pipeline.routes.test.ts` — **166 tests,8bestanden, allemaal geslaagd**.
- Vanuit `apps/ml-service`: `MODEL_PATH=/tmp/ghs-offline-models PYTHONPATH=. /tmp/logo-ci-repair-venv/bin/python -m pytest tests/test_ghs_contract.py tests/test_symbols_contract.py tests/test_ghs_evaluation.py tests/test_ghs_images.py tests/unit/test_reference_registration_contract.py tests/unit/test_classify_gate_19_11.py tests/unit/test_localize_codes_filter.py tests/unit/test_nutriscore_reader_12_22.py tests/unit/test_nutriscore_a2_12_25.py -q` — **150 tests geslaagd**,2bestaande dependencywaarschuwingen.
- Vanuit `apps/ml-service`: `/tmp/logo-ci-repair-venv/bin/python -m ruff check app/`, `/tmp/logo-ci-repair-venv/bin/python -m black --check app/`, `/tmp/logo-ci-repair-venv/bin/python -m isort --check-only app/` — elk afzonderlijk exitcode0; Black controleert42bestanden. Alleen eigen gewijzigde productbestanden geformatteerd; geen brede wijzigingen aan bestaande tests.
- Vanuit repositoryroot: `git diff --check` — exitcode0.
- Vanuit repositoryroot: `npm run build --workspace=@logo-recognition/api` — TypeScriptbuild geslaagd.

Voorlopige failures en structurele oplossingen staan in de bestaande investigationcase. Testverwachtingen zijn niet afgezwakt: pure categorieresolutie blijft NO_PICTOGRAM kennen; positieve registratie heeft een eigen guard. De nieuwe legacyadaptertest volgt de expliciete contractcorrectie van root: method blijft bestaande enum, perdetectieversie is officieeltemplateversie.

## Traceerbaarheid

| Rij | Werkelijk uitgevoerde tests | Uitkomst / bewijsgrens |
|---|---|---|
| G01 | Python `test_g01_pairs`; TS `G01 resolves all nine aliases` |9naam/nummerparen, categorie en GS1veld correct |
| G02 | `test_g02_explicit_and_dedup`; bestaande `test_localize_codes_filter` |Aliassen selecteren hetzelfde, dubbelebevinding één |
| G03 | `test_g03_invalid_reference`; `test_ghs_invalid_positive_reference_does_no_io`; `test_invalid_ghs_reference_endpoint_422_no_io` |Geenpositieveklasse/reference;422vóórI/O |
| G04 | Bestaande reference_registration_contract idempotentie/metadata; `test_ghs_alias_registration_metadata`; TS beideflywheelflagtests |Metadata,invalid-I/Oguard en idempotentie; pilottrainingafgeschermd |
| G05 | TS `G05 exact namespaced repeated XML field independently resolves aliases` en26bestaande parser/providerchecks |Exactveld,namespace,aliasdedup,geen generieke enumfalsepositive |
| G06 | TS vijfdeclaratiescenarios,lowconfidenceopen,beideflags;2echteFastifyaccepttests |Geenautoacceptatie/nominatie/promotie; menselijkeaccept blijft200accepted zondertraining/reference/goldset |
| G07 | `test_g07_split_leakage`; `test_g07_holdout_import_refused`; samesplitfamilyguard; officialhash/resizeguard; renamedpilothashguard |Hash/familie/nearduplicate/refleakage afgewezen; GHS_PILOT_MANIFEST beschermt hernoemdebeelden |
| G08 |9echteofficiëletemplates via imageprocessing; cropConfusionMatrix/evaluatiefixtures |Technischebeeldsmoke; **onafhankelijke echtecroppilot nog onvoldoende bewijs** |
| G09 | Multiboxmatching/dubbelebox/allclassesfixture;2officiëlePNGmultiboxcompositie via beideroutes |Eén-op-één maximum matching; extrasfalenfamilie; compositie is geenholdout |
| G10 | `test_g10_negative_label_denominator`; uncertainproposalsnegativeerror |Foutetiketten teller/noemer,uncertainvoorstellen tellenmee; **100onafhankelijknegatievefamilies ontbreken** |
| G11 | `test_g11_confusion_visible`; echteFLAME/FLAME_OVER_CIRCLEtemplates apart en samen |Verwisselingen zichtbaar; echteandereGHSkent eigenpositieveklasse |
| G12 | Unreadablevacuoussuccess,uncertaincrop,uncertainfamilypage; nestedruitregressie |Abstenties/kwaliteits- en groottebakken; onleesbaargeenminimum; bekendeechtesoapontwikkelingstreffer blijftonzeker |
| G13 | `test_g13_url_only_explicit_unsupported` |URLonly422,geen leegsucces |
| G14 | BestaandePythonNutriScore/gate/localize/referencechecks; APIparser/mapping/flywheel/artworkroutes |Bestaandegedrag groen in gekozenregressies |
| G15 | `test_g15_freeze_protocol_once_and_changed_threshold_rejected` |Frozenconfig/hashdriﬅweigering,eenmaligefinalexposure,expliciet onvoldoende bewijs; baseline/challengercomparisonnietmeegeleverd en alsontbrekendgerapporteerd |

## Echte ontwikkelprobe

Op rootgeleverde echteachteretiketafbeelding `/tmp/logo-ghs-source-pilot-20261002/08721516201096-page1-variant.png` vindt de route `EXCLAMATION_MARK`,confidence0.798982,bbox{x409,y967,width134,height134},uncertain=true,requires_review=true. Bron/eigenaar/evidence staan in rootonderzoek. Dit is een ontwikkelprobe gebruikt voor contourdiagnose, nooit onafhankelijke finalevidence.

De specifieke contourfix inspecteert internegeslotenruitcontours en dedupliceert vollediggeneste ruitboxes; generieke modeldrempels blijven gelijk. GHSreferenceconfidencevloer0.87 blijft behouden; GHSreviewproposalvloer0.65 houdt het onzekeretypevoorbeeld zichtbaar. Vergelijkingsmarge0.035. Interne method `ghs-reference`; legacy SymbolDetection gebruikt `classifier` (deterministische referentieclassificatie, geen neurale trainingsclaim) met `modelVersion=ccohs-ghs-v1`.

## Niet uitgevoerd / resterende beperkingen

Geen onafhankelijke finalevaluatie gestart wegens ontbreken van toegestane vollediggeannoteerde onafhankelijkefamilies. De CLI meldt dit perklasse; referentieaantallen worden nooit trainingsgereedheid. Geen baseline/challengervergelijking aangeleverd: rapport noemt dit expliciet en geeft geen vergelijkende vrijgaveclaim. De deterministische route is gericht op complete rode ruiten; vervorming/roodloze symbolen hebben nog geen onafhankelijk herkenningsbewijs. ImageURLfetch blijft explicietunsupported.

GHS_PILOT_MANIFEST is optionele operatorconfiguratie voor een lokaal geregistreerdmanifest; namen holdout/validation/ghs-pilot worden altijd geweigerd. Een willekeurigbeeld zonder herkomstmetadata of geregistreerdmanifest kan niet automatisch als verborgenholdout worden herkend. Pilotbestanden blijven lokaal en mogen niet via anderegenerieke writepaden worden ingevoerd.


## Hervatting en definitieve ontwikkelprobe 2026-10-03

De gebruikslimiet onderbrak de implementatie; alle lokale edits zijn behouden en hervat. Laatste daadwerkelijke afwijking: twee onterechte HEALTH_HAZARDvoorstellen op bloem/drukachtergrondgaten. De geometryguard valideert nu vier ruitvertices én de witteannulus tussen zwartefiguur en verbondenrodecontour. Die annulus houdt de dichte zwarte HEALTH_HAZARDfiguur geldig; geen generieke confidenceverlaging.

Op alle8rootgeleverde echte ontwikkelpagina's behoudt de aangepaste route4EXCLAMATION_MARKvoorstellen:2opscore0.798982onzeker en2opscore0.870679. De twee HEALTH_HAZARDextras verdwijnen; de4overige pagina's hebben geen GHSvoorstel. Volledige lokaleprobeoutput: `/tmp/logo-ghs-source-pilot-20261002/exploratory-predictions-geometry-guard.json`. Dit zijn ontwikkelbeelden zonder claim van onafhankelijke groepen of uiteindelijke herkenningskwaliteit.

Nieuwe blijvende technische regressies `test_nested_ghs_diamond_inside_larger_red_label_frame` en `test_colored_artwork_holes_and_flower_shapes_are_not_ghs` zijn uitgevoerd in de150geslaagdePythonchecks; alle9officialtemplates blijven in diezelfde run bewezen via symbolimageadapter/artworklocalize/artworkclassify. Geen echte bronfoto's als nieuwe testwaarheid aan de repository toegevoegd.


## Gerichte reviewfixverificatie 2026-10-04 (Amsterdam)

Alle14fixgroepen uit de reviewopdracht zijn uitgevoerd. De bovengenoemde150/166zijn de eerdere brede implementatiechecks; hieronder staat uitsluitend de laatste gerichte reviewfixcontrole. Root voert daarna de brede verificatie uit.

- Vanuit `apps/ml-service`: `MODEL_PATH=/tmp/ghs-offline-models PYTHONPATH=. /tmp/logo-ci-repair-venv/bin/python -m pytest tests/test_ghs_evaluation.py tests/test_ghs_images.py tests/test_symbols_contract.py tests/unit/test_classify_gate_19_11.py -q` —77geslaagd,exit0.
- Vanuit repositoryroot: `npm test --workspace=@logo-recognition/api -- --run src/__tests__/services/ghs-contract.test.ts src/__tests__/services/t3777-declarations.test.ts` —45geslaagd,exit0.
- Scopedruffcheck op vijfgewijzigdeproductbestanden, scopedblack/isortcheck op achtgewijzigdePYbestanden, en `git diff --check` —elk afzonderlijkexit0. Geen bredere build/testsuite door worker.
- Een pytestaanroep vanuit repositoryroot met een mlservice-relatiefpad eindigdeexit4zondertests; de correcte aanroep vanuit apps/ml-service is daarna geslaagd. Dit was een uitvoercontextfout en geen coderegressie.

| Fixgroep | Gerichte dekking |
|---|---|
| NO_PICTOGRAMgeenmissingplaceholder |2nieuwecrosschecktests voor leegsentinel en matchedcontradictie |
| Geenstilpartialsuccesnadedectorfailure |2echteFLAMEimagecases met beschikbaarheidsfailure op de legacyinfrastructuur, inclusief profielzonderGHS |
| GHSdependencyfoutbeïnvloedtlegacyclassificatie niet |Corrupt/missingreferences en3unsupportedarraycases |
| Artworkprovenancebehouden |9echteofficiëlebeeldroutes toetsen reference_version en requires_review |
| Metadata/dimensies/bbox vóórfinalexposure |Distinctreviewer/dimensie/bboxgevallen, decoded-dimensionscase, CLIpreflightmarkerabsence |
| Cropnear-duplicates |Officiëlecropopunrelatedpagina, crossfamily/split-crops, samefamilyreuse en echtecroppHashverificatie |
| Runtimebytesnear-duplicates |Hernoemd/resized/reencodedfullbeeld én transformedcrop geweigerd vóórreferencewrites |
| Frozennormalisatie/labelmap/thresholds |Geïsoleerde kopie met gewijzigde normalisatiebronweigertprotocol; actuelealiases/sharedmapping/thresholds/runtimeversies vastgelegd |
| Datasetgebondenexposure |2protocolnamen voor dezelfdeeinddatasetweigeren2erun; corrupt-imagefreezezonderdecode, exposureblijftnadecodefailure |
| Onzekereclassificatieabstentie |Sameclassuncertain gaat naarUNKNOWN,geen falsematrixdiagonal/criticalconfusion; sampleunleesbarecroptruthconsistentUNKNOWN |
| Onleesbareobjectoverride telt nietvoor20minimum |18leesbare+2sampleonleesbaregroepen met100negatieven blijftinsufficient-evidence |
| GHS-onlycatalogprovider/cache |Echteprovider parseertGHS02XMLnaarFLAME engebruiktcachebij2eaanroep |
| Pilotdoelgrenzen |19/20positief,99/100negatief,17/18correct,5/6foutnegatief —alle3statussengetest alsstructuurfixtures |
| Maximumcardinalityreassignment |Competitieve20x20boxes truthx0/6,predx3/-6 geven2matches,0miss/extra,1correctefamilie |

De deterministische rekeningfixtures vormen geen veldkwaliteitsbewijs. De herkenningskern/thresholds zelf zijn tijdens de reviewfixes ongewijzigd; alle9officialbeeldsmokes zijn opnieuw uitgevoerd. De4eerder door root bevestigde ontwikkelvoorstellen blijven buiten onafhankelijke finalevidence. Geen training,liveDB/modelactie,commitofpush doorworker.


## Onafhankelijke eindverificatie na reviewfixes — 2026-10-04T00:16:35.865314+02:00

Root herhaalde zelf de volledige hierboven vermelde Pythoncontract/beeld/evaluatie/registratie/gate/filter/Nutri-Score-reeks: **190 passed**, 2 bestaande deprecationwaarschuwingen, 10.13s, exit0. Root herhaalde de acht vermelde APItestbestanden: **169 passed**, 10.59s, exit0. APIpackagebuild exit0; ruffcheck app/ exit0; blackcheck app/42bestanden exit0; isortcheck app/ exit0; gitdiff en stageddiffcheck exit0. Geen tests op live DB. Onafhankelijke fixes-audit loopt; testbewijs is geen onafhankelijke veldkwaliteitsclaim.


CI-follow-up: volledige eersteGitHubMLjobgeslaagd; APIjob1failed/1211passed doorontbrekendGHSoogstveld. Niet genegeerd: rootreproduce1fail16pass; mappingfix+nieuwegenestetest geeft18/18snapshotchecks. Root63adjacentAPIchecks exit0, APIbuild/diffcheckexit0; onafhankelijke verificationreview bevestigt geen testverzwakking/gemetendatawijziging. VolledigenieuweCI volgt.


ACCpostmergeCI37158891471 success (incl.pipeline smoke). Automatischeappbuild blokkeert optioneleONNXinstallerdownload; minimaleDockerfilefix2scopedcommands. RootinstallerONNXRUNTIME_NODE_INSTALL=skip opverifiedlokalepackage1.23.0exit0, workerzero-networkprobeexit0/diff0. Independentverificationreview bevestigt supportedskip/CPUbundled/nootherhooks/runtimechanges. Werkelijkebuild+runtimebewijs volgt; exactefailedCIpkgversieonbewezen.
