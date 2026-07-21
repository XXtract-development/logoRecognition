# Versiegeschiedenis

## 2026-07-21 (Keurmerk-voorbeelden met transparantielaag blokkeerden de kwaliteitscontrole niet langer)

### De nachtelijke kwaliteitscontrole kon met-de-hand-getekende voorbeelden niet verwerken
- De controleronde die nieuwe keurmerk-voorbeelden goedkeurt, moet eerst een set ijk-voorbeelden doorrekenen. Een deel daarvan — juist de met-de-hand-getekende correcties uit de beoordeel-app — was opgeslagen mét een transparantielaag, en daar liep de beeldherkenning op vast. Gevolg: elke batch werd veiligheidshalve apart gezet en er werd niets goedgekeurd
- De beeldherkenning zet een plaatje nu altijd eerst om naar een standaardvorm zonder transparantie vóór het rekenen. Dat lost het voor alle onderdelen tegelijk op; aan de uitkomst voor gewone (transparantie-loze) plaatjes verandert niets
- Er is een test toegevoegd die precies dit soort plaatje afvangt, zodat het niet opnieuw kan gebeuren

## 2026-07-21 (De nachtelijke keurmerk-aanvulling liep vast op een verborgen databasefout — opgelost)

### De nachtelijke controleronde van nieuwe keurmerk-voorbeelden stopte halverwege
- De automatische nachtelijke ronde die beoordeelde keurmerk-voorbeelden definitief goedkeurt of apart zet, liep sinds begin juli telkens vast op een verborgen databasefout. Daardoor bleef een groep goedgekeurde voorbeelden hangen zonder verwerkt te worden. Omdat die keurmerken al andere voorbeelden hadden, was er in de herkenning zelf niets vreemds te zien — de storing was stil
- De oorzaak was een typefout in twee database-opdrachten die een lijst van identificatienummers vergeleek als tekst in plaats van als het juiste nummer-type. Dit is nu gecorrigeerd, zonder dat er iets aan de werking of de uitkomsten van die controle verandert
- Er is bovendien een nieuwe test toegevoegd die precies dit soort fout voortaan afvangt tegen een echte database — de bestaande testopzet kon hem principieel niet zien. Het daadwerkelijk verwerken van de vastgelopen groep gebeurt pas op de praktijkomgeving na expliciete goedkeuring

## 2026-07-20 (Bij de beoordeling zie je nu altijd het voorbeeld-logo)

### Voor sommige keurmerken ontbrak het voorbeeld-logo, waardoor je niet wist waar je naar zocht
- Keurmerken zonder eerder bevestigde referentie toonden geen voorbeeldbeeld; de hele voorbeeld-regel verdween dan
- Er verschijnt nu altijd een voorbeeld: bestaat er nog geen bevestigd logo, dan valt de app terug op het officiële logo uit de GS1-gids
- Voor de enkele keurmerken waarvan de gids alleen tekening-bestanden heeft die we niet kunnen tonen, verschijnt een duidelijke melding ("geen voorbeeld beschikbaar — zoek op de naam") in plaats van een lege regel

## 2026-07-20 (Gecorrigeerde uitsnede is direct correct zichtbaar, ook op desktop)

### Na een correctie bleef de oude automatische uitsnede soms tot 5 minuten in beeld
- De verpakkingsbeelden in de beoordeel-app werden door de browser tot 5 minuten bewaard. Corrigeerde je een uitsnede en ging je terug, dan kon je nog de oude automatische uitsnede zien — terwijl je correctie al correct was opgeslagen
- De beelden worden nu bij elke terugkeer geverifieerd: is er niets veranderd, dan blijft het snel; heb je gecorrigeerd, dan zie je meteen je nieuwe uitsnede en kader. Dit geldt zowel op desktop als mobiel

## 2026-07-17 (Zelf-getekende correcties blijven staan en tonen het juiste keurmerk)

### Na een zelf-getekende crop stond bij terugkeer soms weer de oude uitsnede/keurmerk
- Wie het logo zelf overtekende en accepteerde, zag bij terugkeer naar dat item nog de oorspronkelijke automatische uitsnede — de correctie was wel opgeslagen, maar het scherm toonde het oude beeld door een verouderde weergave-cache. Dat is verholpen: je ziet nu je eigen correctie terug
- De grote goedkeurknop toont voortaan onder welk keurmerk het kader wordt opgeslagen ("Bevestig kader als …"), zodat een correctie nooit stilzwijgend onder een verkeerd keurmerk belandt; klopt het keurmerk niet, dan kies je met één tik het juiste
- Voor een Nutri-Score waarvan de letter nog niet gekozen is, opent het bevestigen eerst de keuzelijst voor de letter, in plaats van op te slaan zonder letter

## 2026-07-17 (Getekend kader bevestig je nu bewust — met keurmerk-keuze vooraf)

### Een getekend kader werd direct goedgekeurd en het volgende item verscheen meteen
- Wie een kader om een logo tekende kon dat per ongeluk direct indienen via de knop onder de afbeelding — zonder kans om eerst het juiste keurmerk te kiezen
- Nu zet tekenen het kader alleen klaar: de grote goedkeurknop verandert van tekst ("Bevestig kader…") en pas als je díe indrukt wordt het kader geregistreerd
- Kies je tussendoor een ander keurmerk, dan wordt dat klaargezet en toont de knop beide ("Bevestig kader als …"); kader en keurmerk worden dan samen in één keer vastgelegd
- Nogmaals drukken op een al-goedgekeurd item blijft gewoon "ongedaan maken"

## 2026-07-16 (Kader tekenen op telefoon en tablet werkt nu betrouwbaar)

### Op mobiel kon het tekenen van een kader het item per ongeluk goed- of afkeuren
- In de beoordeel-app veeg je een kaartje naar rechts (goedkeuren) of links (afwijzen). Op een telefoon werd het tekenen van een kader om een logo soms als zo'n veegbeweging gezien — het item werd dan weggeveegd terwijl je alleen wilde markeren
- Teken- en zoombewegingen op de afbeelding tellen nu nooit meer als veegbeslissing, ook niet als je het toestel met een tweede vinger vasthoudt
- De bedieningstips passen zich aan het apparaat aan: op aanraakschermen lees je nu vinger-instructies (dubbeltik om te zoomen) in plaats van muis- en toetsenbordtaal

## 2026-07-16 (Preciezer uitlezen van gedeclareerde keurmerken en Nutri-Score)

### Verwante productvelden konden meelezen als declaratie
- Bij het uitlezen van de productdata kon een veld met een langere, verwante naam (zoals de Nutri-Score-categoriecode) per ongeluk meetellen als echte declaratie
- De uitlezer kijkt nu strikt naar de exacte veldnaam, zodat alleen de echte declaraties (keurmerken, dieet-codes, de Nutri-Score-letter) worden gebruikt — gecontroleerd tegen echte productdata uit de catalogus

## 2026-07-15 (Kruischeck telt nu ook de gedeclareerde Nutri-Score mee)

### Producten met een Nutri-Score kregen bij de kruischeck "geen declaraties gevonden"
- De kruischeck (vergelijking tussen wat een leverancier declareert en wat er op het etiket staat) keek alleen naar het veld met keurmerk-codes; de Nutri-Score staat in de productdata echter in een eigen, apart veld
- De kruischeck leest nu ook dat Nutri-Score-veld: declareert een product bijvoorbeeld een "D", dan wordt op het etiket gecontroleerd of daar inderdaad een Nutri-Score D staat — met de gespecialiseerde lezer en het vangnet die eerder zijn gebouwd
- Als het ophalen van de Nutri-Score-declaratie een keer mislukt, draait de controle gewoon door op de keurmerk-codes; er valt dus nooit een controle uit
- Ook opgelost: het starten van een kruischeck via de API gaf altijd een foutmelding door een technisch ongeldig taak-ID; dat is hersteld en de eerste succesvolle controles zijn gedraaid

## 2026-07-15 (Vangnet voor Nutri-Score-logo's die de specialist niet kan lezen)

