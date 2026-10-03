---
case: ghs-codecontract-20261002
status: confirmed
datum: 2026-10-02
owner_repo: logoRecognition
environment: lokale offline contractdiagnose
taak_id: 01a0fc7a-28d6-7333-ae26-c6dc972076d8
gate: specificatie en testontwerp afgerond; onafhankelijke review gesloten
open_goedkeuring: geen
---
# GHS-codecontract

VERIFIED: negen canonieke namen vallen in symbol_contract onder T3777 en worden in uitsluitend GHS-profiel afgewezen; negen GHS01–09-aliassen worden wel geaccepteerd. Pure module-import met per code confidence0.95/profileGHSSymbolDescriptionCode, zie [meetbewijs](ghs-codecontract-20261002-evidence.json). Geen model-/beeld- of database-initialisatie.
VERIFIED: tweede onafhankelijke route: broninspectie toont GHS_CODES uitsluitend GHS01–09, while centrale reference-code-mapping.json uitsluitend negen namen plus NO_PICTOGRAM. API-code mappingtest bevestigt bestaande categorie voor FLAME.
VERIFIED: MARK_FIELDS in t3777-declarations.ts mist gHSSymbolDescriptionCode; rg van veldnaam in API levert centrale mapping, geen declaratieparser. parseDeclaredMarks bron gecontroleerd. Ontbrekend veld is een lokale codeclaim, geen conclusie over alle externe consumers.
VERIFIED: /detect-symbols is een aparte pipelineadapter; imageUrl wordt geaccepteerd als input maar route gebruikt alleen image-base64 of replaydetections. Replayresultaten bewijzen geen whole-label herkenning. API/artwork-productpad en pipelineadapter moeten afzonderlijk bewezen worden.
INFERENCE: intern canoniek normaliseren en buitenste adapter legacy GHS-nummers laten behouden kan incompatibele wijziging voorkomen. Exacte externe consumer en GHS-publicatieadapter nog niet aangetoond.
Hypothese uitsluitend te weinig training: REJECTED als volledige verklaring, er zijn eerst onafhankelijke contractgaten. Modeltrainingstatus: UNKNOWN; huidige ref/holdoutsnapshot nul GHS bewijst geen afwezigheid van ooit getrainde modelgewichten.
Geen productcode, databasedata, thresholds of modelgewichten gewijzigd. Vervolg: lokale BMAD-specificatie, contracttests, dataset en onafhankelijke beeldtoetsing.

Afsluiting 2026-10-02T20:22:19.656635+00:00: [SPEC en companions](../../specs/spec-ghs-herkenning/SPEC.md) afgerond met5capabilities/15testscenario’s en onafhankelijke hercontrole. Alleen lokale artifacts; alle eigen meetcommando’s voltooid, geen remote bestanden/processen. Geen nieuwe codecommit, push, uitrol, GHS-dataimport of modeltraining. Bewijs en bestaande gebruikerswijzigingen behouden. Volgendeprojectactie: offline ATDD voor compatibele naam/declaratie/review-aansluiting.

Vervolg bronverzameling: OSHA webbron biedt9pictogrammen expliciet PublicDomain, maar directe PNG-download via lokale urllib geeft HTTP403. Niets gedownload of alsdatasetgeteld. Alternatieve toegankelijke authentieke overheidsbron wordt gezocht; geen toegangscontrole omzeild. Deze failure vereist geen codefix.

### Vervolg bronverzameling — hersteld
HSE officiële PNG/GIF-downloads gaven eveneens HTTP403; geen bestanden gebruikt. CCOHS officiële WHMIS Pictograms Kit biedt expliciet vrij downloadbare PNG/EPS bestanden. Alle negen PNGs (inclusief ENVIRONMENT) direct van https://www.ccohs.ca/images/whmis2015/for_download/ gedownload, bronpagina https://www.ccohs.ca/WHMISpictograms.html. Opgeslagen onder apps/ml-service/app/assets/ghs met oorspronkelijke bytes, sha256manifest, bronverwijzing en README. Alle9 visueel afzonderlijk gecontroleerd tegen klassenaam; alle9 hashes opnieuw gelezen en gecontroleerd. Deze bronfamilies zijn referenties, geen onafhankelijk verpakkingsbewijs.

