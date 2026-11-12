---
titel: Meetregels proef getrainde detector
hoort-bij: SPEC.md (CAP-9, CAP-11, stopregel)
datum: 2026-10-31
bijgewerkt: 2026-11-12 (ronde 11f: AI-aandeel in het eindrapport, §7; ronde 11b: glutenvrij-uitzondering in §1 en gate C, besluiten Friso 12-11-2026; besluiten Friso: steekproef bij nakijken, akkoord ≥ 50 zonder; ronde 5: Nutri-Score A–E, V-label als 9e keurmerk; ronde 9 (02-11-2026): FSC, Triman, kunststofcode, PlanetProof; ronde 10 (03-11-2026): glutenvrij als 14e keurmerk)
---

# Meetregels

Dit bestand is de enige plek voor: de definities, de gelijkende keurmerken per keurmerk (§2), de telling, de bevriezingslijst (§6) en de uitvoertabel (§7).

## 1. Definities (vaste keuze Friso, 31-10-2026)

Alles telt **per etiket**, op aanwezigheid. Een vakje of positie telt niet mee. **Aanwezig** betekent: het keurmerk staat er als gedrukt logo of pictogram. Alleen tekst (bijvoorbeeld een zin over zwangerschap zonder pictogram) telt niet als aanwezig.

- **Melding:** het systeem zegt dat keurmerk X op het etiket staat.
- **Gevonden (keurmerk X):** noemer = etiketten waarop Friso X als aanwezig heeft bevestigd; teller = die etiketten met een melding X. Eis: Wilson-95%-**ondergrens ≥ 80%**.
- **Vals (keurmerk X):** noemer = etiketten waarop Friso X als afwezig heeft bevestigd; teller = die etiketten met een melding X. Eis: Wilson-95%-**bovengrens < 10%**.
- **Glutenvrij, uitzondering (besluit Friso 12-11-2026, "35, rest volgt de AI"):** voor glutenvrij omvat "door Friso afwezig bevestigd" ook de etiketten waarop de AI-voorinvulling van ronde 10 glutenvrij afwezig gaf en geen beoordelaar glutenvrij bevestigde (samengevoegd met markering `herkomst_codes` bron `ai-r10`, toetsset §6b). Een menselijk glutenvrij-oordeel gaat voor op de AI (ook "onzeker"), en een latere export met open of onleesbaar haalt een bevestigd oordeel niet weg (besluit Friso 12-11-2026, "Akkoord met beide"; toetsset §6b); een getoond etiket zonder bevestigd glutenvrij-oordeel (van de 35) telt niet mee voor glutenvrij (afgeleid, door Friso 12-11-2026 zo gelaten). De AI-oordelen tellen voor de vals-noemer en voor gate C (≥ 35 bevestigd zonder; besluit Friso 12-11-2026, "Ja, AI telt mee"); het samenvoegcommando en het eindrapport van `tel_proef` (§7, "(AI n)", ronde 11f) noemen hoeveel daarvan komen. Een latere opslag via de lokale invulpagina wist de markering (toetsset §6b); wijzig samengevoegde records daar niet. Risico: vals-telling en gate C voor glutenvrij rusten dan op niet-nagekeken AI-oordelen, en gate C kan zijn drempel alleen met AI-oordelen halen. Gevolg: een gemist glutenvrij-logo ontbreekt in de gevonden-noemer en kan als vals tellen.
- **Stopregel per keurmerk:** beide eisen gehaald → **"automatisch"**; anders → **"mens bevestigt"** (het systeem doet een voorstel, een mens bevestigt).
- De Wilson-ondergrens is het percentage dat je met 95% zekerheid minstens haalt, gegeven hoeveel etiketten zijn geteld; de bovengrens is wat je met 95% zekerheid hooguit haalt. Met weinig etiketten liggen ze ver van het gemeten percentage.
- Berekening: `wilson` uit `_bmad-output/planning-artifacts/spike-architectuurkeuze-logoherkenning/fase-b/tel.py` (z = 1,96), hergebruikt.

## 2. De keurmerken en hun gelijkende keurmerken

