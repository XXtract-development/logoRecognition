# logoRecognition — projectregels

## Productievoorbeelden zijn verplicht trainingsmateriaal

Op expliciet verzoek van de gebruiker (5 oktober2026): gebruik bij iedere echte modeltraining voor logoRecognition gecontroleerde productievoorbeelden. Echte etiketbestanden, productfoto’s en aan productieproducten gekoppelde veiligheidsbladen hebben prioriteit, omdat zij de te herkennen praktijk vertegenwoordigen. Ze moeten daadwerkelijk bijdragen aan de modelgewichten; alleen beoordelen of testen is niet voldoende. Officiële pictogrammen en synthetische varianten vullen dit materiaal aan.

- Interne training met deze productievoorbeelden is door de gebruiker toegestaan; registreer deze toestemming als herkomst, zonder een externe hergebruiklicentie te verzinnen.
- Bewaar bronkoppeling, oorspronkelijke bestandshash, product/bronfamilie, beoordelaars, pictogramcode en echt gecontroleerde uitsnede. Een productdeclaratie bewijst niet dat een pictogram op de betreffende foto zichtbaar is.
- Neem onleesbare, betwiste of verkeerd gekaderde voorbeelden niet stilzwijgend als positieve training op. Controleer ze eerst. Twee afzonderlijke AI-beoordelingen zijn toegestaan; vermeld dat dit geen menselijke gold is.
- Eén product/bronfamilie blijft in één datasetdeel: train, ontwikkeling/validatie of eindtest. Meerdere aanzichten, etiketten en SDS van hetzelfde product blijven samen. Eerder voor ontwikkeling bekeken beelden zijn geen nieuwe ongeziene eindtest.
- Echte training/vrijgave weigert een manifest zonder gecontroleerde productievoorbeelden in de train-split. Referentie-only bootstrap en unitfixtures zijn alleen expliciete ontwikkelmodi, nooit voldoende-getraindbewijs.
- Rapporteer aantallen oorspronkelijke productievoorbeelden en productfamilies los van augmentaties. Geen claims over alle negen typen zonder voldoende onafhankelijke praktijkmetingen en negatieve voorbeelden.

De bestaande zelfstandige opdracht omvat lokale training, implementatie en ACC-vrijgave via de normale PR-/testflow en automatische Coolify-uitrol. Geen handmatige containeractie of productiedatabasewijziging. Dit project hoeft niet in Zoho Sprints.