### Vervolg testomgeving — Python collection failure
Symptoom: import app.services activeert settings vanuit repositoryroot; rootdotenv heeft CORS_ORIGINS die DotEnvSettingsSource als JSONlijst verwacht en niet kan parsen. Evidence: writer pytest collection errors; aansluitende APItypecheck pass maskeerde samengestelde exitstatus, geen PythonGREEN. Eigenaar: MLtestconfig/uitvoeringswerkdirectory, niet GHSmodel. Hypothese bevestigd door imports/context; productcodefailure nog niet aangetoond. Fixrichting: afzonderlijke Pythonrun vanuit apps/ml-service met geïsoleerde offline testinstellingen, purecontractimports volgens bestaand patroon; geen liveenvwijziging. Elke opdrachtstatus afzonderlijk vastleggen.

### Vervolg regressie — declaratieve toestand versus positieve registratie
Symptoom: bestaande test_shared_mapping_python_parity_and_runtime_file faalt nadat nieuwe positieve-GHSguard in pure categoryresolver is geplaatst. Evidence: NO_PICTOGRAM declaratieve metadata moet wel naar GHS-categorie kunnen resolven, maar mag geen positieve referentie worden. Andere86Pythonchecks groen, suite nog niet volledigGREEN. Hypothese bevestigd: guardniveau te vroeg; geen wijziging van bestaande verwachting toegestaan. Eigenaar: MLreference_category/similarityregistratie. Structurele fixrichting: resolver behoudt declaratievecategorieresolutie; aparte assert_positive_reference_code vóór registratie/storage/embedding-I/O. Invalidregistratietest apart.

### Vervolg codepreflight — onafhankelijke families en contractcompatibiliteit
Symptoom1: validate_manifest accepteerde twee samples met gelijke originalHash/perceptualHash in hetzelfde holdoutsplit maar verschillende familyId. Rootreproducer met verify_files=False gaf REPRODUCED; structurefixture, geen beeldkwaliteitsclaim. Hypothese bevestigd: lekkontrole uitsluitend tussen splits mist pseudo-onafhankelijkheid binnen split. Eigenaar MLghs_dataset. Fixrichting: hashes/nearduplicates binnen iedere split slechts één familie; final/validation nooit de eigen officiële referentietemplates.
Symptoom2: SymbolDetection.method werd uitgebreid met ghs-reference terwijl externe consumer nog onbekend is. Evidence diff; compatibiliteitsrisico, consumerfailure niet gemeten. Fixrichting: intern eigenmethodnaam, legacyadapter bestaande classifier-enum met daadwerkelijke referentieversion, geen embedding/NNtrainingclaim.
Symptoom3: registerCropsTx weigert GHS met exception. Reviewacceptcaller moet aantoonbaar een GHS-reviewbesluit zonder trainingswrite kunnen vastleggen; exceptionpad mag geen reviewaccept500 geven. Calleronderzoek/test door writer gevraagd vóór eventuele fix.

### Vervolg echte ontwikkelproef — zichtbaar uitroepteken gemist
Symptoom: zichtbaar EXCLAMATION_MARK op originele achterkantetiket08721516201096, PDF0edd6466b34f, gerenderd150dpi1754x1396, levert detect_ghs=[]; vierpreviewrunsallemaalgeenbevinding. Root heeft volledige voorkant/achterkant visueel gelezen; eerste2anderebronPDFs zijn uitsluitend technische stanstekeningen, nietpositiefbewijs. Deze ontwikkelverkenning is geen sealedfinal/humanapprovedtruth.
Evidence: rootpredicate-exploratory-predictions.json in /tmp/logo-ghs-source-pilot-20261002. m.regions retourneert []; redmask RETR_EXTERNAL ziet slechts colorlegendbbox1293,228,61,34 en gehele rode buitenlabelcontour401,190,450,1129 (fill0.868). Daardoor gaat de interne rode GHSruit verloren. Hypothese bevestigd: externecontour-onlylocalisatie sluit geneste echteGHSruiten onderdruk/stansrodeomtrek uit. Eigenaar MLghs_reference.regions. Structurele fixrichting: interne/hiërarchischegeslotenruiten meenemen en duplicate inner/outerringboxes ontdubbelen, strikt GHSgericht, geen generieke drempelverlaging. Regressionfixture met echtGHS binnen groterrodeomtrek; behoud bestaande9smokes+negatieven.