Een **gelijkend keurmerk** lijkt op een van de keurmerken, maar is het niet. In de training worden ze bewust ongelabeld toegevoegd (**harde negatieven**), zodat de detector ze leert negeren. In de toets maken ze de zonder-kant moeilijker.

| # | Keurmerk | Codes | Rol | Gelijkende keurmerken |
|---|---|---|---|---|
| 1 | EU-biologisch | `EU_ORGANIC_FARMING` | kern | `AGRICULTURE_BIOLOGIQUE`, `BDIH_LOGO`, nationale bio-logo's |
| 2 | Groene Punt | `GREEN_DOT` | kern | `RECYCLABLE_GENERAL_CLAIM`, `TRIMAN`, `SEPARATE_COLLECTION`, `SOCIETY_PLASTICS_INDUSTRY`, `RETURNABLE_CAN_NL` |
| 3 | Recyclebaar | `RECYCLABLE_GENERAL_CLAIM` | kern | `GREEN_DOT`, `TRIMAN`, `SEPARATE_COLLECTION`, `SOCIETY_PLASTICS_INDUSTRY`, `RETURNABLE_CAN_NL` |
| 4 | Nutri-Score | `NUTRISCORE_A` t/m `NUTRISCORE_E` (één groep; D en E eigen klasse sinds besluit Friso 01-11-2026) | kern | andere gekleurde schalen |
| 5 | Zwangerschapswaarschuwing | `PREGNANCY_WARNING` | kern | `MINIMUM_DRINKING_AGE_18_WARNING`, `DO_NOT_DRINK_AND_DRIVE_WARNING` |
| 6 | MSC | `MARINE_STEWARDSHIP_COUNCIL_LABEL` | ijkpunt | `AQUACULTURE_STEWARDSHIP_COUNCIL` |
| 7 | Weidemelk | `WEIDEMELK` | ijkpunt | `BETER_LEVEN_1_STER`, `BETER_LEVEN_2_STER` |
| 8 | Vegan Society | `VEGAN_SOCIETY_VEGAN_LOGO` | ijkpunt | `VEGAN` |
| 9 | V-label | `EUROPEAN_V_LABEL_VEGAN`, met `EUROPEAN_V_LABEL_VEGETARIAN` als variant | kern (besluit Friso 01-11-2026) | `VEGAN` |
| 10 | FSC | `FOREST_STEWARDSHIP_COUNCIL_LABEL`, met `FOREST_STEWARDSHIP_COUNCIL_MIX`, `_RECYCLED` en `_100_PERCENT` als variant | kern (besluit Friso 02-11-2026) | `PEFC`, `PEFC_CERTIFIED` |
| 11 | Triman | `TRIMAN` | kern (besluit Friso 02-11-2026) | `GREEN_DOT`, `RECYCLABLE_GENERAL_CLAIM`, `SEPARATE_COLLECTION`, `SOCIETY_PLASTICS_INDUSTRY`, `RETURNABLE_CAN_NL` |
| 12 | Kunststofcode (harscode 1–7) | `SOCIETY_PLASTICS_INDUSTRY` | kern (besluit Friso 02-11-2026) | `RECYCLABLE_GENERAL_CLAIM`, `GREEN_DOT`, `TRIMAN`, `SEPARATE_COLLECTION`, `RETURNABLE_CAN_NL` |
| 13 | On the way to PlanetProof | `ON_THE_WAY_TO_PLANETPROOF` | kern (besluit Friso 02-11-2026) | `RAINFOREST_ALLIANCE`, `RAINFOREST_ALLIANCE_PEOPLE_NATURE`, `FAIR_TRADE_MARK`, `FAIRTRADE_COCOA`, `CERTIFIED_B_CORPORATION` |
| 14 | Glutenvrij (doorgekruiste aar) | `DIET_FREE_FROM_GLUTEN` (declaratie `FREE_FROM_GLUTEN`) | kern (besluit Friso 03-11-2026; licentierisico bekend, zie randvoorwaarden §4) | nog niet vastgesteld |

