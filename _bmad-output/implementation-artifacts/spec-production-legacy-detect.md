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

## Getraind herkenningstraject: geautoriseerde correctie
Root heeft vóór wijziging vastgelegd dat /ml/detect zonder ONNX slechts mocklokalisatie gaf en referentie/A2-positieven niet kon bereiken. De adapter gebruikt nu bestaande artwork-localize/classify op dezelfde inline-afbeelding, zonder opslag. Classificatie ontvangt uitsluitend voltooide, geldige gelokaliseerde boxen (max64), expliciete grens0,99 en persist_crops:false. Beide ML-aanroepen delen 165s totaal vanaf start (geverifieerde n8n-timeout180s). Echte classificatiescores/methode worden behouden; GHS altijd review, ook bij ontbrekend upstreamflag. Nieuwe routefixtures bewijzen referentie/A2-positief, negatief, GHS-review en géén generieke detectoraanroep. De frontend-WebSocket valt buiten deze migratiecorrectie.


## Strikte uitvoering: geautoriseerde reviewcorrecties
Vóór wijziging heeft de coördinator de bevestigde fouten aan de investigation toegevoegd: stille UNKNOWN bij backendfouten, overslaan van onleesbare referenties, onvolledige classificatie-antwoorden, lege catalogus, onbeperkte databasewachttijd en doorlopende zware modelbewerkingen na HTTP-timeout.

De adapter weigert lege actieve catalogi vóór upstreamaanroepen. Iedere gevraagde crop krijgt exact één geldig classificatieantwoord; onbekend met nulscore blijft negatief, ontbrekende/dubbele/extra boxen en ongeldige methode/score geven operationele fout. Databasecataloguslezing heeft een transactie met maxWait/timeout en transactioneel statement_timeout.

Opt-in strict_runtime en remaining_budget_ms behouden bestaande modelcallers, maar maken opslag/model/referentiefouten voor de adapter zichtbaar. Gereedheidscontrole omvat het wachten op de databaseverbinding. Zware opslag-, beeld- en modelbewerkingen draaien in threads binnen hetzelfde proces; capaciteit blijft bezet totdat werk werkelijk eindigt, ook na annulering of verstreken HTTP-deadline. Geen gedupliceerde Torch-processen. Strikte opslag heeft begrensde connectie/read, bloklezing, totale budgetchecks en bytecap.

Gerichte API-/netwerktests: 73 geslaagd; TypeScriptcontrole geslaagd. Werkelijke lokale PostgreSQL-proef: server annuleert pg_sleep bij 50ms met SQLSTATE 57014, sessie herstelt en vervolgquery werkt; één test geslaagd, alleen eigen localhostfixture gebruikt en verwijderd. ML-endpoint- en classifierverificatie wordt na de laatste gedeelde helpercorrecties opnieuw vastgelegd door de coördinator. Geen livewijzigingen, commit of push door implementatieagent.

Aanvullende bronproef bevestigde afgebroken volledige-etiketlokalisatie bij de standaardlimiet van 30s. Strikte lokalisatie gebruikt nu het actuele resterende budget met maximaal 20s (of 20% bij korte budgetten) voor classificatie; standaardcallers behouden hun bestaande limiet. Afgebroken uitkomsten blijven fouten en worden niet als volledig beschouwd. De coördinator moet volledige etiketten opnieuw live meten vóór omschakeling.

Werkelijke endpointtests met blocking threads bewijzen dat HTTP-deadlines en busy-antwoorden blijven reageren terwijl modelcapaciteit vastgehouden wordt. Gereedheidscontrole omvat geblokkeerde poolacquisitie. Gecombineerde 15 endpointtests + 42 bestaande classifier/NutriScore-tests: 57 geslaagd vóór de aanvullende budgetregressie; gerichte formatter- en lintchecks geslaagd. Definitieve aantallen na aanvullende budgetregressie volgen bij overdracht.

