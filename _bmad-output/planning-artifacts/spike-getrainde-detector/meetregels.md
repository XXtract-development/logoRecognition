---
titel: Meetregels proef getrainde detector
hoort-bij: SPEC.md (CAP-9, CAP-11, stopregel)
datum: 2026-10-31
bijgewerkt: 2026-10-31 (na bmad-review)
---

# Meetregels

Dit bestand is de enige plek voor: de definities, de gelijkende keurmerken per keurmerk (§2), de telling, de bevriezingslijst (§6) en de uitvoertabel (§7).

## 1. Definities (vaste keuze Friso, 31-10-2026)

Alles telt **per etiket**, op aanwezigheid. Een vakje of positie telt niet mee. **Aanwezig** betekent: het keurmerk staat er als gedrukt logo of pictogram. Alleen tekst (bijvoorbeeld een zin over zwangerschap zonder pictogram) telt niet als aanwezig.

- **Melding:** het systeem zegt dat keurmerk X op het etiket staat.
- **Gevonden (keurmerk X):** noemer = etiketten waarop Friso X als aanwezig heeft bevestigd; teller = die etiketten met een melding X. Eis: Wilson-95%-**ondergrens ≥ 80%**.
- **Vals (keurmerk X):** noemer = etiketten waarop Friso X als afwezig heeft bevestigd; teller = die etiketten met een melding X. Eis: Wilson-95%-**bovengrens < 10%**.
- **Stopregel per keurmerk:** beide eisen gehaald → **"automatisch"**; anders → **"mens bevestigt"** (het systeem doet een voorstel, een mens bevestigt).
- De Wilson-ondergrens is het percentage dat je met 95% zekerheid minstens haalt, gegeven hoeveel etiketten zijn geteld; de bovengrens is wat je met 95% zekerheid hooguit haalt. Met weinig etiketten liggen ze ver van het gemeten percentage.
- Berekening: `wilson` uit `_bmad-output/planning-artifacts/spike-architectuurkeuze-logoherkenning/fase-b/tel.py` (z = 1,96), hergebruikt.

## 2. De 8 keurmerken en hun gelijkende keurmerken

Een **gelijkend keurmerk** lijkt op een van de 8, maar is het niet. In de training worden ze bewust ongelabeld toegevoegd (**harde negatieven**), zodat de detector ze leert negeren. In de toets maken ze de zonder-kant moeilijker.

| # | Keurmerk | Codes | Rol | Gelijkende keurmerken |
|---|---|---|---|---|
| 1 | EU-biologisch | `EU_ORGANIC_FARMING` | kern | `AGRICULTURE_BIOLOGIQUE`, `BDIH_LOGO`, nationale bio-logo's |
| 2 | Groene Punt | `GREEN_DOT` | kern | `RECYCLABLE_GENERAL_CLAIM`, `TRIMAN`, `SEPARATE_COLLECTION`, `SOCIETY_PLASTICS_INDUSTRY`, `RETURNABLE_CAN_NL` |
| 3 | Recyclebaar | `RECYCLABLE_GENERAL_CLAIM` | kern | `GREEN_DOT`, `TRIMAN`, `SEPARATE_COLLECTION`, `SOCIETY_PLASTICS_INDUSTRY`, `RETURNABLE_CAN_NL` |
| 4 | Nutri-Score | `NUTRISCORE_A`, `NUTRISCORE_B`, `NUTRISCORE_C` (één groep) | kern | `NUTRISCORE_D`, `NUTRISCORE_E`, andere gekleurde schalen |
| 5 | Zwangerschapswaarschuwing | `PREGNANCY_WARNING` | kern | `MINIMUM_DRINKING_AGE_18_WARNING`, `DO_NOT_DRINK_AND_DRIVE_WARNING` |
| 6 | MSC | `MARINE_STEWARDSHIP_COUNCIL_LABEL` | ijkpunt | `AQUACULTURE_STEWARDSHIP_COUNCIL` |
| 7 | Weidemelk | `WEIDEMELK` | ijkpunt | `BETER_LEVEN_1_STER`, `BETER_LEVEN_2_STER` |
| 8 | Vegan Society | `VEGAN_SOCIETY_VEGAN_LOGO` | ijkpunt | `EUROPEAN_V_LABEL_VEGAN`, `EUROPEAN_V_LABEL_VEGETARIAN`, `VEGAN` |

IJkpunten zijn de drie keurmerken die ook in de vorige proef (fase B) gemeten zijn; ze maken de uitkomst vergelijkbaar met die proef. Ze krijgen dezelfde telling en hetzelfde besluit als de kern. Bron van de groepen: `_bmad-output/planning-artifacts/eindtest-logo-pijplijn/lookalike-groepen.md` in de hoofdmap.

## 3. Nutri-Score als groep

- Friso legt per etiket de verzameling zichtbare letters vast (A–E), of "letter onleesbaar".
- **Mét:** etiketten met minstens één van A, B, C. **Gevonden** als alle gemelde Nutri-Score-letters in die verzameling zitten (en er minstens één is). Een gemelde letter buiten de verzameling, ook naast de juiste, maakt het etiket **gemist**; het wordt apart geteld als "verkeerde letter".
- **Zonder:** etiketten zonder A, B en C, dus ook etiketten met alleen Nutri-Score D of E (de detector kent D en E niet als klasse). Op zulke etiketten is elke melding A, B of C **vals**.
- "Letter onleesbaar" telt aan geen van beide kanten mee.
- A, B en C worden ook per letter gerapporteerd, ter informatie; het besluit valt op de groep.

