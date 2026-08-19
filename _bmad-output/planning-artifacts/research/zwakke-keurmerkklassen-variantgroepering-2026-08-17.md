# Onderzoek: waarom 15 van de 38 keurmerkklassen onder 80% blijven

**Gestart:** 17 augustus 2026
**Aanleiding:** de nulmeting van 27 juli 2026 (`_bmad-output/implementation-artifacts/nulmeting-herkenning-2026-07-27.md`)
laat zien dat méér referenties de zwakke klassen niet meer helpt. Dit document zoekt uit
wat het knelpunt dán is, vóórdat er iets gebouwd wordt.

**Status:** in bewerking — nog geen eigen meting gedaan. Alles hieronder komt uit de
nulmeting of uit eerder onderzoek, met bron.

---

## 1. Wat vaststaat

`VERIFIED` — overgenomen uit de nulmeting van 2026-07-27, die is uitgevoerd met de echte
poortfunctie `measureBatch(..., 'nulmeting')` uit `apps/api/src/services/flywheel/gate.ts`,
read-only, met afgedwongen leave-one-out (self-match-guard op inhouds-hash én `cropPath`).

| Grootheid | Waarde |
|---|---|
| Echte uitsneden (referenties) | 466, allemaal met embedding |
| Gold-set met crop (de meetbare set) | 580 records — 489 ECHT / 91 VALS |
| Live drempel | `CLASSIFY_THRESHOLD_EMBEDDING=0.80` (ACC) |
| Poortdrempel vliegwiel | `FLYWHEEL_REGRESSION_THRESHOLD=0.90` (strenger, bewust) |
| Resultaat @0,80 | 77,9% totaal — 377/489 ECHT herkend, 75/91 VALS geweerd |
| Klassen ≥ 80% | 23 van 38 |

`VERIFIED` — onafhankelijk nagemeten op 2026-08-17, niet uit de nulmeting overgenomen:
de live drempel op ACC staat werkelijk op 0,80 (`CLASSIFY_THRESHOLD_EMBEDDING=0.80`,
`ENVIRONMENT=acc`, gelezen uit de draaiende ml-container), en ACC draait exact commit
`23592d4` — de huidige kop van de acc-branch, dus inclusief alles t/m story 20.14.

`VERIFIED` — volume is niet de knop. Vijf zwakke klassen met hun aantal referenties:

| Klasse | Referenties | Score @0,80 |
|---|---|---|
| RECYCLABLE_GENERAL_CLAIM | 64 | 58% |
| PREGNANCY_WARNING | 30 | 62% |
| VEGAN_SOCIETY_VEGAN_LOGO | 16 | 63% |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 13 | 52% |
| LACTOSE_FREE | 10 | 25% |

`VERIFIED` — de oogstbron is uitgeput: de laatste ronde leverde 51 nieuwe uitsneden op
1521 doorzochte paren, en diezelfde declaratie-paren zijn nu verwerkt.

`INFERENCE` — de nulmeting concludeert dat de varianten van hetzelfde keurmerk "te ver uit
elkaar liggen in de embedding-ruimte". Dat is een plausibele verklaring, maar **niet
gemeten**: er is geen cijfer over hoe ver de missers naast een referentie zitten. Dat is
precies wat meting M1 hieronder moet ophalen.

---

## 2. De vraag die alles bepaalt

Van de 112 ECHT-missers (489 − 377) is nu onbekend **hoe ver ze mis zijn**. Er zijn twee
werelden, met totaal verschillende oplossingen:

- **Wereld A — de missers zitten net onder de drempel** (beste match 0,70–0,79). Dan is
  het geen representatieprobleem maar een kalibratieprobleem: drempel, normalisatie, of
  het aantal kandidaten dat `ivfflat` ophaalt (eerder al een bekend knelpunt, zie
  `project_recyclable_dead_refs`: onder-fetchen).
- **Wereld B — de missers zitten er ver naast** (beste match < 0,60). Dan helpt geen enkele
  drempel en is het wél de representatie: de uitsnede of het beeldmodel vangt het keurmerk
  niet. Dat sluit aan op de eerdere conclusie dat het knelpunt in de referentie zit, niet
  in het model (`project_123_realref_pivot`).

