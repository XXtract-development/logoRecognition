---
title: Referentie-vliegwiel zonder review
status: final
created: 2026-07-02
updated: 2026-07-02
---

# PRD: Referentie-vliegwiel zonder review

## 0. Document Purpose

Dit PRD beschrijft de scope-uitbreiding "Referentie-vliegwiel zonder review" op het bestaande logoRecognition-platform. Het is bedoeld voor de datamanager (primaire gebruiker), de architect en de ontwikkelaars die de epics en stories uitwerken. Het bouwt voort op de bestaande PRD (`_bmad-output/planning-artifacts/prd.md`, Epics 7–11) en op het domain-research-rapport `research/domain-referentie-vliegwiel-zonder-review-research-2026-07-02.md`; het dupliceert die documenten niet. Vocabulaire is verankerd in de Glossary (§3); features zijn gegroepeerd met genummerde FR's; afgeleide aannames zijn inline getagd als `[ASSUMPTION]` en geïndexeerd in §9. Technische kandidaat-oplossingen staan bewust niet hier maar in `addendum.md`.

## 1. Vision

Het systeem herkent keurmerken op verpakkingsartwork door crops te vergelijken met een referentiebibliotheek. Die bibliotheek is vandaag de bottleneck: referenties worden handmatig gecureerd, terwijl het systeem dagelijks detecties produceert die door twee onafhankelijke bronnen bevestigd worden — de visuele match én de GS1-declaratie van de leverancier. Die dubbel bevestigde crops verdwijnen nu in de trainingsdata-opslag en doen daarna niets meer voor de herkenning.

Dit PRD sluit die lus. Elke dubbel bevestigde detectie wordt een kandidaat-referentie die — na een automatische kwaliteitspoort, zonder menselijke review — de referentiebibliotheek versterkt. Daarmee wordt elke verwerkte verpakking brandstof voor betere herkenning van de volgende: een zelfversterkend vliegwiel. De rol van de datamanager verschuift van per-crop-reviewer naar bestuurder van het vliegwiel: drempels, steekproeven en een noodrem.

Het patroon is industrieel bewezen (data-engines in autonomous driving en retail-herkenning); de gedocumenteerde faalwijze — zelfversterkende fouten, zoals het eigen RECYCLABLE-incident — wordt ondervangen door guardrails die geen bijzaak zijn maar de kern van het ontwerp: strenge startdrempels, per-klasse caps, ontdubbeling, een outlier-audit en een gold-set-regressietest die het vliegwiel automatisch stillegt bij kwaliteitsdaling.

## 2. Target User

### 2.1 Jobs To Be Done

- **Datamanager:** "Ik wil dat de herkenning vanzelf beter wordt van het werk dat het systeem toch al doet, zonder dat ik elke crop hoef te bekijken — maar mét de zekerheid dat ik het zie én kan stoppen als de kwaliteit daalt."
- **Datamanager:** "Ik wil dat keurmerkklassen zonder referenties vanzelf gevuld raken met bruikbare echte voorbeelden, in plaats van dat ik ze handmatig moet zoeken."
- **Afnemend proces (n8n/kruischeck):** "Ik wil dat verificatie-verdicts maand na maand betrouwbaarder worden zonder dat er een migratie of hertraining nodig is."
- **Organisatie:** "Ik wil aantoonbaar kunnen maken wélke keurmerken op een verpakking staan en of dat klopt met de declaratie — met herleidbaar bewijs." (ECGT-context, zie §Why Now.)

### 2.2 Non-Users (v1)

- Leveranciers/dataproviders: zij zien niets van het vliegwiel; het datakwaliteitssignaal (§4.5) landt bij de datamanager, niet extern.
- Eindconsumenten en externe afnemers buiten de bestaande n8n-integratie.

### 2.3 Key User Journeys

*Lichte vorm — interne tool, één operator-rol.*

- **UJ-1. Sanne (datamanager) opent maandagochtend het vliegwiel-dashboard.** Ze ziet: 3 promotiebatches dit weekend verwerkt, 41 nieuwe referenties over 12 klassen, gold-set-precisie stabiel op 0,97, 2 klassen aan hun cap, 1 batch in quarantaine wegens precisiedaling. Ze opent de quarantainebatch, ziet per kandidaat het bewijs (crop, declaratie, scores), keurt 3 kandidaten alsnog af en geeft de rest vrij. Totaal 10 minuten — voorheen bestond dit werk niet eens, omdat referenties handwerk waren.
- **UJ-2. Het systeem vult een lege klasse.** Klasse `DEMETER_LABEL` heeft nul referenties. De seed-bootstrap gebruikt het schone GS1-gids-logo als zoekzaad, zoekt uitsluitend in producten die de code declareren, vindt 4 ondubbelzinnige echte crops en zet die als kandidaat-referenties klaar. Na de kwaliteitspoort is de klasse actief — zonder dat iemand ernaar omkeek. Sanne ziet het in het dashboard als "nieuw geactiveerde klasse".
- **UJ-3. De noodrem doet zijn werk.** Een promotiebatch bevat een besmette kandidaat (verkeerd gelokaliseerde crop die toevallig matcht). De gold-set-regressietest na de batch toont precisiedaling boven de tolerantie; de batch gaat automatisch in quarantaine, de betrokken referenties worden nooit actief, en het dashboard toont de reden. Het vliegwiel draait door voor alle andere klassen.

## 3. Glossary