### Zwart-wit-gedrukte Nutri-Score-logo's kregen geen letter
- De Nutri-Score-specialist leest op kleur — en sommige verpakkingen drukken het logo in zwart-wit, of met een onduidelijk uitvergroot vakje. Die gevallen bleven zonder letter
- Er is nu een klein, speciaal getraind vangnet-model (geleerd van ruim 10.000 wetenschappelijk geannoteerde verpakkingsfoto's) dat alleen wordt geraadpleegd als de specialist niets kan lezen én er al aanwijzingen zijn dat het om een Nutri-Score gaat
- Het vangnet overschrijft nooit een zeker antwoord van de bestaande herkenning en zegt bij twijfel eerlijk "weet ik niet" — in de praktijktest op onze eigen verpakkingen werden alle eerder onleesbare gevallen correct gelezen, zonder nieuwe fouten

## 2026-07-15 (Nutri-Score-letters worden nu betrouwbaar gelezen door een specialist)

### De letter (A t/m E) van een Nutri-Score-logo werd vaak verkeerd herkend
- De vijf Nutri-Score-varianten lijken zo sterk op elkaar dat de algemene beeldherkenning ze slecht uit elkaar hield: in een praktijktest werd maar 1 op de 6 letters goed gelezen
- Er is nu een gespecialiseerde lezer die werkt zoals een mens: hij zoekt de kenmerkende gekleurde balk en kijkt welk vakje uitvergroot is. In dezelfde praktijktest leest die 98% van de gevallen correct, en bij twijfel zegt hij eerlijk "geen lezing" in plaats van te gokken
- De specialist herkent verschillende drukstijlen, gedraaide en ondersteboven gedrukte logo's, en negeert misleidende beelden zoals gekleurde grafiekjes op de verpakking
- Voor alle andere keurmerken verandert er niets: de specialist grijpt alleen in bij een echt Nutri-Score-logo

## 2026-07-14 (Duidelijker beoordelen van Nutri-Score-vondsten zonder letter)

### Sommige Nutri-Score-items toonden een verwarrende, "kapotte" code
- De automatische vormherkenning zet Nutri-Score-logo's soms in de wachtrij zónder de letter al te bepalen — dan moet jij de juiste letter (A t/m E) toewijzen. Zulke items toonden de rauwe tekst "NUTRISCORE", wat overkwam als een foutieve code
- Voortaan staat er duidelijk "Nutri-Score — kies de letter" met een korte uitleg: kies de juiste letter via "Ander keurmerk koppelen", of wijs het item af als die letter al gedekt is
- De keuzelijst biedt die letterloze tussenstand niet meer als optie aan (je koppelt aan een echte letter), en de "niet gedeclareerd"-melding verschijnt niet meer misleidend op zo'n item

## 2026-07-14 (Een keurmerk markeren kan nu ook in de "bekijk in context"-weergave)

### Zelf een kader tekenen kon alleen in de uitsnede-weergave
- In het beoordelingsscherm kun je met "bekijk in context" het keurmerk ingezoomd in zijn omgeving zien. Tot nu toe was dat een platte afbeelding: je kon er niet zelf een kader op tekenen om het logo te markeren — dat kon alleen in de standaard uitsnede-weergave
- Voortaan kun je óók in de "bekijk in context"-weergave rechtstreeks een kader om het keurmerk slepen en bevestigen. Het programma rekent jouw kader automatisch terug naar de juiste plek op de volledige verpakking, dus de opgeslagen crop klopt

## 2026-07-14 (Twee correcties in het beoordelingsscherm: getekend kader blijft behouden en de "gedeclareerd"-melding klopt)

### Een zelf getekend kader kon bij het accepteren verloren gaan
- In het beoordelingsscherm kun je zelf een kader om een keurmerk tekenen als het automatisch voorgestelde vakje ernaast zit. Tot nu toe registreerde de groene "Accepteer"-knop (en ook een veegbeweging of de sneltoets) tóch altijd het automatisch voorgestelde vakje — je zelfgetekende kader ging dan verloren, en soms belandde daardoor een verkeerd stukje van het etiket als voorbeeld in het systeem
- Voortaan bewaart "Accepteer" jouw getekende kader zodra je er een hebt getekend; de knop toont dat ook met de tekst "Bevestig getekend kader". Heb je geen kader getekend, dan verandert er niets aan de werkwijze

### De melding "niet gedeclareerd" verscheen ten onrechte bij elk Nutri-Score-item
- Bij Nutri-Score-items toonde het scherm altijd de oranje waarschuwing "niet gedeclareerd op deze GTIN" — ook als de letter wél op de verpakking gedeclareerd was
- Die melding klopt nu: staat de Nutri-Score-letter in de declaratie, dan zie je de groene bevestiging "gedeclareerd op verpakking"

## 2026-07-14 (Een nieuwe zoekmodus gebruikt de opgegeven Nutri-Score-letter zelf als bewijs)

### De letters C en D van de Nutri-Score hadden nog te weinig herkende voorbeelden
- Elk product met een Nutri-Score-label geeft de letter (A t/m E) al zelf door aan de leveranciersdatabase. Die informatie stond al klaar, maar werd nog niet gebruikt om het vliegwiel te voeden met nieuwe voorbeelden voor de letters C en D
- Er staat nu een nieuwe, apart te starten zoekmodus klaar die precies dat doet: bij een product waarvan de Nutri-Score-letter al bekend is, wordt op het etiket naar het bijbehorende vakje gezocht. Vindt de zoekmodus geen betrouwbaar vakje, dan wordt dat product gewoon overgeslagen — er wordt nooit een letter geraden of verzonnen
- Gevonden vakjes komen voorgelabeld met de juiste letter in de beoordelingswachtrij terecht, zodat bevestigen nog maar één klik kost in plaats van eerst zelf de letter te moeten aflezen
- Deze zoekmodus draait niet automatisch mee met de bestaande nachtelijke aanvulling; hij wordt pas op de praktijkomgeving gestart na expliciete goedkeuring
## 2026-07-14 (Zelfgetekend kader en gekozen keurmerk worden voortaan samen bewaard)

### Een zelf getekende crop ging verloren zodra er ook een ander keurmerk gekozen werd
- In het reviewscherm kon je zelf een kader om een keurmerk tekenen én uit de lijst een (ander) keurmerk kiezen. Die twee acties werkten tot nu toe niet goed samen: het systeem bewaarde ofwel het gekozen keurmerk mét de automatisch gevonden crop, ofwel het zelfgetekende kader mét het oorspronkelijke keurmerk — nooit allebei tegelijk
- Beide acties worden nu, in welke volgorde je ze ook uitvoert, samen bewaard: de crop die je zelf hebt aangewezen, onder het keurmerk dat je hebt gekozen
- Los een kader tekenen (zonder keurmerk te wisselen) en los een ander keurmerk kiezen (zonder zelf te tekenen) werken nog precies zoals voorheen
- Bij het testen van deze correctie is ook een tweede, subtieler probleem gevonden en meteen meegenomen: als je een getekend kader of gekozen keurmerk eerst afwees en het item daarna opnieuw beoordeelde, kon een oud, al verlaten kader of keurmerk stiekem toch weer meegenomen worden. Dat gebeurt nu niet meer — een afwijzing wist altijd een eventueel nog openstaand kader/keurmerk voor dat item

## 2026-07-13 (Een foutmelding bij te snel klikken toont voortaan de juiste, duidelijke tekst)

### Het reviewscherm gaf soms een verwarrende serverfout in plaats van "even rustig aan"
- Bij het openen van het keurmerk-kiesscherm laadt de app tientallen kleine voorbeeldplaatjes tegelijk. Bij normaal gebruik kon dat er per ongeluk voor zorgen dat de server daarna een goedkeuring afwees met een onduidelijke, generieke foutmelding in plaats van de bedoelde "te veel verzoeken, even rustig aan"-melding
- Die foutmelding komt nu altijd correct binnen, zodat duidelijk is wat er aan de hand is
- De voorbeeldplaatjes van het kiesscherm hebben nu bovendien meer ruimte gekregen voordat de server ze afremt, zodat een normale reviewsessie (scherm openen, keurmerk kiezen, item goedkeuren) niet meer tegen die grens aanloopt — misbruik blijft wel afgeremd

## 2026-07-13 (Een nieuwe, aparte zoekmodus kan Nutri-Score-vakjes vinden op hun vorm, ongeacht de letter)

### Nutri-Score-letters C en D hadden vrijwel geen echte voorbeelden om op te herkennen
- Het Nutri-Score-vakje (de bekende groen-tot-rood-balk met een letter A t/m E) heeft voor alle vijf letters dezelfde vorm — alleen de kleur en de letter verschillen. Een eerdere proef liet zien dat automatisch gokken van de letter niet werkt; alleen een mens kan de letter betrouwbaar aflezen
- Er staat nu een aparte, los aan te roepen zoekmodus klaar die in het bestaande verpakkingsarchief speurt naar vakjes die op de Nutri-Score-VORM lijken — ongeacht welke letter erop staat. Elke treffer krijgt een voorlopige kleur-gok (groen/geel/oranje/rood) mee en komt in de bestaande beoordelingswachtrij terecht
- Een mens bevestigt daar de echte letter via de al bestaande keuzelijst (die alle vijf Nutri-Score-letters al aanbiedt); een bevestigd voorbeeld wordt dan meteen een volwaardig herkenningsvoorbeeld voor die letter — precies het pad waarmee de andere letters (A, B en E) al goed herkend worden
- Deze zoekmodus draait niet automatisch mee met de bestaande nachtelijke aanvulling en verandert daar niets aan; hij wordt pas op de praktijkomgeving gestart na expliciete goedkeuring

## 2026-07-13 (De juiste GS1-categorie wordt voortaan automatisch op een keurmerk-voorbeeld gezet)

### Keurmerk-voorbeelden droegen vaak de verkeerde categorie-labeling
- Elk keurmerk-voorbeeld in de bibliotheek hoort een categorie te dragen (bijvoorbeeld "keurmerk", "dieet/vrij-van", "Nutri-Score" of "consumentenpictogram"). Tot nu toe kreeg bijna elk nieuw voorbeeld automatisch dezelfde standaardcategorie, ook als het eigenlijk een dieet-claim of een Nutri-Score-letter was
- Er staat nu een geteste, herbruikbare regel klaar die per keurmerkcode de juiste categorie aflevert, met een expliciete markering voor de enkele gevallen waar een code in meerdere categorieën zou kunnen vallen — die worden gerapporteerd in plaats van geraden
- Nieuwe voorbeelden (via handmatige toevoeging én via de automatische vliegwiel-aanvulling) krijgen voortaan meteen de juiste categorie. Een opschoonactie voor de bestaande voorbeelden staat klaar maar wordt pas op de praktijkomgeving uitgevoerd na expliciete goedkeuring
- Er komt een nieuw overzicht bij het bestaande vliegwiel-dashboard dat per categorie laat zien hoeveel keurmerken al gevuld zijn, hoeveel er herkenning-klaar zijn en hoeveel er nog op beoordeling wachten — automatisch bijgewerkt, zonder handmatig telwerk

## 2026-07-13 (Correctie voor foutief gelabelde Nutri-Score-voorbeelden staat klaar)

### Achttien Nutri-Score-voorbeelden bleken verkeerd gelabeld, één stond onder de verkeerde letter
- Bij een handmatige controle van alle Nutri-Score-voorbeelden (de bekende A-E-schaal) bleken 18 voorbeelden onder de verkeerde letter geregistreerd te staan, en één voorbeeld stond onder letter A terwijl het eigenlijk een E is
- Er staat nu een geteste correctie klaar die deze 18 voorbeelden buiten gebruik zet en het ene voorbeeld naar de juiste letter (E) verplaatst, zonder de correct gelabelde voorbeelden of de bestaande testvoorbeelden aan te raken
- Deze correctie wordt pas daadwerkelijk op de praktijkomgeving uitgevoerd na expliciete goedkeuring — er is dus nog geen zichtbaar verschil in de herkenning totdat die goedkeuring gegeven is

## 2026-07-12 (De nachtelijke keurmerk-zoektocht richt zich voortaan op de belangrijkste keurmerken)

### De nachtelijke aanvulling van keurmerk-voorbeelden had geen focus
- Het systeem dat 's nachts automatisch op zoek gaat naar nieuwe voorbeelden van keurmerken deed dat tot nu toe voor ieder keurmerk dat al minstens één voorbeeld had — zonder onderscheid tussen een veelvoorkomend en een zeldzaam keurmerk. Dat verspreidde het beschikbare zoekbudget te breed
- De zoektocht richt zich nu gericht op de keurmerken die het vaakst voorkomen, plus expliciet op de keurmerken die nog te weinig bevestigde voorbeelden hebben om al optimaal herkend te worden — precies de klassen die het meest baat hebben bij extra aanvulling
- Twee bekend gevoelige keurmerken (het kringloop-symbool en het Franse sorteerlogo Triman) worden standaard buiten deze zoektocht gehouden, omdat ze eerder tot een overvloed aan (soms onterechte) voorstellen leidden
- Alles wat een gevonden voorbeeld al moest doorstaan blijft ongewijzigd: het gaat nog steeds eerst naar een medewerker ter beoordeling, en alle bestaande veiligheidscontroles (waaronder de kwaliteitsdrempel en de limiet per keurmerk) blijven onverkort gelden

## 2026-07-12 (Het zoek-voorbeeld van een keurmerk blijft het gids-logo, ook als er al bevestigde foto's zijn)

### Het interne zoek-voorbeeld week soms af van het bedoelde gids-logo
- Bij het zoeken naar nieuwe voorbeelden van een keurmerk gebruikte het systeem één beeld als vergelijkingsbasis. Dat hoorde altijd het originele gids-logo te zijn, maar zodra een keurmerk inmiddels een nieuwer, door een medewerker bevestigd voorbeeld had, werd per ongeluk dát voorbeeld als vergelijkingsbasis gebruikt in plaats van het gids-logo. Dat is nu gecorrigeerd: het gids-logo blijft de vergelijkingsbasis, ook als er al bevestigde voorbeelden bijgekomen zijn
- Heeft een keurmerk (nog) geen apart gids-logo, dan blijft het bestaande gedrag gelden zodat er niets vastloopt
- Dit raakt alleen de interne zoekbasis — de aparte, betrouwbaardere vergelijking met bevestigde voorbeelden (zie hierboven) blijft ongewijzigd werken

## 2026-07-12 (Herkenning gaat vergelijken met eerder bevestigde voorbeelden zodra een keurmerk er genoeg heeft)

### Een keurmerk met genoeg bevestigde voorbeelden wordt straks nog beter herkend
- Tot nu toe vergeleek de herkenning een gevonden keurmerk altijd met het ene "gids-logo" van dat keurmerk. Zodra een keurmerk minstens drie door een medewerker bevestigde, echte voorbeelden heeft, gaat de herkenning voortaan óók vergelijken met díe bevestigde voorbeelden — bovenop het gids-logo, niet in plaats daarvan. Dat is een veel betrouwbaardere vergelijking, omdat echte foto's van een keurmerk beter op elkaar lijken dan op een schoongepoetst gids-plaatje
- Deze verbetering staat nu klaar in de code; ze gaat pas daadwerkelijk meetellen nadat er eerst gemeten is hoeveel de vergelijkingslat precies moet zijn (een aparte, bewust losse stap met expliciete goedkeuring)
- Alle bestaande veiligheidscontroles blijven onveranderd gelden: een keurmerk moet nog steeds echt op het product staan, dubbele of eerder afgekeurde voorbeelden worden nog steeds geweerd, en er blijft een maximum aan het aantal voorbeelden per keurmerk

## 2026-07-12 (Herkenning vergelijkt weer met álle voorbeelden, en goedgekeurde keurmerken tellen gegarandeerd mee)

### Herkenning miste soms het best passende voorbeeld
- Bij het herkennen van een keurmerk vergelijkt het systeem het gevonden logo met bekende voorbeelden. Door een instelling keek het daarbij maar naar een klein deel van die voorbeelden, waardoor soms een minder goed passend keurmerk werd gekozen. Het vergelijkt nu weer met álle voorbeelden, zodat het juiste keurmerk betrouwbaarder bovenaan komt

### Een goedgekeurd keurmerk wordt nu gegarandeerd meteen een actief voorbeeld
- Als een medewerker een keurmerk-voorbeeld goedkeurt (via de beoordelingslijst of door zelf een kader te tekenen), wordt dat nu altijd direct een actief referentievoorbeeld dat de herkenning gebruikt. Voorheen liep een goedkeuring onder de huidige instelling via een omweg waar hij alsnog kon blijven steken — die omweg is verwijderd, zodat menselijke goedkeuringen niet meer verloren gaan

### Het recycling-keurmerk wordt weer herkend
- De voorbeelden voor het algemene recycling-keurmerk waren uitgevallen, waardoor recycle-logo's ten onrechte als een ander keurmerk (zoals Fairtrade) werden aangezien. Die voorbeelden zijn hersteld, zodat het recycling-keurmerk weer correct wordt herkend

## 2026-07-07 (Keurmerken die eerder onzichtbaar werden gemist, komen nu bij een mens terecht — en bevestigde voorbeelden gaan écht meetellen)

### Een filter keurde echte keurmerken ten onrechte af — dat is hersteld
- De herkenning gebruikte een filter dat bepaalde échte keurmerken (zoals Rainforest Alliance en TRIMAN) op de verpakking ten onrechte wegkeurde, waardoor ze volledig gemist werden. Dat filter is voor de herkenning versoepeld: zulke keurmerken worden nu opgepikt en ter controle op de beoordelingslijst gezet in plaats van onzichtbaar te verdwijnen. De strengere instelling blijft elders gewoon gelden
- Een door een medewerker goedgekeurd keurmerk-voorbeeld wordt nu betrouwbaar een actief referentievoorbeeld dat de herkenning gebruikt — voorheen bleef zo'n voorbeeld soms steken omdat het de automatische-goedkeurlat niet haalde, terwijl een mens het al had bevestigd

## 2026-07-07 (Gevonden keurmerk-voorbeelden gaan nu naar de beoordelingslijst i.p.v. verloren te gaan)

### De voorbeelden die het vliegwiel vindt, belanden nu bij een mens ter controle
- Het vliegwiel vond wél keurmerk-voorbeelden in lege keurmerk-vakken, maar die haalden de automatische-goedkeurlat net niet en werden weggegooid — netto kwam er nog steeds niets binnen. Nu worden die voorbeelden op de bestaande beoordelingslijst gezet, zodat een medewerker ze met één blik als echt of onterecht kan markeren. Een goedgekeurd voorbeeld wordt meteen bruikbaar bewijsmateriaal voor dat keurmerk
- Een keurmerk-vak geldt pas als "gevuld" zodra er minstens één door een mens bevestigd voorbeeld is (of een al eerder goedgekeurde referentie). Zo blijft een vak netjes in behandeling zolang er nog niets bevestigd is, in plaats van vast te lopen als "leeg maar afgehandeld"
- De veiligheidscontroles blijven gelden: een voorbeeld dat eerder is afgekeurd of al op de lijst staat, wordt niet opnieuw voorgelegd — per keurmerk apart, zodat verschillende keurmerken hetzelfde plekje op een verpakking wél elk voor zichzelf kunnen laten beoordelen. Aan de live keurmerk-herkenning verandert niets

## 2026-07-06 (Vliegwiel vindt nu daadwerkelijk keurmerk-voorbeelden — zoeklat bijgesteld)

### De gerichte brandstofselectie levert nu voorbeelden op i.p.v. nul
- Het vliegwiel zocht keurmerk-logo's met een gelijkenis-lat die in de praktijk onhaalbaar hoog bleek, waardoor er geen enkel voorbeeld doorheen kwam. De lat is bijgesteld naar de gemeten werkelijkheid, zodat declarerende producten nu wél keurmerk-voorbeelden opleveren
- Ook de interne voorfilter van het vliegwiel is versoepeld — uitsluitend voor het vliegwiel; de live keurmerk-herkenning verandert niet — omdat die eerder echte logo's ten onrechte wegfilterde
- De veiligheidscontroles blijven ongewijzigd: voorbeelden gaan door de kwaliteitspoort en langs de gold-set-controle voordat ze in de bibliotheek komen. Verwacht voorlopig een bescheiden aantal voorbeelden; een vervolgverbetering brengt het rendement verder omhoog

## 2026-07-06 (Meer keurmerken tellen mee bij de gerichte brandstofselectie van het vliegwiel)

### De declaratie-controle kijkt nu naar alle vijf keurmerk-velden, niet meer naar één
- Bij het gericht ophalen van voorbeelden per keurmerk controleert het vliegwiel of een product dat keurmerk ook echt opgeeft. Die controle keek voorheen maar naar één soort keurmerk-veld, waardoor keurmerken die in een ander veld staan — zoals VEGAN, HALAL of het zwangerschapswaarschuwingslogo — ten onrechte werden overgeslagen en er geen voorbeelden voor werden opgehaald
- De controle kijkt nu naar dezelfde vijf keurmerk-velden als waarmee de keurmerk-lijst is opgebouwd, zodat ook die keurmerken meedoen en er geen brandstof meer verloren gaat
- De keurmerken die al goed werkten (de accreditatie-logo's) blijven ongewijzigd meelopen; er verandert niets aan de veiligheidscontroles, de kwaliteitspoort of de begrenzing per keurmerk

## 2026-07-04 (Restant zonder leverancier krijgt een tweede kans via de bestaande her-inleesroute)

### Beelden die na de eerste koppelronde nog geen leverancier hadden, worden alsnog aangevuld
- Voor de verpakkingsbeelden die na de eerste koppelronde nog altijd geen leverancier (GLN) hadden, is er nu een tweede, handmatig te starten hulpmiddel dat die alsnog probeert aan te vullen via de bestaande her-inleesroute uit de mediaserver — er komt geen nieuw mechanisme bij, het hergebruikt wat er al is
- Het draait bewust rustig en gedoseerd: in kleine porties met een pauze ertussen (beide instelbaar), zodat de dagelijkse verwerking er geen last van heeft. Het wacht netjes tot een portie klaar is voordat de volgende begint
- Elk beeld houdt een actuele reden: lukt de koppeling nu wél, dan verdwijnt de eerdere uitvalreden; lukt het nog steeds niet, dan komt er een preciezere reden voor terug — "mediaserver leverde geen leverancier" of "mediaserver leverde geen beeld". Zo valt nog steeds niets stilletjes weg
- Ook hier is er eerst een veilige proefstand die alleen het plan toont (aantal beelden en de porties) zonder iets te wijzigen; pas met een expliciete bevestiging gaat het echt draaien, en het kan zonder risico opnieuw gestart worden
- Na afloop toont het Vliegwiel-overzicht vanzelf de bijgewerkte dekkingsgraad en het definitieve restant met redenen — via hetzelfde overzicht als voorheen

## 2026-07-04 (Historische artwork-archief krijgt zijn GLN terug voor declaratie-controle)

### Oude verpakkingsbeelden kunnen alsnog aan hun leverancier gekoppeld worden
- Er is nu een eenmalig, handmatig te starten hulpmiddel dat oude verpakkingsbeelden zonder bekende leverancier (GLN) alsnog aan de juiste leverancier koppelt, door die op te zoeken in de productbron. Zo kan ook het historische archief straks meedoen aan de declaratie-controle en de dubbele bevestiging
- Het hulpmiddel raakt nooit een al bekende leverancier aan (alleen ontbrekende worden ingevuld) en kan zonder risico opnieuw draaien: een tweede keer voegt niets nieuws toe
- Elk beeld dat géén eenduidige leverancier krijgt, krijgt een zichtbare reden — "geen productgegevens gevonden" of "meerdere mogelijke leveranciers" — zodat niets stilletjes wegvalt; bij twijfel tussen meerdere leveranciers gokt het systeem bewust niet
- Er is eerst een veilige proefstand die alleen laat zien wat er zou gebeuren (aantallen per uitkomst) zonder ook maar iets te wijzigen; pas met een expliciete bevestiging schrijft het hulpmiddel de gegevens weg
- Het Vliegwiel-overzicht toont nu de dekkingsgraad: welk percentage van het archief een leverancier heeft (doel: minstens 90%) plus de verdeling van de resterende uitval per reden

## 2026-07-04 (Overzicht en beheer van de opstart-wachtrij voor lege keurmerken)

### De datamanager ziet en stuurt welke lege keurmerken als eerste worden opgestart
- Er is nu een wachtrij-overzicht dat alle keurmerken zonder eigen referentiebeelden toont, gerangschikt op hoe vaak leveranciers ze opgeven — de meest voorkomende lege keurmerken staan bovenaan, waar de opstart-zoektocht het eerst loont
- Per keurmerk is de status zichtbaar: wachtend, gedraaid, gevuld, leeg (niets gevonden) of uitgesloten. Keurmerken die niet visueel te herkennen zijn, staan meteen op uitgesloten
- De datamanager kan de volgorde zelf overrulen, keurmerken uitsluiten of toevoegen, en vanuit het overzicht direct een opstart-zoektocht starten; elke ingreep wordt vastgelegd met wie en wanneer
- Zodra een lege klasse via de opstart zijn eerste referentie krijgt, verschijnt die als "nieuw geactiveerde klasse", met doorklik naar de onderliggende voorbeelden en hun herkomst


## 2026-07-03 (Lege keurmerkklassen vullen zichzelf met echte voorbeelden uit declarerende producten)

### Een keurmerk zonder referentiebeelden kan zichzelf op gang brengen zonder handwerk
- Voor een keurmerk waarvoor het systeem nog géén eigen referentiebeelden heeft, kan nu automatisch een "opstart-zoektocht" draaien. Het systeem gebruikt het officiële GS1-gidslogo van dat keurmerk puur als zoekbeeld en speurt daarmee naar echte voorbeelden op de verpakkingen van producten die dat keurmerk zelf opgeven
- Er wordt uitsluitend gezocht binnen producten die het keurmerk ook echt declareren: per product wordt de declaratie eerst geverifieerd, zodat er nooit buiten de opgegeven keurmerken gezocht wordt
- Gevonden voorbeelden die genoeg lijken op het gidslogo worden als kandidaat aangedragen — via exact dezelfde kwaliteitscontrole als alle andere kandidaten. Het systeem zet zelf niets rechtstreeks live; een voorstel blijft een voorstel
- Het GS1-gidslogo is enkel zoekinstrument: het komt zelf nooit als referentiebeeld in de bibliotheek, in exports of in rapporten terecht
- Levert een zoektocht niets op, dan wordt dat netjes vastgelegd en blijft het keurmerk in de wachtrij voor een volgende poging
- De zoektocht is begrensd op tijd en op het aantal producten per ronde, zodat de dagelijkse herkenning er geen last van heeft; de rest blijft klaarstaan voor een volgende ronde. Staat het vliegwiel op pauze of is het automatisch aandragen uitgezet, dan draait de zoektocht niet

## 2026-07-03 (Vaste meetgroep laat zien of de keurmerkherkenning maand op maand écht beter wordt)

### Een vast controle-cohort van ongeveer 100 producten wordt maandelijks opnieuw doorgemeten
- Er is nu een vaste groep van circa 100 producten die het systeem elke maand automatisch opnieuw controleert op hun eigen gedeclareerde keurmerken. Omdat het altijd dezelfde producten zijn, is een stijgend bevestigingspercentage aantoonbaar toe te schrijven aan een betere/rijkere referentiebibliotheek — en niet aan een toevallig makkelijkere of moeilijkere selectie
- De groep ligt bewust vast: gewone maandmetingen wijzigen de lijst nooit. Alleen een bewuste, gelogde ingreep kan de groep vernieuwen, en dat start dan expliciet een nieuwe meetlijn
- Het maandelijkse bevestigingspercentage per meetronde is opvraagbaar op het Vliegwiel-overzicht, als een eigen trendlijn — één meetpunt per ronde
- Deze controle-metingen staan volledig los van de dagelijkse cijfers: ze verschijnen niet in de gewone mismatch-trends, de werkvoorraad of het datakwaliteitsrapport, zodat een maandelijkse meetronde die overzichten niet vertekent
- De meting is een puur meetinstrument: ze maakt geen review-taken, geen kandidaat-voorstellen en geen trainingsdata aan, en draait 's nachts op de achtergrond binnen een tijdslimiet zodat de live-herkenning er geen last van heeft. Staat het vliegwiel op pauze, dan slaat ook deze meetronde over

## 2026-07-03 (Kruischeck-endpoint: gedeclareerde keurmerken automatisch controleren op de verpakking)

### Nieuwe automatische controle of een product zijn eigen gedeclareerde keurmerken ook echt op de verpakking heeft staan
- Er is een nieuw koppelpunt waarmee een geautomatiseerde workflow per product (GTIN) kan vragen: "staan de keurmerken die dit product opgeeft ook daadwerkelijk op het etiket?". Bedoeld voor doorlopende datakwaliteitsbewaking (100–200 producten per dag)
- Het systeem zoekt gericht alléén naar de keurmerken die het product zelf opgeeft — niet naar álle mogelijke keurmerken. Dat maakt de controle snel en gericht
- Per opgegeven keurmerk komt er een duidelijk oordeel terug: bevestigd (gevonden met voldoende zekerheid), onzeker (wel iets gevonden, maar te onzeker), niet gevonden, of niet-ondersteund (we hebben nog geen referentiebeeld voor dat keurmerk). Zo lijkt een controle die niets kon vinden nooit ten onrechte op "netjes gecontroleerd, niets aan de hand"
- De controle draait in de schaduw: ze rapporteert en logt, maar blokkeert niets en maakt geen handmatige-review-taken aan
- Verschillende schrijfwijzen van hetzelfde keurmerk (bijvoorbeeld de oude en nieuwe naam van Rainforest Alliance, of MSC met/zonder "label"-toevoeging) worden automatisch naar dezelfde referentie herleid, zodat een naamsverschil niet onterecht "niet gevonden" oplevert

## 2026-07-03 (Datakwaliteitsrapport: keurmerken die wél op de verpakking staan maar niet gedeclareerd zijn)

### Nieuw rapport toont per informatieleverancier de gemiste declaraties
- Er is een nieuw, exporteerbaar overzicht van keurmerken die met hoge zekerheid op een verpakking zijn gevonden, maar níet door de leverancier zijn gedeclareerd. Zo kan een datamanager leveranciers gericht wijzen op wat ze vergeten zijn op te geven
- Het overzicht is gegroepeerd per informatieleverancier (GLN; ontbreekt de leverancier, dan komt het geval in de groep "onbekend") en toont per geval het product (GTIN), het keurmerk, de zekerheid en een verwijzing naar het eigen bronbeeld — genoeg om het met de hand te controleren
- Je kunt een periode kiezen (van/tot) en op één leverancier filteren, en het geheel downloaden als CSV naast de weergave op het scherm
- Het rapport toont uitsluitend eigen beeldmateriaal; officiële referentie-/gidsbeelden komen er bewust nooit in terecht
- Dit is een intern hulpmiddel: er gaat geen automatische melding naar leveranciers — die terugkoppeling blijft mensenwerk

## 2026-07-03 (Zwakke keurmerken agenderen zichzelf als werkvoorraad)

### Keurmerken die stelselmatig wél gedeclareerd maar niet teruggevonden worden, komen nu automatisch op een werklijst
- Zodra een keurmerk vaak genoeg "wel verwacht, maar niet teruggevonden" oplevert — standaard bij minstens tien voorvallen verspreid over minstens vijf verschillende producten — agendeert het systeem die klasse voortaan zelf. Zo hoeft niemand meer handmatig te speuren naar waar de bibliotheek zwak is; de zwaktes melden zich vanzelf
- Heeft de klasse nog helemaal geen voorbeelden in de bibliotheek, dan belandt hij op de bootstrap-wachtlijst (klaar om aangevuld te worden). Heeft hij al voorbeelden maar blijkbaar te weinig, dan verschijnt hij als aanvul-signaal. Beide zijn zichtbaar op het Vliegwiel-scherm
- De grenswaarden (aantal voorvallen en aantal verschillende producten) zijn instelbaar, zodat de lijst niet te vol of te leeg loopt. Metingen uit speciale controle-rondes tellen hier bewust niet mee

### Vanaf een werklijst-item doorklikken naar de onderliggende producten
- Bij elk item op de werklijst kun je opvragen om welke producten (GTINs) en welke verwerkingen het precies gaat. Zo is altijd navolgbaar waaróm een keurmerk op de lijst staat, zonder giswerk
- Deze lijst is puur agenderen en tonen: er wordt nog niets automatisch verwerkt of aangevuld — dat komt in een volgende stap

## 2026-07-03 (Mismatch-signalen vastleggen en samenvatten)

### Elke verwerking legt nu vast wat er met de gedeclareerde keurmerken gebeurde
- Bij elke verwerking van een verpakking houdt het systeem voortaan bij hoe het per gedeclareerd keurmerk afliep: bevestigd, wel verwacht maar niet teruggevonden, of een keurmerk dat het model nog helemaal niet kan herkennen. Daarnaast wordt elk met hoge zekerheid gevonden keurmerk dat níet was gedeclareerd apart genoteerd
- Zo verdampen de twee waardevolste signalen van het vliegwiel niet langer: ze vormen de basis voor de werkvoorraad en het datakwaliteitsrapport die er later op voortbouwen
- Deze registratie is een stille bij-vangst: ze verandert niets aan de bestaande beoordeling of aan wat er richting de koppelingen teruggaat, en staat standaard uit tot ze bewust wordt aangezet

### Een nieuw overzicht van de bevestigingsgraad per keurmerk en per leverancier
- Het Vliegwiel-scherm kan nu de verhouding bevestigd/niet-teruggevonden tonen, uitgesplitst per keurmerk-klasse én per informatieleverancier, plus het verloop daarvan over de tijd
- Metingen uit speciale controle-rondes worden bewust buiten dit reguliere overzicht gehouden, zodat de cijfers zuiver blijven

## 2026-07-03 (Drempels bijstellen en het vliegwiel pauzeren)

### Je bepaalt nu zelf de promotiedrempels — met een verplichte reden en een logboek
- Via de knop "Drempels" op het Vliegwiel-scherm open je een venster waarin je per herkenningsmethode (template, embedding en classifier) de promotiedrempel apart instelt. Je ziet steeds de huidige én de vorige waarde
- Opslaan kan pas als je een reden invult — die reden, samen met de oude en nieuwe waarde, je naam en het tijdstip, komt in een wijzigingslogboek dat direct in hetzelfde venster zichtbaar is. Zo blijft altijd navolgbaar wie wanneer waarom een drempel verschoof
- Een aangepaste drempel werkt meteen door in de nachtelijke nominatie- en promotieronde, zonder dat er iets opnieuw uitgerold hoeft te worden

### Het vliegwiel pauzeren en hervatten met een duidelijke bevestiging
- Met een schakelaar in de bovenbalk zet je het vliegwiel op pauze of weer aan. Omzetten opent altijd een bevestiging die uitlegt wat er gebeurt: nominatie en promotie stoppen, maar herkenning en het verzamelen van trainingsdata lopen gewoon door
- Zolang het vliegwiel handmatig gepauzeerd is, staat er een amber (oranje) balk onder de titel met wie het pauzeerde en wanneer. Hervatten is altijd een bewuste actie; als er nog batches op beoordeling wachten, waarschuwt het venster daarvoor — maar het blokkeert niet, want die batches blijven veilig in quarantaine
- Zet het vliegwiel zichzelf stil na twee mislukte batches op rij (de automatische noodrem), dan verschijnt bovenaan een rode balk met de aanleiding en directe links naar de betrokken batches. Rood is bewust voorbehouden aan deze automatische stilstand en aan een echte terugval — nooit aan een gewone pauze of aan wachtende batches
- De pauze onthoudt zichzelf: na een herstart blijft het vliegwiel gepauzeerd tot je het bewust hervat. Alle teksten zijn Nederlands en de banners zijn schermlezer-toegankelijk

## 2026-07-03 (Quarantainebatch afhandelen met volledig bewijs)

### Wachtende batches beoordeel je nu kandidaat-voor-kandidaat op een eigen pagina
- Klik je in de quarantainetabel op "Openen", dan kom je op een nieuwe detailpagina voor die batch. Links een lijst met alle kandidaat-referenties (elk met een statusbadge: amber "te beoordelen", groen "vrijgegeven", grijs "afgekeurd" — nooit rood, want afkeuren is gewoon werk). Rechts het bewijs van de geselecteerde kandidaat: het uitgesneden beeld naast de bestaande referentie, de scores tegenover de promotiedrempel, het declaratieblok (GTIN, leverancier, gedeclareerde keurmerken) en de uitkomst van de kwaliteitspoort per controle
- Bovenaan staat de faalreden van de batch in gewone taal ("wacht op jouw beoordeling", geen fout-toon) en een voortgangsbalk "3 van 8 beoordeeld"
- Per kandidaat kies je Afkeuren of Vrijgeven. Afkeuren markeert het beeld als tegenvoorbeeld (hard-negative) waar het systeem van leert. Vrijgeven zet de kandidaat terug in de aanvoer: hij wordt bij de eerstvolgende nachtelijke ronde opnieuw gebundeld en gaat dan opnieuw volledig door de kwaliteitspoort — vrijgeven slaat de poort dus nooit over
- Je werkt vlot met het toetsenbord, net als in het reviewstation: A = vrijgeven, R = afkeuren, U = laatste beslissing ongedaan, pijltjes = vorige/volgende, Esc = sluiten. Na elke beslissing springt de weergave automatisch naar de volgende nog-onbeoordeelde kandidaat. De sneltoetsen doen niets zolang je in een invoerveld typt
- Zodra álle kandidaten beoordeeld zijn, wordt "Batch afsluiten" actief. Een samenvatting bevestigt wat er gebeurt ("3 afgekeurd → tegenvoorbeeld; 5 vrijgegeven → nieuwe batch, opnieuw door de poort"). Na bevestigen verdwijnt de batch uit de wachtlijst
- Alles is toetsenbord- en schermlezer-toegankelijk (de geselecteerde kandidaat scrolt in beeld en wordt aangekondigd) en volledig in het Nederlands

## 2026-07-03 (Vliegwiel-overzichtsscherm: de gezondheid in één blik)

### Het Vliegwiel-onderdeel toont nu een volledig overzicht
- Waar het Vliegwiel eerst alleen een casco was, staat er nu een echt dashboard. Bovenaan een rij kerncijfers: de gold-set-precisie, hoeveel nieuwe referenties er de afgelopen week bijkwamen (en over hoeveel keurmerken), hoeveel batches op beoordeling wachten (met hun ouderdom), hoeveel keurmerken hun maximum bereikt hebben, en de GLN-dekkingsgraad. Klikken op een kerncijfer scrolt naar het bijbehorende onderdeel
- Een precisietrend-grafiek toont per gepasseerde batch één meetpunt, met een gestippelde tolerantielijn. Een batch die de kwaliteitspoort niet haalde, is als rood ruitje mét tekst herkenbaar — nooit alleen op kleur. Onder de grafiek staat de laatste meting ook als tekst, en de onderliggende cijfers zijn als tabel opvraagbaar
- De quarantainetabel toont wachtende batches met hun faalreden in gewone taal. Een tweede tabblad "Historie" toont de gepasseerde én teruggedraaide batches. Terugdraaien kan daar, achter een bevestiging met een verplicht redenveld; een teruggedraaide batch krijgt een neutraal label "teruggedraaid"
- Een samenstellingspaneel laat zien hoe de goudstandaard eruitziet: omvang, de ECHT/VALS-verdeling, de meest en minst vertegenwoordigde keurmerken en eventuele scheefgroei-signalen (rustig, informatief — geen alarm)
- Afwijkende referentiebeelden (de wekelijkse controle) kun je nu vanuit het overzicht beoordelen: een vergelijkingsweergave toont het gemarkeerde beeld naast zijn soortgenoten, met de keuze "Behouden" of "Deactiveren". Deactiveren zet het beeld op inactief (het wordt niet verwijderd) en zorgt dat de kwaliteitspoort daarna opnieuw ijkt
- Onderdelen die nog uit latere stappen komen (bootstrap-wachtrij, mismatch-trends, GLN-dekking) tonen netjes een "nog niet beschikbaar"-melding in plaats van een leeg vlak
- Het scherm ververst bij openen en met een handmatige knop — er wordt niet doorlopend gepolld. Staat een weergave te lang open, dan verschijnt een rustige "vernieuwen"-melding. Alle teksten zijn Nederlands en de statuskleuren volgen de afspraak: amber voor "wacht op beoordeling", rood alleen voor een echte terugval

## 2026-07-03 (Vliegwiel-onderdeel in de app)

### Nieuw menu-item "Vliegwiel" met een teller voor wachtende batches
- In de bovenbalk staat naast "Review" voortaan een nieuw onderdeel "Vliegwiel". Daar komt het overzicht van het leervliegwiel — de plek waar de datamanager straks in één blik de gezondheid van het proces ziet
- Op het menu-item verschijnt een amber (oranje) telbolletje zodra er promotiebatches in quarantaine staan die op beoordeling wachten. De kleur is bewust géén alarmrood: quarantaine is de kwaliteitspoort die zijn werk doet, niet een fout
- Deze eerste stap levert het casco: het onderdeel opent netjes met een lege of ladende weergave zolang er nog geen gegevens zijn — geen leeg wit scherm en geen foutmelding. De inhoudelijke overzichtspanelen volgen in een volgende stap
- Het Vliegwiel-onderdeel gebruikt de XXtract-huisstijl (de vertrouwde blauw/groen/teal-kleuren en het Inter-lettertype). Die stijl geldt alléén binnen het Vliegwiel; de bestaande schermen blijven ongewijzigd
- Alle teksten zijn in het Nederlands

## 2026-07-03 (wekelijkse controle op afwijkende referentiebeelden)

### Afwijkende referentiebeelden worden voortaan wekelijks gesignaleerd
- Eén keer per week loopt het systeem automatisch alle actieve referentiebeelden na (de voorbeelden waarmee keurmerken worden herkend) en meet per keurmerk hoe ver elk beeld van de "gemiddelde" van dat keurmerk af ligt. Beelden die er duidelijk uitspringen — de meest afwijkende, of beelden boven een vaste afstandsgrens — worden als aandachtspunt gemeld
- Ook handmatig toegevoegde referentiebeelden worden meegenomen. Juist zo'n handmatig geplaatst, afwijkend beeld veroorzaakte eerder een herkenningsprobleem; die situatie wordt nu vooraf gevangen
- De melding is puur signalering: het systeem zet zelf niets uit. Het beoordelen (behouden of uitzetten) gebeurt straks via het dashboard. De aandachtspunten zijn zichtbaar in het vliegwiel-overzicht, met het tijdstip van de laatste controle, en blijven bewaard ook na een herstart
- De wekelijkse controle draait gewoon door wanneer het leervliegwiel gepauzeerd is — ze verandert immers niets, ze kijkt alleen mee

## 2026-07-03 (zicht op de gezondheid van de goudstandaard)

### De datamanager ziet nu de omvang en samenstelling van de goudstandaard
- Het vliegwiel-overzicht toont voortaan hoe groot de goudstandaard (de vaste meetlat) is, hoe de verhouding tussen echte en valse voorbeelden ligt, en welke keurmerken het vaakst en het minst vaak vertegenwoordigd zijn (de top-5 van beide). Zo is in één oogopslag te zien of de meetlat nog gezond en evenwichtig is
- Deze cijfers worden live berekend op het moment dat het overzicht wordt opgevraagd — er draait geen extra achtergrondtaak voor

### Automatische waarschuwingen bij scheefgroei
- Zodra één keurmerk meer dan een vijfde van alle voorbeelden uitmaakt, of de verhouding echt/vals buiten de gezonde bandbreedte (tussen 60% en 90% echt) valt, verschijnt er een signaal. Zo wordt zichtbaar wanneer de meetlat uit balans dreigt te raken
- De grenswaarden zijn instelbaar, zodat ze in de eerste weken kunnen worden bijgesteld

### Nieuwe keurmerken zonder voorbeeld worden gemarkeerd, niet geblokkeerd
- Verwerkt de nachtelijke ronde een keurmerk waarvan nog geen enkel voorbeeld in de goudstandaard zit, dan wordt dat als aandachtspunt genoteerd bij de lichting — maar de verwerking gaat gewoon door. Blokkeren zou het opbouwen van nieuwe keurmerken onmogelijk maken

## 2026-07-03 (reviewbeslissingen laten de goudstandaard automatisch meegroeien)

### Elke beoordeling in het reviewstation voedt voortaan de goudstandaard
- Wat een beoordelaar in het reviewstation goedkeurt (of zelf op de verpakking aanwijst) belandt automatisch als "echt voorbeeld" in de goudstandaard — de vaste meetlat waarmee het systeem bewaakt dat het niet slechter gaat herkennen. Zo groeit die meetlat mee zonder extra werk
- Elk voorbeeld wordt vastgelegd met de crop, de keurmerkcode, de herkomst en wie de beslissing nam, zodat alles herleidbaar blijft

### Afwijzen kan nu met een reden, en die reden bepaalt wat er gebeurt
- Bij het afwijzen kiest de beoordelaar voortaan een reden. "Geen keurmerk" betekent: dit beeld is écht fout — het gaat als tegenvoorbeeld de goudstandaard in én wordt permanent geblokkeerd, zodat het nooit meer als kandidaat terugkomt
- "Onjuiste locatie / verkeerde code" betekent: het beeld zelf klopt, alleen de toewijzing was verkeerd — dan wordt er niets geblokkeerd en niets als fout weggeschreven
- Deze redenkeuze verschijnt alleen wanneer het leervliegwiel aanstaat; staat het uit, dan werkt het reviewstation precies zoals voorheen

### Een beslissing terugnemen draait ook de gevolgen netjes terug
- Maakt een beoordelaar een zojuist genomen beslissing ongedaan, dan wordt het bijbehorende goudstandaard-voorbeeld ingetrokken (het blijft bewaard, maar telt niet meer mee) en vervalt een eventuele blokkade weer — geen losse eindjes

## 2026-07-03 (veiligheidsrem: terugdraaien, pauzeren en automatisch stilvallen bij herhaald falen)

### Een hele goedgekeurde lichting kan in één handeling worden teruggedraaid
- Blijkt een eerder goedgekeurde lichting toch verkeerd, dan kan de datamanager die als geheel terugdraaien: alle voorbeelden uit die lichting worden op non-actief gezet en tellen niet meer mee in de herkenning
- Terugdraaien wist nooit iets — de voorbeelden blijven bewaard (alleen uitgezet), met vastgelegd wie het deed, wanneer en waarom, zodat alles herleidbaar blijft
- Na een terugdraaiing valt de vergelijkingsmaatstaf automatisch terug op de laatst overgebleven goedgekeurde lichting, en de eerstvolgende meting begint met een verse nulmeting op de dan actuele voorbeelden

### Elke wijziging buiten de nachtelijke lichting om zet de meetlat op "opnieuw ijken"
- Wordt de actieve set voorbeelden op een andere manier aangepast (handmatig toevoegen of uitzetten, een terugdraaiing, of de oude directe registratie), dan weet het systeem dat de nulmeting niet meer klopt en meet het bij de volgende ronde vers, zodat vergelijkingen altijd eerlijk blijven

### Een pauzeknop die een herstart overleeft
- Het leervliegwiel kan worden gepauzeerd: er ontstaan dan geen nieuwe kandidaten en er wordt niets goedgekeurd, terwijl de gewone herkenning, het vastleggen van trainingsdata en het dashboard gewoon blijven doorlopen
- De pauze is echt persistent: een herstart van het systeem heft hem niet op — hervatten is altijd een bewuste actie, met wie en wanneer vastgelegd

### Twee mislukte lichtingen op rij en het systeem legt zichzelf stil
- Vallen er twee lichtingen achter elkaar in quarantaine, dan pauzeert het vliegwiel zichzelf en volgt er een melding met de aanleiding — zo kan een sluipend probleem nooit ongemerkt dooretteren; een geslaagde lichting ertussen zet de teller weer op nul

### Slechte voorbeelden zijn te exporteren als lesmateriaal
- De verzameling menselijk-afgekeurde voorbeelden (afgekeurd in de quarantaine of in het reviewstation als "geen keurmerk") is exporteerbaar als lesmateriaal om de herkenning scherper te trainen; automatisch/zacht geweigerde kandidaten zitten er per definitie niet in

## 2026-07-03 (kwaliteitspoort: een besmette lichting kan de herkenning nooit verslechteren)

### Elke nachtelijke lichting moet eerst langs een kwaliteitsmeting vóór hij meetelt
- Voordat automatisch geleerde voorbeelden echt gaan meedoen in de herkenning, meet het systeem eerst op de vaste goudstandaard of de herkenning er niet slechter van wordt — pas bij een goede uitslag worden de voorbeelden actief
- De meting gebeurt "in de schaduw": de bestaande herkenning wordt tijdens het meten nooit aangeraakt, dus gebruikers merken er niets van en er kan niets kapot
- Een voorbeeld dat later zelf de meetlat wordt, wordt tijdens de meting niet tegen zichzelf vergeleken — dat zou een oneerlijk perfecte score geven
- De allereerste keer legt het systeem een nulmeting vast als ijkpunt; latere lichtingen worden daar steeds tegen afgezet
- Wordt de herkenning door een lichting merkbaar slechter, dan gaat die lichting in quarantaine (niets ervan wordt actief) met vermelding van de zwaarst getroffen keurmerken, plus een melding voor de datamanager
- Kan de meting niet betrouwbaar draaien (goudstandaard onbereikbaar of de meetdienst ligt eruit), dan gaat de lichting uit voorzorg óók in quarantaine — bij twijfel nooit zomaar doorlaten
- Voorbeelden die met een verouderd herkenningsmodel zijn gemaakt, worden niet meegemeten maar netjes opnieuw ingepland voordat ze een kans krijgen
- Goedgekeurde voorbeelden worden één voor één veilig en in één keer toegevoegd; gaat er onderweg iets mis met één voorbeeld, dan blijven de andere gewoon staan

## 2026-07-03 (leergeheugen: kandidaten worden 's nachts gebundeld en langs de vangrails geleid)

### Kandidaat-voorbeelden gaan 's nachts automatisch langs caps en ontdubbeling
- Elke nacht (standaard om 01:00) bundelt het systeem de verzamelde kandidaat-voorbeelden en leidt ze langs een reeks vangrails, zodat straks alleen zinvolle, niet-dubbele voorbeelden de dure kwaliteitsmeting bereiken
- Per keurmerk geldt een bovengrens op het aantal automatisch geleerde voorbeelden (standaard 10); handmatig gecureerde voorbeelden tellen daar niet in mee en worden nooit verdrongen
- Bijna-identieke voorbeelden worden ontdubbeld — zowel onderling als tegen wat al bekend is, inclusief zojuist uitgezette slechte voorbeelden, zodat een kloon daarvan niet stiekem terugkeert
- Voorbeelden die duidelijk afwijken van hun soortgenoten (uitschieters) worden er automatisch uitgefilterd
- Wordt een voorbeeld op zo'n zachte grond afgewezen (te vol, dubbel of uitschieter), dan wordt het niet definitief geblokkeerd: het mag later opnieuw meedoen als de situatie verandert
- Valt er 's nachts iets stil, dan volgt automatisch een melding zodra de laatste geslaagde ronde meer dan 26 uur geleden is — een stilgevallen leerlus blijft zo niet onopgemerkt
- Draait het systeem opnieuw op halverwege een ronde, dan pakt het de openstaande ronde eerst netjes af voordat het nieuwe voorbeelden bundelt — er blijft niets half hangen
- Nog geen nieuwe actieve herkenning: de gebundelde voorbeelden staan klaar voor de kwaliteitsmeting die in de volgende stap volgt

## 2026-07-03 (goudstandaard: de meetlat voor de herkenning staat nu veilig in de database)

### De goudstandaard verhuist van losse bestanden naar een beheerde opslag
- De vaste referentieset waarmee we de kwaliteit van de herkenning meten (91 gecontroleerde voorbeelden plus de officiële keurmerk-declaraties van 74 producten) staat voortaan in de database in plaats van in losse bestanden — één betrouwbare bron van waarheid
- Die set wordt met één handmatige opdracht ingeladen; je kunt eerst een "proefdraai" doen die precies laat zien wat er ingeladen zou worden zonder al iets weg te schrijven
- De import is herhaalbaar zonder rommel: een tweede keer draaien voegt niets dubbels toe
- Een voorbeeld in de goudstandaard wordt nooit overschreven of gewist; een correctie zet een nieuw voorbeeld klaar en markeert het oude als vervangen — zo blijft de meethistorie altijd herleidbaar
- De oude bestanden blijven als bevroren momentopname bestaan, met een duidelijke verwijzing dat de database nu leidend is
- Nog geen zichtbare wijziging in de schermen; dit legt de basis voor de automatische kwaliteitsmeting (regressietest) die hierna volgt

## 2026-07-03 (leergeheugen: dubbel bevestigde keurmerken worden vanzelf kandidaat)

### Een dubbel bevestigd keurmerk wordt automatisch een kandidaat-voorbeeld
- Wanneer het systeem een keurmerk vindt dat óók in de officiële productdeclaratie staat (dubbele bevestiging), wordt dat uitgesneden logo voortaan automatisch bewaard als kandidaat-voorbeeld voor het leergeheugen — geen enkel dubbel bewijs verdwijnt nog ongebruikt
- Ook een handmatig bevestigd of ingetekend logo in het reviewstation gaat via deze nieuwe route
- Elk kandidaat-voorbeeld krijgt zijn vaste vingerafdruk mee; een eerder afgekeurd of al bekend voorbeeld wordt nooit dubbel opgeslagen
- Alles staat achter een uit-schakelaar: standaard verandert er niets aan het huidige gedrag. De beheerder zet het pas aan zodra de leerlus bewezen is
- Overgeslagen kandidaten (bijvoorbeeld omdat de vingerafdruk-dienst even niet bereikbaar is) worden geteld en zijn straks zichtbaar op het beheerdashboard — zo gaat er niets stil verloren
- Dit levert nog geen nieuwe actieve herkenning op; de kandidaten worden in een volgende stap beoordeeld en pas daarna eventueel echt in gebruik genomen

## 2026-07-03 (fundament: één vaste vingerafdruk per uitgesneden logo)

### Elke crop krijgt voortaan één en dezelfde, reproduceerbare vingerafdruk
- De beeldherkenning berekent nu voor elk uitgesneden logo een vaste "vingerafdruk" (inhouds-hash) die altijd hetzelfde is voor hetzelfde beeld — ongeacht bestandsformaat (PNG, BMP) of kleurmodus
- Deze vingerafdruk is het fundament waarmee het systeem straks dubbele voorbeelden herkent en voorkomt dat een eerder afgekeurd logo opnieuw wordt voorgesteld
- Er is bewust maar één plek die deze vingerafdruk berekent, zodat het geheugen van het systeem nooit stil kan falen door twee verschillende definities
- Nog geen zichtbare wijziging in de reviewschermen; dit legt alleen de basis voor de automatische ontdubbeling en het leergeheugen die hierna volgen

## 2026-06-21 (specialistische symboolherkenning)

### Symbolen kunnen gecontroleerd aan de labelketen worden geleverd
- De herkenningsservice kan keurmerken, Nutri-Score en GHS-symbolen in een vast antwoordformaat teruggeven
- Onbekende of onzekere symbolen worden apart gemarkeerd, zodat ze eerst beoordeeld kunnen worden
- Alleen symbolen die bij het actieve profiel passen worden als kandidaat doorgegeven

## 2026-06-18 (review: direct tekenen, slepen en verwijderen op de afbeelding)

### De afbeelding is nu volledig interactief
- **Direct markeren**: houd je muisknop ingedrukt op de afbeelding en sleep — je tekent meteen een kader om een keurmerk, zonder eerst op een knop te klikken
- **Ook ingezoomd tekenen**: dubbelklik om in te zoomen op een klein logo en teken er dan nauwkeurig een kader omheen
- **Verschuiven**: houd de **spatiebalk** ingedrukt en sleep om het (ingezoomde) beeld te verschuiven
- **Kader verwijderen**: een getekend kader heeft rechtsboven een ×-knop om het weer weg te halen
- Daarna bevestig je het kader; het uitgesneden stuk wordt als bevestigd voorbeeld geregistreerd

## 2026-06-18 (review: logo's in de keurmerk-keuzelijst)

### Herken een keurmerk aan z'n logo bij het kiezen
- In de lijst om een ander keurmerk te kiezen ("ander keurmerk") staat nu vóór elke code het **referentielogo** van dat keurmerk
- Zo kies je sneller op beeld in plaats van alleen op de naam

## 2026-06-17 (review: "Markeer keurmerk" werkt nu overal)

### Kader tekenen kan nu bij elk item
- De knop "Markeer keurmerk" en de sneltoets **M** werkten alleen bij "niet gevonden"-items; bij keurmerk-kandidaten gebeurde er niets
- Nu kun je bij élk item (ook kandidaten) een kader om het keurmerk tekenen op de volledige verpakking — handig om een verkeerd voorgestelde plek te corrigeren of een gemist keurmerk alsnog vast te leggen

## 2026-06-16 (review-station: referentiebeeld + voorstel direct op de verpakking)

### Zie wát je zoekt en wáár het systeem het voorstelt
- Bij elk item staat nu het **referentiebeeld** van het keurmerk ("zoek dit keurmerk op de verpakking") — geen giswerk meer over hoe een keurmerk eruitziet
- Bij keurmerk-kandidaten zie je standaard de **volledige verpakking met een rood kader** om precies de plek die het systeem voorstelt, zodat je in één oogopslag controleert of het kader om het juiste logo zit (en dus het juiste logo wordt gekoppeld)

## 2026-06-16 (review-station: sneller beoordelen met sneltoetsen)

### Eén item tegelijk, in volle focus — op desktop én mobiel
- De review werkt nu als een snel "station": je beoordeelt één item tegelijk, groot in beeld, en gaat na elke keuze automatisch naar het volgende
- **Sneltoetsen** voor minimaal klikken: **A** goedkeuren · **R** afwijzen · **M** keurmerk markeren · **L** ander keurmerk kiezen · **←/→** vorige/volgende · **U** ongedaan maken
- **Dubbelklik** op de afbeelding om in/uit te zoomen op precies die plek
- Alles bij elkaar: goedkeuren/afwijzen, kader tekenen, ander logotype kiezen, in/uitzoomen en navigeren — zonder telkens te scrollen of menu's te openen

## 2026-06-16 (review: voorstel controleren op de verpakking + markeren op mobiel)

### Zie het voorgestelde gebied op de hele verpakking
- Bij een keurmerk-kandidaat kun je nu de volledige verpakking openen met een **rood kader om precies het stuk dat het systeem voorstelt** — inzoombaar
- Zo controleer je vóór het accepteren of het kader om het júiste logo zit (en niet om een ander logo op dezelfde verpakking), zodat er nooit een verkeerd logo voor training wordt gekoppeld

### "Markeer keurmerk" werkt nu ook op mobiel
- Het zelf tekenen van een kader om een gemist keurmerk werkt nu ook op de mobiele review-weergave

## 2026-06-16 (review: keurmerk zelf markeren met een kader)

### Teken een kader om een gemist keurmerk
- Bij items waar een keurmerk wél gedeclareerd is maar de herkenning het niet vond, kun je nu zelf de verpakking bekijken en — als je het keurmerk vindt — er een **kader omheen tekenen** ("Markeer keurmerk")
- Het uitgesneden stuk wordt dan meteen als bevestigd voorbeeld geregistreerd, precies op de juiste plek. Zo leert de herkenning van échte missers in plaats van een gok bij "accepteren"
- Hierdoor weet je ook zeker dat het júiste logo gekoppeld wordt: je wijst zelf het gebied aan

## 2026-06-16 (review: sneller beoordelen + verpakking inzoomen)

### Accepteren en afwijzen gebeurt nu direct
- Bij het accepteren of afwijzen van een review-item hoef je niet meer eerst een bevestiging ("Bevestig") aan te klikken — één klik op "Accepteer" of "Wijs af" verwerkt het item meteen
- Zo werk je de review-lijst veel sneller door

### Volledige verpakking groot tonen en inzoomen
- Bij items waar het keurmerk niet automatisch gevonden werd, toont de review nu de volledige verpakking groter
- Je kunt erop klikken om volledig in te zoomen (en slepen om te verschuiven), zodat je een klein keurmerk op de verpakking goed kunt vinden — op zowel desktop als mobiel

## 2026-06-15 (review-queue vult zichzelf nu automatisch aan)

### Nachtelijke aanvulling met schone keurmerk-kandidaten
- De review-queue wordt nu elke nacht automatisch aangevuld met nieuwe keurmerk-kandidaten van verpakkingen die nog niet zijn doorzocht — batchgewijs richting de volledige catalogus
- Alleen betrouwbare voorstellen komen erin (de verbeterde keurmerk-filter + een strenge zekerheidsdrempel), zodat de lijst werkbaar blijft
- De aanvulling draait 's nachts zodat hij het dagelijkse gebruik niet vertraagt, en onthoudt waar hij gebleven was; zo groeit de set bevestigde voorbeelden vanzelf verder

## 2026-06-15 (review: volledige verpakking tonen bij 'niet gevonden')

### Geen lege "Crop niet beschikbaar" meer bij gedeclareerde-maar-niet-gevonden keurmerken
- Sommige review-items komen voort uit een kruiscontrole: de GS1-data zegt dat een keurmerk op de verpakking staat, maar de herkenning vond het niet. Zulke items hadden geen uitsnede en toonden alleen "Crop niet beschikbaar" — niet te beoordelen
- Voor deze items wordt nu de **volledige verpakking** (artwork van de GTIN) getoond, zodat je zelf kunt kijken of het gedeclareerde keurmerk er wél op staat
- Werkt zowel op de mobiele review-kaarten als de desktop-lijst, met de melding "Niet gedetecteerd — volledige verpakking; zoek het keurmerk"

## 2026-06-15 (herkenning: verbeterde keurmerk-filter live)

### Tekst, tabellen en pictogrammen worden nu betrouwbaarder weggefilterd
- De filter die beoordeelt of een gevonden stukje überhaupt een keurmerk is, is opnieuw getraind — nu op honderden door de beoordelaar afgekeurde voorbeelden in plaats van eenvoudige ruis
- Daardoor houdt de herkenning veel meer niet-keurmerken tegen: voedingstabellen, losse tekst, kleurstalen, font-overzichten en pictogrammen (zoals een kooktimer of koffiekopje) belanden niet langer als keurmerk-voorstel in de review
- Op een steekproef ging het aandeel correcte voorstellen in de opgeschoonde review-lijst van circa 30% naar circa 74%
- Deze verbeterde filter werkt nu ook live in de herkenning zelf, niet alleen in de review-lijst
- Let op: het allerfijnste onderscheid (een echt keurmerk versus een gewoon merklogo) blijft een vervolgstap; daarvoor is meer beoordeeld voorbeeldmateriaal nodig

## 2026-06-14 (review desktop: logo's nu direct zichtbaar)

### Desktop-reviewlijst toont nu een thumbnail per item
- Op de desktop-pagina moest je voorheen per item op "Toon herkomst" klikken om de gevonden afbeelding te zien — reviewen was daardoor onwerkbaar
- Elk item toont nu links een kleine afbeelding (thumbnail) van de gevonden uitsnede, direct zichtbaar; klik erop voor de volledige herkomst
- Zo beoordeel je de logo's in één oogopslag

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
# 2026-06-21

- Vision-service krijgt een nieuw `/v1/detect-symbols` contract voor keurmerken, Nutri-Score en GHS-symbolen.
- Onbekende of niet-toegestane codes worden fail-closed behandeld en verlaten het contract niet als gok.
- Detectieresultaten bevatten nu modelversie, methode, confidence, bounding box en crop-referentie voor downstream bewijsvoering.