## 4. Benodigde aantallen (Wilson 95%, nagerekend met `wilson`, 31-10-2026)

**Zonder-kant: maximaal toegestane valse meldingen om "< 10%" te bewijzen.**

| Etiketten zonder | 30 | 34 | 35 | 40 | 50 | 60 | 80 | 100 | 150 |
|---|---|---|---|---|---|---|---|---|---|
| Max. vals | onmogelijk (0/30 → 11,35%) | onmogelijk (0/34 → 10,15%) | 0 | 0 | 0 | 1 | 2 | 4 | 7 |

**Met-kant: minimaal benodigde vondsten om "≥ 80%" te bewijzen.**

| Etiketten met | 16 | 20 | 25 | 30 | 40 | 50 |
|---|---|---|---|---|---|---|
| Min. gevonden | 16 | 20 | 24 | 29 | 37 | 46 |

> [!warning] Correctie op het doel "30–50 zonder" (ter kennisname aan Friso)
> Met 30 tot 34 etiketten zonder keurmerk is "< 10% vals" nooit te bewijzen, ook niet met nul fouten. Doel daarom: **≥ 50 zonder per keurmerk**. Dat kost geen extra etiketten: elk etiket waarop Friso een keurmerk afwezig verklaart, telt als "zonder" voor dat keurmerk (**gedeelde negatieven**).

**Doel per keurmerk:** ≥ 16 bevestigde etiketten mét het keurmerk (liefst ≥ 25) en ≥ 50 zonder, waarvan liefst ≥ 10 met een gelijkend keurmerk (§2). Het aantal met een gelijkend keurmerk komt uit de voorinvulling en is niet door Friso bevestigd.
**Te weinig voorbeelden:** minder dan 16 mét of minder dan 35 zonder → besluit "te weinig voorbeelden", niet "mens bevestigt".

## 5. Welke etiketten tellen

- Per keurmerk telt alleen een bevestigd oordeel (aanwezig of afwezig). "Onzeker" telt voor dat keurmerk niet mee; een etiket met status "onleesbaar" telt voor geen enkel keurmerk mee. Hun aantallen worden wel apart gerapporteerd.
- Draaide een route niet op een etiket (fout of tijd op), dan telt dat als **geen melding**, en de fout wordt per route geteld. **Foutpercentage** = etiketten met minstens één fout ÷ bevestigde toetsetiketten. Boven 2% is de run ongeldig.
- **Een zdr-weigering is geen etiketfout.** Weigert de aanbieder een aanroep omdat er geen endpoint met zdr is, dan stopt de hele run; zie [randvoorwaarden.md §1](randvoorwaarden.md#1-privacy-zdr).

## 6. Bevriezing en eenmalige toetsrun (CAP-11)

Vóór de eerste toetsrun liggen vast in `bevroren.json`, elk met sha256:

1. de scheiding (`scheiding.json`);
2. de lijst bevestigde toetsetiketten en hun uitslag (`toets/uitslag.json`);
3. het model (checkpoint), de maat en de tegelinstellingen;
4. de drempels `laag`/`hoog` per code;
5. model, prompt en antwoordschema van de beoordelaar, en de referentieplaatjes per code;
6. de K4-aa-code (commit), de gefilterde referentieset en het tijdsbudget per etiket;
7. de telcode;
8. de gewichten (URL, sha256, licentie).

- **De eerste toetsrun per route telt.** Een tweede run mag alleen met `--herhaling` en een vastgelegde technische reden (niet na een tegenvallende uitslag); de eerste uitslag blijft bewaard. Een gewijzigde hash wordt geweigerd.
- Niets wordt afgesteld op de toetsset.
- **Blind nakijken.** Na de runs maakt de telcode een lijst van alle etiketten waar een route en de waarheid verschillen, zonder te zeggen welke route het was. Kijkt Friso die na, dan geldt het besluit op de uitslag ná nakijken (voor beide routes dezelfde correcties); de uitslag ervóór wordt ook gerapporteerd. Kijkt hij niet na, dan geldt de uitslag ervóór.
- Per keurmerk wordt gelogd hoe vaak Friso de voorinvulling veranderde (correctiepercentage).

## 7. Uitvoer per route en keurmerk

Eén getoetst script maakt uit de bevroren uitvoer drie tabellen: **D+A** (detector, beoordelaar en certificaatnummers; hierop valt het besluit), **D** (zonder certificaatnummers, ter informatie) en **K4-aa** (met gefilterde referenties; een run met de volledige referentieset is alleen informatief). Per keurmerk:

| kolom | inhoud |
|---|---|
| mét | gevonden / aanwezig, Wilson-ondergrens |
| zonder | vals / afwezig, Wilson-bovengrens |
| verkeerde letter | alleen Nutri-Score |
| spreiding per leverancier | 95%-interval als je de leveranciers opnieuw trekt (GLN-bootstrap, `trekkingen`/`bootstrap` uit `tel.py`; informatief) |
| leveranciers | aantal leveranciers (GLN's) aan de mét-kant |
| besluit | automatisch / mens bevestigt / te weinig voorbeelden |

Daarnaast per route: tijd per etiket (mediaan, p90, max), kosten per etiket (gemiddeld en totaal, uit `usage.cost`), aantal beoordelaaraanroepen, foutpercentage, en voor K4-aa het aandeel meldingen met "requires_review". **Elke K4-aa-detectie telt als melding**, ook met "requires_review". En per keurmerk het verschil tussen D+A en K4-aa (gevonden en vals in procentpunten), met de etiketten waarop ze verschillen als lokale lijst.
