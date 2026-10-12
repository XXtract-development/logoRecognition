---
titel: "Spike: levert een getraind stap-2-model een betere logoclassificatie dan de referentiemethode?"
project: logoRecognition
type: meetrapport (spike)
datum: 2026-10-12
peildatum_code: origin/acc 31ff627
omgeving: ACC (alleen gelezen), berekening lokaal op CPU
spec: SPEC.md
scripts: scripts/
status: afgerond (baseline, A, B, C gemeten)
auteur: Claude (subagent), in opdracht van de hoofdsessie
---

# Spike: levert een getraind stap-2-model een betere logoclassificatie dan de referentiemethode?

> [!note] Uitkomst in één alinea
> Op een eerlijke test (producten én hun artwork-varianten buiten de training, splitsing F, 140 uitsneden uit 62 artwork-families) herkent een model dat op de 867 gevalideerde trainingsuitsneden is getraind **niet meer logo's goed** dan de huidige "dichtstbijzijnde referentie"-methode: baseline 107/140 (76%), logistische regressie op dezelfde kenmerken 104/140 (74%), fine-tune van het netwerk 100/140 (71%), trainingsuitsneden als extra referenties 107/140 (76%, geen enkele voorspelling verandert). Het verschil ligt ruim binnen de onzekerheid (McNemar p = 0,55; bootstrap-interval van het verschil −9 tot +3 procentpunt). **Wat de getrainde modellen wél beter doen, is zeggen hoe zeker ze zijn:** bij evenveel onterechte meldingen als de baseline nu bij drempel 0,80 (13 van 140) vindt de logistische regressie 91 en de fine-tune 96 logo's, tegen 69–72 voor de referentiemethode. De schijnbare winst in de door de briefing gevraagde splitsing E (90% tegen 79%) verdwijnt zodra de 113 van 148 test-uitsneden worden weggelaten die vrijwel pixelgelijk zijn aan een trainings- of referentie-uitsnede.

## 1. Vraag en afbakening

Productowner: "Kunnen we met alle gedane trainingen niet alvast automatisch een model maken dat de herkenning beter maakt?" Het [onderzoek van 12-10-2026](../../implementation-artifacts/investigations/acc-top15-logoherkenning-slecht-20261012.md) (F1, E17–E20, E26, E28) stelde vast dat de live classificatie op ACC geen getraind model gebruikt: stap 2 is "dichtstbijzijnde referentie" met een onbewerkt ImageNet-EfficientNet-B0, en de gevalideerde `training_data` speelt daar geen rol in.

Deze spike meet **alleen stap 2**: gegeven een vakje met een logo, welke soort is het? **Stap 1 — vakjes vinden op een volledig etiket — is niet gemeten**, en het onderzoek wijst juist stap 1 (F2) aan als grootste bijdrage aan de 83% gemiste logo's. Een beter stap-2-model lost dat niet op.

Volledige meetopzet en succesmaat: [SPEC.md](SPEC.md). De spec is tegengelezen (`bmad-review`, 16 bevindingen, alle doorgevoerd — o.a. splitsing op artwork-familie in plaats van GTIN, vooraf vastgelegde drempelregel, vergelijking bij gelijk aantal onterechte meldingen, cluster-bootstrap, verificatie van de nagebouwde embedding tegen ACC).

## 2. De data, en wat erin opviel

VERIFIED (query in [`scripts/00_haal.sh`](scripts/00_haal.sh); bestanden via MinIO-bucket `training-images`, alleen gelezen):

| feit | waarde |
|---|---|
| rijen `training_data` actief + gevalideerd met `crop_path` | 880 |
| unieke uitsneden (13 rijen zijn hetzelfde pad met hetzelfde label) | 867 |
| ontbrekend / onleesbaar in MinIO | 0 / 0 |
| soorten · producten (GTIN) · artwork-families (zie §3) | 40 · 447 · 312 |
| beeldmodus | 852 RGB, 15 RGBA (verwerkt met `convert("RGB")`, exact zoals ACC) |
| actieve referenties (na deactivering van het witte vlak `f1a85af9-…`) | 541, waarvan 482 zelf een `artwork-crops/`-uitsnede |
| trainingsuitsneden met hetzelfde pad als een referentie | 481 van 867 |
| trainingsuitsneden byte-gelijk aan een referentie (sha256, ook onder ander pad) | 610 van 867 |
| trainingsuitsneden met cosinus ≥ 0,999 met een referentie | 619 van 867 |
| producten die ook referentiebron zijn | 352 van 447 |

> [!warning] "Trainen" was tot nu toe "referenties toevoegen"
> Zeven van de tien gevalideerde trainingsuitsneden zitten al letterlijk in de referentieset. Elke meting die een trainingsuitsnede tegen de referenties legt zonder dit uit te sluiten, meet dus hoe goed het systeem zichzelf terugvindt (cosinus 1,000). Dat is ook waarom eerdere "goed genoeg"-metingen te rooskleurig waren (onderzoek F6).

Drie datakwaliteitsvondsten, alleen gerapporteerd (opschonen valt buiten deze spike):

