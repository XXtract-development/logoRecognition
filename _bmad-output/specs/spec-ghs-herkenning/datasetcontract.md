---
datum: 2026-10-02
status: voorgestelde pilot; dataset niet verzameld
---
# Beeldmateriaal en onafhankelijke splits

Per klasse: voorstel 15 onafhankelijke ontwikkelverpakkingsgroepen, 20 andere positieve holdoutgroepen; kies 5–10 diverse referentiecrops uit ontwikkeling. Voor negen klassen 135 klasse-ontwikkelgroepen en 180 klasse-testgroepen; een etiket met meerdere GHS-klassen blijft één bronfamilie en kan niet over splits worden verdeeld. Daarnaast minimaal 100 onafhankelijke negatieve etiketten. Aantallen zijn een startbegroting en geen bewijs van voldoende training.

Manifestvelden: sampleId, sourceId/sourceURL, bronrecht/provenance, GTIN indien bekend, artworkVersion, familyId, originalHash, cropHash, split, label, bbox, imageWidth/Height, annotator, secondReviewer, leesbaarheid/variatie en cropPath/fullImagePath. Onbekende familyId niet automatisch als uniek behandelen: eerst duplicatecontrole. Manifestversie en annotaties bevriezen vóór testen. Geen niet-bestaande samples als ingevuld tellen.

Zelfde foto, verschillende crops/resoluties, artworkfamilie en augmentaties blijven één splitgroep. Exacte hash plus perceptuele near-duplicatecontrole en menselijke beoordeling. Holdout buiten referenties/templates/modeltraining/flywheelpromotie, ook na fouten. Ontwikkelaugmentaties blijven bij originele ontwikkelgroep. Geen mislukte holdoutbeelden achteraf vervangen. Dubbele annotatie beslist op zichtbare afbeelding; onleesbaar/afgesneden blijft onzeker.

Authentieke officiële pictogrammen alleen als herleidbare starttemplates, na controle van download/hergebruikvoorwaarden; geen AI-gegenereerde symbolen als waarheid. Referentietemplate alleen bewijst geen herkenning op echte verpakkingen. Verzamel toegestane echte etiketten met complete ruit, box en aparte crop; meerdere symbolen krijgen afzonderlijke boxes.

Variatie: kleine symbolen (<24,24–48,>48 pixels als meetvakken), blur/compressie, rotatie/perspectief, gebogen verpakking, reflecties, afsnijding, rooddruk en naburige tekst. Geen ondersteunde-resolutiebelofte afleiden uit deze meetvakken.

Negatieven: lege rode ruit, merk/prijs in rode ruit, decoratieve rand, transport/verkeersdiamant, algemeen uitroepteken/vlamillustratie, recyclingicoon, tekst/barcode. Ander echt GHS-symbool is een andere positieve klasse, geen algemeen gate-negatief. Verplicht onderscheid FLAME/FLAME_OVER_CIRCLE en EXCLAMATION_MARK/algemeen uitroepteken.

Pilotvoorstel: per klasse minimaal20 onafhankelijke positieve groepen, minstens18/20 correct geclassificeerd en gelokaliseerd met IoU≥0,5; hoogstens5/100 negatieve etiketten met enig foutief GHS-voorstel. Mens blijft beslissen. Onderminimum: onvoldoende bewijs; onderdoel: gericht onderzoeken. Dit is geen norm voor automatische bevestiging. Kritieke verwisselingen en onzekerheid altijd afzonderlijk zichtbaar.

Automatisch bevestigen is een apart productbesluit met onafhankelijke declaratie, toepasselijke foutkosten/populatie en grotere bevroren eindtest. De analist stelde minstens100 positieve gevallen per klasse en toepasselijke negatieven voor; 0 fouten/300 negatieven benadert eenzijdig95% bovengrens1%, geen universele garantie of vastgesteld criterium.

## Reviewaanscherpingen — onderdeel van pilotvoorstel
Verdeel de15 ontwikkelgroepen vooraf in maximaal10 referentie/train en minimaal5 ontwikkelvalidatiegroepen perklasse. Validatie blijft buiten templates/referenties/training/promotie, maar mag tuning/selectie sturen. De20 onafhankelijke positieve eindtestgroepen en100 negatieve eindtestgroepen blijven verzegeld tot weights, thresholds, referenties en modelkeuze vastliggen. Evalueer baseline en gekozen challenger op exact die bevroren eindset eenmaal; kies geen nieuwe challenger op eindtestresultaten. Na blootstelling niet hergebruiken als verzegeld selectiebewijs. Nieuwe eindtestversie prospectief verzamelen/annoteren, geen ongunstige gevallen vervangen.

Een positievegroep kan alleen pilot-succes zijn bij minstens één leesbaar waarheidssymbool, alle vereiste correcte matches én geen foutieve extra/verwisselde GHS-voorspelling op het etiket. Ook positieve/multisymboletiketten worden zo beschermd tegen alle-klassen-voorspellen. Volledig onleesbaar telt als abstentie en niet mee voor minimum20 leesbare onafhankelijke positievegroepen; toon altijd totaal inclusief onleesbaar. Een niet-bepaalbare annotatie maakt de groepsuitkomst onzeker, nooit automatisch correct. Dit aangescherpte groepscriterium blijft een voorgesteld pilotcriterium.
