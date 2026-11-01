---
id: SPEC-spike-getrainde-detector
title: "Proef: herkent een getrainde detector onze keurmerken betrouwbaarder dan de huidige route?"
type: spike (gereedschap + draaiplan; het experiment zelf draait daarna)
datum: 2026-10-31
bijgewerkt: 2026-11-01 (besluiten Friso: licenties, maat N, steekproef bij nakijken; ronde 3: grens voorinvulling $65, verzoekgrootte, klaar-teken invulpagina)
peildatum_code: origin/acc 8c9373d
companions:
  - meetregels.md
  - toetsset.md
  - trainingsset-en-herkenning.md
  - randvoorwaarden.md
sources:
  - ../research/technical-keurmerkherkenning-zonder-training-2026-10-31/research.md
  - ../research/technical-keurmerkherkenning-zonder-training-2026-10-31/meting-etiketbestanden-2026-10-31.md
  - ../spike-architectuurkeuze-logoherkenning/BESLISRAPPORT.md
---

> **Bindend contract.** Deze SPEC en de bestanden onder `companions:` vormen samen het volledige, op volledigheid gecontroleerde contract voor wat er gebouwd, getoetst en gevalideerd wordt. De bronnen onder `sources:` dienen alleen voor herleidbaarheid; lees ze alleen voor achtergrond die dit contract bewust weglaat.

# Proef getrainde detector voor keurmerken

## Why