- **Referentie** — een gecureerd voorbeeldbeeld van een keurmerk (record in de referentiebibliotheek met variantlabel en opslagpad) waartegen crops gematcht worden. Een referentie is **actief** of **inactief**.
- **Referentiebibliotheek** — de verzameling referenties, per T3777-code, inclusief embeddings. Huidige stand ACC: 43 actieve klassen, 215 actieve referenties.
- **T3777-code** — GS1-code uit de codelijst `packagingMarkedLabelAccreditationCode` die een keurmerk identificeert (universum ~894 codes).
- **Declaratie** — de set T3777-codes die de leverancier voor een GTIN heeft gedeclareerd in GDSN/tradeItems.
- **Crop** — een uitgesneden regio van verpakkingsartwork waarin het systeem een keurmerk vermoedt.
- **Dubbele bevestiging** — een detectie waarvan (a) de visuele match-confidence de methode-drempel haalt én (b) de gematchte T3777-code in de declaratie van de GTIN voorkomt. Bestaand mechanisme (crosscheck, Story 8.5).
- **Kandidaat-referentie** — een dubbel bevestigde crop die is genomineerd voor opname in de referentiebibliotheek, maar nog niet actief is. Status: `candidate`.
- **Promotie** — het activeren van een kandidaat-referentie tot actieve referentie (kandidaat-status `promoted`; de actieve referentie is een ReferenceLogo-rij met active=true en herkomst flywheel-promotion), uitsluitend via een promotiebatch die de kwaliteitspoort passeert.
- **Promotiebatch** — een gegroepeerde set kandidaat-referenties die als geheel door de kwaliteitspoort gaat; de batch is de eenheid van promotie, quarantaine en rollback.
- **Kwaliteitspoort** — het geautomatiseerde keurproces per promotiebatch: guardrail-checks (caps, dedup, outlier) gevolgd door de gold-set-regressietest.
- **Gold-set** — de menselijk gevalideerde meetset (crops met ECHT/VALS-label plus declaratie-goudstandaard) waarmee precisie/recall van het systeem gemeten wordt. Huidige stand: 91 samples.
- **Gold-set-regressietest** — geautomatiseerde meting van herkenningsprecisie op de gold-set mét de batch-kandidaten tijdelijk actief, vergeleken met de meting zonder; daling boven de tolerantie blokkeert de batch.
- **Quarantaine** — status van een promotiebatch die de kwaliteitspoort niet passeerde; kandidaten blijven inactief tot een datamanager beslist.
- **Per-klasse cap** — maximumaantal actieve referenties per T3777-code dat via promotie mag ontstaan.
- **Dedup** — ontdubbeling van kandidaat-referenties in twee trappen: bijna-exacte kopieën en visueel-gelijkende varianten.
- **Outlier-audit** — periodieke controle die per klasse referenties markeert die ver van het klasse-centrum liggen.
- **Seed-bootstrap** — het gericht oogsten van echte crops voor een klasse zonder actieve referenties, met het schone gids-logo als zoekzaad en uitsluitend binnen GTINs die de code declareren.
- **Mismatch-trigger** — een structureel verschil tussen declaratie en detectie: *gedeclareerd-niet-gevonden* (code gedeclareerd, geen visuele match) of *gevonden-niet-gedeclareerd* (visuele match, code niet gedeclareerd).
- **Evidence-contract** — het herleidbare bewijsrecord per kandidaat-referentie en per promotiebatch: bron-GTIN, bronbestand, bbox, methode, scores, declaratie-uitkomst, poort-resultaten, tijdstempels.
- **Hard-negative** — een door een mens afgewezen crop (quarantaine-afkeuring of reviewstation-reject wegens "geen keurmerk") die permanent als negatief voorbeeld bewaard blijft (voedt de gate-training). Zachte poort-afwijzingen (cap-bereikt, duplicaat, outlier) zijn géén hard-negatives en blijven hernomineerbaar.
- **Gate** — de bestaande keurmerk-vs-niet-keurmerk-classifier (gate-v2) die niet-keurmerk-crops wegfiltert vóór classificatie.
- **Vliegwiel** — het geheel van nominatie → kwaliteitspoort → promotie → betere herkenning → nieuwe nominaties.
- **Provenance** — de herkomstadministratie van een record (bron, methode, scores, tijdstempels); het evidence-contract is de vliegwiel-specifieke vorm ervan.
- **CONFIRMED-verdict** — uitkomst van het kruischeck-endpoint (Story 12.8) dat een gedeclareerde code visueel bevestigd is; overige verdicts: UNCERTAIN, NOT_FOUND, UNSUPPORTED.
- **Reviewstation** — het bestaande scherm waar de datamanager detecties handmatig beoordeelt; bron van de menselijke beslissingen die de gold-set voeden.
- **Informatieleverancier (GLN)** — de dataprovider van een GTIN, geïdentificeerd door Global Location Number; sleutel voor declaratie-lookup en voor de aggregatie van datakwaliteitssignalen.

## 4. Features

### 4.1 Promotielus met escalatiemodel

**Description:** De kern van het vliegwiel. Elke dubbele bevestiging nomineert de crop automatisch als kandidaat-referentie (naast de bestaande registratie als trainingsdata, die ongewijzigd blijft). Kandidaten worden per periode gebundeld in een promotiebatch `[ASSUMPTION: dagelijkse batch-cadans als zelfstandige nachtelijke job; de bestaande harvest is géén nominatiebron — die produceert review-items voor menselijke beoordeling]`. De batch doorloopt de kwaliteitspoort: eerst de guardrail-checks (§4.2), dan de gold-set-regressietest. Alleen een batch die de poort volledig passeert promoveert; zijn kandidaten worden actieve referenties (kandidaat-status `promoted`; ReferenceLogo-rij met active=true en herkomst flywheel-promotion) met volledige provenance. Een falende batch gaat integraal in quarantaine met de faalreden. Er bestaat géén pad van detectie rechtstreeks naar actieve referentie. Het bestaande 12.3-pad (reviewstation-accept → directe registratie als actieve referentie, buiten elke poort om) wordt in het vliegwiel geabsorbeerd: met de hoofdvlag aan nomineert een accept (herkomst `review`) en doorloopt hij dezelfde kwaliteitspoort; met de vlag uit blijft het legacy-gedrag ongewijzigd. Realiseert UJ-1, UJ-3.

**Functional Requirements:**

#### FR-1: Automatische nominatie
Het systeem nomineert elke dubbel bevestigde detectie als kandidaat-referentie, met evidence-contract, zonder menselijke tussenkomst.

