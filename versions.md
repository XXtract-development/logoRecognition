# Versiegeschiedenis

## 2026-06-14 (review-queue: tekst en tabellen weggefilterd)

### Geen voedingstabellen en tekst meer als keurmerk voorgesteld
- De herkenning sneed voorheen overal stukjes uit het artwork en stelde die als keurmerk voor — ook voedingstabellen, losse tekst en halve afbeeldingen, waardoor de review-lijst onbruikbaar was
- Een nieuwe filter beoordeelt eerst of een gevonden stukje überhaupt op een logo/merk lijkt; tekst, tabellen en fragmenten worden nu automatisch weggehouden
- De bestaande review-lijst is hierop opgeschoond (honderden niet-logo-voorstellen verborgen, niet verwijderd)
- Let op: de filter houdt nog wél alle logo-achtige stukjes (ook merklogo's) over; het fijnere onderscheid "is dit een keurmerk of een merklogo" is een vervolgstap

## 2026-06-12 (herkenning leert nu automatisch mee met de review)

### Elk bevestigd logo verbetert direct de herkenning
- Wanneer je in de review een logo accepteert (of corrigeert naar het juiste keurmerk), wordt die uitsnede nu automatisch toegevoegd als herkenningsvoorbeeld
- Daardoor herkent het systeem datzelfde keurmerk op andere verpakkingen meteen beter — de herkenning groeit dus mee met elke beoordeling, zonder dat er iets handmatigs voor nodig is
- Bij het terugzetten van een beslissing (heropenen/relabelen) wordt het bijbehorende voorbeeld weer netjes verwijderd, zodat een verkeerde correctie geen ruis achterlaat
- Ingebouwde bescherming tegen bijna-identieke voorbeelden voorkomt dat één keurmerk de herkenning gaat domineren

## 2026-06-12 (herkenning: bevestigde voorbeelden als referentie)

### Logo's worden nu herkend op echte verpakkingsvoorbeelden
- De herkenning vergeleek een gevonden logo alleen met het officiële GS1-voorbeeldplaatje — dat lijkt vaak te weinig op hoe een keurmerk er op een échte verpakking uitziet, waardoor veel voorstellen niet klopten
- Bevestigde voorbeelden uit de review worden nu óók als referentie gebruikt. Daardoor worden keurmerken die voorheen vrijwel nooit goed herkend werden (zoals het algemene recycling-logo, Nutri-Score B en de zwangerschaps-waarschuwing) nu wél correct herkend
- Gemeten op voorbeelden van verpakkingen die het systeem niet als referentie kende: de herkenning ging van gemiddeld 58% naar 83% correct
- De betrouwbaarheidsdrempel is licht verhoogd zodat de winst niet ten koste gaat van foutieve voorstellen
- Hoe meer voorbeelden er in de review worden bevestigd, hoe beter de herkenning verder wordt

## 2026-06-12 (review-queue: ruis weggefilterd)

### Onbetrouwbare voorstellen niet meer in de review-lijst
- De review-lijst stond vol met detecties waar het systeem zelf nauwelijks zeker van was — het overgrote deel klopte niet
- Voorstellen met een te lage betrouwbaarheid worden nu automatisch buiten de review-lijst gehouden, zodat alleen de kandidaten die een handmatige beoordeling waard zijn overblijven
- De bestaande lijst is eenmalig opgeschoond: ruim 4.500 onbetrouwbare voorstellen zijn verborgen (niet verwijderd — ze blijven bewaard)
- Dit is een tussenoplossing; de structurele verbetering van de herkenning loopt apart

## 2026-06-12 (review: contextweergave centreert logo beter)

### Witruimte rechts in contextweergave opgelost
- De contextweergave toonde soms veel lege verpakkingsachtergrond aan één kant (rechts) wanneer het logo dicht bij de linkerrand van het artwork stond
- Het venster rondom het logo wordt nu symmetrisch bijgeknipt: het logo staat altijd in het midden, ook bij randen

## 2026-06-11 (review: "bekijk in context" voor onleesbare uitsnedes)

### Afgesneden uitsnedes nu te begrijpen
- In het reviewscherm kun je met de knop "🔍 Bekijk in context" de uitsnede op het volledige artwork bekijken, met de gevonden locatie rood gemarkeerd
- Zo zie je ook bij een krap of half afgesneden logo (bijvoorbeeld een gedeeltelijke Nutri-Score-balk) meteen wélk keurmerk het werkelijk is
- Met "Toon uitsnede" schakel je terug naar de close-up
- De contextweergave laadt vrijwel direct: de server stuurt een klein ingezoomd fragment rond de locatie (met de markering er al op getekend) in plaats van het hele artwork

### Nieuwe uitsnedes krijgen wat marge mee
- Bij nieuwe detecties wordt de bewaarde uitsnede met een marge eromheen opgeslagen, zodat een krap gevonden logo niet meer half wordt afgesneden (bestaande uitsnedes blijven ongewijzigd)
- De detectie zelf verandert niet — alleen de bewaarde afbeelding krijgt context


## 2026-06-10 (review toont nu wat er op de verpakking is gedeclareerd)

### Slimmer labelvoorstel op basis van de GS1-declaratie
- Bij elk review-item haalt het systeem op welke keurmerken/claims er volgens GS1 daadwerkelijk op de verpakking van die GTIN staan
- Staat het voorgestelde keurmerk **niet** in de declaratie, dan toont de kaart een waarschuwing ("⚠ niet gedeclareerd op deze GTIN") — zo herken je valse detecties (zoals een verkeerd Beter Leven-voorstel) meteen
- Klopt het wél, dan zie je "✓ gedeclareerd op verpakking"
- In "ander keurmerk koppelen" staan de gedeclareerde codes bovenaan met een "gedeclareerd"-label, zodat het juiste keurmerk sneller te kiezen is
- Werkt alleen als er declaratie-data beschikbaar is; anders verandert er niets aan het scherm


## 2026-06-10 (lactosevrij en alle dieet-/free-from-codes koppelbaar in review)

### Volledige keuzelijst bij "ander keurmerk koppelen"
- In het reviewscherm kun je een uitsnede nu ook koppelen aan lactosevrij, glutenvrij, vegan, vegetarisch, halal, koosjer en alle andere dieet-/free-from-claims — die ontbraken eerder omdat er voor lactosevrij geen apart keurmerk-logo bestaat
- Ook GHS-gevaarpictogrammen en consumenten-waarschuwingspictogrammen (o.a. NIX18) zijn nu koppelbaar
- Elke optie toont een label met het type (Keurmerk, Dieet / free-from, Nutri-Score, GHS-pictogram of Consumentenpictogram), zodat je in één oogopslag ziet bij welk GS1-veld een code hoort
- De lijst is 1-op-1 gevuld vanuit de officiële GS1-Benelux-codelijsten


## 2026-06-07 (automatische keurmerk-detectie + veel minder valse meldingen)

### Keurmerk-detectie draait nu vanzelf
- Geïmporteerd etiket-artwork wordt voortaan automatisch gecontroleerd op keurmerken — uitkomsten verschijnen vanzelf in de reviewwachtrij (handmatig herstarten per productset blijft mogelijk voor beheerders)
- Detecties die al beoordeeld of geregistreerd zijn worden niet opnieuw aangeboden

### Veel nauwkeurigere detectie
- Valse meldingen drastisch teruggebracht (in de testmeting van 20 naar 1 op hetzelfde etiket) door slimmere afstelling per keurmerk en het negeren van te kleine schijn-treffers
- Twee dezelfde keurmerken op één etiket worden nu allebei gevonden


## 2026-06-06 (keurmerk-detectie vindt nu ook kleine logo's)

### Slimmere keurmerk-herkenning op etiketten
- De automatische keurmerk-detectie herkent logo's nu op elk formaat op het etiket — ook kleine keurmerken op grote etiketbestanden werden eerder helemaal gemist
- Ronde en deels transparante keurmerken (zoals de Groene Punt) worden beter herkend
- De keurmerk-zoekfunctie blijft betrouwbaar werken nadat de referentiebibliotheek opnieuw is opgebouwd
- Let op: de afstelling tegen valse meldingen op echte etiketten volgt in een vervolgstap; tot die tijd is bulk-detectie nog niet vrijgegeven


## 2026-06-06 (fix crop-weergave review-scherm)

### Uitsneden zichtbaar in het artwork-reviewscherm
- De keurmerk-uitsnede bij elk reviewitem wordt nu correct getoond (de afbeeldings-link verwees naar interne opslag die de browser niet kon bereiken)

## 2026-06-05 (fix trainingspijplijn-pagina)

### Trainingspijplijn-pagina werkt weer
- De pagina Training -> Pipeline crashte ("Something went wrong") door een verkeerd verwerkt server-antwoord; de pagina laadt nu correct, ook zonder trainingsjobs

## 2026-06-05 (login-fix)

### Inloggen met je XXtract-account werkt nu
- Inloggen met je gewone XXtract-accountgegevens werkt nu ook in deze applicatie (wachtwoordcontrole accepteerde het centrale wachtwoordformaat niet)
- XXtract-medewerkers krijgen automatisch beheerrechten in dit tool

## 2026-06-05 (Acceptatietest Epic 9 — UI-verbeteringen)

### In- en uitloggen vanuit de navigatiebalk
- Rechtsboven in elke pagina staat nu een gebruikersmenu: ingelogd zie je je e-mailadres met de optie "Uitloggen"; niet ingelogd zie je een "Inloggen"-knop
- Na uitloggen kom je automatisch terug op het inlogscherm

### Goedkeuringsscherm direct bereikbaar
- Op de modellenpagina staat een knop "Goedkeuringsqueue" met een teller van het aantal modellen dat op goedkeuring wacht
- De melding "Hertraining aanbevolen" bevat nu een knop "Bekijk goedkeuringsscherm" die je direct naar de goedkeuringspagina brengt
- Het goedkeuringsscherm opent nu correct (was eerder niet bereikbaar)

### Nettere melding bij verlopen sessie
- Wanneer je sessie is verlopen toont de reviewpagina nu een duidelijke melding met een "Inloggen"-knop, in plaats van een technische foutmelding

## 2026-06-05 (Epic 9 — Automatische Retraining: CI-smoke-test 9.6, revisie)

### Geautomatiseerde regressiedetectie voor de volledige trainingspipeline — volledige flowdekking
- Smoke-test uitgebreid met alle vijf pipelinestappen: incorporate (feedbacktelling op de mini-dataset), batch-opbouw (synthetisch aanvullen), trainen (2 epochs via ML-client), holdout-evaluatie (metriekencontract) en kwaliteitsgate
- De kwaliteitsdrempel-test gebruikt uitsluitend de omgevingsvariabele `GATE_MIN_IMPROVEMENT` — geen expliciete doorgave in de aanroep — waardoor bewezen wordt dat de drempel werkelijk wordt gelezen uit de configuratie
- Verwijderd: verouderde stub-testfile (`tests/smoke/pipeline-smoke-test.ts`) die nooit door de testrunner werd opgepikt
- CI-aanroep gecorrigeerd naar `cd apps/api && npx vitest run ...` zodat de Vitest-configuratie en setupbestanden correct worden geladen
- Totale looptijd van de smoke-test: onder de 5 minuten dankzij gemockte ML-service en kleine testdataset

## 2026-06-05 (Epic 9 — Automatische Retraining: Goedkeuringsscherm 9.5)

### Eén-klik modelactivatie met volledig evaluatierapport
- Nieuwe pagina `/models/approval` toont uitsluitend modellen die de kwaliteitsgate haalden en op goedkeuring wachten
- Per kandidaat-model ziet de datamanager een vergelijkingskaart: de nauwkeurigheid van het nieuwe model naast die van het huidige actieve model, het verschil en de reden voor de retraining-trigger
- Activatie vereist één handeling: bevestig via de "Activeren"-knop; het systeem weigert geautomatiseerde activatiepogingen (servicesleutel in de header geeft een 403-foutmelding)
- Elke activatie wordt vastgelegd met gebruiker, tijdstip en trigger-context (traceerbaarheid voor toekomstige audit-trail)

## 2026-06-05 (Epic 9 — Automatische Retraining: Kwaliteitsgate 9.4)

### Automatische kwaliteitsdrempel voor getrainde modellen
- Na elke training beoordeelt een kwaliteitsgate automatisch of het nieuwe model de actieve versie overtreft op dezelfde testset
- Een challenger die de huidige champion haalt of overtreft op nauwkeurigheid (en dezelfde holdout-set heeft gebruikt) wordt doorgestuurd voor goedkeuring
- Afgewezen modellen worden geregistreerd met de vergelijkingscijfers; de datamanager ontvangt een melding met de exacte scores van beide modellen
- Eerste trainingsrun (geen actieve champion) en legacy-modellen zonder testmetriken worden automatisch goedgekeurd
- De minimale verbetering is instelbaar via de omgevingsvariabele `GATE_MIN_IMPROVEMENT` (standaard: gelijk of beter dan champion)

## 2026-06-05 (Epic 9 — Automatische Retraining: Trainingspipeline 9.3)

### Crash-bestendige trainingspipeline
- De volledige retraining-pipeline draait nu als een aaneengekoppelde BullMQ-jobflow: incorporate-feedback → build-batch → train-model → evaluate-model
- Elke stap in de flow is afzonderlijk herstelbaar: een herstarte container pikt de flow op vanaf de niet-voltooide stap, zonder de eerder afgeronde stappen te herhalen
- De trainingsworker draait met concurrency 1 en binnen een configureerbaar tijdvenster (standaard 22:00–06:00) om productieverkeer niet te hinderen
- Klassen met onvoldoende trainingsbeelden worden automatisch aangevuld via synthetische data (deferred van Story 8.7); het tekortrapport per klasse wordt gelogd op taakniveau
- Datamanagers kunnen een trainingscyclus handmatig starten via de API (`POST /api/v1/pipeline/training/start`); het systeem weigert een nieuwe start als er al een actieve trainingsrun loopt

## 2026-06-05 (Epic 9 — Automatische Retraining: Trigger & Notificaties 9.2)

### Automatische herkenningsmeldingen
- Het systeem controleert dagelijks (06:00) of hertraining zinvol is op basis van drie configureerbare drempels: minimaal aantal nieuwe annotaties, ratio onverwerkte feedback, en modelnauwkeurigheid
- Bij een positieve check ontvangt de datamanager een concrete melding met het exacte aantal nieuwe annotaties ("512 nieuwe gevalideerde annotaties")
- Meldingen worden bewaard in de database zodat een later paginabezoek de notificatie alsnog toont — een offline datamanager mist nooit een trigger
- Dubbele meldingen worden onderdrukt: dezelfde trigger verstuurt hooguit één keer per 24 uur een notificatie, ook na een API-herstart (Redis-dedup)
- Gelezen meldingen kunnen worden weggestreept via de "Gelezen"-knop in de banner

## 2026-06-05 (Epic 9 — Automatische Retraining: Infrastructure 9.1)

### Persistente job-wachtrij voor de trainingspipeline
- Alle retraining-taken draaien nu in een persistente BullMQ-wachtrij die is opgeslagen in Redis; een herstarte container verliest nooit meer een taak in uitvoering
- Elke taak wordt automatisch tot 3× opnieuw geprobeerd met exponentiële wachttijd bij tijdelijke fouten
- Mislukte taken zijn terug te vinden in de taakgeschiedenis met de precieze foutmelding en een "opnieuw starten" optie
- De trainingsoverzichtspagina toont nu een paneel met de actuele status van alle pipelinetaken
- Geautomatiseerde planners authenticeren via een apart serviceaccount (API-sleutel); menselijke activatie blijft altijd vereist
- Redis is toegevoegd aan alle deploymentconfiguraties (development, ACC en productie)

## 2026-06-04 (Epic 8 — Review-scherm & bibliotheekweergave)

### Beoordelingsscherm voor artwork-detecties
- Nieuw scherm "Artwork review": twijfelgevallen uit de automatische keurmerk-detectie staan nu in één overzicht, naast de bestaande onzekere feedback-items
- Per item zie je de uitsnede van het gedetecteerde keurmerk, het voorgestelde label, de zekerheidsscore, de herkomst (bronbestand + positie op het etiket) en de reden waarom het item beoordeling nodig heeft
- Goedkeuren of afwijzen kan met één klik; goedgekeurde items worden direct als trainingsdata geregistreerd
- Beoordelen is voorbehouden aan beheerders; voor anderen zijn de knoppen uitgeschakeld met uitleg

### Bibliotheekweergave
- Trainingsafbeeldingen tonen nooit meer "NaN MB" of een ongeldige datum; ontbrekende gegevens worden netjes als "—" weergegeven

## 2026-06-04 (Epic 8 — Automatische Trainingsdata)

### Stabiliteits- en kwaliteitsverbeteringen (code-review)
- Gedeactiveerde trainingsdata (afgekeurde bron) wordt nu daadwerkelijk uitgesloten van modeltraining en de holdout-evaluatie — voorheen telde een gedeactiveerd record nog mee
- Registratie van meerdere crops gebeurt nu in één transactie: bij een fout halverwege blijven er geen half-opgeslagen records achter
- Synthetische trainingsdata kan niet meer als holdout gemarkeerd worden (de evaluatieset blijft gegarandeerd 100% echt)
- Een herhaalde mislukte import voor dezelfde productcode laat de importrun niet meer vastlopen
- Crop-classificatie verzint geen keurmerk-label meer wanneer er geen referentie beschikbaar is: de regio wordt dan als 'onzeker' gemarkeerd voor handmatige beoordeling in plaats van met een gegokt label de trainingsdata in te gaan

### Synthetische trainingsdata-generatie
- Schaarse klassen worden automatisch aangevuld met synthetisch gegenereerde trainingsdata
- De ratio echte/synthetische voorbeelden is configureerbaar; het ratio-plafond wint altijd over het minimum (kwaliteit boven kwantiteit)
- Klassen die het minimum niet kunnen halen door het ratio-plafond worden gerapporteerd als 'tekort' in plaats van stilletjes met ruis te worden opgevuld
- Synthetische samples komen nooit in de holdout-set terecht (NFR3: holdout is altijd 100% echt)

### Trainingsdata-registratie met herkomst
- Automatisch goedgekeurde keurmerk-crops worden opgeslagen als trainingsdata met volledige herkomst-informatie (bronbestand, boundingbox, methode, zekerheid)
- Trainingsdata uit een specifiek bronbestand kunnen in bulk gedeactiveerd worden (zonder te verwijderen) via één API-aanroep
- Elke trainingsrecord is volledig herleidbaar naar het originele artwork-bestand

### T3777-kruischeck en routing
- Gedetecteerde keurmerken worden automatisch vergeleken met de T3777-declaratie van het product
- Overeenkomsten met voldoende zekerheid worden direct goedgekeurd als trainingsdata
- Afwijkingen (verwacht maar niet gevonden, of gevonden maar niet gedeclareerd) gaan naar de beoordelingswachtrij met een duidelijke reden
- Zonder T3777-declaratie wordt niets automatisch goedgekeurd — alles gaat ter controle

### Crop-classificatie van gelokaliseerde regio's
- Gelokaliseerde keurmerk-regio's worden nu automatisch geclassificeerd naar een T3777-code
- Classificatie gebruikt embedding-gelijkenis met de referentiebibliotheek; als de zekerheid onder de drempel blijft, wordt de regio gemarkeerd als 'onzeker' (input voor handmatige beoordeling in stap 8.5)
- Bij ontbrekende referentie-embeddings valt het systeem terug op een pixelgebaseerde heuristiek

### Keurmerk-lokalisatie op artwork
- Het systeem kan nu keurmerken automatisch lokaliseren op gerasterde artwork-afbeeldingen
- Grote afbeeldingen worden opgeknipt in overlappende tegels (SAHI-aanpak) voor nauwkeurige detectie van kleine keurmerken
- Per tegel wordt template-matching uitgevoerd; detecties van overlappende tegels worden samengevoegd (non-maximum suppression)
- Lege of bijna-eenkleurige regio's worden automatisch genegeerd (wit-op-wit-bescherming)
- Nieuwe API-endpoint: POST /ml/artwork/localize — accepteert afbeelding en keurmerk-templates, retourneert detecties met coördinaten

### Artwork-import via mediaserver
- Het systeem kan nu etiket-artwork automatisch ophalen uit de mediaserver en lokaal opslaan
- Per productcode (GTIN) worden alle PACKAGING_ARTWORK-bestanden geïmporteerd en gecachet
- Bestanden die al geïmporteerd zijn, worden overgeslagen (geen dubbele downloads)
- Importfouten per product worden geregistreerd; de rest van de batch gaat gewoon door
- Importstatus is op te vragen: hoeveel bestanden geïmporteerd, overgeslagen, of mislukt

## 2026-06-04

### Stabiliteits- en kwaliteitsverbeteringen modeltraining
- Het opslaan van een getraind model is robuuster gemaakt (technische fout in de registratie verholpen)
- Bij het opnieuw uploaden van een bestaande keurmerk-variant verschijnt nu een duidelijke melding in plaats van een serverfout
- Keurmerken met heel weinig voorbeelden blijven volledig beschikbaar voor training (worden niet meer in de holdout-set geplaatst)
- Een te kleine holdout-set geeft nu ook bij de trainingsservice een nette foutmelding
- De zoekfunctie op gelijkenis blijft alle keurmerken vinden, ook als hun voorbeelden in de holdout-set zitten
- Het referentie-overzicht laadt sneller bij veel (historische) varianten

## 2026-06-03

### Keurmerk-referentiebibliotheek
- Nieuw scherm "Referenties" om officiële keurmerk-beeldmerken te beheren
- Per keurmerk (T3777-code) meerdere varianten uploaden (taal, mono, kleur) met bronvermelding
- Alleen PNG- en SVG-bestanden toegestaan; te kleine afbeeldingen worden geweigerd met een duidelijke melding
- Varianten worden overzichtelijk per keurmerk gegroepeerd met een voorbeeldweergave
- Een variant kan worden gedeactiveerd zonder te verwijderen, zodat de historie behouden blijft

### Betrouwbaar evaluatiefundament voor modeltraining
- Trainingsafbeeldingen kunnen als "holdout" gemarkeerd worden: een vaste, beschermde set die nooit voor training wordt gebruikt
- Holdout-afbeeldingen worden automatisch uitgesloten bij het samenstellen van een trainingsbatch
- Elk getraind model wordt automatisch beoordeeld op dezelfde holdout-set, zodat modellen eerlijk met elkaar te vergelijken zijn
- Op het modelscherm zijn de holdout-resultaten (accuraatheid, precisie, recall, F1) zichtbaar, los van de trainingsresultaten
- De modelvergelijking toont beide modellen beoordeeld op dezelfde holdout-set

## 2026-04-04

### Training pagina laadt correct
- Categorieën en afbeeldingen worden nu correct geladen op de trainingpagina
- Inloggen is niet meer nodig om gegevens te bekijken

### Pagina's laden weer correct
- Alle pagina's (zoals training, dashboard) worden weer correct weergegeven
- Categorieën worden correct verwerkt op de trainingpagina
- Dashboard statistieken laden nu zonder inlogvereiste
- Trainings-jobs en modellen geven geen foutmelding meer als de ML-service niet beschikbaar is

### Testplannen gevalideerd en bijgewerkt
- Testplannen gevalideerd tegen huidige codebase en bijgewerkt met recente wijzigingen
- Validatierapport toegevoegd met bevindingen en aanbevelingen

### Test infrastructuur uitgebreid
- In-memory storage adapter voor tests (geen S3/MinIO nodig in CI)
- 43 nieuwe web component tests (stores, utils, services, pages)
- 28 P0 acceptatie tests voor kritische paden (auth, uploads, training)
- 32 API tests voor training, modellen en health endpoints
- 40 E2E tests voor modellen pagina, training pipeline en health API

### ML Service configuratie gefixt
- ML service poort uitgelijnd op 8011 (was mismatch tussen 8001 en 8011)
- API verbindt nu correct met de ML service

### Authenticatie geïmplementeerd
- Inloggen met bestaande xxtract-portal inloggegevens
- Login pagina toegevoegd
- 40 API unit tests en 14 E2E tests voor authenticatie