Zonder dit onderscheid is elke bouwbeslissing gokken.

---

## 3. Geplande metingen (allebei read-only)

### M1 — verdeling van de beste match per gold-set-sample

Per gold-set-record met crop: de hoogste gelijkenis over alle referenties, plus de klasse
van die beste referentie, gesplitst naar ECHT/VALS en met leave-one-out aan.

Levert in één run:
1. de verdeling van de 112 ECHT-missers over 0,00–0,80 → beslist wereld A of B;
2. de verdeling van de VALS-samples in 0,70–0,80 → dit is precies het openstaande
   actiepunt uit de terugblikken op epic 19 en epic 12 over de vloer waarboven de
   kruischeck zelf mag bevestigen. Twee vragen, één meting.
3. per zwakke klasse: matcht de misser op een referentie van een **andere** klasse (dan is
   het een verwarringsprobleem) of op niets (dan is het een dekkingsprobleem)?

### M2 — spreiding binnen een klasse

Voor de vijf zwakke klassen: de onderlinge gelijkenis tussen de referenties van diezelfde
klasse. Liggen die zelf al ver uit elkaar, dan is "één keurmerk = één groep" een verkeerde
aanname en horen er subgroepen per variant te bestaan.

### Correctie op M1 punt 3 — de huidige meting kán die vraag niet beantwoorden

`VERIFIED` — `best_similarity()` in `apps/ml-service/app/services/regression_eval.py:110-112`
slaat elke referentie van een **andere** klasse over (`if e.get("t3777Code") != q_class:
continue`). De poortmeting vergelijkt dus uitsluitend binnen de eigen klasse.

Gevolg: "matcht de misser op een referentie van een andere klasse?" is met deze meting
**niet** te beantwoorden — niet omdat het niet gemeten is, maar omdat de vergelijking daar
per ontwerp niet gemaakt wordt. Daar is een ongescopete naaste-buur-vraag voor nodig, zoals
de oogst-kruisguard uit story 20.7 die al doet (`_cross_code_rejected` +
`find_similar_references`). Dat wordt een aparte meting M3; M1 blijft beperkt tot punt 1 en 2.

### Één run levert alle drempels

`VERIFIED` — `evaluate_sample()` (`:135-152`) berekent `topSimilarity` los van de drempel; de
drempel zet alleen de vlaggen `recognized` en `correct`. De verdeling van `topSimilarity` is
dus drempel-onafhankelijk, en één meetronde levert de héle drempelcurve op, offline te
berekenen. Dat verklaart ook waarom de nulmeting geen tweede run nodig had — maar niet
waarom alleen de aggregaten bewaard zijn.

### Voorwaarde vooraf

Het script van de nulmeting is **niet bewaard** — er staat niets in de repository dat
`measureBatch` van buiten aanroept, en de nulmeting noemt geen commando. De meetharnas moet
dus opnieuw gebouwd worden. Bouw hem dit keer als bestand in de repository, zodat de meting
herhaalbaar is; dat is ook wat de bewijsregel vraagt (elke bewering met een fragment dat
Friso zelf kan overdoen).

---

## 4. Uitkomst M1 (gemeten 17 augustus 2026)

Gedraaid met `scripts/qa/meet-gelijkenis-verdeling.py` in de ACC-ml-container, tegen de
bestaande read-only poort-endpoint `POST /ml/regression-eval`. Ruwe per-sample-uitkomsten
bewaard; 580 uitsneden (489 ECHT / 91 VALS), zelfde set als de nulmeting.

**Herhaalbaarheid `VERIFIED`:** de ECHT-cijfers komen exact overeen met de nulmeting van
27 juli (415/489 @0,75 · 377/489 @0,80 · 327/489 @0,85 · 257/489 @0,90). De VALS-kant wijkt
twee samples af (ik meet 77/91 terecht geweerd @0,80, de nulmeting meldde 75/91). Twee
records op 91 — niet materieel voor een beslissing, maar wel onverklaard; bij de volgende
run opnieuw naast elkaar leggen.