**Consequences (testable):**
- Een detectie mét dubbele bevestiging resulteert in exact één kandidaat-referentie-record met status `candidate` en gevuld evidence-contract.
- Een detectie zónder declaratie-bevestiging resulteert nooit in een kandidaat-referentie (bestaande veiligheidsregel: lege declaratie → geen auto-accept, dus ook geen nominatie).
- De bestaande trainingsdata-registratie (Story 8.6) blijft byte-voor-byte ongewijzigd functioneren.

#### FR-2: Promotiebatch als eenheid van promotie
Het systeem bundelt kandidaat-referenties in promotiebatches en promoveert uitsluitend complete batches die de kwaliteitspoort passeren.

**Consequences (testable):**
- Een kandidaat-referentie kan alleen actief worden als onderdeel van een gepasseerde promotiebatch; directe activatie via een ander pad is niet mogelijk.
- Elke batch heeft een poort-resultaat (`passed` / `quarantined`) met per guardrail-check en voor de regressietest een vastgelegde uitkomst.
- Bij quarantaine blijven alle batch-kandidaten inactief; niets van de batch lekt naar de actieve bibliotheek.

#### FR-3: Gold-set-regressietest als poortwachter
Het systeem meet per promotiebatch de herkenningsprecisie op de gold-set met de batch-kandidaten tijdelijk meegenomen, en blokkeert de batch bij precisiedaling boven de tolerantie `[ASSUMPTION: tolerantie is sample-gebaseerd zolang de gold-set klein is — quarantaine bij ≥2 netto verslechterde gold-set-samples t.o.v. de laatste gepasseerde meting; de 1pp-drempel (conform het aiService-regressiecriterium) geldt pas vanaf een actieve gold-set ≥200 samples]`.

**Consequences (testable):**
- Een batch waarvan de meting de tolerantie overschrijdt krijgt status `quarantined` inclusief de gemeten delta en de meest getroffen klassen.
- Een gepasseerde batch legt de nieuwe baseline-meting vast; metingen zijn historisch opvraagbaar per batch.
- De regressietest draait volledig automatisch; een niet-uitvoerbare meting (bijv. gold-set onbereikbaar) blokkeert de batch (fail-closed).

#### FR-4: Rollback van gepromoveerde batches
De datamanager kan een gepromoveerde batch als geheel terugdraaien; de betrokken referenties worden inactief en de baseline-meting wordt teruggezet.

**Consequences (testable):**
- Na rollback matcht geen enkele detectie meer tegen de teruggedraaide referenties.
- Rollback is herleidbaar in het evidence-contract van de batch (wie, wanneer, waarom).

**Feature-specific NFRs:**
- De promotielus draait buiten de live-detectie-verkeersstroom en mag de bestaande verwerkings- en API-latency niet beïnvloeden.

### 4.2 Guardrails

**Description:** De verdediging tegen de gedocumenteerde faalwijze van zelflerende lussen: zelfversterkende fouten (confirmation bias; RECYCLABLE-incident). Vier mechanismen, alle vóór de regressietest in de kwaliteitspoort: strenge startdrempels, per-klasse caps, tweetraps-dedup en een periodieke outlier-audit. Afgewezen materiaal wordt hard-negative en kan nooit opnieuw genomineerd worden. Realiseert UJ-3.

**Functional Requirements:**

#### FR-5: Strenge, configureerbare promotiedrempel
Het systeem hanteert voor nominatie een aparte promotiedrempel die strenger is dan de bestaande crosscheck-drempels, per methode configureerbaar, met strenge defaults `[ASSUMPTION: startdrempel 0,90 voor embedding-matches; verruiming pas na aantoonbaar stabiele gold-set-historie]`.

**Consequences (testable):**
- Een dubbel bevestigde detectie onder de promotiedrempel wordt wél trainingsdata (bestaand gedrag) maar géén kandidaat-referentie.
- Drempelwijzigingen zijn alleen door de datamanager door te voeren en worden gelogd met oude en nieuwe waarde.

#### FR-6: Per-klasse cap op promotie
Het systeem begrenst het aantal via promotie ontstane actieve referenties per T3777-code `[ASSUMPTION: cap 10 per klasse bij start; geteld over actieve promotie-referenties — rollback en deactivatie geven ruimte terug; bewust strenger dan de bestaande per-run harvest-cap van 25]`.

**Consequences (testable):**
- Nominaties boven de cap worden geweigerd met reden `cap-bereikt`; de klasse verschijnt in het dashboard als "aan cap".
- Handmatig gecureerde referenties tellen niet mee voor de cap en worden er nooit door verdrongen.

#### FR-7: Tweetraps-dedup
Het systeem ontdubbelt kandidaat-referenties in twee trappen — bijna-exacte kopieën en visueel-gelijkende varianten — zowel tegen de actieve bibliotheek als binnen de batch `[ASSUMPTION: trap 1 perceptual-hash met strakke Hamming-drempel; trap 2 embedding-gelijkenis ≥ 0,97 binnen dezelfde klasse — startwaarden, te kalibreren op de gold-set]`.

**Consequences (testable):**
- Van twee bijna-identieke kandidaten in één batch wordt er hoogstens één gepromoveerd; de ander wordt afgewezen met reden `duplicaat`.
- Een kandidaat die visueel vrijwel samenvalt met een bestaande actieve referentie van dezelfde klasse wordt afgewezen (geen informatiewinst).

#### FR-8: Outlier-audit op de referentiebibliotheek
Het systeem draait periodiek `[ASSUMPTION: wekelijks]` een outlier-audit over alle actieve referenties per klasse en markeert afwijkende referenties voor beoordeling door de datamanager; de audit zelf deactiveert niets automatisch `[ASSUMPTION: outlier-criterium = afstand tot het klasse-centrum in het bovenste 5%-percentiel van de klasse of boven een absolute afstandsgrens — startwaarden, te kalibreren op de gold-set]`.

**Consequences (testable):**
- Een referentie die ver van zijn klasse-centrum ligt verschijnt als outlier-melding in het dashboard met vergelijkingsbeeld.
- De audit bestrijkt óók handmatig gecureerde referenties (het RECYCLABLE-incident betrof een handmatig geplaatste referentie).