Definitieve gerichte endpointcontrole inclusief budgetregressie: 16 geslaagd. 42 bestaande classifier/NutriScore-tests geslaagd in de gecombineerde voorafgaande run. API/netwerk: 73 geslaagd; echte PostgreSQL-annulering: één geslaagd. Black/isort/ruff voor artwork.py en de endpointtests geslaagd; git diff --check schoon.


## Visuele gebieden en getrainde classificatie: geautoriseerde correctie
Root legde vóór wijziging vast dat zoeken met alle templates over de volledige pagina op echte productie-etiketten onvoldoende begrensd was. Lokale proeven met alle 542 referenties en met 142 vertegenwoordigers bevestigen tijdsproblemen, ruis en gemiste echte markeringen; deze prototypes worden niet uitgerold. De reeds geconfigureerde provider stelt nu alleen geometrie voor: inline JPEG maximaal 2400 pixels, 64 gebieden, 256 KiB antwoord, 8192 tokens en de resterende totale deadline. Alleen een volledig geldig antwoord kan negatief zijn. Providerlabels en scores worden niet gevraagd of als classificatie getoond.

Alle oorspronkelijke gebieden blijven behouden. Pure verfijning zoekt de volledige referentiebibliotheek uitsluitend binnen beperkte gebieden. GHS-modelgebieden blijven onafhankelijk toegevoegd. Exacte boxdeduplicatie; combinaties boven 64 geven een fout. Model-, GHS- en indexgereedheid blijven vereist. Bestaande standaardafnemers behouden templatezoektocht; visual vereist strict. De oorspronkelijke PNG en uitsneden blijven op volle resolutie voor classificatie. De pixelgrens wordt 80 miljoen voor echte druketiketten tot 75 miljoen pixels; 20 MiB bytegrens en maximaal twee gelijktijdige aanvragen blijven behouden. Echte aanvullende classificatieonderbouwing blijft zichtbaar zonder scores om te rekenen. Een juist Green Dot met score 0,98555 blijft review.

Gerichte verificatie na providerintegratie: 37 modeltransport-/endpointtests en 75 API-/netwerktests geslaagd; TypeScript geslaagd. Providertransporttests voeren echte begrensde httpx-streaming uit met gecontroleerde transportantwoorden: omvang, deadline, afgebroken antwoord, geometrie, negatieven en verboden classificatievelden. Endpointtests controleren gereedheid, providerstoring, geldig leeg succes, combinatie van oorspronkelijke/verfijnde/GHS-gebieden en weigering van te grote combinaties. Root moet bij review en vrijgave dezelfde getrainde route met echte productievoorbeelden controleren.

Ruim gekozen providergebieden kunnen meerdere echte, naast elkaar gedrukte logo’s omvatten. De geautoriseerde verfijning bewaart daarom maximaal drie afzonderlijke posities per oorspronkelijk gebied, naast alle oorspronkelijke en GHS-gebieden. Integratietest bevestigt dat twee verfijnde posities beide behouden blijven; de gezamenlijke grens blijft 64 en geeft bij overschrijding een fout.

## Specialistklassen buiten de embeddingcatalogus
Vastgelegde evidence: 542 overgezette actieve referenties / 61 codes bevatten geen canonieke GHS-klassen. De catalogusgestuurde upstreamfilter en outputcategorieën onderdrukten daardoor het aparte specialistmodel. De API voegt de negen positieve GHS-klassen uit de bestaande canonieke veldmapping zelfstandig toe aan lokaliseercontext en toegestane reviewcategorieën. NO_PICTOGRAM en oude nummeraliassen worden niet toegevoegd. Bestaande lege-catalogus- en model/indexcontroles blijven behouden; geen databaserijen worden aangemaakt. Gerichte regressie gebruikt uitsluitend gewone referenties en bewijst voor alle negen typen upstreaminclusie en review met product-id, oorspronkelijke score en box, ook zonder upstreamreviewflag.

Verificatie specialistkoppeling: 84 API-/netwerktests geslaagd, inclusief alle negen GHS-codes met uitsluitend gewone catalogusrijen. TypeScriptcontrole en git diff --check geslaagd. Geen ML-wijziging, databaserij, commit of liveactie.