IJkpunten zijn de drie keurmerken die ook in de vorige proef (fase B) gemeten zijn; ze maken de uitkomst vergelijkbaar met die proef. Ze krijgen dezelfde telling en hetzelfde besluit als de kern.

**V-label** (besluit Friso 01-11-2026): eigen klasse en 9e keurmerk, niet langer gelijkend van Vegan Society; `VEGAN` (algemeen woord of logo) blijft gelijkend. Vegan en vegetarisch zijn hetzelfde V-label-ontwerp, alleen het woord eronder verschilt; ze tellen samen als één keurmerk **V-label aanwezig**. Overal (declaraties, referenties, AI-codes, K4-aa-detecties) telt `EUROPEAN_V_LABEL_VEGETARIAN` als `EUROPEAN_V_LABEL_VEGAN`. Reden: op de detectorschaal is het woord niet leesbaar, NutriGreen kent één klasse V-label voor beide, een ongelabelde vegetarische variant zou de detector een vrijwel gelijk logo leren negeren, en de vegetarische variant heeft 4 declaraties zonder één aan de trainingskant (gemeten 01-11-2026). Bron van de groepen: `_bmad-output/planning-artifacts/eindtest-logo-pijplijn/lookalike-groepen.md` in de hoofdmap (G2, G4, G6 voor de vier van ronde 9).

**Ronde 9** (besluit Friso 02-11-2026): FSC, Triman, kunststofcode en PlanetProof zijn het 10e t/m 13e keurmerk, met dezelfde telling en hetzelfde besluit. **FSC** is één keurmerk: Mix, Recycled en 100% zijn hetzelfde ontwerp (boom met vinkje), alleen het woord eronder verschilt; overal telt een variantcode als `FOREST_STEWARDSHIP_COUNCIL_LABEL` (54 van de 56 toets-declaraties zijn Mix). **Kunststofcode** is één keurmerk zonder cijfer: aanwezig = de driehoek van pijlen met een cijfer 1–7; de GS1-declaratie kent geen cijfer en per cijfer zouden er ±3 toetsetiketten zijn. Triman en kunststofcode zijn sindsdien geen gelijkend keurmerk van een ander meer in de training (eigen klasse). In de rijen van Groene Punt, Recyclebaar, Triman en kunststofcode hierboven staan ze alleen nog voor de kandidaatkeuze; ze tellen niet als "met gelijkend keurmerk" (§4).

**Ronde 10** (besluit Friso 03-11-2026): glutenvrij (`DIET_FREE_FROM_GLUTEN`) is het 14e keurmerk, met dezelfde telling en hetzelfde besluit. Het krijgt geen gelijkende keurmerken in de telling zolang die lijst niet is vastgesteld. COELIAC telt niet mee zonder apart besluit van Friso (open vraag 2 in SPEC).

## 3. Nutri-Score als groep (A–E, besluit Friso 01-11-2026)

- Friso legt per etiket de verzameling zichtbare letters vast (A–E), of "letter onleesbaar".
- **Mét:** etiketten met minstens één letter A–E. **Gevonden** als alle gemelde Nutri-Score-letters in die verzameling zitten (en er minstens één is): een melding D op een etiket met D is gevonden. Een gemelde letter buiten de verzameling, ook naast de juiste, maakt het etiket **gemist**; het wordt apart geteld als "verkeerde letter".
- **Zonder:** etiketten zonder Nutri-Score (lege verzameling). Op zulke etiketten is elke Nutri-Score-melding, welke letter ook, **vals**. D en E tellen niet meer als zonder.
- "Letter onleesbaar" telt aan geen van beide kanten mee.
- A t/m E worden ook per letter gerapporteerd (mét = letter in de verzameling, zonder = een leesbare verzameling zonder die letter; "letter onleesbaar" telt aan geen kant), ter informatie; het besluit valt op de groep.

## 4. Benodigde aantallen (Wilson 95%, nagerekend met `wilson`, 31-10-2026)

**Zonder-kant: maximaal toegestane valse meldingen om "< 10%" te bewijzen.**