#### FR-9: Hard-negative-geheugen
Het systeem bewaart elke door een mens afgewezen kandidaat — quarantaine-afkeuring door de datamanager en reviewstation-reject wegens "geen keurmerk" — permanent als hard-negative en sluit hernominatie van dezelfde crop uit. Zachte poort-afwijzingen (`cap-bereikt`, `duplicaat`, `outlier`) worden géén hard-negative: de kandidaat krijgt status `rejected` mét reden en kan later opnieuw kandidaat worden.

**Consequences (testable):**
- Een eerder door een mens afgewezen crop (zelfde bronbestand + bbox `[ASSUMPTION: identiteit via inhouds-hash van de crop — nieuw te bouwen; de bestaande opslagsleutel hasht bron+bbox, niet de beeldinhoud]`) wordt bij een latere run niet opnieuw genomineerd.
- Een zacht afgewezen kandidaat (cap/duplicaat/outlier) komt niet in het hard-negative-register; hernominatie verloopt via status-reset van de bestaande kandidaat-rij (geen nieuwe insert).
- Hard-negatives zijn exporteerbaar als trainingsmateriaal voor de gate; de export bevat uitsluitend de door een mens afgewezen categorie.

### 4.3 Meegroeiende gold-set

**Description:** De gold-set (91 samples) is als noodrem te dun voor een vliegwiel op schaal. Elke menselijke beslissing die het systeem toch al kent — reviewstation-accepts en -rejects, quarantaine-beoordelingen — is een gratis, al gevalideerde gold-set-kandidaat. Dit feature maakt van de gold-set een groeiend meetinstrument met een bewaakte samenstelling, zodat de regressietest (FR-3) statistisch dragend wordt én blijft.

**Functional Requirements:**

#### FR-10: Automatische gold-set-aanwas uit reviewbeslissingen
Het systeem voegt elke expliciete menselijke reviewbeslissing (accept → ECHT, reject → VALS) als kandidaat toe aan de gold-set, met bron en beslisser vastgelegd.

**Consequences (testable):**
- Een reviewstation-beslissing resulteert in exact één gold-set-record met label, crop-verwijzing, T3777-code en herkomst.
- Gold-set-records zijn onveranderlijk na opname; correcties gebeuren via een nieuw record dat het oude vervangt, met beide bewaard.

#### FR-11: Gold-set-samenstelling bewaakt
Het systeem bewaakt de verdeling van de gold-set (ECHT/VALS-ratio, klasse-spreiding) en rapporteert scheefgroei in het dashboard `[ASSUMPTION: signaal bij klassen die >20% van de set uitmaken of bij ECHT-aandeel buiten 60–90%]`.

**Consequences (testable):**
- Het dashboard toont actuele gold-set-omvang, ECHT/VALS-verdeling en de top-5 meest/minst vertegenwoordigde klassen.
- Promotie van een klasse zonder enige gold-set-dekking wordt gemarkeerd `[ASSUMPTION: markeren, niet blokkeren — blokkeren zou de bootstrap van nieuwe klassen (§4.4) onmogelijk maken]`.

### 4.4 Seed-bootstrap voor lege klassen

