# Onderzoek opvolgfailures CI-herstel — 2026-10-02
## Bevestigde uitgangssymptomen
MinIO dockerrepository niet beschikbaar, waardoor E2E vóór applicatiestart stopt; ML modelmanager schrijft /app en pytestexitcode wordt door shell echo gemaskeerd. Eigenaarschap .github/workflows/ci-cd.yml en tijdelijke CIhelpers, geen productfix.
## Lokale suite met correcte servicewerkmap
VERIFIED: /tmp/logo-ci-repair-baseline.log: 314passed8failed15skipped, tijdelijke modelpaden en localhostdummyURLs. Vier imagehash failures en twee torch failures zijn ModuleNotFoundError; requirements.txt bevat deze dependency al. Twee NutriScoreA failures draaien met cv2 5.0.0 en numpy2.5.3, terwijl requirements pinnen4.9.0.80 en1.26.3.
OPEN: NutriScore failures veroorzaakt door nietrepresentatieve lokale dependencyversies vs echte productassertie. Test met Python3.11 plus bestaande dependencyversiepinnen vóór enige test/productcodeaanpassing.
CONFIRMED: twaalf eerder root-cwd failures verdwijnen met bestaande CIwerkmap apps/ml-service; geen codewijziging nodig.15skips zijn bestaande scaffoldtests, geen nieuwe skip toegevoegd.
Fixrichting: reproduceer in tijdelijke Python3.11 omgeving met bestaande pins; laat productdependencies/productmodel ongemoeid. Commit alleen CIreparatie, residual genuine failures blokkeren release.
## Uitvoeringsfallback
Spawn fresh ci_spec_red: agent thread limit reached. Parent bevestigt geen close/reset lifecycle; generated bmad-build step03 noemt directe implementatie als subagents unavailable. Parent vraagt bestaande onafhankelijke GHSagent na afronding om review vóór/na code. Geen zichtbare taak aangemaakt om limiet te omzeilen.

## Hypothese gesloten vóór implementatie
VERIFIED: /tmp/logo-ci-repair-pinned.log: Python3.11 bestaande exactrequirements325passed14skipped exit0. Twee NutriScoreAasserties slagen met vastgepinde cv24.9.0.80/numpy1.26.3; ontbrekendeimagehash/torch opgelost door bestaande requirements te installeren. Geen code/testproductfix nodig. De eerdere afwijkende lokale omgeving was niet representatief.
VERIFIED: official MinIO fullcommit goinstall exit0 met checksumdatabase, /tmp/logo-ci-source-build.log. mcsourcebuild wordt apart geverifieerd.

## Follow-up tijdens GREEN-run vóór fix
VERIFIED: achtcontractchecks7pass1fail. Pytestexit13mock stopt bij nieuw mkdir omdat testfixture MODEL_PATH/TORCH_HOME niet zet; echte workflow zet beide runner.temp. Bevestigd exit1stderr mkdir emptyargument. Eigenaar testfixture, productworkflow correct. Fixrichting fixture krijgt dezelfde tijdelijke envpaths; retainexit13assertie, geen versoepeling.

## ACCrelease prerequisite extension before composeedit
VERIFIED parentreadonly: Coolifystopsrunningcontainers beforecomposeup, removedlatestimage may be pulled even from cache. Verifiedexactcurrentcachedimage digest14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e image69b2. OfficialDockerpull_policynever usescacheonly/errorifmissing. Root owns remotes; repairagent assigned onlycomposeimage+policy. Structuralfixdirection pinexistingcachedidentity+never, no source/volume/env/storageupgrade. GeneratedCoolifycompose preservation remains parentpremergegate; coldhost requiresexplicitprovision.

## Deadprocess/healthyendpoint regression vóór fix
VERIFIED: /tmp/logo-ci-release-green.log deadMinIOexit9+mockhealthyendpoint gaf helperexit0, terwijl overigechecks pass. Hypothese: nohup wrapper is tijdelijk levend vóór executableexit en pidguard ziet wrapper; kort delay is geen readinessbewijs. Sourceguard gebruikt nohupPid, geen directe start. Fixrichting nativebinary direct background in noninteractiveCIstep (zoals bestaande APIstartup), vermijden wrapper identity; behoud failclosed health+pidchecks en diagnose, testverwachting blijftnonzero.

Secondmethod bash-xtrace confirms deadchildguard exits1 after child exits; instantaneousfakehealthprobe races scheduling. Sole-nohupcause hypothesis refuted (directlaunch samecounterfactual). Deterministicfakehealthyprobe must await deadchildexit; keepnonzeroassertion. No realnative storagefailure: 3bucketsreadback+ownPIDcleanup succeeded.

## Independent reviewfailure vóór patch
VERIFIED reviewerhelperlines26-35: GITHUB_ENVappend vindt plaats vóór EXITfailuretrapinstallatie; onschrijfbaarexistingdirectory/file/fullrunnerstate kan proceslek veroorzaken, workflow krijgtgeenPID. Eigenaar CIhelper/tests. Fixrichting trapdirectna pidcapture installeren, vóór enige environmentwrite; regression injecteer directoryalsGITHUB_ENV en observeeralleeneigenmockPID, maak testcleanupfinally gegarandeerd.

Trapregression RED verified11run1fail: failingGITHUB_ENVdirectory returnednonzero but trackedownPIDsurvived. Fix trap immediatelyafter PIDcapture before environmentappend. Fixtureusesbashtraceonly toidentify itsownPID deterministically and killsownPIDfinally; no otherprocessesaffected.
