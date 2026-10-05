---
title: 'Bestaande productieaanroep behouden'
type: feature
created: '2026-10-05'
status: in-review
route: dispatch
review_loop_iteration: 0
baseline_commit: 0b95a64268243069391528a2a3262efe77c4da35
context: []
---
<frozen-after-approval>
## Intent
Bestaande afnemers blijven POST /detect gebruiken bij overgang naar de getrainde herkenningsservice. De gebruiker heeft volledige productieafronding en zelfstandige keuzes toegestaan. Deze deelimplementatie maakt het bestaande verzoek en antwoord compatibel; live overgang hoort bij de coördinator.

## Boundaries & Constraints
Gebruik de bestaande X-API-Key als afzonderlijke LEGACY_DETECTION_API_KEY, nooit als JWT of dashboardrechten. Ontbrekende configuratie weigert toegang. Download uitsluitend publieke HTTPS-adressen: geen lokale/interne/reserved adressen, URL-inloggegevens, afwijkende poorten of redirects. Bind transport aan het gecontroleerde DNS-adres. Beperk duur, omvang en gedecodeerde pixels. Geen nieuw trainingsbewijs claimen. Gebruik echte mlClient en houd scores ongewijzigd; geef nieuwe scorebetekenis als aanvullende metadata. Laat reviewvoorstellen weg. Dedup hoogste score per code, behoud genormaliseerde xyxy-boxen en echo product_id. Geen live wijzigingen en geen wijzigingen aan bestanden van andere agents. Alleen eigen route/service/test, main route registration, envregel en documentatie.

## I/O & Edge-Case Matrix
| Scenario | Input | Verwachting |
|---|---|---|
| Goed verzoek | geldige sleutel, publiek PNG | echo product_id; echte ML; box pixels naar genormaliseerd xyxy |
| Authenticatie | ontbrekend/fout/onconfigured | 401/503, geen download |
| Netwerkveiligheid | private/lokaal/mixed DNS, HTTP, redirect | weigeren zonder intern verzoek |
| Omvang | te grote stroom/afbeelding | gecontroleerde 400 |
| Onzeker | uncertain/requires_review/review_proposals | geen positieve detection |
| Deduplicatie | twee geaccepteerde dezelfde code | hoogste originele score |
| Modelstoring | ML exception | gecontroleerde 502/503, geen lege succesrespons |
| Ongeldig modelresultaat | malformed confidence/box/unknowncode | niet als positief rapporteren |
</frozen-after-approval>

## Code Map
- apps/api/src/main.ts registreert Fastifyplugins: /detect eigen plugin zonder herkennings-JWT-hook.
- apps/api/src/services/ml-client.ts detectLogosFromBuffer maakt echte /ml/detect-aanroep.
- apps/ml-service/app/ml/detector.py gebruikt pixel-xywh en onzekerheidsvelden.
- logo/src/models/detection.py definieert oude response en genormaliseerde xyxy.
- apps/api/src/services/reference-code-mapping.json bevat codes en aliasnormalisatie.

## Tasks & Acceptance
- [x] veilige fetchservice en beperkte afbeeldingsnormalisatie
- [x] compatibele route plus hoofdregistratie
- [x] tests voor elke matrixrij
- [x] envcontract en documentatie
Given bestaande consument, when nieuwe route wordt aangeroepen, then geaccepteerde codes kunnen met bestaande veldnamen worden verwerkt, zonder twijfeluitkomsten tot positieve data te maken.

## Implementation Notes
Gedelegeerde implementatie door dezelfde implementatieagent wegens beschikbare agentcapaciteit; onafhankelijke review door coördinator. Geen extra goedkeuringsvraag: bestaande menselijke toestemming dekt dit werk.

## Spec Change Log

## Review Triage Log

## Verification
- Gerichte API-tests en TypeScriptcontrole; daadwerkelijke netwerk/modelproef hoort bij vrijgavebewijs coördinator.

49 gerichte tests geslaagd (40 route/output/URL + 9 netwerkgrenzen); TypeScriptcontrole geslaagd.

## Root review triage

| Finding | Verdict | Evidence and route |
|---|---|---|
| B1 | high | Newmandatorycomposevariable absent from REQUIRED/fixture; exactsubstitution indexesenv. Patchvalidator+fixtures+shellcoverage. |
| B2 | high | Pinnedoldimages predateroute. Rootpatch releasefreeze to newly built/reviewedpair beforedeployment; no oldimage compatibilityclaim. |
| B3 | high | _match_logos may attachlowerclassmatch to highobjectconfidence; adapterexposesscoreascodeconfidence. Patchcarry+gateactualmatching evidence in MLresponse/APIclient andtestrealpath. |
| B4 | high | Anyvalueaccepted for defaultcategory. Patchcanonicalclassificationuniverse andpositive/negativecode tests. |
| B5 | high | No in-flight ornormalizedbufferlimit on2GiBapp. Patchsmallboundedconcurrencyandnormalizedlimit, saturationtests. |
| V1 | medium | PreverifiedorientedJPEGgap. PatchrealEXIFfixture/normalizedMLbuffer/bbox assertion. |
| V2 | medium | Preverifiedpositiveaccreditationgap. Patchcanonicalpositivefixture endtoendroute. |
| Edge | false | No findingsreported; no triagerowcandidate. |

## Reviewfixes uitvoering
- LEGACY_DETECTION_API_KEY in vereiste/geheime inputs, exacte composebinding en shellconflictvalidatie; tests bevestigen ontbrekende/lege input, verkeerde binding en override.
- Werkelijke match_confidence blijft door daadwerkelijke ML-response bewaard. Referentiedetecties vereisen classificatiescore ≥0,99; boxconfidence alleen telt niet. Actieve code/categorieparen uit de database bepalen toegestane referenties.
- Hoogstens twee in-flight per proces; pixelcap 8M en genormaliseerde bytecap 20MiB, finally geeft capaciteit vrij. EXIF-test controleert de echte ML-bufferkleuren/dimensies en corresponderende bbox.
- De exact door coördinator gecontroleerde bestaande productie-media-URL https://media.stage.xxtract.com is alleen voor MEDIASERVER_DOMAIN toegestaan; overige stage/ACC-doelen blijven geweigerd.
- 57 gerichte API/netwerktests, 2 daadwerkelijke matcher/response-tests en 30 productieconfiguratietests geslaagd; TypeScript geslaagd. Geen commit/push/deploy.

Productiebroncorrectie: coördinator bevestigde dat https://catalog.stage.xxtract.com de bestaande productiecatalogus gebruikt (46.224.119.158/xxtractCatalogService), terwijl catalog.xxtract.com niet bereikbaar is. Alleen deze exacte CATALOG_API_BASE is toegestaan als afzonderlijke uitzondering; geen algemene stagevrijstelling. Gerichte variant/veld/poort/padtests toegevoegd.