### Vervolg tests geneste ruiten en near-duplicates
Symptoom: bredere run140pass/4fail na genestecontouruitbreiding. Twee officiëleklassen GAS_CYLINDER/EXCLAMATION geven inner/outerringdubbelbox omdatIoU<0.7 terwijlboxvollediggenest. Tweede failureklasse: resize-official-neardup pHash verschilt door transparanteRGB/antialias. Eigenaar ghs_reference.regions en ghs_datasetperceptualhash. Hypothesen bevestigd door writertrace. Fixrichting: containmentontdubbeling naastIoU, wit-alphanormalisatie vóórpHash; verwachtingenbehouden en relevantechecksherhalen.
Ontwikkelmeting score werkelijksoapback: juisteklassetop0.799, runnerup0.413; confidentvloer0.87blijft. GHSgerichte onzekere reviewvoorstelvloer0.65 wordt afzonderlijk/versionedvastgelegd; geen calibratedconfidence/fieldqualityclaim. Deze ontwikkelbron wordt nietfinaltest.

### Vervolg echte ontwikkelproef — onjuiste extra HEALTH_HAZARD
Root voerde detect_ghs op alle8volledige lokaalgerenderdepagina's uit na contourfix. Alle4zichtbareuitroeptekens werdengevonden (2onzeker~0.799,2~0.871), maar2onjuisteextraHEALTH_HAZARD-voorstellen verschenen: front01096bbox600,447,22,31score0.7396 en pouch01119bbox446,1343,20,21score0.6722. Rootbekeek beide uitgesnedenregio's naastvolledigepagina: grafische/drukvlakken en bloemen, geenrodeGHSruit/gezondheidspictogram. Evidence /tmp/logo-ghs-source-pilot-20261002/exploratory-predictions-after.json en false-proposal-{flower,pouch}.png. Ookonzekerevoorstellen zijnfoutvoorstellen, nietwegfilterenuitmeting.
Hypotheseconfirmed: nieuweinternecontourrouteaccepteertgekleurdeachtergrondgaten/flowerregionsdieglobalevierhoek/filltesthalen zonder echte rode ring metwittebinnenruit. Eigenaar ghs_reference.regions. Structurelefixrichting: echteGHSruitgeometrie/rodering+wittebinnenzijde verifiëren; geen simpelverhogen/verlagingvanalgemenedrempels. Voeggeneriekegekleurdeachtergrond/flowernegativeregressies toe; alle9officialsmoke+4developGHS bewaren. Dezeontwikkeldata magtuninguitsluitenddevelopmentsturen, geenfinalevidence.

### Hervatting na platformlimiet — geometrieguardregressie
Bewaarde laatste149Python/166APIchecks/APIbuild groen vóór centrale-witfractieguard. Centrale wittefractie0.55 wijst HEALTH_HAZARD metdichtezwartefiguur af; hierdoor officiëletemplate-smoke faalt. Eigenaar ghs_reference.regions, hypotheseconfirmedwritertrace. Fixrichting: witteannulus rond zwartebinnenfiguur, behoud echte roderuitgeometrie en genestededup; geen centrale wittefractieeis. Alle9officials en8developmentbeelden opnieuwmeten, eerderefalsepositives blijvennegatiefverwacht. Platformlimiet onderbrakworker/watchdog; bestaandeagents hervat en daadwerkelijkrunningbevestigd, geen codeverlies of liveactie.


## Reviewfollow-up 2026-10-04T00:02:19.171556+02:00

Symptomen/evidence: drie onafhankelijke reviewers vinden 21 afzonderlijke code- of testbevindingen, bevestigd door rootcodepadinspectie; exacte triage staat in bouwspecificatie. Confirmed: NO_PICTOGRAM-falsepositive; verborgen legacydetectoruitval; GHSdependency blokkeert legacy; verloren artworkversie; ontbrekende onafhankelijke annotatorcontrole/bbox/dimensions/croppHash/runtime-neardupe; incomplete frozen source hashes en filename-ledger bypass; onzekerheidsmatrix/onleesbare familyminimum; drie testgaps (catalog/cache, pilotgrenzen, augmenting matching). Geen open productintenthypothese; eigenaar ghs_implementation/API+ML. Structurele richting: kleine guards/provenancevelden, volledige perceptuele en geometriemetadata, manifestgebonden exposureledger, consistent abstentionaccounting en regressietests. Eerst deze evidence vastgelegd, daarna pas fixes. Geen live effect vóór gecontroleerde ACC-release.


## CI-follow-up 2026-10-04T00:23:04.106946+02:00