### Het antwoord op de hoofdvraag: het is BEIDE, en het splitst per keurmerk

De 112 ECHT-missers op drempel 0,80:

| Waar de misser zit | Aantal | Aandeel | Betekenis |
|---|---|---|---|
| 0,75–0,80 | 38 | 34% | bijna-misser — kalibratie |
| 0,70–0,75 | 20 | 18% | bijna-misser — kalibratie |
| 0,60–0,70 | 31 | 28% | representatie |
| 0,50–0,60 | 15 | 13% | representatie |
| < 0,50 | 8 | 7% | representatie |

Ruim de helft (58 van 112) is dus een **bijna-misser**, en 54 zit er echt naast. Eén
verklaring voor alle zwakke klassen bestaat niet.

### Per keurmerk is de diagnose wél eenduidig

ECHT-samples, klassen met n ≥ 5 die onder 80% blijven. "bijna" = 0,70–0,80, "ver" = < 0,70.

| Klasse | n | goed | bijna | ver | Diagnose |
|---|---|---|---|---|---|
| DO_NOT_DRINK_AND_DRIVE_WARNING | 9 | 2 | 6 | 1 | kalibratie |
| AISE_1 | 6 | 3 | 3 | 0 | kalibratie |
| AISE_5 | 6 | 4 | 2 | 0 | kalibratie |
| PREGNANCY_WARNING | 42 | 24 | 12 | 6 | vooral kalibratie |
| MINIMUM_DRINKING_AGE_18_WARNING | 8 | 3 | 2 | 3 | gemengd |
| RECYCLABLE_GENERAL_CLAIM | 43 | 30 | 6 | 7 | gemengd |
| VEGAN_SOCIETY_VEGAN_LOGO | 16 | 10 | 3 | 3 | gemengd |
| EU_ORGANIC_FARMING | 31 | 23 | 5 | 3 | gemengd |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 23 | 11 | 4 | 8 | vooral representatie |
| LACTOSE_FREE | 8 | 2 | 0 | 6 | representatie |
| CROSSED_GRAIN_SYMBOL | 6 | 4 | 0 | 2 | representatie |
| FREE_FROM_GLUTEN | 5 | 3 | 0 | 2 | representatie |

De waarschuwings-pictogrammen (alcohol/rijden, zwangerschap, AISE) zitten bijna allemaal
net onder de drempel. LACTOSE_FREE, CROSSED_GRAIN en FREE_FROM_GLUTEN hebben **nul**
bijna-missers: daar helpt geen enkele drempel.

### Antwoord op het openstaande actiepunt over de kruischeck-vloer

Verdeling van de 91 lookalikes (VALS) naar hun hoogste gelijkenis:

| Bereik | Aantal |
|---|---|
| ≥ 0,90 | 12 |
| 0,80–0,85 | 2 |
| 0,75–0,80 | 4 |
| 0,70–0,75 | 9 |
| 0,60–0,70 | 30 |
| 0,50–0,60 | 11 |
| < 0,50 | 13 |
| geen vergelijkbare referentie | 10 |

Twee harde conclusies:

1. **De vloer mag niet naar 0,70.** Dat laat 13 extra lookalikes door (van 14 naar 27 van
   de 91). Naar 0,75 kost 4 extra. Het actiepunt "meet de VALS-verdeling in 0,70–0,80
   vóórdat de 0,80-vloer verlaagd wordt" is hiermee ingelost: verlagen naar 0,70 is af te
   raden, 0,75 is een reële afweging.
2. **12 lookalikes halen ≥ 0,90** — hoger dan zelfs de strenge poortdrempel. Voor die twaalf
   is géén drempel veilig; dat is een verwarrings- of labelprobleem dat apart onderzocht
   moet worden (meting M3, ongescopete naaste buur).

`INFERENCE` — 10 van de 91 lookalikes hebben geen enkele referentie in hun klasse en kunnen
dus per definitie geen vals-positief opleveren. Ze tellen wel mee als "terecht geweerd" en
maken de lookalike-score daarmee ~11 procentpunt gunstiger dan de werkelijke afweerkracht.