**Description:** Klassen zonder actieve referenties kunnen per definitie niet via de promotielus groeien (geen match zonder referentie). De seed-bootstrap doorbreekt dat: het schone gids-logo (GS1 Label Guide) dient als tijdelijk zoekzaad, het zoekgebied is beperkt tot GTINs die de code déclareren, en alleen ondubbelzinnige vondsten worden kandidaat-referentie. Het zaad zelf wordt nooit actieve referentie (gedocumenteerde domain-gap: gids-logo's matchen slecht op drukwerk; het eigen 12.3-experiment bewees dit). Gevonden kandidaten volgen de normale kwaliteitspoort. Realiseert UJ-2.

**Functional Requirements:**

#### FR-12: Bootstrap-run per lege klasse
Het systeem kan voor een T3777-code zonder actieve referenties een bootstrap-run uitvoeren: zoeken met het gids-logo als zaad, uitsluitend binnen declarerende GTINs, en vondsten boven de bootstrap-drempel nomineren als kandidaat-referentie `[ASSUMPTION: bootstrap-drempel 0,93 — strenger dan de reguliere promotiedrempel omdat het zaad-signaal zwakker is; te kalibreren op de eerste bootstrap-runs]`.

**Consequences (testable):**
- Een bootstrap-run kan niet buiten declarerende GTINs zoeken.
- Het gids-logo zelf komt nooit als actieve referentie in de bibliotheek; het is uitsluitend zoekinstrument.
- Bootstrap-kandidaten doorlopen dezelfde kwaliteitspoort als reguliere kandidaten en zijn in het evidence-contract herkenbaar als bootstrap-herkomst.
- Een bootstrap-run die nul kandidaten oplevert wordt vastgelegd als `leeg` en de klasse keert terug in de wachtrij; synthetische context-expansie als overbrugging voor zulke klassen is een geagendeerde vervolgoptie (addendum §5), geen v1-gedrag.

#### FR-13: Bootstrap-prioritering op declaratiefrequentie
Het systeem prioriteert bootstrap-runs op declaratiefrequentie in het GTIN-universum, zodat de meest voorkomende ongedekte keurmerken het eerst gevuld worden; de datamanager kan de volgorde overrulen en klassen uitsluiten.

**Consequences (testable):**
- Het dashboard toont de bootstrap-wachtrij: klasse, declaratiefrequentie, status (wachtend/gedraaid/gevuld/leeg/uitgesloten).
- Een geslaagde bootstrap (klasse van 0 naar ≥1 actieve referentie) verschijnt als "nieuw geactiveerde klasse" in het dashboard.

### 4.5 Mismatch-triggers als brandstof- en signaalstroom

**Description:** Structurele verschillen tussen declaratie en detectie zijn geen ruis maar de twee waardevolste datastromen van het vliegwiel (het trigger-mining-patroon uit de data-engine-literatuur). *Gedeclareerd-niet-gevonden* betekent: het keurmerk stáát er vermoedelijk, maar het systeem kan het niet vinden — gerichte werkvoorraad voor bootstrap (lege klasse) of referentie-aanvulling (zwakke klasse). *Gevonden-niet-gedeclareerd* betekent: mogelijk een declaratie-omissie bij de leverancier — een datakwaliteitssignaal. Beide stromen worden vastgelegd, geaggregeerd en in het dashboard ontsloten; v1 rapporteert alleen (geen automatische actie richting leverancier).

**Functional Requirements:**

#### FR-14: Registratie en aggregatie van mismatch-triggers
Het systeem legt per verwerkte GTIN beide mismatch-typen vast en aggregeert ze per T3777-code en per informatieleverancier (GLN).

**Consequences (testable):**
- Elke verwerking met declaratie produceert per gedeclareerde code een uitkomst: bevestigd, niet-gevonden, of niet-ondersteund (geen actieve referentie).
- Het dashboard toont per klasse de verhouding bevestigd/niet-gevonden en de trend over tijd.

#### FR-15: Gedeclareerd-niet-gevonden voedt de werkvoorraad
Het systeem vertaalt structurele gedeclareerd-niet-gevonden-patronen automatisch naar werkvoorraad: bootstrap-nominatie voor klassen zonder referenties, aanvul-signaal voor klassen met zwakke dekking `[ASSUMPTION: "structureel" = code ≥N keer gedeclareerd-niet-gevonden over ≥M verschillende GTINs; N=10, M=5 bij start]`.

**Consequences (testable):**
- Een klasse die de structureel-drempel passeert verschijnt automatisch in de bootstrap-wachtrij (FR-13) of als aanvul-signaal.
- De koppeling is herleidbaar: vanuit het signaal zijn de onderliggende GTINs en verwerkingen opvraagbaar.

#### FR-16: Gevonden-niet-gedeclareerd als datakwaliteitsrapport
Het systeem stelt per periode een datakwaliteitsrapport samen van hoogbetrouwbare gevonden-niet-gedeclareerd-gevallen, gegroepeerd per informatieleverancier, exporteerbaar door de datamanager.

**Consequences (testable):**
- Alleen detecties boven de promotiedrempel (FR-5) tellen mee (lage-confidence-vondsten vervuilen het rapport niet).
- Het rapport bevat per geval GTIN, code, confidence en bronbestand — voldoende voor menselijke verificatie richting leverancier.

### 4.6 Vliegwiel-dashboard en besturing

**Description:** De datamanager bestuurt het vliegwiel in plaats van het te moeten vertrouwen. Eén dashboard toont de gezondheid (gold-set-trend, promotievolume, quarantaines, caps, outliers, bootstrap-wachtrij, mismatch-stromen) en biedt de bedieningselementen: quarantaine-afhandeling, rollback, drempelbeheer, pauzeknop. Realiseert UJ-1, UJ-3.

**Functional Requirements:**

#### FR-17: Vliegwiel-dashboard
De datamanager ziet in één overzicht: gold-set-precisietrend, promoties per periode en per klasse, batches in quarantaine met faalreden, klassen aan hun cap, openstaande outlier-meldingen, bootstrap-wachtrij en mismatch-trends.

**Consequences (testable):**
- Elke quarantainebatch is vanuit het dashboard te openen met per kandidaat het volledige bewijs (crop-beeld, referentievergelijking, declaratie, scores, poort-uitkomsten).
- De gold-set-precisietrend toont per gepasseerde batch een meetpunt; regressies zijn visueel herkenbaar.

#### FR-18: Quarantaine-afhandeling
De datamanager kan een quarantainebatch per kandidaat beoordelen: afkeuren (wordt hard-negative) of alsnog vrijgeven; vrijgegeven kandidaten vormen een nieuwe batch die opnieuw door de kwaliteitspoort gaat.

**Consequences (testable):**
- Vrijgave omzeilt de kwaliteitspoort niet: ook een vrijgegeven kandidaat wordt pas actief na een gepasseerde regressietest.
- Afgekeurde kandidaten volgen FR-9 (hard-negative, nooit hernominatie).

#### FR-19: Pauzeknop en automatische stilstand
De datamanager kan het vliegwiel pauzeren (nominatie en promotie stoppen; detectie en trainingsdata-registratie lopen door). Het systeem pauzeert zichzelf automatisch bij K opeenvolgende gequarantaineerde batches `[ASSUMPTION: K=2]`.

**Consequences (testable):**
- In gepauzeerde toestand ontstaan geen nieuwe kandidaat-referenties en promoveert niets; hervatten vereist een expliciete actie van de datamanager.
- Automatische stilstand produceert een notificatie met de aanleiding.

### 4.7 Brandstofvergroting

**Description:** Het vliegwiel is zo productief als zijn aanvoer. De dubbele bevestiging ontstaat uitsluitend in de artwork-import-/detectie-flow (waar de crosscheck draait) — de nachtelijke harvest produceert géén dubbel bevestigde detecties maar review-items voor menselijke beoordeling (die via FR-10 de gold-set voeden). Drie maatregelen vergroten de aanvoer: (1) het kruischeck-endpoint (Story 12.8) levert bij elke n8n-aanroep dubbel bevestigde detecties — die voeden voortaan de nominatiestroom (100–200 producten/dag); (2) reguliere en hernieuwde artwork-imports blijven de tweede stroom; (3) de GLN-dekkingsblokkade op het historische 39k-archief wordt opgeheven, zodat ook die etiketten declaratie-lookup en dus dubbele bevestiging kunnen krijgen. `[ASSUMPTION: de 39k-verwerking zelf (bulk-run) blijft een aparte operationele activiteit buiten dit PRD; dit PRD levert de GLN-dekking die hem zinvol maakt]`

**Functional Requirements:**

#### FR-20: Kruischeck-verdicts voeden de nominatiestroom
Het systeem nomineert CONFIRMED-verdicts uit het kruischeck-endpoint (12.8) die de promotiedrempel halen als kandidaat-referentie, via hetzelfde pad als FR-1.

**Consequences (testable):**
- Een n8n-verificatierun met CONFIRMED-verdicts boven de promotiedrempel produceert overeenkomstige kandidaat-referenties met evidence-contract-herkomst `kruischeck`.
- Deze voeding is een expliciete, geconfigureerde uitbreiding op het 12.8-contract: dat contract specificeert het endpoint als vrij van neveneffecten, dus nominatie staat achter een configuratievlag `[ASSUMPTION: vlag default uit tot de promotielus op de harvest-/importstroom bewezen is]`; met de vlag uit blijft 12.8 exact contract-conform.
- Het aan- of uitzetten van deze voeding beïnvloedt de verdict-responses richting n8n op geen enkele wijze.

#### FR-21: GLN-dekking voor het historische archief
Het systeem kan voor artwork-records zonder GLN de GLN alsnog vaststellen, zodat declaratie-lookup (en daarmee dubbele bevestiging) mogelijk wordt voor het 39k-archief `[ASSUMPTION: primair via batch-backfill uit de tradeItems-bron; de precieze route is een architectuurkeuze — zie addendum]`.

**Consequences (testable):**
- Na de backfill-run heeft elk archief-record óf een GLN óf een gemarkeerde uitvalreden `[ASSUMPTION: doel ≥90% GLN-dekking; het restant expliciet gemarkeerd]`; de dekkingsgraad is zichtbaar in het dashboard.
- Records waarvoor geen GLN vast te stellen is, zijn gemarkeerd met reden en tellen niet mee als stille uitval.

## 5. Non-Goals (Explicit)

- **Geen modeltraining of hertraining.** Het vliegwiel verbetert herkenning uitsluitend via de referentiebibliotheek; de retraining-pijplijn (Epic 9) is een gescheiden traject.
- **Geen automatische communicatie richting leveranciers.** Het datakwaliteitssignaal (FR-16) is een intern rapport; terugkoppeling naar dataproviders is menselijk werk, buiten dit systeem.
- **Geen wijziging van de live-detectie-API of het reviewstation-proces.** Het vliegwiel hangt achter de bestaande flows; bestaande consumenten merken alleen betere herkenning. *Nuance:* de klik en het scherm van het reviewstation blijven gelijk, maar de báckend-bestemming van een accept verandert bij vlag-aan — nominatie (herkomst `review`) in plaats van de directe 12.3-registratie — en de reject-flow krijgt een minimale UI-uitbreiding (redenkeuze, alleen zichtbaar bij vlag-aan).
- **Geen vervanging van handmatige curatie.** De datamanager kan referenties blijven uploaden en beheren; promotie-referenties en gecureerde referenties bestaan naast elkaar (en gecureerde referenties winnen bij cap-conflicten, FR-6).
- **Geen embedding-backbone-migratie en geen zero-shot region proposer in dit PRD.** Beide zijn geagendeerde vervolgkansen (zie Open Questions), geen onderdeel van deze scope.
- **Geen verwerking van de 39k-bulk zelf.** Dit PRD maakt die verwerking zinvol (GLN-dekking); de bulk-run is operationeel vervolgwerk.

## 6. MVP Scope

### 6.1 In Scope

- Promotielus met escalatiemodel: nominatie, promotiebatch, kwaliteitspoort met gold-set-regressietest, quarantaine, rollback (FR-1 t/m FR-4)
- Guardrails: promotiedrempel, per-klasse caps, tweetraps-dedup, outlier-audit, hard-negative-geheugen (FR-5 t/m FR-9)
- Meegroeiende gold-set uit reviewbeslissingen + samenstellingsbewaking (FR-10, FR-11)
- Mismatch-registratie en -aggregatie + beide vervolgstromen in rapportvorm (FR-14 t/m FR-16)
- Vliegwiel-dashboard met quarantaine-afhandeling en pauzeknop (FR-17 t/m FR-19)
- Kruischeck-voeding (FR-20)

### 6.2 Out of Scope for MVP

- **Seed-bootstrap (FR-12, FR-13)** — vereist een werkende promotielus als fundament; direct erna oppakken. `[NOTE FOR PM: emotioneel load-bearing — de 15+ lege klassen waren de oorspronkelijke aanleiding; niet laten liggen na MVP.]`
- **GLN-backfill (FR-21)** — waardevol maar onafhankelijk van de lus; kan parallel of erna, zodra de architectuurroute gekozen is.
- Automatische verruiming van drempels op basis van stabiliteitshistorie — v1 houdt drempelbeheer volledig handmatig; automatisering pas als de datamanager het handmatige regime vertrouwt.
- Notificaties buiten het dashboard (mail/chat) — v1 signaleert in het dashboard; kanalen zijn v2.

## 7. Success Metrics

**Primary**
- **SM-1: Gold-set-precisie blijft ≥ baseline.** De precisie op de gold-set daalt op geen enkel meetmoment meer dan de tolerantie onder de baseline van vóór het vliegwiel. Valideert FR-3, FR-5 t/m FR-9. *Dit is de bestaansvoorwaarde: een vliegwiel dat kwaliteit kost is erger dan geen vliegwiel.*
- **SM-2: Dekkingsgroei zonder review.** Aantal actieve klassen en aantal actieve referenties uit promotie, per maand. Richtwaarde: ≥ 10 nieuwe promotie-referenties per week bij normale aanvoer `[ASSUMPTION: gebaseerd op ~500–1000 auto-accepts/week; werkelijke nominatie-rate na drempels is onbekend tot de eerste weken draaien]`. Valideert FR-1, FR-2, FR-20.
- **SM-3: Bevestigingsgraad stijgt.** Het aandeel gedeclareerde codes dat bij verwerking bevestigd wordt (CONFIRMED-ratio) stijgt maand-op-maand in de eerste drie maanden na activering. Valideert de vliegwiel-hypothese als geheel (betere referenties → betere bevestiging). *Meetmethode:* gemeten op een vast controle-cohort GTINs dat periodiek herverwerkt wordt, zodat de stijging toe te schrijven is aan referentiegroei en niet aan een veranderde productmix `[ASSUMPTION: cohort ~100 GTINs, maandelijkse herverwerking]`.

**Secondary**
- **SM-4: Gold-set-groei.** Gold-set-omvang groeit van 91 naar ≥ 300 samples binnen drie maanden na MVP `[ASSUMPTION: haalbaar bij ~50–200 reviewbeslissingen/week]`. Valideert FR-10.
- **SM-5: Bestuurbaarheid.** Elke quarantainebatch is binnen 5 werkdagen afgehandeld; automatische stilstanden zijn binnen 1 werkdag opgevolgd. Valideert FR-17 t/m FR-19.

**Counter-metrics (do not optimize)**
- **SM-C1: Promotievolume.** Aantal promoties is géén doel; sturen op volume nodigt uit tot drempelverlaging en dat is precies de faalwijze. Counterbalanceert SM-2.
- **SM-C2: Quarantaine-ratio ≈ 0 is verdacht.** Een poort die nooit iets tegenhoudt is waarschijnlijk te soepel afgesteld; een gezonde lus kent afwijzingen. Counterbalanceert SM-5.

## 8. Open Questions

- **OQ-1 — Regressietest-methodiek [BESLECHT]:** de tolerantie is sample-gebaseerd zolang de set klein is — quarantaine bij ≥2 netto verslechterde gold-set-samples; de 1pp-drempel geldt pas vanaf een actieve gold-set ≥200 samples. Per-klasse-meting met eigen tolerantie blijft de vervolgvraag zodra de set dat draagt.
- **OQ-2 — Batch-cadans en -grootte:** dagelijkse batches verondersteld; werkelijke optimum (grootte vs. meetkosten van de regressietest) bepalen in de eerste draai-weken.
- **OQ-3 — GLN-backfill-route:** batch-export uit de productbron vs. re-import vs. externe lookup — architectuurkeuze met governance-implicaties (prod-toegang). → `bmad-architecture`.
- **OQ-4 — DINOv2-spike:** embedding-backbone-vergelijking op de gold-set als aparte, goedkope spike agenderen (potentieel grote versneller, geen voorwaarde).
- **OQ-5 — Zero-shot region proposer:** kandidaat-vervolgtraject om de lokalisatie-bottleneck (~28s/beeld, lineair in referentie-aantal) te doorbreken naarmate de bibliotheek groeit — apart onderzoeken.
- **OQ-6 — Referentie-veroudering:** schema-eigenaren reviseren beeldmerken periodiek; is de outlier-audit (FR-8) hiervoor afdoende signaal of is actief versie-/vervalbeheer per referentie nodig?
- **OQ-7 — AI Act-toets bij externe sturing:** zodra vliegwiel-gevoede verdicts externe klantprocessen gaan sturen (n8n-afnemers voorbij intern gebruik), is een juridische toets op de AI Act-classificatie nodig; tot die tijd volstaan de bestaande logging- en oversight-invarianten.

## 9. Assumptions Index

- §4.1 — dagelijkse batch-cadans als zelfstandige nachtelijke job (harvest is géén nominatiebron).
- §4.1 FR-3 — regressietolerantie sample-gebaseerd bij kleine set (quarantaine bij ≥2 netto verslechterde gold-set-samples); de 1pp-drempel pas vanaf een actieve gold-set ≥200 samples (OQ-1 beslecht).
- §4.2 FR-5 — startdrempel promotie 0,90 (embedding); verruiming pas na stabiele historie.
- §4.2 FR-6 — per-klasse cap 10 bij start; geteld over actieve promotie-referenties — rollback en deactivatie geven ruimte terug (bewust strenger dan de per-run harvest-cap van 25).
- §4.2 FR-7 — dedup-startwaarden: perceptual-hash strakke Hamming-drempel; embedding-gelijkenis ≥ 0,97 binnen klasse; kalibreren op gold-set.
- §4.2 FR-8 — outlier-audit wekelijks; criterium: bovenste 5%-percentiel afstand tot klasse-centrum of absolute grens; kalibreren op gold-set.
- §4.2 FR-9 — crop-identiteit via inhouds-hash (nieuw te bouwen; bestaande sleutel hasht bron+bbox).
- §4.3 FR-11 — scheefgroei-signalen: klasse >20% van de set; ECHT-aandeel buiten 60–90%; klasse-zonder-dekking markeren, niet blokkeren.
- §4.4 FR-12 — bootstrap-drempel 0,93, strenger dan promotiedrempel; kalibreren op eerste runs.
- §4.5 FR-15 — structureel-drempel N=10 declaraties-niet-gevonden over M=5 GTINs.
- §4.6 FR-19 — automatische stilstand na K=2 opeenvolgende quarantaines.
- §4.7 — 39k-bulk-verwerking zelf buiten scope; GLN-route is architectuurkeuze.
- §4.7 FR-20 — kruischeck-nominatievlag default uit tot de promotielus op de import-/detectiestroom bewezen is.
- §4.7 FR-21 — GLN-dekkingsdoel ≥90%; restant expliciet gemarkeerd.
- §7 SM-2 — richtwaarde ≥10 promotie-referenties/week, gebaseerd op geschatte auto-accept-volumes.
- §7 SM-3 — controle-cohort ~100 GTINs met maandelijkse herverwerking als attributiemethode.
- §7 SM-4 — gold-set-groei naar ≥300 in 3 maanden bij geschatte reviewvolumes.

## Why Now

Drie lijnen komen samen. (1) **De bouwstenen zijn er net:** crosscheck (8.5), provenance-registratie (8.6), gate-v2 (12.4), declaratie-prior (12.7) en het kruischeck-endpoint (12.8, ready-for-dev) vormen samen ~80% van een data-engine; alleen de promotielus ontbreekt. (2) **De aanvoer start nu:** n8n gaat 100–200 producten/dag aanleveren — zonder vliegwiel verdampt de leerwaarde van elke aanroep. (3) **Regulatoire deadline:** de ECGT-richtlijn maakt vanaf 27 september 2026 geverifieerde duurzaamheidslabels handhaafbaar compliance-terrein; een systeem dat keurmerk-aanwezigheid herleidbaar bewijst, stijgt dan direct in waarde.

## Cross-Cutting NFRs

- **Herleidbaarheid:** elke actieve referentie uit promotie is via zijn evidence-contract terug te voeren tot bron-GTIN, bronbestand, bbox, scores, declaratie-uitkomst en poort-resultaten. Geen referentie zonder herkomst.
- **Fail-closed:** elk defect in de kwaliteitspoort (meting faalt, dienst onbereikbaar) blokkeert promotie; nooit "bij twijfel door".
- **Isolatie:** vliegwiel-verwerking (nominatie, poort, audits) draait gescheiden van de live-detectiestroom en mag die niet vertragen.
- **Idempotentie:** herverwerking van dezelfde GTIN of herstart van een batch-run leidt niet tot dubbele nominaties of dubbele promoties.
- **Observability:** poort-uitkomsten, drempelwijzigingen, pauzes/hervattingen en rollbacks zijn gelogd en opvraagbaar; het dashboard is daarvan de leesbare projectie.
- **Bronrestrictie gids-logo's:** beeldmateriaal uit de GS1 Label Guide en van schema-eigenaren wordt uitsluitend intern gebruikt als zoek- en vergelijkingsinstrument; het wordt niet gepubliceerd of extern ontsloten — ook niet via exports (FR-16-rapporten bevatten eigen crops, nooit gids-beelden).

## Risk and Mitigations

| Risico | Kans | Impact | Mitigatie |
|---|---|---|---|
| Zelfversterkende fout (besmette referentie versterkt zichzelf) | Middel | Hoog | Escalatiemodel + regressietest (FR-3), caps (FR-6), dedup (FR-7), outlier-audit (FR-8), automatische stilstand (FR-19) |
| Declaratie-fouten (zelfrapportage, 5–10% generieke invoerfout) vervuilen nominaties | Middel | Middel | Dubbele bevestiging blijft tweezijdig; strenge promotiedrempel (FR-5); regressietest vangt structurele vervuiling |
| Gold-set te dun → regressietest mist kleine degradaties | Hoog (bij start) | Middel | FR-10/FR-11 laten de set groeien; tot die tijd strenge drempels en lage caps; per-klasse-meting als vervolgvraag (OQ-1) |
| Klasse-onbalans (RECYCLABLE: 8.643 declaraties) domineert de aanvoer | Hoog | Middel | Per-klasse caps (FR-6); dashboard-zicht op verdeling (FR-17) |
| Dashboard wordt genegeerd → vliegwiel draait onbestuurd | Laag | Middel | Automatische stilstand (FR-19) begrenst onbeheerde schade; SM-5 bewaakt afhandeltermijnen |
| Referentie-veroudering: schema-eigenaren reviseren beeldmerken → verouderde referenties matchen slechter of verkeerd | Middel | Middel | Outlier-audit (FR-8) als eerstelijnssignaal; actief versie-/vervalbeheer als vervolgvraag (OQ-6) |
| T3777-codelijst-churn (ECGT maakt labels illegaal; codes gedeprecieerd/hernoemd) raakt caps, referenties en gold-set per code | Middel | Laag-middel | Alias-/deprecatiemechanisme (12.8 AC3) als fundament; vliegwiel-administratie volgt de alias-mapping |
| AI Act-herclassificatie zodra vliegwiel-gevoede verdicts externe (klant)processen sturen | Laag | Middel | Juridische toets vóór externe productisering (OQ-7); logging en human-oversight-capability zijn al ontwerp-invarianten |

## Integration and Dependencies

- **Bestaand, ongewijzigd benut:** crosscheck/dubbele bevestiging (Story 8.5), trainingsdata-registratie met provenance (8.6), declaratie-provider met cache (8-3D), gate-v2 (12.4), reviewstation (Epic 8/12). De nachtelijke harvest (12.6) blijft ongewijzigd draaien, maar in zijn werkelijke rol: hij levert review-items voor menselijke beoordeling — die beslissingen voeden gold-set (FR-10) en hard-negatives (FR-9), niet de nominatiestroom.
- **Afhankelijk van:** kruischeck-endpoint (Story 12.8, ready-for-dev) voor de dagelijkse nominatiestroom (FR-20) — het vliegwiel werkt ook zonder (import-/detectiestroom), maar de dagelijkse aanvoer komt uit 12.8. De daarvoor benodigde uitbreiding van het 12.8-contract (configuratievlag) staat beschreven bij FR-20; het n8n-team is te informeren partij over deze contractuitbreiding (het vlag-gedrag wordt gedocumenteerd in de 12.8-API-docs). Het alias-/deprecatiemechanisme (12.8 AC3) is tevens het fundament voor codelijst-churn-bestendigheid.
- **Raakt (nieuwbouw):** het vliegwiel vereist nieuwe gegevensstructuren — kandidaat-status en herkomst op referenties, promotiebatches, evidence-contracten, hard-negative-register en een beheerde gold-set-opslag (de huidige gold-set is een statisch repository-bestand en kan FR-10-groei niet dragen; migratieroute is een architectuurkeuze). Randvoorwaarde: databasemigraties vereisen per teamafspraak expliciete toestemming per geval. Verder: reviewstation (reviewbeslissingen krijgen een tweede bestemming: gold-set) en dashboard-frontend (nieuw scherm). Ook geabsorbeerd wordt het bestaande 12.3-pad (reviewstation-accept → directe referentie-registratie door ml-service): bij hoofdvlag-aan wordt een accept een nominatie met herkomst `review` in plaats van een directe registratie; bij vlag-uit blijft het legacy-gedrag ongewijzigd.
- **Extern:** GS1 Label Guide als zaad-bron (bootstrap, uitsluitend intern gebruik); tradeItems/catalogus als declaratie-bron (bestaand).