Symptoom: GitHubCI37157970435 APIunitjob failed; MLjobpassed. Evidence: tradeitem-declaration-snapshot.test.ts194 verwacht dezelfde veldmap alsMARK_FIELDS en mist gHSSymbolDescriptionCode in harvestscript;1failed/1211passed/2skipped/67todo. Zelfstandig lokaal gereproduceerd1failed/16passed,exit1. Hypothese bevestigd: zelfstandige GDSN_TO_FIELD_TYPE-map in apps/api/scripts/harvest-tradeitem-snapshot.ts59 mist nieuwe GHSveldregel; walkselecteert alleen bekendevelden, dus GHSwordt werkelijk overgeslagen. Refuted: alleen testverwachting verouderd; nieuweveld hoort bij intent en XMLparser. Geen openhypothese. EigenaarAPI/ghs_implementation. Fixrichting: voeg juiste categorie toe in zelfstandige oogstmap, behoud bestaande snapshotdata/veiligecoderegels, voeg echte geneste GHSextractietest toe en voer snapshot/adjoiningtests uit. Geen liveoogst/DBmutatie. Onderzoek vastgelegd vóórcodefix. bmad-investigateSKILL niet geïnstalleerd in aangetroffen skillroots; bestaande investigationcase gebruikt met symptoom/evidence/hypothesen/eigenaar/fixrichting, geen ad-hocproductfix.

CI-follow-upresolved: bestaandeoogstmap exactGHStag toegevoegd; nestedextractie/dedup/oldValue/exactname regression18pass; root63adjacentAPItests/build/diffgreen; readonlyindependentauditclosed. Geen liveoogst/snapshotdatamutatie.


## ACC-buildfollow-up 2026-10-04T00:38:59.865782+02:00

Symptoom: build-appjob111307955462 van buildrun37158891455failed opACCmergef5c4a5b74f35c6a692782aacea1754e1849fd408; automatischedeployrequiresbothimages en blijft uit. Evidence: ghjoblogs directAPI opgehaald; pnpm install onnxruntime-node postinstall IPv4ETIMEDOUT150.171.109.72:443 enIPv6ENETUNREACH,ELIFECYCLE1. Missingcacheblobmeldingen gaan vooraf maar build probeert freshdependencies; geen compilefailure. SSHreadonly bevestigt oudeapp+ML305733gezond, geen nieuwecontainer. Confirmed netwerkassetdownloadfout; open transientvsoptionalGPUvsretiredendpoint; refuted GHScompilefailure (noggeencompile bereikt). ComponentDockerNodebuild/dependencyinstall, eigenaarroot na readonlyexploreronderzoek. Eersteherstelrichting: begrensde herhaling vanfailedbuildjob zodra huidigeMLbuildrunterminal; geen codemutatie vóór package-sourceonderzoek als retryfaalt. Geen handmatigecontaineractie/DBmutatie/kwaliteitsclaim.

Readonlyexplorerconfirmed: lokaal+lockonnxruntime-node1.23.0postinstall defaultlinuxx64 downloadCUDA12/TensorRTproviders; CPUbinding/libs zijngebundeld. ExactefailedCIversie nietbewezen doorno-frozen-lockfile. Package-supported ONNXRUNTIME_NODE_INSTALL=skip heeftsuccessful earlyexit; APIimporteertNodeONNXOptimizer niet, PythonMLCPUonnxruntime1.16.3blijftongewijzigd. OptionalGPUdownloadvsrequiredCPUhypothese resolved opverifiedlockedpackage; netwerktransient/retiredendpointnietbewezen. Structureleminimale richting: scopedskipbijbeideDockerworkspaceinstalls, geen algemeneignore-scripts/no runtime providerwijziging. EigenaarbestaandeimplementatieworkerDockerfilealleen; rootreview/nieuwePR/CI/actualbuild+runtimeverificatie. KEEP: CPUbundledlibs, alleandereinstallhooks, PythonMLmodelroute, projectweightsen9GHSrefs.

Bouwfixauditclosed: uitsluitend2command-scopedDockerinstalls. Rootactualinstallerskipexit0/diff0; independentreview bevestigt officiallocalsource/CPUbundled/APIusesPython/noactualruntimefeatureloss. Geen algemeneignore-scripts ofGPUdetectiepatch. Werkelijkeimagebuild blijft releasegate, nietalsgroengeclaimd opnativehookalleen.