### Methodische controle: werkt de leave-one-out-guard echt?

`VERIFIED` — de guard heeft twee sleutels (inhouds-hash, dan pad), maar de endpoint zet de
hash op referentie-rijen expliciet op `None` (`apps/ml-service/app/api/flywheel.py:368`),
dus in de praktijk werkt uitsluitend de pad-sleutel. Die doet wél echt werk: **309 van de
580** gold-set-uitsneden zijn tegelijk een actieve referentie met exact hetzelfde pad
(zelfde klasse), en worden dus tegen zichzelf uitgesloten. Zonder die guard zou meer dan de
helft van de meting een gratis 1,0 halen. Restrisico: raakt dezelfde afbeelding ooit onder
een ánder pad in de referentieset, dan glipt een zelfmatch erdoor — met alleen de pad-sleutel
is dat niet te zien.

```sql
-- Herhaalbaar: hoeveel gold-set-uitsneden zijn tegelijk actieve referentie?
SELECT count(*) FROM gold_set_records g
WHERE g.replaced_by_id IS NULL AND g.crop_path IS NOT NULL
  AND EXISTS (SELECT 1 FROM reference_logos rl
              WHERE rl.active AND rl.storage_path = g.crop_path
                AND rl.t3777_code = g.t3777_code);
```

## 4b. De 12 lookalikes boven 0,90 — uitgezocht (17 augustus 2026)

`VERIFIED` — samenstelling: 10 × RECYCLABLE_GENERAL_CLAIM, 1 × EUROPEAN_V_LABEL_VEGAN,
1 × RAINFOREST_ALLIANCE_PEOPLE_NATURE. **Alle twaalf zijn `review-reject`** — menselijke
afwijzingen — en alle twaalf komen uit de declaratie-oogst van story 20.2 (`20_2_`-prefix).
Zeven scoren **exact 1,0000**.

### Bevinding A — één afwijzing spreekt een eerdere goedkeuring tegen

`VERIFIED`, byte-vergelijking (md5 over de opslag, read-only): de afgewezen uitsnede
`artwork-crops/08721516201379/20_2_EUROPEAN_V_LABEL_VEGAN__229_97_518.png` is **byte-identiek**
aan de ACTIEVE referentie `review:12_6_EUROPEAN_V_LABEL_VEGAN__1798_97_518.png`
(`reference_logos` e3476b2a). Let op de gelijke staart `_97_518`: dezelfde uitsnede-coördinaten.

Dezelfde afbeelding is dus én goedgekeurd (en als referentie in gebruik) én afgewezen. Eén van
beide menselijke beslissingen is fout. Zolang dat zo staat, produceert de meting hier
gegarandeerd een "vals-positief" die met geen enkele drempel te verhelpen is — en gebruikt de
herkenning mogelijk een referentie die niet had mogen bestaan.

### Bevinding B — bij RECYCLABLE is het onderscheid niet visueel

`VERIFIED` — de 10 RECYCLABLE-afwijzingen zijn **niet** byte-identiek aan een actieve
referentie, maar scoren wel 0,99–1,00. Anders gezegd: het beeldmodel ziet géén verschil, terwijl
een mens ze afwees.

`INFERENCE` (sterk) — de afwijzing ging dan niet over hoe het teken eruitziet maar over de
context: een materiaalcode, een verkeerd kader, of een Mobius-lus die geen recyclebaarheidsclaim
is. Dat is met een uitsnede-vergelijking principieel niet te beslissen, hoeveel referenties er
ook bijkomen. Dit is de meest waarschijnlijke verklaring voor het hardnekkig lage cijfer van
RECYCLABLE_GENERAL_CLAIM (43 ECHT-samples, bereik 0,27–1,00 — de breedste spreiding van alle
klassen) en het sluit aan op het mislabel-verleden dat story 20.13 al noemde.

Gevolg voor de meting: deze 10 records drukken de lookalike-score structureel omlaag zonder dat
er iets aan te verbeteren valt. Ze horen apart behandeld te worden, niet meegeteld als
"herkenning presteert slecht".