| Etiketten zonder | 30 | 34 | 35 | 40 | 50 | 60 | 80 | 100 | 150 |
|---|---|---|---|---|---|---|---|---|---|
| Max. vals | onmogelijk (0/30 → 11,35%) | onmogelijk (0/34 → 10,15%) | 0 | 0 | 0 | 1 | 2 | 4 | 7 |

**Met-kant: minimaal benodigde vondsten om "≥ 80%" te bewijzen.**

| Etiketten met | 16 | 20 | 25 | 30 | 40 | 50 |
|---|---|---|---|---|---|---|
| Min. gevonden | 16 | 20 | 24 | 29 | 37 | 46 |

> [!warning] Correctie op het doel "30–50 zonder" (akkoord Friso 01-11-2026)
> Met 30 tot 34 etiketten zonder keurmerk is "< 10% vals" nooit te bewijzen, ook niet met nul fouten. Doel daarom: **≥ 50 zonder per keurmerk**. Dat kost geen extra etiketten: elk etiket waarop Friso een keurmerk afwezig verklaart, telt als "zonder" voor dat keurmerk (**gedeelde negatieven**).

**Doel per keurmerk (14):** ≥ 16 bevestigde etiketten mét het keurmerk (liefst ≥ 25) en ≥ 50 zonder (dit meetdoel geldt ook voor glutenvrij; de lokale pagina toont voor glutenvrij het doel van gate C, 35, besluit Friso 12-11-2026), waarvan liefst ≥ 10 met een gelijkend keurmerk (§2; n.v.t. voor Nutri-Score, dat geen gelijkend met code meer heeft). Het aantal met een gelijkend keurmerk komt uit de voorinvulling en is niet door Friso bevestigd. Codes van V-label, Nutri-Score D/E, Triman en kunststofcode tellen niet meer als gelijkend; eerder als gelijkend gekozen etiketten blijven in de toetsset en tellen aan de mét-kant van hun eigen keurmerk.
**Te weinig voorbeelden:** minder dan 16 mét of minder dan 35 zonder → besluit "te weinig voorbeelden", niet "mens bevestigt".
**Gate C voor glutenvrij (besluit Friso 03-11-2026; sinds 12-11-2026 tellen de AI-oordelen afwezig mee, zie §1):** de 16 en de 35 uit deze regels zijn in de code afgedwongen door `poort_glutenvrij` in `train.py`. De training weigert zolang er minder dan 16 bevestigde etiketten mét voor glutenvrij zijn, of minder dan 35 bevestigde etiketten zonder glutenvrij, of als `toets/uitslag.json` ontbreekt of onleesbaar is. Stoppunt 2 blijft een besluit van Friso (DRAAIPLAN stap 4 en stap 10).

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
- **Blind nakijken** (akkoord Friso 01-11-2026: vóór het besluit).
  - **Paren die tellen:** (etiket, keurmerk) met een bevestigd oordeel aanwezig/afwezig; Nutri-Score als één groep met leesbare letters. **Routes:** D+A, D en K4-aa (gefilterd); de informatieve K4-aa-run met alle referenties telt niet mee.
  - **Nakijklijst** = alle paren waar minstens één route van de waarheid afwijkt, plus een **steekproef** van de paren waar alle drie routes met de waarheid overeenkomen: per keurmerk en per kant (mét/zonder) 10% van die paren, naar boven afgerond, minstens 1 als de kant niet leeg is, 0 bij 0 paren. Getrokken uit de gesorteerde paren met seed `20261101`, die in de telcode vastligt (geen opdrachtregeloptie; bevroren via de hash van de code).
  - Elke regel heeft dezelfde velden (nummer, etiket, keurmerk, Friso's eerdere oordeel), door elkaar geschud, zonder routenaam en zonder aanduiding of een paar uit de verschillen of uit de steekproef komt. Wat welk paar is, staat in `nakijk-sleutel.json`; dat bestand en `verschil.json` (dat de verschillen verraadt) komen in een aparte map `niet-voor-nakijker/`. De sha256 van lijst en sleutel wordt vóór het nakijken vastgelegd.
  - **Antwoord:** voor elke regel een oordeel in `nakijken.json` (`{nummer: oordeel}`): Nutri-Score als lijst letters A–E of "onleesbaar", de andere keurmerken "aanwezig"/"afwezig"/"onzeker". Een ontbrekende regel of een oordeel voor een paar buiten de lijst is een fout: dan geen tabellen ná nakijken. Correcties gelden voor alle routes gelijk.
  - **Fout in de waarheid:** elk oordeel dat afwijkt van Friso's eerdere oordeel, ook een wijziging naar "onzeker" of "onleesbaar" en elke wijziging van de Nutri-Score-letters.
- **Steekproef apart gerapporteerd:** per keurmerk en per kant het aantal nagekeken overeenkomende paren, het aantal fouten en de Wilson-bovengrens van die foutkans ("–" bij 0 paren). Ter informatie ook het besluit dat zou volgen als die bovengrens in het nadeel van de route op de overeenkomende paren werd toegepast (gevoeligheid; het besluit zelf volgt de regel hieronder).
- **Besluitregel bij fouten in de steekproef:** vindt de steekproef bij een keurmerk minstens één fout, dan volgt een **tweede ronde** met alle overige overeenkomende paren van dat keurmerk, in een eigen bestand (`nakijklijst-ronde2-<KEURMERK>.json`); die ronde is alleen blind voor de route, want alle regels zijn overeenkomende paren. Tot de tweede ronde is nagekeken, is het besluit voor dat keurmerk **"mens bevestigt (voorlopig)"**; wordt hij niet nagekeken, dan **"mens bevestigt"** (definitief).
- **Tijd voor Friso (INFERENCE):** de steekproef voegt ±260 regels toe voor 9 keurmerken (±45 minuten), voor 13 ±375 regels (±65 minuten); een tweede ronde ±290 regels per keurmerk (±50 minuten).
- Per keurmerk wordt gelogd hoe vaak Friso de voorinvulling veranderde (correctiepercentage); bij V-label gemarkeerd als gemeten tegen een afgeleide voorinvulling voor de etiketten van vóór ronde 5 (toetsset §5); bij de vier van ronde 9 tegen de voorinvulling van ronde 9.

## 7. Uitvoer per route en keurmerk

Eén getoetst script maakt uit de bevroren uitvoer drie tabellen: **D+A** (detector, beoordelaar en certificaatnummers; hierop valt het besluit), **D** (zonder certificaatnummers, ter informatie) en **K4-aa** (met gefilterde referenties; een run met de volledige referentieset is alleen informatief). Per keurmerk:

| kolom | inhoud |
|---|---|
| mét | gevonden / aanwezig, Wilson-ondergrens |
| zonder | vals / afwezig, Wilson-bovengrens; "(AI n)" alleen bij n > 0: n van de afwezig-etiketten hebben hun oordeel alleen van de AI (`herkomst_codes` exact bron `ai-r10`; besluit Friso 12-11-2026, ronde 11f); per route een toelichting onder de tabel als er ergens n > 0 is; een nakijkoordeel op dat etiket en keurmerk maakt het menselijk |
| verkeerde letter | alleen Nutri-Score |
| spreiding per leverancier | 95%-interval als je de leveranciers opnieuw trekt (GLN-bootstrap, `trekkingen`/`bootstrap` uit `tel.py`; informatief) |
| leveranciers | aantal leveranciers (GLN's) aan de mét-kant |
| besluit | automatisch / mens bevestigt / mens bevestigt (voorlopig) / te weinig voorbeelden; voorrang: te weinig voorbeelden, dan voorlopig (§6), dan de tabel |
| steekproef (na nakijken) | per kant: nagekeken / fouten / Wilson-bovengrens; voor alle routes gelijk (één per keurmerk) |

Daarnaast per route: tijd per etiket (mediaan, p90, max), kosten per etiket (gemiddeld en totaal, uit `usage.cost`), aantal beoordelaaraanroepen, foutpercentage, en voor K4-aa het aandeel meldingen met "requires_review". **Elke K4-aa-detectie telt als melding**, ook met "requires_review". En per keurmerk het verschil tussen D+A en K4-aa (gevonden en vals in procentpunten), met de etiketten waarop ze verschillen als lokale lijst.