Er is een probleem en een eis van de producteigenaar. Een keurmerk mag pas "automatisch" als het aantoonbaar ≥ 80% gevonden haalt en < 10% vals ([meetregels.md §1](meetregels.md#1-definities-vaste-keuze-friso-31-10-2026)). De huidige route K4-aa (een taalmodel zoekt en benoemt het keurmerk, een beeldvergelijker, SigLIP 2, controleert) vond in de vorige proef (fase B) 144 van 161 combinaties van etiket en keurmerk die de AI had gelabeld. Het vals-aandeel is niet bewezen, en de grootste bron van valse meldingen is een tweede vakje dat naast het echte keurmerk ligt. Het onderzoek van 31-10 adviseert route D (een getrainde detector met vrije licentie) plus route A (verplichte certificaatnummers, zoals een MSC- of biocode, gelezen uit het etiketbestand), met een taalmodel alleen als beoordelaar van twijfelgevallen. Niemand heeft dat per keurmerk gemeten. Deze proef levert het gereedschap en het draaiplan om het te meten op een door Friso bevestigde toetsset, naast de huidige route.

## Capabilities

- **CAP-1** — scheiding training/toets ([toetsset.md §2](toetsset.md#2-scheidingseenheid-de-leverancier-gln))
  - **intent:** elk etiket hoort bij precies één kant, met de leverancier (GLN) als eenheid, zodat de toets geen productfamilie bevat die de detector in training zag.
  - **success:** `scheiding.json` volgens de regel; tests bewijzen: geen leverancier aan beide kanten; geen GTIN (productnummer achter de streepjescode) uit referenties of `training_data` en geen doc uit de fase-B-meetset in de toets; nul uitgesloten GTIN's is een fout; een mini-set waarop een gulzige keuze en de uitputtende zoektocht verschillen geeft de uitputtende uitkomst; dezelfde invoer geeft dezelfde indeling; trainings- en validatiebeelden die vrijwel gelijk zijn aan een toetsbeeld (dHash-afstand ≤ 6) gaan eruit. Een lokale controle op de echte invoer reproduceert de tabel (zwakste waarde 16,5).
- **CAP-2** — toetskandidaten met AI-voorinvulling ([toetsset.md §4–5](toetsset.md#4-kandidaten-voor-de-toets-cap-2))
  - **intent:** per keurmerk genoeg kandidaat-etiketten van toetsleveranciers, met per etiket een AI-oordeel over de 8 keurmerken.
  - **success:** kandidatenlijst ontdubbeld op GTIN en beeld, tot 40 per keurmerk plus tot 10 met een gelijkend keurmerk; per etiket een voorinvulling (8 keurmerken, Nutri-Score-letters, hinttegels (de tegels, dus vaste uitsneden van het etiket, waarin het model het keurmerk zag), model, kosten) door een ander model dan het taalmodel van K4-aa, via de gedeelde client met zdr (zero data retention: de aanbieder bewaart de beelden niet), met overzicht en tegels als JPEG en per verzoek hoogstens 16 tegels en 20.000.000 bytes aan beelden ([randvoorwaarden.md §5](randvoorwaarden.md#5-verzoekgrootte)); tests tonen het beeldtype, de grens en de splitsing over extra aanroepen (hinttegels op etiketindex); een rapport telt per keurmerk de etiketten waarop het volgens de voorinvulling waarschijnlijk staat, en meldt stoppunt 2 bij minder dan 16.
- **CAP-3** — invulpagina voor Friso ([toetsset.md §6](toetsset.md#6-invulpagina-voor-friso-cap-3))
  - **intent:** Friso bevestigt of corrigeert per etiket snel welke van de 8 keurmerken erop staan, en wat hij typt raakt nooit kwijt.
  - **success:** servertests bewijzen: elke keuze landt atomisch in `uitslag.json` volgens het schema; 8 gelijktijdige opslagen komen alle 8 aan; onbekende etiketten, ongeldige waarden en "bevestigd" zonder alle 8 keuzes worden geweigerd. Een browsertest (Playwright) bewijst: tijdens typen blijven cursor en tekst staan bij opslaan en tellerupdate; sneltoetsen doen niets in een tekstveld; na herladen met een andere serverstand staat het concept er nog; de pagina wordt pas bruikbaar als sneltoetsen en invoer gekoppeld zijn (klaar-teken), elke browsertest wacht na laden en herladen op dat klaar-teken, en een sneltoets direct na het klaar-teken werkt ook als `items.json` later binnenkomt dan `/stand`; lukt het laden niet, dan blijft de pagina onbruikbaar en zegt dat. De pagina toont per keurmerk de stand ten opzichte van het doel (≥ 16 mét, ≥ 50 zonder).
- **CAP-4** — nagemaakte trainingsbeelden ([trainingsset-en-herkenning.md §2–3](trainingsset-en-herkenning.md#2-logobronnen-en-referentieplaatjes-buiten-de-repository-proef_maplogos))
  - **intent:** trainingstegels met officiële logo's in alle varianten op gescreende echte etiketachtergronden, met harde negatieven (gelijkende keurmerken die bewust ongelabeld worden toegevoegd zodat de detector ze leert negeren) en lege tegels.
  - **success:** COCO-uitvoer; tests bewijzen: elk geplakt exemplaar van een klasse gelabeld, gelijkende keurmerken ongelabeld, geplakte objecten overlappen niet, 0–10% lege tegels, varianten kleur/zwart-wit/lijn/negatief aanwezig, elke bron met een GTIN hoort bij een trainingsleverancier, achtergronden zonder gemeld keurmerk, vaste seed geeft identieke uitvoer.
- **CAP-5** — echte trainingsvoorbeelden ([trainingsset-en-herkenning.md §4](trainingsset-en-herkenning.md#4-echte-trainingsvoorbeelden-cap-5))
  - **intent:** echte productie-etiketten van trainingsleveranciers met AI-vakjes (kaders die een taalmodel om elk gevonden keurmerk tekent) als trainingsmateriaal, plus een validatieset.
  - **success:** voorlabels via de gedeelde client, met dezelfde verzoekregel als CAP-2 ([randvoorwaarden.md §5](randvoorwaarden.md#5-verzoekgrootte)); tests bewijzen: de grens en de splitsing met juiste vakjescoördinaten; geen toetsleverancier in de uitvoer; tegels die een onzeker vakje raken vallen af; validatiesplit per klasse op dHash-cluster. Een rapport geeft per keurmerk het aantal overgebleven echte etiketten en vakjes.
- **CAP-6** — training van de detector ([trainingsset-en-herkenning.md §5](trainingsset-en-herkenning.md#5-detector-en-training-cap-6))
  - **intent:** een RF-DETR-model (maat N; S/M/L alleen na een nieuw besluit van Friso) op tegels, eerst op nagemaakte beelden en daarna bijgetraind op echte, reproduceerbaar.
  - **success:** trainingscommando met configuratie, seed, log, checkpoint, sha256 en gewichtsherkomst; een andere maat dan N wordt geweigerd zonder vastgelegde besluitverwijzing; een snelheidsmeting op de grafische chip van de Mac (MPS) met de verwachte duur; rooktest: een paar iteraties op een kleine lokale set leveren een checkpoint dat de herkenning kan laden.
- **CAP-7** — herkenning op het hele etiket ([trainingsset-en-herkenning.md §6 en §8](trainingsset-en-herkenning.md#6-herkenning-op-het-hele-etiket-cap-7))
  - **intent:** de detector loopt op de processor in tegels over het hele etiket en geeft per code een melding, een twijfelgeval of niets; een certificaatnummer kan een twijfelgeval bevestigen.
  - **success:** tests op verzonnen beelden en scores bewijzen: tegelomrekening, samenvoegen van overlappende vakjes (ook over de Nutri-Score-letters), de bandregel, het afleiden van `laag`/`hoog` uit een mini-validatieset met bekende uitkomst (ook de terugval naar gezamenlijke drempels en `hoog` = 1,01), en dat een certificaatnummer een twijfelgeval alleen kan bevestigen en nooit een melding weghaalt.
- **CAP-8** — taalmodel-beoordelaar ([trainingsset-en-herkenning.md §7](trainingsset-en-herkenning.md#7-beoordelaar-taalmodel-cap-8))
  - **intent:** een twijfelgeval wordt ja/nee/twijfel beoordeeld door een taalmodel dat de uitsnede en het referentieplaatje als losse beelden krijgt.
  - **success:** tests bewijzen: twee losse beelden, JSON-schema met ja/nee/twijfel, alleen `ja` wordt een melding, een ongeldig antwoord is een fout en geen `nee`, kandidaten per code van hoog naar laag tot `ja`, hoogstens 10 per etiket.
- **CAP-9** — telling, stopregel en vergelijking ([meetregels.md](meetregels.md))
  - **intent:** per keurmerk gevonden en vals met Wilson-grenzen, kosten en tijd per etiket, en het besluit volgens de stopregel, voor D+A, D en K4-aa op dezelfde toetsset.
  - **success:** één getoetst script maakt uit bevroren uitvoer en `uitslag.json` de tabellen van [meetregels.md §7](meetregels.md#7-uitvoer-per-route-en-keurmerk) en de blinde nakijklijst met de steekproef van overeenkomende paren ([meetregels.md §6](meetregels.md#6-bevriezing-en-eenmalige-toetsrun-cap-11)): steekproef per keurmerk en kant met vaste seed in de code (dezelfde trekking in elk proces), regels niet te onderscheiden (sleutel en `verschil.json` in een aparte map), een oordeel voor elke regel verplicht, steekproefuitslag apart, en de besluitregel met tweede ronde en "mens bevestigt (voorlopig)". Tests met verzonnen mini-sets bewijzen: de definities, de Nutri-Score-groep (verkeerde letter = gemist, D/E = zonder), gedeelde negatieven (een etiket telt als "zonder" voor elk keurmerk dat Friso afwezig verklaarde), "onzeker" en "onleesbaar" uitgesloten, fouten als geen melding, foutpercentage boven 2% maakt de run ongeldig, een zdr-weigering stopt de run, "te weinig voorbeelden" onder 16 mét of 35 zonder, en het besluit bij de grensgetallen uit [meetregels.md §4](meetregels.md#4-benodigde-aantallen-wilson-95-nagerekend-met-wilson-31-10-2026). Eén integratietest gaat van de server via `uitslag.json` naar dit script.
- **CAP-10** — draaiplan
  - **intent:** wie het experiment draait, weet per stap wat te draaien, wat eruit moet komen, wat het kost en wanneer te stoppen.
  - **success:** `DRAAIPLAN.md` in de specmap volgt de vaste volgorde uit [toetsset.md §4](toetsset.md#4-kandidaten-voor-de-toets-cap-2) en geeft per stap het commando, de verwachte uitvoer, de geschatte kosten en tijd, en de stoppunten; elke stap verwijst naar getest gereedschap uit deze build, of noemt uitdrukkelijk dat de stap ongetest is en waarom.
- **CAP-11** — bevriezing ([meetregels.md §6](meetregels.md#6-bevriezing-en-eenmalige-toetsrun-cap-11))
  - **intent:** wat de uitslag bepaalt, ligt vóór de eerste toetsrun vast, en de eerste toetsrun per route telt.
  - **success:** tests bewijzen: `bevroren.json` bevat de sha256 van alle onderdelen uit de lijst; een toetsrun met een gewijzigd onderdeel wordt geweigerd; een tweede toetsrun zonder `--herhaling` en reden wordt geweigerd; de eerste uitslag blijft bewaard.
- **CAP-12** — lokale K4-aa-runner ([trainingsset-en-herkenning.md §9](trainingsset-en-herkenning.md#9-vergelijking-met-de-huidige-route-k4-aa-cap-12))
  - **intent:** de huidige route draait lokaal over de bevestigde toetsset, met referenties die alleen van trainingsleveranciers of uit publieke bronnen komen.
  - **success:** tests met een nagebootste aanbieder bewijzen: alleen referenties van trainingsleveranciers en publieke bronnen worden geladen; elke detectie (ook "requires_review") wordt een melding; het tijdsbudget per etiket wordt doorgegeven; `budget_exhausted` is een routefout; `no_zdr_provider` stopt de run; uitvoer per etiket met kosten en tijd.
- **CAP-13** — licentiecontrole ([randvoorwaarden.md §4](randvoorwaarden.md#4-licenties-cap-13))
  - **intent:** geen pakket, gewicht of extern programma met een licentie buiten de toegestane lijst komt in de proef.
  - **success:** tests bewijzen: BSL-1.0 en CNRI-Python zijn toegestaan (besluit Friso 01-11-2026), andere licenties buiten de lijst niet; een verboden pakket of licentie stopt de controle; `AND`/`OR`-uitdrukkingen worden juist beoordeeld; een leeg licentieveld leidt naar het licentiebestand, en blijft het onbekend, dan stopt de controle; op de echte omgeving geeft de controle een rapport zonder overtredingen.
- **CAP-14** — uitgavenbewaking ([randvoorwaarden.md §3](randvoorwaarden.md#3-kosten-cap-14))
  - **intent:** geen post geeft meer uit dan zijn grens: 1,5× de raming, tenzij Friso een vaste grens besliste ([randvoorwaarden.md §3](randvoorwaarden.md#3-kosten-cap-14)).
  - **success:** tests bewijzen: de voorinvulling gebruikt standaard de vaste grens van $65 (besluit Friso 01-11-2026); een andere grens alleen met een besluitverwijzing; de startprojectie telt per open etiket zijn aanroepen; een post met een verwachte uitgave boven de grens start niet; de aanroep die de grens zou passeren wordt niet verstuurd; kosten komen uit `usage.cost`, anders uit tokens × tarief.
- **CAP-15** — beelden ophalen en bouwen ([toetsset.md §3](toetsset.md#3-beelden-ophalen-en-bouwen-cap-15))
  - **intent:** elk toets- en trainingsetiket wordt alleen-lezend opgehaald en tot één beeld gebouwd, zoals de pijplijn dat doet of uit het origineel.
  - **success:** tests bewijzen: de ophaalquery is alleen een `SELECT`; rsync en ssh worden met `nice -n 19` en zonder schrijfopties aangeroepen (nagebootste opdrachtuitvoerder); samenvoegen volgt de regels van `bouw.py`; PDF-pagina's en RGBA/CMYK worden juist omgezet; het gereedschap weigert te schrijven binnen een git-werkboom.

## Constraints

- **Definities en stopregel liggen vast** (Friso, 31-10-2026); de telling is per etiket op aanwezigheid ([meetregels.md](meetregels.md)). Toetsdoel per keurmerk: ≥ 16 bevestigde etiketten mét het keurmerk (liefst ≥ 25) en ≥ 50 zonder (correctie op "30–50"; akkoord Friso 01-11-2026).
- **Niets afstellen op de toetsset.** Model (maat N, vast), tegels, drempels en beoordelaar worden gekozen op de validatieset van de trainingskant en bevroren vóór de eerste toetsrun; de eerste toetsrun per route telt ([meetregels.md §6](meetregels.md#6-bevriezing-en-eenmalige-toetsrun-cap-11)).
- **Scheiding op leverancier (GLN)**, in de vaste volgorde bevroren vóór de snelheidsmeting. Versoepelen is een keuze van Friso.
- **Eerlijke vergelijking:** K4-aa krijgt voor het besluit geen referenties van toetsleveranciers, en etiketten uit de fase-B-meetset (waarop K4-aa gekozen is) komen niet in de toets.
- **Privacy:** elke taalmodelaanroep met klantartwork gaat via OpenRouter met zdr (de aanbieder bewaart niets), geen batch-API, sleutel alleen in de omgeving ([randvoorwaarden.md §1](randvoorwaarden.md#1-privacy-zdr)).
- **Licenties:** alleen zoals in [randvoorwaarden.md §4](randvoorwaarden.md#4-licenties-cap-13); nooit Ultralytics, YOLOE, PyMuPDF, AlbumentationsX of `albumentations` ≥ 2.0.9, DEIMv2, RF-DETR-platformmaten of DINOv3.
- **Klantdata buiten elke git-werkboom** (`~/logo-meetset-20261018/proef-detector/`): geen beelden, uitsneden, GLN's, GTIN's of certificaatnummers in commits; de spec noemt leveranciers alleen geanonimiseerd.
- **Productie en ACC alleen lezen:** `banana:/media/Xmedia` met `nice -n 19` en zonder volledige `find`; `replica-db` alleen `SELECT`; MongoDB alleen op `_id`. Geen zware proeven in de ACC ml-service, geen migraties.
- **Herkenning op de processor** (ACC heeft geen GPU), gemeten met 8 threads; training lokaal op MPS.
- **Uitgaven:** ±$63 geraamd (±$78–83 verwacht als de voorlabels 2,6–3× kosten); per post stoppen bij zijn grens ([randvoorwaarden.md §3](randvoorwaarden.md#3-kosten-cap-14)). Friso's werk: ±2 uur bevestigen voor ±350 etiketten, plus ±40 minuten steekproef bij het nakijken en ±50 minuten per eventuele tweede ronde (INFERENCE).
- Bestaande suites in de repository blijven groen.
- **Stoppunten** (de enige lijst; terug naar Friso, niet zelf beslissen):
  1. Maat N schiet tekort op de validatieset (definitie in [trainingsset-en-herkenning.md §5](trainingsset-en-herkenning.md#5-detector-en-training-cap-6)), of een trainingsfase met N duurt volgens de meting of in werkelijkheid meer dan 8 uur, of MPS werkt niet (grotere maat of GPU? Besluit Friso 01-11-2026: eerst alleen N).
  2. Na de voorinvulling of na het aanvullen staat een keurmerk aan de toetskant op minder dan 16 etiketten (waarschijnlijk of bevestigd) (scheiding versoepelen, of het keurmerk zonder besluit laten?).
  3. Een model heeft geen zdr-endpoint, of de zdr-proefaanroep mislukt.
  4. Een pakket, gewicht of programma met een licentie buiten de toegestane lijst.
  5. Een uitgavenpost zou boven zijn grens uitkomen ([randvoorwaarden.md §3](randvoorwaarden.md#3-kosten-cap-14)); voor de voorlabels wordt 2,6–3× de raming verwacht; ze starten pas na Friso's besluit over hun grens.
  6. Elke schrijfactie op ACC of productie.
  7. Een verplicht referentieplaatje voor de beoordelaar ontbreekt bij het bevriezen.
  8. RF-DETR installeert of traint niet (terugval D-FINE?).
- Geen stoppunt maar een ongeldige run: foutpercentage boven 2% ([meetregels.md §5](meetregels.md#5-welke-etiketten-tellen)).

## Non-goals

- Het experiment zelf: de volle training, Friso's bevestiging van de toetsset, het blind nakijken en de eindmeting draaien ná deze build, volgens het draaiplan. Wel: rooktests op kleine lokale sets.
- Productiecode, integratie in de ml-service of de API, uitrol, of iets schrijven op ACC.
- De overige keurmerken uit de top 15 (FSC, Rainforest Alliance, Beter Leven, V-label, `VEGAN`): alleen als gelijkend keurmerk.
- Vergelijking met de oude standaardroute (B0/legacy).
- D-FINE bouwen (alleen gedocumenteerde terugval, stoppunt 8).
- De Nutri-Score-letter uit vectorkleuren lezen.
- Scoren op vakniveau; menselijke correctie van trainingsvakjes; actief leren.
- Foto's van verpakkingen.

## Success signal

Met de gebouwde gereedschappen en het draaiplan levert één doorloop op een door Friso bevestigde toetsset per keurmerk (8) een tabel met gevonden k/n en Wilson-ondergrens, vals k/n en Wilson-bovengrens, kosten en tijd per etiket, en het besluit "automatisch" of "mens bevestigt", voor D+A én voor K4-aa. Eén getoetst script maakt die tabel uit bevroren uitvoer. In de build is dat aangetoond met rooktests op kleine lokale sets en tests met verzonnen mini-sets.

## Assumptions

- Een declaratie is geen bewijs van zichtbaarheid. De scheiding is gekozen op gedeclareerde aantallen; MSC en Vegan Society halen 16 bevestigde etiketten alleen als het keurmerk op ≥ 48% resp. ≥ 46% van hun toetsproducten echt zichtbaar is (INFERENCE).
- Docs (productregistraties: één GTIN van één leverancier voor één doelmarkt) zonder print-laag (de drukversie die de pijplijn al naar een beeld heeft omgezet) mogen uit het origineel gebouwd worden; voor de vergelijking telt alleen dat beide routes dezelfde bytes krijgen.
- De processor van deze Mac met 8 threads benadert de ACC-server (8 vCPU) goed genoeg voor tijd per etiket.
- De huidige route is K4-aa (8c9373d), lokaal gedraaid met de referentiemomentopname van 30-10-2026.
- `anthropic/claude-sonnet-5.5` heeft op OpenRouter een zdr-endpoint; zo niet, dan stoppunt 3.
- Trainingsvakjes van het taalmodel zijn goed genoeg zonder menselijke correctie; de validatieset laat zien hoeveel ruis er is.
- Voor MSC, Weidemelk en Vegan Society bestaan mogelijk geen publieke vectorbestanden; dan dienen het GS1-gidsbeeld en schone uitsneden van trainingsleveranciers als generatorbron.
- JPEG in plaats van PNG verandert de kosten van een aanroep niet: de aanbieder rekent beeldtokens op afmeting, niet op bestandsgrootte (INFERENCE; na de herhaalrun vergeleken).
- JPEG kwaliteit 90 houdt kleine keurmerken even leesbaar voor het taalmodel als PNG (INFERENCE).