### Bevinding C — dubbel gold-set-record

`VERIFIED` — `2c4334ef-28f5-4fb8-ba84-c9525b6f1929` en `1e141a18-5275-49ac-a9dc-22230fd60fae`
verwijzen naar **hetzelfde** `crop_path`
(`artwork-crops/04006795372038/20_2_RECYCLABLE_GENERAL_CLAIM__843_737_276.png`), beide actief,
beide afgewezen. Eén afbeelding telt dus twee keer mee in de noemer van 91.

## 5. Openstaande punten

- **M1: gedraaid** (§4). **M2 (spreiding binnen een klasse): nog niet gedraaid** — pas nuttig
  voor de klassen met de diagnose "representatie"; voor de kalibratie-klassen voegt hij niets toe.
- **M3 (ongescopete naaste buur): nog niet gedraaid** — nodig voor de 12 lookalikes die ≥ 0,90
  halen. Zolang die onverklaard zijn, is elke uitspraak over een lagere kruischeck-vloer
  onvolledig.
- De twee samples verschil met de nulmeting op de lookalike-kant zijn onverklaard.
### Besluiten van Friso, 17 augustus 2026

1. **Drempels splitsen.** Aanwijzen naar 0,75 (+38 terecht herkend), zelf-bevestigen blijft op
   0,80 zodat de 4 extra vals-positieven langs een mens gaan. Voorbehoud dat erbij hoort: de
   verhouding echt/lookalike in deze meetset (489 tegen 91) is niet die van productie, dus de
   ~10:1 is een meetuitkomst, geen productiebelofte.
   **UITGEVOERD** 2026-08-17 16:35 via Coolify + herstart: `CLASSIFY_THRESHOLD_EMBEDDING` naar
   `0.75`, `CROSSCHECK_THRESHOLD_EMBEDDING` nieuw aangemaakt op `0.80` (stond leeg en zou dus
   met de eerste meeschuiven). Nagemeten in béide verse containers (app én ml-service) ná de
   herstart; alle vier containers healthy, `https://logo-detection.acc.xxtract.com/` geeft 200.
   Terugdraaien: eerste weer op `0.80`, tweede verwijderen, herstarten.
2. **RECYCLABLE_GENERAL_CLAIM apart zetten**, uit de gewone herkenningsmeting. Grond:
   bevinding B — het onderscheid is niet visueel, dus geen enkele hoeveelheid referenties of
   drempel lost het op.
3. **Het betwiste vegan-voorbeeld uit gebruik.** Grond: op de uitsnede ontbreekt de balk met
   "VEGAN" die vegan van vegetarisch scheidt (beide beelden vergeleken met het gidslogo; de
   uitsnede is de eenkleurige V-Label-zegel die V-Label voor álle varianten gebruikt). Het
   risico van laten staan is een onware claim, niet een gemiste herkenning.
   **UITGEVOERD** 2026-08-17 16:35 — `reference_logos` e3476b2a op `active = false`
   (`UPDATE 1`); actieve voorbeelden voor die klasse 17 → 16. Aanvullend bewijs dat bij de
   beslissing hoort: de referentie staat op
   `artwork-crops/08721516201379/12_6_EUROPEAN_V_LABEL_VEGAN__1798_97_518.png` — **hetzelfde
   GTIN en dezelfde plek** als de afgewezen uitsnede, twee keer geoogst (story 12.6 en 20.2)
   en twee keer tegengesteld beoordeeld. Terugdraaien: `active = true` op dat ene id.
4. **Scherper beeld naar het beoordeelscherm** — met een expliciete geheugengrens, want juist
   geheugen legde in story 20.11 de oogstronde om.

5. **Dubbelen opgeruimd — en het waren er 13, niet 1.** Bevinding C bleek geen incident: 13
   paden hadden twee actieve records (580 records op 567 unieke afbeeldingen). In géén enkele
   stapel spraken de labels elkaar tegen, dus zuiver een tellingsfout, geen beoordelingsconflict.
   **UITGEVOERD** 2026-08-17: per pad blijft het nieuwste record actief, het oudere kreeg
   `replaced_by_id` = het nieuwe id (bestaande vervangings-semantiek; niets verwijderd).
   Nagemeten: actief 580 → **567 (ECHT 478 / VALS 89)**, 0 dubbele paden over. Terugdraaien:
   `replaced_by_id = NULL` op de 13 genoemde records — de paren staan in het sessielogboek.

