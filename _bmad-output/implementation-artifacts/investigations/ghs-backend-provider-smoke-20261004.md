# Onderzoek lokale backendcontrole

- Symptoom: de eerste lokale controle stopte tijdens configuratieladen; geen AI-aanroep uitgevoerd.
- Evidence: Pydantic meldt ongeldige JSON voor CORS_ORIGINS uit de bestaande root-.env. De controle importeerde de ML-configuratie vanuit de repository-root.
- Bevestigd: verkeerde werkmap van het tijdelijke controleprogramma. Geen fout in de nieuwe reviewroute aangetoond.
- Eigenaar: tijdelijk verificatieprogramma van de coördinator.
- Fixrichting: uitvoeren vanuit /tmp zodat de bestaande root-.env niet geladen wordt; uitsluitend expliciete tijdelijke reviewvariabelen gebruiken. Geen product- of liveconfigwijziging.

## Vervolg: indirect trainingsimport

- Symptoom: vanuit /tmp stopt de echte route-import vóór de AI-aanroep op mkdir('/app/models').
- Evidence: traceback app.api.ghs_review → app.services.ghs_review → app.services.__init__ → trainer.TrainerService → _models_dir.mkdir; lokaal /app read-only.
- Bevestigd: eager package-initialisatie importeert indirect training en maakt een modelmap aan. Geen providerfout; nog geen visuele AI-call.
- Eigenaar: ML-route/importgrens, implementatieworker geïnformeerd.
- Fixrichting: de pure reviewservice buiten het eager services-package plaatsen of aantoonbaar side-effectvrij importpad realiseren; route-import zonder package-stub verifiëren. Bestaand trainingsgedrag behouden.

## Vervolg: verkeerde visuele coördinaten

- Symptoom: alle tien echte Gemini-routecalls HTTP200; Flash/Pro vinden dezelfde vier GHS07-pagina's, maar alle acht positieve bounding boxes missen het pictogram vergeleken met twee afzonderlijke originelebeeldreviews.
- Evidence: page04 origineel1754x1396 heeft reviewvak rond409,966,135,135; Gemini Flash236,694,63,63 en Pro235,715,141,141. page05 origineel3073x3379 rond1761,1809,140,140; Flash1763,2042,120,120 en Pro567,638,147,147. Alle oorspronkelijke bytes/hashes blijven gelijk. Volledige respons zonder beelden/secrets in release/ghs-backend-review-20261004-local-provider-evidence.json.
- Bevestigd: syntactisch geldige pixelvakken bewijzen geen juiste plaatsbepaling. Refuted: transport of beeldhash wijkt af. Open: providerconventie genormaliseerde coördinaten wordt verkeerd geïnstrueerd.
- Eigenaar: ML-providerinstructie/coördinatencontract; nog geen livewrite/vrijgave.
- Fixrichting: officiële providerbeeldcoördinaten onderzoeken; expliciete providercoördinaatconventie met controleerbare omzetting naar oorspronkelijke pixels en behoud van ruwe uitkomst. Eerst echte positieve beelden opnieuw controleren; geen labelkwaliteitclaim op basis van HTTP200.

## Vervolg: drie onafhankelijke codereviews

Alle drie afgerond vóór triage. Concrete fouten: gateway rate-limit429 wordt400; AJV coerces singletonarrays; nullprovider-envelope verliest succesvolle sibling via AttributeError; diepeJSON RecursionError niet afgevangen; ongeldigeIPv6 URL geeft500; numeriekgelijke1/1.0 vallen uiteen in exactvergelijking; EXIForientation mist eenduidig frame; decode-thread loopt na deadline door terwijl capacityslot vrijgegeven wordt. Testgaten: echte transportreturn, equal-count verschillen/reordering, ASGI success/partial. Eigenaars: nieuwe gateway/MLroute/service/tests. Structurele fixrichting en13 afzonderlijke verdicts in spec Review Triage Log. Sameworker behoudt werkende contracten en herstelt alle bevindingen; geen liveconfigwrite of deployment uitgevoerd.

## Vervolg: plaatsbepaling na coördinaatcorrectie nog wisselend

Tien echte nieuwe routecalls: negentien geldige beoordelingen en één expliciete partial wegens ongeldig Flashantwoord. Beide modellen classificeren dezelfde positieve pagina's; pageType/readability correct onderscheiden. Slechts twee van zeven geldige positieve vakken overlappen eerdere AI-vakken (0.803 en0.506); vijf missen de locatie. Dus de eerste korte normalizedprobe was onvoldoende bewijs voor betrouwbare plaatsbepaling. Raw/projection correct uitgevoerd en hashes gelijk; openhypothesen: oorspronkelijke pixeldimensies in normalizedprompt veroorzaken schaalverwarring, modelgeneratiekwaliteit/spatialcapability verschilt. Volledig bewijs in release/ghs-backend-review-20261004-local-provider-normalized-evidence.json. Volgende stap: lokale begrensde model/promptvergelijking met actuele modellen uit echte modellenlijst, zonder providerdefaults/livewrites en zonder detectorinput. Geen gelijkwaardigekwaliteitclaim.

## Vervolg: EXIF-lezen vóór PNG-integriteitscontrole

- Symptoom: gerichte tests wijzen gewone PNG's af na toevoeging van EXIF-oriëntatiecontrole; API 27 tests blijven groen.
- Evidence: afzonderlijke Pillow-probe geeft orientation=1, daarna RuntimeError 'verify must be called directly after open'; opnieuw openen en direct verify slaagt. 17 tests stoppen op INVALID_IMAGE vóór provider.
- Bevestigd: PNG getexif wijzigt de decoderstate zodat verify op diezelfde instantie niet meer geldig is. Geen ongeldige originele beeldbytes. Eigenaar ML-beeldvalidatie.
- Fixrichting: verify bij eerste open behouden; EXIF controleren op de tweede, afzonderlijke decoderinstantie vóór load. Beide gebruiken exact dezelfde oorspronkelijke bytes, geen hercodering. Gerichte regressietests omvatten gewone PNG en EXIF-PNG/JPEG.

## Vervolg heraudit2
Alle eerderedefectengesloten. Vier concrete nieuweoorzaken:tinypositivearea-underflow union0 geeft500, onzekerheidcoincidentduplicatevakken mismatchedondanksidentiekantwoord, malformedURLport geeftHTTPXInvalidURL500, overlap0.5/locatieonzekerheidboundarytests ontbreken. Eigenaar MLconfig/comparison/tests; gecontroleerdekleinecorrecties enregressietests vóórrelease. Zevenafzonderlijketriages specloop2.

## Vervolg: exact halve overlap na numerieke schaling

- Symptoom: nieuwe IoU-grenstest mist exact0.5 doordat ratio-schaling naar maximale zijde 0.49999999999999994 oplevert. Losse shift20-test had bovendien een onjuiste verwachting2/3 in plaats van7/11.
- Evidence: onafhankelijke rekenprobe intersection60/90, union2-intersection geeft0.49999999999999994; directe integer-geometrie6000/(18000-6000) geeft0.5. Shift20 op90hoge vakken geeft7000/11000=7/11. 62 gerichte tests groen, twee grensgevallen falen.
- Bevestigd: afronding door niet-binaire schalingsfactor en één testfixture-rekenfout. Eigenaar ML-IoU en gerichte tests.
- Fixrichting: elke as via een macht-van-twee schalen (frexp/ldexp), behoud exacte binaire representatie bij schaling en voorkom kleine-gebiedunderflow. Testverwachting voor shift20 corrigeren naar bewezen geometrie, inclusieve0.5-gate behouden zonder tolerantieverruiming.