- **128 groepen byte-gelijke bestanden** binnen de trainingsset, waarvan **23 over meerdere GTIN's**: productvarianten (smaak, maat) delen één artwork en dus dezelfde uitsnede.
- **3 groepen byte-gelijke bestanden met tegenstrijdig label**: `DO_NOT_DRINK_AND_DRIVE_WARNING` ↔ `MINIMUM_DRINKING_AGE_18_WARNING`, `EUROPEAN_V_LABEL_VEGAN` ↔ `VEGAN`, `NUTRISCORE_B` ↔ `NUTRISCORE_C`. Hetzelfde plaatje is dus twee keer gevalideerd met een andere soort.
- **760 paren uitsneden met cosinus ≥ 0,98 over een GTIN-grens** (347 uitsneden, 182 GTIN's): splitsen op GTIN alleen lekt trainingsbeelden naar de test.

VERIFIED (tweede route voor de baseline-nabouw): voor 40 actieve referenties is de pgvector-embedding op ACC opgehaald (`select e.reference_logo_id, e.embedding::text from reference_embeddings e join reference_logos r on r.id = e.reference_logo_id where r.active order by r.id limit 40`) en vergeleken met de lokaal herberekende embedding: cosinus **1,0000 bij alle 40** (kleinste waarde 1,0). De lokale keten ([`scripts/01_embed.py`](scripts/01_embed.py)) is dus dezelfde als die van ACC.

## 3. Meetopzet

**Eenheid van splitsing: artwork-familie.** GTIN's zijn verbonden als minstens één paar uitsneden (trainings- of referentie-uitsnede) cosinus ≥ 0,98 heeft; byte-gelijke bestanden scoren ≥ 0,9999, dus 0,98 vangt ook licht anders ingesneden kopieën. Dat levert 312 families over 447 GTIN's.

| splitsing | test | train | referenties voor de baseline | lek |
|---|---|---|---|---|
| **F (hoofdmeting)** | willekeurig 20% van de families (seed 20261012): 62 families, 79 GTIN's, **140 uitsneden** | 250 families, 368 GTIN's, 727 uitsneden | 450 (91 referenties uit test-families verwijderd) | 0 van 140 |
| **E (briefing-regel)** | alle 95 GTIN's die geen referentiebron zijn: 52 families, **148 uitsneden** | 352 GTIN's, 719 uitsneden | alle 541 | **113 van 148** test-uitsneden hebben cosinus ≥ 0,98 met een train- of referentie-uitsnede |

INFERENCE: splitsing E is de regel uit de briefing, maar de 95 "niet-gepromoveerde" producten zijn geen steekproef — en omdat hun varianten wél referentie zijn, lekt bijna alles. F is daarom de meting die telt; E staat erbij om te laten zien hoe groot het lek is.

**Methoden** (alle op dezelfde test-uitsneden, [`scripts/02_analyse.py`](scripts/02_analyse.py)):

| methode | wat het is |
|---|---|
| baseline | ACC nagebouwd: bevroren EfficientNet-B0-embedding (eerste 512 dims), cosinus, top-1 over de baseline-referentieset; `zekerheid = cosinus` |
| baseline beperkt | idem, maar alleen referenties van soorten die in train voorkomen (symmetrisch met Model A, dat alleen die soorten kent) |
| Model C | baseline-referentieset + alle train-uitsneden als extra referenties — wat "trainen" tot nu toe feitelijk deed |
| Model A | logistische regressie (`class_weight='balanced'`, C=10) op dezelfde bevroren embeddings van de train-uitsneden; `zekerheid = kans van de gekozen soort` |
| Model B | lichte fine-tune van de laatste twee blokken + nieuwe kop van EfficientNet-B0, 224 px, gebalanceerde sampling, augmentatie; zie §7 |

**Drempels.** Baseline en C bij 0,75 (live `CLASSIFY_THRESHOLD_EMBEDDING`, E22) en 0,80 (kruischeck-drempel). Model A heeft een andere schaal; zijn drempel is vooraf en zonder de test gekozen: 5-voudige familie-gegroepeerde cross-validatie op train geeft per train-uitsnede een zekerheid; de baseline krijgt op dezelfde uitsneden een score met de referenties van de eigen familie uitgesloten; de drempel is de laagste waarde waarbij A in cross-validatie niet méér onterechte meldingen geeft dan de baseline bij 0,80. Uitkomst: F → 0,40 (doel 8,4% onterecht, A in CV 8,4%), E → 0,35.

**Onzekerheid.** Per methode: Wilson-interval op uitsneden én cluster-bootstrap op families (2000 trekkingen, want uitsneden uit één familie zijn niet onafhankelijk); verschil met de baseline via exacte McNemar op gepaarde uitsneden én bootstrap van het verschil; het kleinst aantoonbare verschil bij het waargenomen aantal discordante paren. Totaal = álle test-uitsneden; soorten met minder dan 3 test-uitsneden zijn in de tabellen gemarkeerd (*).

## 4. Resultaat splitsing F (hoofdmeting, 140 test-uitsneden, 62 families)

| methode | top-1 juist | Wilson 95% | bootstrap 95% (families) | verschil met baseline (bootstrap) | McNemar p (discordant) | macro-recall | gevonden ≥ 0,80 | onterecht ≥ 0,80 | gevonden bij eigen drempel | onterecht bij eigen drempel | gevonden bij 13 onterecht |
|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 107/140 (76%) | 69–83% | 66–88% | – | – | 69% | 69 | 13 | 69 | 13 | 69 |
| baseline beperkt | 107/140 (76%) | 69–83% | 66–88% | 0 | 1,0 (0) | 69% | 69 | 13 | 69 | 13 | 71 (drempel 0,79) |
| Model C | 107/140 (76%) | 69–83% | 66–88% | 0 | 1,0 (0) | 69% | 69 | 13 | 69 | 13 | 72 (drempel 0,79) |
| Model A (drempel 0,40) | 104/140 (74%) | 66–81% | 64–86% | −9 … +3 pp | 0,55 (11) | 68% | 35 | 1 | **90** | 13 | **91** (drempel 0,40) |
| Model B (fine-tune, drempel 0,15) | 100/140 (71%) | 63–78% | – | – | 0,26 (29) | – | 78 | 4 | 99 | 24 | **96** |

VERIFIED:

- **Top-1: geen aantoonbaar verschil.** A wint 4 uitsneden en verliest 7 ten opzichte van de baseline; met 11 discordante paren is pas een verschil van 9 uitsneden (6 procentpunt) aantoonbaar. C verandert geen enkele voorspelling: voor 25 van de 140 test-uitsneden is een train-uitsnede de dichtstbijzijnde, maar met dezelfde soort als de dichtstbijzijnde referentie.
- **Zekerheid: wél een verschil.** De baseline heeft 107 juiste top-1's, maar 38 daarvan scoren onder 0,80 (mediaan beste cosinus 0,84) — de cosinus van het ImageNet-model scheidt goed en fout slecht. Gevonden bij hoogstens *k* onterechte meldingen:

| onterecht ≤ | 0 | 5 | 13 | 20 |
|---|---|---|---|---|
| baseline vindt | 3 | 37 | 71 | 76 |
| Model A vindt | 8 | 75 | **91** | 102 |

- Model A verliest het meest op `AISE_2020_COMPANY` (baseline 5/5, A 0/5: alle vijf test-uitsneden komen uit één familie en train heeft er maar één), `NUTRISCORE_E` (1→0 van 1) en `VEGAN` (9→8 van 10); het wint op `RECYCLABLE_GENERAL_CLAIM` (7→8 van 8), `NUTRISCORE_B` (0→1 van 4) en `LACTOSE_FREE` (0→1 van 1). Alles binnen enkele uitsneden.
- Soorten alleen in train (A kan ze voorspellen, test heeft ze niet): 10, o.a. `NUTRISCORE_A`, `EUROPEAN_V_LABEL_VEGAN`, `MARINE_STEWARDSHIP_COUNCIL_LABEL`. Alleen in test: `AGRICULTURE_BIOLOGIQUE` (1 uitsnede; A kan die nooit raken, de baseline wel via de gidsreferentie). 11 soorten hebben < 3 test-uitsneden.

## 5. Resultaat splitsing E (briefing-regel, 148 test-uitsneden, 52 families)

| methode | top-1 juist | Wilson 95% | bootstrap 95% (families) | verschil met baseline | McNemar p (discordant) | macro-recall | gevonden ≥ 0,80 | onterecht ≥ 0,80 | gevonden bij eigen drempel | onterecht bij eigen drempel | gevonden bij 17 onterecht |
|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 117/148 (79%) | 72–85% | 64–93% | – | – | 76% | 115 | 17 | 115 | 17 | 115 |
| baseline beperkt | 117/148 (79%) | 72–85% | 64–93% | 0 | 1,0 (0) | 76% | 115 | 17 | 115 | 17 | 115 |
| Model C | 123/148 (83%) | 76–88% | 69–96% | +1 … +8 pp | 0,070 (8) | 85% | 120 | 25 | 120 | 25 | 67 (drempel 0,99) |
| Model A (drempel 0,35) | 133/148 (90%) | 84–94% | 82–96% | −1 … +23 pp | 0,004 (28) | 92% | 69 | 1 | 128 | 15 | 133 (drempel 0,24) |

> [!warning] Deze winst is een lek, geen leereffect
> 113 van de 148 test-uitsneden in E hebben cosinus ≥ 0,98 met een trainings- of referentie-uitsnede (zelfde artwork op een variant-GTIN). Zonder die 113 blijven er 35 over: baseline 28/35, Model C 30/35, Model A 29/35 — geen verschil. Het McNemar-resultaat (p = 0,004) telt gepaarde uitsneden alsof ze onafhankelijk zijn; het familie-bootstrap-interval (−1 … +23 pp) laat zien dat het verschil op familieniveau niet van nul te onderscheiden is.

## 6. Wat dit níet bewijst

- **Niets over stap 1.** De testset bestaat uit vakjes die een mens al had aangewezen. Of een etiket überhaupt een vakje oplevert, en of dat vakje goed ligt, is hier niet gemeten; dat is volgens het onderzoek de grootste verliespost.
- **Niets over valse meldingen op echte etiketten.** Alle test-uitsneden zijn échte logo's. Hoe een model reageert op lege vakjes, tekst, barcodes of onbekende logo's (de bron van de RECYCLABLE-1,0-meldingen) is niet gemeten; geen van de modellen heeft een "onbekend"-uitkomst, omdat `training_data` geen negatieven bevat.
- **Niets over lookalikes die niet in de data zitten.** 40 soorten in train, 70 in de referentieset; 30 soorten kan een getraind model per definitie niet herkennen en 11 soorten hebben hier minder dan 3 test-uitsneden.
- **Niets over andere printkwaliteit of resolutie.** Alle uitsneden komen uit dezelfde artwork-bron (mediaan 166 × 153 px).
- **De testset is klein.** 140 uitsneden uit 62 families: verschillen kleiner dan ongeveer 6–10 procentpunt zijn hiermee niet aantoonbaar, in geen van beide richtingen.
- INFERENCE: de kalibratiewinst van Model A (91 tegen 71 gevonden bij 13 onterecht) is een eigenschap van de scorefunctie, niet van beter "kijken". Een even goed effect is denkbaar door de cosinusscore van de baseline opnieuw te kalibreren per soort, zonder model; dat is niet getest.

## 7. Model B — lichte fine-tune

VERIFIED ([`scripts/03_finetune.py`](scripts/03_finetune.py), 12 epochs, 31,7 minuten CPU): EfficientNet-B0 met de laatste twee blokken en een nieuwe kop (38 soorten) getraind op 679 train-uitsneden van splitsing F, 48 uitsneden uit 10% van de train-families als validatie (val-top-1 90%, 43/48), gebalanceerde sampling, augmentatie (uitsnede 70–100%, rotatie ±10°, kleur).

| | top-1 juist | Wilson 95% | t.o.v. baseline (McNemar) | gevonden ≥ 0,80 | onterecht ≥ 0,80 | gevonden bij drempel 0,15 (val-regel) | onterecht bij 0,15 | gevonden bij 13 onterecht |
|---|---|---|---|---|---|---|---|---|
| Model B | 100/140 (71%) | 63–78% | baseline-alleen 18, B-alleen 11; p = 0,26 | 78 | 4 | 99 | 24 | **96** |

- **Top-1 slechter dan de baseline, niet aantoonbaar** (29 discordante paren, p = 0,26). Grootste verliezen: `AISE_2020_COMPANY` (5→0 van 5) en `ON_THE_WAY_TO_PLANETPROOF` (5→0 van 5, beide één familie), `EU_ORGANIC_FARMING` (14→10 van 15).
- **De op validatie gekozen drempel (0,15) draagt niet over:** 24 onterecht op de test tegen een doel van ±12 — 48 validatie-uitsneden zijn te weinig om een drempel op te kiezen.
- **Dezelfde kalibratiewinst als Model A, iets sterker:** gevonden bij hoogstens 0 / 5 / 13 / 20 onterecht: 52 / 87 / 96 / 99 (baseline 3 / 37 / 71 / 76; Model A 8 / 75 / 91 / 102). Bij 0 onterechte meldingen vindt B 52 logo's waar de baseline er 3 vindt.
- INFERENCE: een fine-tune op 679 beelden overfit op de families die het ziet (val 90%, test 71%); meer data uit méér producten zou dit kunnen keren, maar dat is met de huidige dataset niet te meten.

## 8. Advies

1. **Nu geen trainingspijplijn bouwen voor stap 2:** op een eerlijke test herkent een model dat op de bestaande 867 uitsneden is getraind niet aantoonbaar meer logo's dan de referentiemethode; de data is te klein en te veel kopie van de referentieset.
2. **Wel de zekerheidsscore verbeteren:** een lineaire kop op de bestaande embeddings (of een per-soort-kalibratie van de cosinus) vindt bij gelijk aantal onterechte meldingen ±20 logo's op 140 méér — dat is het goedkoopste meetbare effect en kan als `model_versions`-kandidaat via BMAD.
3. **Eerst stap 1 en de data:** de labelconflicten (3 groepen) en variant-duplicaten (23 groepen) opruimen, negatieven verzamelen voor een "onbekend"-uitkomst, en de lokalisatie meetbaar maken (onderzoek actie 4) — zonder dat blijft elke stap-2-winst onzichtbaar op volledige etiketten.

## 9. Open vragen voor de productowner

1. Mag een getraind model straks een "onbekend"-uitkomst geven, en wie verzamelt daar voorbeelden voor (lege vakjes, vreemde logo's)?
2. Wat weegt zwaarder: meer logo's gevonden of minder onterechte meldingen? Model A kan bij 13 onterecht 91 vinden, bij 5 onterecht 75; de baseline 71 respectievelijk 37.
3. Moeten de drie tegenstrijdig gelabelde plaatjes en de 26 `classifier`-gelabelde rijen in `training_data` opnieuw door een mens?

## 10. Reproduceren

Scripts in [`scripts/`](scripts/) (geen sleutels, geen beelden): `00_haal.sh` (query + MinIO-leesstap), `01_embed.py` (embeddings, cache in de scratchpad), `02_analyse.py` (families, splitsingen, baseline, A, C, statistiek → `resultaten.json`, `splits.json`), `03_finetune.py` (Model B → `model_B.json`), `04_tabellen.py` (tabellen hieronder). Omgeving: Python 3.14, torch 2.14.1, torchvision 0.29.1, scikit-learn 1.9.1, scipy, Pillow; seed 20261012; CPU. Herhaling moet binnen 0,5 procentpunt uitkomen (Model B kan door augmentatie iets meer afwijken). De beelden staan uitsluitend in de scratchpad van de sessie en komen niet in de repository.

Context, niet vergelijkbaar: "12.3 real-ref pivot" (echte-crop-referenties top-1 37% → 81%, veel minder data, met overlap) en "12.4 detector-spike" (getrainde detector haalde de eisen niet; knelpunt data).

## Bijlage: tabellen per soort

Teller/noemer per soort; * = minder dan 3 test-uitsneden.

### Splitsing F: verdeling per soort

| soort | train | test | GTIN's train | GTIN's test |
|---|---|---|---|---|
| AGRICULTURE_BIOLOGIQUE | 0 | 3 | 0 | 2 |
| AISE_1 * | 5 | 1 | 4 | 1 |
| AISE_2 | 4 | 0 | 2 | 0 |
| AISE_2020_COMPANY | 1 | 5 | 1 | 4 |
| AISE_5 * | 4 | 2 | 3 | 1 |
| AQUACULTURE_STEWARDSHIP_COUNCIL * | 7 | 1 | 5 | 1 |
| BDIH_LOGO | 2 | 0 | 1 | 0 |
| BETER_LEVEN_1_STER | 48 | 4 | 21 | 2 |
| BETER_LEVEN_2_STER | 12 | 0 | 5 | 0 |
| CCA_GLUTEN_FREE | 1 | 0 | 1 | 0 |
| CERTIFIED_B_CORPORATION * | 4 | 1 | 4 | 1 |
| CONFORMITE_EUROPEENNE | 3 | 0 | 2 | 0 |
| CROSSED_GRAIN_SYMBOL | 3 | 4 | 2 | 3 |
| DO_NOT_DRINK_AND_DRIVE_WARNING * | 6 | 2 | 6 | 2 |
| EUROPEAN_V_LABEL_VEGAN | 33 | 0 | 19 | 0 |
| EUROPEAN_V_LABEL_VEGETARIAN | 2 | 0 | 2 | 0 |
| EU_ORGANIC_FARMING | 53 | 15 | 37 | 9 |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 26 | 7 | 22 | 7 |
| FREE_FROM_GLUTEN | 6 | 7 | 5 | 3 |
| GREEN_DOT | 40 | 5 | 37 | 4 |
| HALAL | 6 | 3 | 3 | 2 |
| LACTOSE_FREE * | 9 | 1 | 8 | 1 |
| MARINE_STEWARDSHIP_COUNCIL_LABEL | 32 | 0 | 12 | 0 |
| MINIMUM_DRINKING_AGE_18_WARNING * | 5 | 2 | 4 | 1 |
| NUTRISCORE_A | 38 | 0 | 21 | 0 |
| NUTRISCORE_B | 24 | 4 | 12 | 4 |
| NUTRISCORE_C * | 27 | 1 | 22 | 1 |
| NUTRISCORE_D * | 14 | 1 | 13 | 1 |
| NUTRISCORE_E * | 15 | 1 | 11 | 1 |
| ON_THE_WAY_TO_PLANETPROOF | 1 | 5 | 1 | 5 |
| PREGNANCY_WARNING | 36 | 12 | 27 | 10 |
| RAINFOREST_ALLIANCE_PEOPLE_NATURE | 64 | 15 | 33 | 10 |
| RECYCLABLE_GENERAL_CLAIM | 61 | 8 | 33 | 8 |
| RETURNABLE_CAN_NL | 8 | 3 | 5 | 1 |
| SEPARATE_COLLECTION | 4 | 0 | 2 | 0 |
| SOCIETY_PLASTICS_INDUSTRY * | 3 | 2 | 3 | 2 |
| TRIMAN | 7 | 5 | 7 | 4 |
| VEGAN | 31 | 10 | 24 | 9 |
| VEGAN_SOCIETY_VEGAN_LOGO | 17 | 3 | 12 | 3 |
| WEIDEMELK | 65 | 7 | 31 | 7 |
| **totaal** | **727** | **140** | **368** | **79** |

\* minder dan 3 test-uitsneden (gemarkeerd, telt wel mee in het totaal). Alleen in train: AISE_2, BDIH_LOGO, BETER_LEVEN_2_STER, CCA_GLUTEN_FREE, CONFORMITE_EUROPEENNE, EUROPEAN_V_LABEL_VEGAN, EUROPEAN_V_LABEL_VEGETARIAN, MARINE_STEWARDSHIP_COUNCIL_LABEL, NUTRISCORE_A, SEPARATE_COLLECTION. Alleen in test: AGRICULTURE_BIOLOGIQUE.

### Splitsing F: Baseline (ACC-methode)

| soort | test | top-1 juist | gevonden ≥ 0.8 | onterecht ≥ 0.8 | onder drempel |
|---|---|---|---|---|---|
| AGRICULTURE_BIOLOGIQUE | 3 | 0/3 (0%) | 0 | 1 | 2 |
| AISE_1 * | 1 | 1/1 (100%) | 0 | 0 | 1 |
| AISE_2020_COMPANY | 5 | 5/5 (100%) | 0 | 0 | 5 |
| AISE_5 * | 2 | 2/2 (100%) | 0 | 0 | 2 |
| AQUACULTURE_STEWARDSHIP_COUNCIL * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| BETER_LEVEN_1_STER | 4 | 2/4 (50%) | 2 | 2 | 0 |
| CERTIFIED_B_CORPORATION * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| CROSSED_GRAIN_SYMBOL | 4 | 1/4 (25%) | 1 | 0 | 3 |
| DO_NOT_DRINK_AND_DRIVE_WARNING * | 2 | 1/2 (50%) | 0 | 0 | 2 |
| EU_ORGANIC_FARMING | 15 | 15/15 (100%) | 7 | 0 | 8 |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 7 | 7/7 (100%) | 5 | 0 | 2 |
| FREE_FROM_GLUTEN | 7 | 0/7 (0%) | 0 | 1 | 6 |
| GREEN_DOT | 5 | 5/5 (100%) | 5 | 0 | 0 |
| HALAL | 3 | 1/3 (33%) | 1 | 0 | 2 |
| LACTOSE_FREE * | 1 | 0/1 (0%) | 0 | 0 | 1 |
| MINIMUM_DRINKING_AGE_18_WARNING * | 2 | 0/2 (0%) | 0 | 0 | 2 |
| NUTRISCORE_B | 4 | 0/4 (0%) | 0 | 3 | 1 |
| NUTRISCORE_C * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| NUTRISCORE_D * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| NUTRISCORE_E * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| ON_THE_WAY_TO_PLANETPROOF | 5 | 5/5 (100%) | 3 | 0 | 2 |
| PREGNANCY_WARNING | 12 | 11/12 (92%) | 2 | 0 | 10 |
| RAINFOREST_ALLIANCE_PEOPLE_NATURE | 15 | 15/15 (100%) | 15 | 0 | 0 |
| RECYCLABLE_GENERAL_CLAIM | 8 | 7/8 (88%) | 6 | 1 | 1 |
| RETURNABLE_CAN_NL | 3 | 3/3 (100%) | 3 | 0 | 0 |
| SOCIETY_PLASTICS_INDUSTRY * | 2 | 0/2 (0%) | 0 | 2 | 0 |
| TRIMAN | 5 | 3/5 (60%) | 1 | 2 | 2 |
| VEGAN | 10 | 9/10 (90%) | 7 | 1 | 2 |
| VEGAN_SOCIETY_VEGAN_LOGO | 3 | 3/3 (100%) | 1 | 0 | 2 |
| WEIDEMELK | 7 | 6/7 (86%) | 5 | 0 | 2 |
| **totaal** | **140** | **107/140 (76%)** | **69** | **13** | **58** |

### Splitsing F: Model C (train-uitsneden als extra referenties)

| soort | test | top-1 juist | gevonden ≥ 0.8 | onterecht ≥ 0.8 | onder drempel |
|---|---|---|---|---|---|
| AGRICULTURE_BIOLOGIQUE | 3 | 0/3 (0%) | 0 | 1 | 2 |
| AISE_1 * | 1 | 1/1 (100%) | 0 | 0 | 1 |
| AISE_2020_COMPANY | 5 | 5/5 (100%) | 0 | 0 | 5 |
| AISE_5 * | 2 | 2/2 (100%) | 0 | 0 | 2 |
| AQUACULTURE_STEWARDSHIP_COUNCIL * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| BETER_LEVEN_1_STER | 4 | 2/4 (50%) | 2 | 2 | 0 |
| CERTIFIED_B_CORPORATION * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| CROSSED_GRAIN_SYMBOL | 4 | 1/4 (25%) | 1 | 0 | 3 |
| DO_NOT_DRINK_AND_DRIVE_WARNING * | 2 | 1/2 (50%) | 0 | 0 | 2 |
| EU_ORGANIC_FARMING | 15 | 15/15 (100%) | 7 | 0 | 8 |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 7 | 7/7 (100%) | 5 | 0 | 2 |
| FREE_FROM_GLUTEN | 7 | 0/7 (0%) | 0 | 1 | 6 |
| GREEN_DOT | 5 | 5/5 (100%) | 5 | 0 | 0 |
| HALAL | 3 | 1/3 (33%) | 1 | 0 | 2 |
| LACTOSE_FREE * | 1 | 0/1 (0%) | 0 | 0 | 1 |
| MINIMUM_DRINKING_AGE_18_WARNING * | 2 | 0/2 (0%) | 0 | 0 | 2 |
| NUTRISCORE_B | 4 | 0/4 (0%) | 0 | 3 | 1 |
| NUTRISCORE_C * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| NUTRISCORE_D * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| NUTRISCORE_E * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| ON_THE_WAY_TO_PLANETPROOF | 5 | 5/5 (100%) | 3 | 0 | 2 |
| PREGNANCY_WARNING | 12 | 11/12 (92%) | 2 | 0 | 10 |
| RAINFOREST_ALLIANCE_PEOPLE_NATURE | 15 | 15/15 (100%) | 15 | 0 | 0 |
| RECYCLABLE_GENERAL_CLAIM | 8 | 7/8 (88%) | 6 | 1 | 1 |
| RETURNABLE_CAN_NL | 3 | 3/3 (100%) | 3 | 0 | 0 |
| SOCIETY_PLASTICS_INDUSTRY * | 2 | 0/2 (0%) | 0 | 2 | 0 |
| TRIMAN | 5 | 3/5 (60%) | 1 | 2 | 2 |
| VEGAN | 10 | 9/10 (90%) | 7 | 1 | 2 |
| VEGAN_SOCIETY_VEGAN_LOGO | 3 | 3/3 (100%) | 1 | 0 | 2 |
| WEIDEMELK | 7 | 6/7 (86%) | 5 | 0 | 2 |
| **totaal** | **140** | **107/140 (76%)** | **69** | **13** | **58** |

### Splitsing F: Model A (logistische regressie), drempel 0.4

| soort | test | top-1 juist | gevonden ≥ 0.4 | onterecht ≥ 0.4 | onder drempel |
|---|---|---|---|---|---|
| AGRICULTURE_BIOLOGIQUE | 3 | 0/3 (0%) | 0 | 1 | 2 |
| AISE_1 * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| AISE_2020_COMPANY | 5 | 0/5 (0%) | 0 | 0 | 5 |
| AISE_5 * | 2 | 2/2 (100%) | 0 | 0 | 2 |
| AQUACULTURE_STEWARDSHIP_COUNCIL * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| BETER_LEVEN_1_STER | 4 | 2/4 (50%) | 2 | 2 | 0 |
| CERTIFIED_B_CORPORATION * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| CROSSED_GRAIN_SYMBOL | 4 | 1/4 (25%) | 0 | 0 | 4 |
| DO_NOT_DRINK_AND_DRIVE_WARNING * | 2 | 2/2 (100%) | 0 | 0 | 2 |
| EU_ORGANIC_FARMING | 15 | 15/15 (100%) | 15 | 0 | 0 |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 7 | 7/7 (100%) | 6 | 0 | 1 |
| FREE_FROM_GLUTEN | 7 | 0/7 (0%) | 0 | 0 | 7 |
| GREEN_DOT | 5 | 5/5 (100%) | 5 | 0 | 0 |
| HALAL | 3 | 1/3 (33%) | 1 | 2 | 0 |
| LACTOSE_FREE * | 1 | 1/1 (100%) | 0 | 0 | 1 |
| MINIMUM_DRINKING_AGE_18_WARNING * | 2 | 0/2 (0%) | 0 | 0 | 2 |
| NUTRISCORE_B | 4 | 1/4 (25%) | 1 | 1 | 2 |
| NUTRISCORE_C * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| NUTRISCORE_D * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| NUTRISCORE_E * | 1 | 0/1 (0%) | 0 | 1 | 0 |
| ON_THE_WAY_TO_PLANETPROOF | 5 | 5/5 (100%) | 2 | 0 | 3 |
| PREGNANCY_WARNING | 12 | 11/12 (92%) | 11 | 0 | 1 |
| RAINFOREST_ALLIANCE_PEOPLE_NATURE | 15 | 15/15 (100%) | 15 | 0 | 0 |
| RECYCLABLE_GENERAL_CLAIM | 8 | 8/8 (100%) | 8 | 0 | 0 |
| RETURNABLE_CAN_NL | 3 | 3/3 (100%) | 3 | 0 | 0 |
| SOCIETY_PLASTICS_INDUSTRY * | 2 | 0/2 (0%) | 0 | 2 | 0 |
| TRIMAN | 5 | 3/5 (60%) | 2 | 2 | 1 |
| VEGAN | 10 | 8/10 (80%) | 6 | 1 | 3 |
| VEGAN_SOCIETY_VEGAN_LOGO | 3 | 3/3 (100%) | 3 | 0 | 0 |
| WEIDEMELK | 7 | 6/7 (86%) | 5 | 1 | 1 |
| **totaal** | **140** | **104/140 (74%)** | **90** | **13** | **37** |

### Splitsing F: totaaltabel (140 test-uitsneden, 62 families)

| methode | top-1 juist | Wilson 95% | bootstrap 95% (families) | verschil met baseline (bootstrap 95%) | McNemar p (discordant) | macro-recall | gevonden ≥ 0,80 | onterecht ≥ 0,80 | gevonden bij eigen drempel | onterecht bij eigen drempel | gevonden bij evenveel onterecht als baseline |
|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 107/140 (76%) | 69%–83% | 66%–88% | – | – | 69% | 69 | 13 | 69 | 13 | 69 (zelf, 0,80) |
| baseline beperkt tot train-soorten | 107/140 (76%) | 69%–83% | 66%–88% | +0%–+0% | 1.000 (0) | 69% | 69 | 13 | 69 | 13 | 71 (drempel 0.79) |
| model C | 107/140 (76%) | 69%–83% | 66%–88% | +0%–+0% | 1.000 (0) | 69% | 69 | 13 | 69 | 13 | 72 (drempel 0.79) |
| model A (drempel 0.4) | 104/140 (74%) | 66%–81% | 64%–86% | -9%–+3% | 0.549 (11) | 68% | 35 | 1 | 90 | 13 | 91 (drempel 0.40) |
| model B (fine-tune, drempel 0.15) | 100/140 (71%) | 63%–78% | – | – | zie tekst (29; baseline-alleen 18, B-alleen 11) | – | 78 | 4 | 99 | 24 | – |

### Splitsing F: Model B (fine-tune) per soort, drempel 0.15

| soort | test | top-1 juist | gevonden ≥ 0.15 | onterecht ≥ 0.15 |
|---|---|---|---|---|
| AGRICULTURE_BIOLOGIQUE | 3 | 0/3 (0%) | 0 | 3 |
| AISE_1 | 1 | 1/1 (100%) | 1 | 0 |
| AISE_2020_COMPANY | 5 | 0/5 (0%) | 0 | 1 |
| AISE_5 | 2 | 2/2 (100%) | 2 | 0 |
| AQUACULTURE_STEWARDSHIP_COUNCIL | 1 | 1/1 (100%) | 1 | 0 |
| BETER_LEVEN_1_STER | 4 | 4/4 (100%) | 4 | 0 |
| CERTIFIED_B_CORPORATION | 1 | 1/1 (100%) | 1 | 0 |
| CROSSED_GRAIN_SYMBOL | 4 | 1/4 (25%) | 0 | 2 |
| DO_NOT_DRINK_AND_DRIVE_WARNING | 2 | 2/2 (100%) | 2 | 0 |
| EU_ORGANIC_FARMING | 15 | 11/15 (73%) | 11 | 4 |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 7 | 7/7 (100%) | 7 | 0 |
| FREE_FROM_GLUTEN | 7 | 1/7 (14%) | 1 | 0 |
| GREEN_DOT | 5 | 5/5 (100%) | 5 | 0 |
| HALAL | 3 | 1/3 (33%) | 1 | 2 |
| LACTOSE_FREE | 1 | 0/1 (0%) | 0 | 0 |
| MINIMUM_DRINKING_AGE_18_WARNING | 2 | 0/2 (0%) | 0 | 2 |
| NUTRISCORE_B | 4 | 2/4 (50%) | 2 | 2 |
| NUTRISCORE_C | 1 | 1/1 (100%) | 1 | 0 |
| NUTRISCORE_D | 1 | 1/1 (100%) | 1 | 0 |
| NUTRISCORE_E | 1 | 0/1 (0%) | 0 | 1 |
| ON_THE_WAY_TO_PLANETPROOF | 5 | 0/5 (0%) | 0 | 1 |
| PREGNANCY_WARNING | 12 | 11/12 (92%) | 11 | 1 |
| RAINFOREST_ALLIANCE_PEOPLE_NATURE | 15 | 15/15 (100%) | 15 | 0 |
| RECYCLABLE_GENERAL_CLAIM | 8 | 7/8 (88%) | 7 | 1 |
| RETURNABLE_CAN_NL | 3 | 3/3 (100%) | 3 | 0 |
| SOCIETY_PLASTICS_INDUSTRY | 2 | 0/2 (0%) | 0 | 2 |
| TRIMAN | 5 | 4/5 (80%) | 4 | 1 |
| VEGAN | 10 | 10/10 (100%) | 10 | 0 |
| VEGAN_SOCIETY_VEGAN_LOGO | 3 | 3/3 (100%) | 3 | 0 |
| WEIDEMELK | 7 | 6/7 (86%) | 6 | 1 |
| **totaal** | **140** | **100/140 (71%)** | **99** | **24** |

### Splitsing E: verdeling per soort

| soort | train | test | GTIN's train | GTIN's test |
|---|---|---|---|---|
| AGRICULTURE_BIOLOGIQUE * | 2 | 1 | 1 | 1 |
| AISE_1 | 6 | 0 | 5 | 0 |
| AISE_2 | 4 | 0 | 2 | 0 |
| AISE_2020_COMPANY * | 4 | 2 | 3 | 2 |
| AISE_5 | 6 | 0 | 4 | 0 |
| AQUACULTURE_STEWARDSHIP_COUNCIL | 8 | 0 | 6 | 0 |
| BDIH_LOGO | 2 | 0 | 1 | 0 |
| BETER_LEVEN_1_STER | 37 | 15 | 13 | 10 |
| BETER_LEVEN_2_STER * | 10 | 2 | 4 | 1 |
| CCA_GLUTEN_FREE | 1 | 0 | 1 | 0 |
| CERTIFIED_B_CORPORATION | 5 | 0 | 5 | 0 |
| CONFORMITE_EUROPEENNE | 3 | 0 | 2 | 0 |
| CROSSED_GRAIN_SYMBOL | 7 | 0 | 5 | 0 |
| DO_NOT_DRINK_AND_DRIVE_WARNING | 8 | 0 | 8 | 0 |
| EUROPEAN_V_LABEL_VEGAN | 25 | 8 | 14 | 5 |
| EUROPEAN_V_LABEL_VEGETARIAN | 2 | 0 | 2 | 0 |
| EU_ORGANIC_FARMING | 53 | 15 | 37 | 9 |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 30 | 3 | 26 | 3 |
| FREE_FROM_GLUTEN | 13 | 0 | 8 | 0 |
| GREEN_DOT | 37 | 8 | 34 | 7 |
| HALAL | 9 | 0 | 5 | 0 |
| LACTOSE_FREE | 10 | 0 | 9 | 0 |
| MARINE_STEWARDSHIP_COUNCIL_LABEL * | 30 | 2 | 11 | 1 |
| MINIMUM_DRINKING_AGE_18_WARNING | 7 | 0 | 5 | 0 |
| NUTRISCORE_A | 27 | 11 | 13 | 8 |
| NUTRISCORE_B * | 27 | 1 | 15 | 1 |
| NUTRISCORE_C | 20 | 8 | 16 | 7 |
| NUTRISCORE_D | 11 | 4 | 10 | 4 |
| NUTRISCORE_E | 12 | 4 | 8 | 4 |
| ON_THE_WAY_TO_PLANETPROOF * | 5 | 1 | 5 | 1 |
| PREGNANCY_WARNING | 42 | 6 | 32 | 5 |
| RAINFOREST_ALLIANCE_PEOPLE_NATURE | 65 | 14 | 32 | 11 |
| RECYCLABLE_GENERAL_CLAIM | 64 | 5 | 37 | 4 |
| RETURNABLE_CAN_NL | 11 | 0 | 6 | 0 |
| SEPARATE_COLLECTION | 4 | 0 | 2 | 0 |
| SOCIETY_PLASTICS_INDUSTRY | 5 | 0 | 5 | 0 |
| TRIMAN * | 11 | 1 | 10 | 1 |
| VEGAN | 29 | 12 | 25 | 8 |
| VEGAN_SOCIETY_VEGAN_LOGO | 20 | 0 | 15 | 0 |
| WEIDEMELK | 47 | 25 | 27 | 11 |
| **totaal** | **719** | **148** | **352** | **95** |

\* minder dan 3 test-uitsneden (gemarkeerd, telt wel mee in het totaal). Alleen in train: AISE_1, AISE_2, AISE_5, AQUACULTURE_STEWARDSHIP_COUNCIL, BDIH_LOGO, CCA_GLUTEN_FREE, CERTIFIED_B_CORPORATION, CONFORMITE_EUROPEENNE, CROSSED_GRAIN_SYMBOL, DO_NOT_DRINK_AND_DRIVE_WARNING, EUROPEAN_V_LABEL_VEGETARIAN, FREE_FROM_GLUTEN, HALAL, LACTOSE_FREE, MINIMUM_DRINKING_AGE_18_WARNING, RETURNABLE_CAN_NL, SEPARATE_COLLECTION, SOCIETY_PLASTICS_INDUSTRY, VEGAN_SOCIETY_VEGAN_LOGO. Alleen in test: geen.

### Splitsing E: Baseline (ACC-methode)

| soort | test | top-1 juist | gevonden ≥ 0.8 | onterecht ≥ 0.8 | onder drempel |
|---|---|---|---|---|---|
| AGRICULTURE_BIOLOGIQUE * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| AISE_2020_COMPANY * | 2 | 2/2 (100%) | 2 | 0 | 0 |
| BETER_LEVEN_1_STER | 15 | 11/15 (73%) | 11 | 4 | 0 |
| BETER_LEVEN_2_STER * | 2 | 0/2 (0%) | 0 | 2 | 0 |
| EUROPEAN_V_LABEL_VEGAN | 8 | 8/8 (100%) | 8 | 0 | 0 |
| EU_ORGANIC_FARMING | 15 | 15/15 (100%) | 15 | 0 | 0 |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 3 | 3/3 (100%) | 3 | 0 | 0 |
| GREEN_DOT | 8 | 8/8 (100%) | 8 | 0 | 0 |
| MARINE_STEWARDSHIP_COUNCIL_LABEL * | 2 | 2/2 (100%) | 2 | 0 | 0 |
| NUTRISCORE_A | 11 | 6/11 (55%) | 6 | 2 | 3 |
| NUTRISCORE_B * | 1 | 0/1 (0%) | 0 | 0 | 1 |
| NUTRISCORE_C | 8 | 1/8 (12%) | 1 | 0 | 7 |
| NUTRISCORE_D | 4 | 4/4 (100%) | 4 | 0 | 0 |
| NUTRISCORE_E | 4 | 3/4 (75%) | 3 | 0 | 1 |
| ON_THE_WAY_TO_PLANETPROOF * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| PREGNANCY_WARNING | 6 | 5/6 (83%) | 3 | 0 | 3 |
| RAINFOREST_ALLIANCE_PEOPLE_NATURE | 14 | 14/14 (100%) | 14 | 0 | 0 |
| RECYCLABLE_GENERAL_CLAIM | 5 | 4/5 (80%) | 4 | 0 | 1 |
| TRIMAN * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| VEGAN | 12 | 3/12 (25%) | 3 | 9 | 0 |
| WEIDEMELK | 25 | 25/25 (100%) | 25 | 0 | 0 |
| **totaal** | **148** | **117/148 (79%)** | **115** | **17** | **16** |

### Splitsing E: Model C (train-uitsneden als extra referenties)

| soort | test | top-1 juist | gevonden ≥ 0.8 | onterecht ≥ 0.8 | onder drempel |
|---|---|---|---|---|---|
| AGRICULTURE_BIOLOGIQUE * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| AISE_2020_COMPANY * | 2 | 2/2 (100%) | 2 | 0 | 0 |
| BETER_LEVEN_1_STER | 15 | 11/15 (73%) | 11 | 4 | 0 |
| BETER_LEVEN_2_STER * | 2 | 0/2 (0%) | 0 | 2 | 0 |
| EUROPEAN_V_LABEL_VEGAN | 8 | 8/8 (100%) | 8 | 0 | 0 |
| EU_ORGANIC_FARMING | 15 | 15/15 (100%) | 15 | 0 | 0 |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 3 | 3/3 (100%) | 3 | 0 | 0 |
| GREEN_DOT | 8 | 8/8 (100%) | 8 | 0 | 0 |
| MARINE_STEWARDSHIP_COUNCIL_LABEL * | 2 | 2/2 (100%) | 2 | 0 | 0 |
| NUTRISCORE_A | 11 | 5/11 (45%) | 5 | 6 | 0 |
| NUTRISCORE_B * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| NUTRISCORE_C | 8 | 5/8 (62%) | 5 | 3 | 0 |
| NUTRISCORE_D | 4 | 4/4 (100%) | 4 | 0 | 0 |
| NUTRISCORE_E | 4 | 3/4 (75%) | 3 | 1 | 0 |
| ON_THE_WAY_TO_PLANETPROOF * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| PREGNANCY_WARNING | 6 | 6/6 (100%) | 3 | 0 | 3 |
| RAINFOREST_ALLIANCE_PEOPLE_NATURE | 14 | 14/14 (100%) | 14 | 0 | 0 |
| RECYCLABLE_GENERAL_CLAIM | 5 | 5/5 (100%) | 5 | 0 | 0 |
| TRIMAN * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| VEGAN | 12 | 3/12 (25%) | 3 | 9 | 0 |
| WEIDEMELK | 25 | 25/25 (100%) | 25 | 0 | 0 |
| **totaal** | **148** | **123/148 (83%)** | **120** | **25** | **3** |

### Splitsing E: Model A (logistische regressie), drempel 0.35

| soort | test | top-1 juist | gevonden ≥ 0.35 | onterecht ≥ 0.35 | onder drempel |
|---|---|---|---|---|---|
| AGRICULTURE_BIOLOGIQUE * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| AISE_2020_COMPANY * | 2 | 2/2 (100%) | 2 | 0 | 0 |
| BETER_LEVEN_1_STER | 15 | 9/15 (60%) | 9 | 6 | 0 |
| BETER_LEVEN_2_STER * | 2 | 2/2 (100%) | 2 | 0 | 0 |
| EUROPEAN_V_LABEL_VEGAN | 8 | 7/8 (88%) | 7 | 1 | 0 |
| EU_ORGANIC_FARMING | 15 | 15/15 (100%) | 15 | 0 | 0 |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 3 | 3/3 (100%) | 3 | 0 | 0 |
| GREEN_DOT | 8 | 8/8 (100%) | 8 | 0 | 0 |
| MARINE_STEWARDSHIP_COUNCIL_LABEL * | 2 | 2/2 (100%) | 2 | 0 | 0 |
| NUTRISCORE_A | 11 | 7/11 (64%) | 7 | 4 | 0 |
| NUTRISCORE_B * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| NUTRISCORE_C | 8 | 7/8 (88%) | 7 | 1 | 0 |
| NUTRISCORE_D | 4 | 4/4 (100%) | 1 | 0 | 3 |
| NUTRISCORE_E | 4 | 1/4 (25%) | 1 | 3 | 0 |
| ON_THE_WAY_TO_PLANETPROOF * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| PREGNANCY_WARNING | 6 | 6/6 (100%) | 5 | 0 | 1 |
| RAINFOREST_ALLIANCE_PEOPLE_NATURE | 14 | 14/14 (100%) | 14 | 0 | 0 |
| RECYCLABLE_GENERAL_CLAIM | 5 | 5/5 (100%) | 5 | 0 | 0 |
| TRIMAN * | 1 | 1/1 (100%) | 1 | 0 | 0 |
| VEGAN | 12 | 12/12 (100%) | 11 | 0 | 1 |
| WEIDEMELK | 25 | 25/25 (100%) | 25 | 0 | 0 |
| **totaal** | **148** | **133/148 (90%)** | **128** | **15** | **5** |

### Splitsing E: totaaltabel (148 test-uitsneden, 52 families)

| methode | top-1 juist | Wilson 95% | bootstrap 95% (families) | verschil met baseline (bootstrap 95%) | McNemar p (discordant) | macro-recall | gevonden ≥ 0,80 | onterecht ≥ 0,80 | gevonden bij eigen drempel | onterecht bij eigen drempel | gevonden bij evenveel onterecht als baseline |
|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 117/148 (79%) | 72%–85% | 64%–93% | – | – | 76% | 115 | 17 | 115 | 17 | 115 (zelf, 0,80) |
| baseline beperkt tot train-soorten | 117/148 (79%) | 72%–85% | 64%–93% | +0%–+0% | 1.000 (0) | 76% | 115 | 17 | 115 | 17 | 115 (drempel 0.82) |
| model C | 123/148 (83%) | 76%–88% | 69%–96% | +1%–+8% | 0.070 (8) | 85% | 120 | 25 | 120 | 25 | 67 (drempel 0.99) |
| model A (drempel 0.35) | 133/148 (90%) | 84%–94% | 82%–96% | -1%–+23% | 0.004 (28) | 92% | 69 | 1 | 128 | 15 | 133 (drempel 0.24) |
## 11. Besluiten productowner (12-10-2026)

Voorgelegd door de hoofdsessie; antwoorden van Friso:

1. **Weinig valse meldingen weegt zwaarder dan zoveel mogelijk vinden.** Een stap-2-verbetering wordt beoordeeld bij een vast, laag aantal onterechte meldingen (richtwaarde: de eis < 10% vals), niet op top-1.
2. **Het systeem mag "geen bekend keurmerk" zeggen.** De hoofdsessie verzamelt kandidaat-negatieven uit de steekproef (lege vakjes en door de poort afgewezen vakjes); Friso keurt ze goed vóór ze als voorbeeld dienen.
3. **De tegenstrijdig gelabelde plaatjes (3 groepen) en de 26 automatisch gelabelde rijen gaan opnieuw langs een mens.** Aanvullende meting bij het klaarzetten — VERIFIED: alle 26 `classifier`-rijen zijn `RECYCLABLE_GENERAL_CLAIM`, aangemaakt 09-06-2026; **25 van de 26 zijn een volledig zwart vlak** (RGB, geen transparantie, stddev van de grijswaarde < 8). Aanpassingen in `training_data` op ACC volgen pas na het oordeel, met een manifest vooraf.
4. **Spec, rapport en scripts komen in de repository** (zonder beelden of sleutels).