### Nieuwe verklaring voor het verschil van 2 met de nulmeting

`VERIFIED` — er zijn ná de laatste commit nog gold-set-records bijgekomen: 47 op 2026-07-28 en
19 op 2026-07-29. Er is dus na 27 juli nog beoordeeld of geoogst op ACC.

`INFERENCE` — dat is de meest waarschijnlijke verklaring voor de twee samples verschil op de
lookalike-kant: nieuwe records vervangen oude, en de set is sindsdien licht verschoven. Daarmee
is dat punt niet langer volledig onverklaard, maar ook niet hard bewezen.

### Nieuwe nullijn ná drempelwijziging én opschoning (17 augustus 2026)

Zelfde script, verse run op de opgeschoonde set (567 records: 478 ECHT / 89 VALS).

| Drempel | ECHT herkend | Lookalikes onterecht herkend |
|---|---|---|
| 0,70 | 425/478 = 88,9% | 26/89 = 29,2% |
| **0,75 (nu LIVE)** | **406/478 = 84,9%** | **17/89 = 19,1%** |
| 0,80 (was live) | 369/478 = 77,2% | 13/89 = 14,6% |
| 0,85 | 321/478 = 67,2% | 11/89 = 12,4% |
| 0,90 | 251/478 = 52,5% | 11/89 = 12,4% |

**De voorspelling is uitgekomen:** de stap van 0,80 naar 0,75 levert +37 terecht herkende
keurmerken (77,2% → 84,9%) en kost 4 extra vals-positieven (13 → 17). Voorspeld was +38 / +4 op
de ongeschoonde set — het verschil van één zit in de 13 verwijderde dubbelen.

**Ook zichtbaar dat de referentie-ingreep werkte:** lookalikes met score ≥ 0,90 gingen van 12
naar 11. De verwijderde vegan-referentie was inderdaad één van die twaalf.

Deze tabel is vanaf nu de nullijn — niet meer die van 27 juli, want zowel de drempel als de set
is gewijzigd. Blijft staan: 10 van de 89 lookalikes hebben geen enkele referentie in hun klasse
en kunnen dus per definitie geen vals-positief worden; de afweerkracht is daarmee ~11
procentpunt gunstiger weergegeven dan hij is.

- Nog te doen: M2 voor de klassen met diagnose "representatie" (lactosevrij, glutenteken,
  glutenvrij), en M3 (ongescopete naaste buur) voor de kruisverwarring.
- Volgende klus (besluit Friso): eerst het beoordeelscherm repareren — dat is nu stuk en
  beoordelen is de motor van al het bovenstaande.

## 6. Bronnen

- `_bmad-output/implementation-artifacts/nulmeting-herkenning-2026-07-27.md` — de cijfers in §1.
- `scripts/qa/meet-gelijkenis-verdeling.py` — het meetscript van §4, herhaalbaar.
- Ruwe per-sample-uitkomsten van de run van 2026-08-17: sessie-kladmap
  `gelijkenis-samples.json` (580 samples). Verplaats naar een blijvende plek als §4 herbruikt
  moet worden — een kladmap overleeft de sessie niet.
- `apps/ml-service/app/services/regression_eval.py` — `best_similarity` (klasse-scoping op
  `:110-112`), `_is_self_match` (`:61-87`), `evaluate_sample` (`:135-152`).
- `apps/ml-service/app/api/flywheel.py:328-420` — de read-only meet-endpoint; `:368` zet de
  inhouds-hash van referenties op `None`.
- `apps/api/src/services/flywheel/gate.ts` — `measureBatch`, `resolveBaseline`, de drempels.
- Eerder onderzoek (MemPalace): `project_flywheel_recall_research`, `project_123_realref_pivot`,
  `project_recyclable_dead_refs`.
