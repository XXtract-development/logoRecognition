---
case: acc-ghs-training-readiness-20261004
status: confirmed
created: 2026-10-04T20:15:00.250429+00:00
owner_repo: logoRecognition
affected_repos: [logoRecognition]
environment: ACC
trigger: Zelfstandig trainen totdat gevaarlijke-stoffenpictogrammen goed herkenbaar zijn via de API.
severity: high
---
# Onderzoek herkenningsroute vóór training

> [!note] Gebruiker autoriseert 2026-10-04 zelfstandige uitvoering inclusief training en noodzakelijke implementatie. Geen destructieve databaseacties, chemische conformiteitsclaims of automatische bevestiging. Eerdere lokale planningsbeperkingen op training worden voor deze opdracht opgeheven; bewijscriteria blijven gelden.

## Symptoom en evidence
VERIFIED: 24 echte bronbeelden / 48 stateless AI beoordelingen opgeleverd; 34 overeenkomende productpictogramvakken, 11 ingrediëntvakken, één conflict (FinishCORROSION). Dit meet AI-beoordeling, niet de actieve logoherkenner. Bron: research/ghs-sources-20261004/annotations/summary.json.
VERIFIED: app/services/ghs_reference.py gebruikt negen officiële templates en rode-ruit-localisatie; THRESHOLD=.87, PROPOSAL_FLOOR=.65. Bron: gelezen code.
VERIFIED: app/api/detection.py /detect gebruikt LogoDetector(model_manager); explorer meldt deze route gebruikt geen GHS-reference. Nog zelfstandig via concrete route-/runtimebaseline verifiëren vóór oorzakelijke conclusie.

## Hypothesen
- H1 OPEN: Gewone herkenningsroute passeert GHS; killing test: volg publieke route → ML en stuur echte GHSbeelden door actieve route.
- H2 OPEN: Lokalisatie mist complete rode ruiten; killing test: vergelijk regio's tegen geannoteerde beelden.
- H3 OPEN: Templateclassificatie mist druk-/schaalvariatie; killing test: vergelijk crops na correcte regio.
- H4 OPEN: Beschikbare echte onafhankelijke bronnen onvoldoende voor perklassedoel; killing test: licentie-/familie-/klassendekking groter corpus.

## Schrijfacties
Alleen dit lokale onderzoeksbestand. Geen live training, import, modelactivatie, configuratie of serviceactie.

## Bevestigde diagnose / uitvoeringsovergang
VERIFIED H1: publieke recognition.ts:171 → ml-client.ts:244 /ml/detect → LogoDetector; aparte GHS-route ontbreekt in die codeketen. Explorer structurele stub en de concrete codeketen onafhankelijk gelezen. Baseline stub is geen echteAPIkwaliteit.
VERIFIED H2: 34 AI-productkandidaten →25 klasse+IoUmatches,8 classificatiemissers,1 regiomisser. Doodskop4/4 en explosief2/2 gevondenruiten maar scores .268–.568 onderfloor. ENV2scores kiezen FLAME; floorverlaging afgewezen. Bron baseline/baseline.json en classification-failure-scores.json.
VERIFIED H3: wholepageHoneywell HEALTH_HAZARD mistregio, afgebakend werkelijkbeeldcrop vindt juisteklasse score.863. Contouroorzaak nogonderzocht door implementatieagent.
VERIFIED: verse ACC dockerinspect exactrelease3ef6db149a20dc7cfb080090371032b14438f96c healthy4CPU8GiB4MLworkers/geenmodelmounts. Geenconfig/DB/containeractie.
INFERENCE: dedicated offlineCPU-classifier + gerichteregioselectie en hoofdAPIintegratie is passend; algemene livecroptraining niettoepassen omdat zij batch/families negeert en verkeerde detectietaak traint.

BMadbouw gestart onder zelfstandige gebruikersopdracht. Spec/trainingtool/immutableartifact/inference/tests eigenaar ghs_training_route; root brononderzoek, criteria/release. Geen geneutraliseerde thresholds of claim ausreichend uit developmentset.

## Follow-up: PR #5 CI import formatting
VERIFIED: GitHub run 37233960439, ML job 111529278150 exits during isort --check-only app/, before pytest. Sole reported violation: app/ml/detector.py standard-library import ordering. Local file places typing before math. Hypothesis confirmed: omitted isort check locally; this is formatting, not recognition/model failure. Owner logoRecognition ML service. Fix direction: reorder math before typing, run all three configured formatting checks, preserve frozen model and algorithm. Node job passed. No ACC merge or deployment has happened. Evidence: /tmp/ghs-ci-ml.log lines 826–829.
