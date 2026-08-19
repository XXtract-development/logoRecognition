# Onderzoek: is de oogstbron uitgeput, of geblokkeerd?

**Gestart:** 18 augustus 2026
**Aanleiding:** de laatste kandidaat dateert van 27 juli, het laatste voorbeeld van 29 juli. De
oogst meldt "geen kandidaten". De vraag is of dat klopt.

**Stand:** de eerste conclusie is onderweg omgevallen. Hieronder staan beide, met het bewijs
waarom de tweede het wint.

---

## 1. Eerste conclusie — ONJUIST gebleken

`INFERENCE, ingetrokken` — "de oogst werkt vanuit een index die 815 van de 1874 producten dekt,
dus 1059 producten zijn nooit bekeken; de index herbouwen zet de kraan weer open."

Aanleiding was een correcte waarneming (de index dekt 815 producten, gebouwd 26 juli) plus een
te snelle gevolgtrekking: dat de rest bruikbaar zou zijn.

`VERIFIED` — de volledige droge run van de indexbouwer over alle 1862 producten weerlegt dat:

| | |
|---|---|
| Index nu → na volledige herbouw | 815 → **844** producten, 78 → **79** sleutels |
| Kwaliteitspoort | DOORGANG (geen forceren nodig) |
| Technische fouten | 0,0% |

De herbouw levert dus **+29 producten en +1 keurmerkcode** op. Nuttig, maar het is niet de
verklaring voor de stilstand.

## 2. Wat er werkelijk aan de hand is

`VERIFIED` — uitkomst van de volledige run over 1862 producten:

| Uitkomst | Aantal |
|---|---|
| Bruikbare declaratie opgehaald | 848 |
| **Geen trade-item-bestand** | **442** |
| Wel bestand, geen keurmerk gedeclareerd | 429 |
| Niet gevonden (404) | 143 |
| Technische fout / time-out | 0 |

De 442 "geen bestand" zijn het interessante deel. Steekproef van vijf, langs twee onafhankelijke
routes gecontroleerd:

`VERIFIED` — de producten **bestaan** in de ACC-MongoDB (`application.tradeItems`), elk zelfs
onder twee GLN's. De GLN die de oogst meegeeft (uit `artwork_imports`) komt exact overeen met een
van die twee. Het ligt dus niet aan een verkeerde GLN.

`VERIFIED` — rechtstreekse aanroep van de catalogus voor `08000146029059` / GLN `8712423033887`:

```
tm=528 → HTTP 500  {"error":"File not found at path:
                    tradeItems/8712423033887/8712423033887_08000146029059_528.xml"}
tm=056 → HTTP 404  {"error":"No trade item found for combination ..."}
```

De catalogus kent het product (anders was het 404 geweest, zoals bij tm=056) maar **het
XML-bestand ontbreekt in zijn opslag**. Dat sluit aan op een eerder vastgelegde bevinding: dit
endpoint meldt een ontbrekend bestand met een 500, niet met een 404.

`VERIFIED` — de acceptatie-omgeving haalt declaraties op bij **stage**:
`CATALOG_API_BASE=https://catalog.stage.xxtract.com`, en de index draagt dat ook als bron
(`declarationSource: "stage"`).

## 3. Wat dat betekent

De oogstbron is niet leeg — hij is **afgeknepen**. Van de 1862 producten met artwork levert 24%
niets op omdat er in de stage-catalogus een bestand ontbreekt dat er volgens de database hoort te
zijn. Dat is geen eigenschap van de data maar een gat in één omgeving.

Of die 442 producten ook daadwerkelijk keurmerken declareren, is hiermee **niet** aangetoond —
alleen dat de vraag nu niet eens gesteld kán worden. Van de producten die wél een bestand hebben,
declareert ongeveer 66% (848 van 1277) iets bruikbaars. Als die verhouding standhoudt, zitten er
achter die 442 producten ruwweg **290 met declaraties** — een derde extra bron bovenop de huidige
848.

`AANNAME` — die extrapolatie is niet gemeten en kan niet gemeten worden zolang de bestanden
ontbreken.

## 5. Twee hypotheses getoetst en verworpen (18 augustus)

**"Het ligt aan de omgeving."** De acceptatie-omgeving vraagt zijn declaraties aan **stage**
(`CATALOG_API_BASE=https://catalog.stage.xxtract.com`), terwijl de code als standaard
`catalog.acc.xxtract.com` heeft — iemand heeft dat bewust omgezet. Voor de hand liggende
gedachte: wijs hem naar acceptatie en de bestanden zijn er wel.

`VERIFIED` — dezelfde aanvraag langs beide omgevingen geeft een **identieke** fout:

```
stage -> 500  File not found at path: tradeItems/8712423033887/8712423033887_08000146029059_528.xml
acc   -> 500  File not found at path: tradeItems/8712423033887/8712423033887_08000146029059_528.xml
```

Omzetten lost dus niets op. De hypothese is verworpen.

**"Productie heeft het bestand wel."** Niet te toetsen vanaf ACC: `catalog.xxtract.com` en
`catalog.prod.xxtract.com` zijn vanuit die container niet bereikbaar (`fetch failed`). Blijft
open; dit is de enige plek waar het bestand nog kan staan.

## 6. Bevestiging van de cijfers

`VERIFIED` — de volledige droge run is twee keer gedraaid, met hetzelfde resultaat:
sleutels 78 → 79, producten met data 815 → 844, poort DOORGANG, 0% technische fouten.
De tweede run putte uit de declaratie-cache (1862 treffers, 0 missers), wat verklaart waarom hij
geen regels per product logde — en meteen bevestigt dat de eerste run compleet was.

## 4. Openstaande punten

- Hoeveel van de 442 bestaan er in de MongoDB? Steekproef van vijf: alle vijf aanwezig. Een
  volledige telling loopt nog.
- Waarom vraagt de acceptatie-omgeving zijn declaraties aan **stage**? Uit de code is niet af te
  leiden of dat een bewuste keuze is. Wijst dit naar acceptatie of productie, dan kan het gat
  meteen kleiner of groter zijn.
- De 429 producten mét bestand maar zónder keurmerk: terecht leeg, of leest de uitlezer een veld
  niet? Niet onderzocht.
- De index herbouwen (+29 producten) is een losse, veilige stap die klaarstaat en op goedkeuring
  wacht.

## 7. De werkelijke oorzaak — gevonden via de productie-database (18 augustus)

`VERIFIED` — de declaraties staan als VELD in de productie-MongoDB (`application.tradeItems`,
161.945 documenten): `packagingMarkingModule` met gdsn `packagingMarkedLabelAccreditationCode`,
en `dietInformationModule` met gdsn `dietTypeCode`.

Het product dat de oogst afschreef als "geen trade-item-bestand" (GTIN 08000146029059) blijkt daar
**drie keurmerken te declareren**: RECYCLABLE_GENERAL_CLAIM, TRIMAN en GREEN_DOT.

`VERIFIED` — waarom de oogst het miste: **de gln is verouderd**. Op productie bestaat dit GTIN
onder twee gln's:

| gln | laatst bijgewerkt | bron |
|---|---|---|
| 8712423033887 | maart 2025 | de gln die de oogst gebruikt (uit `artwork_imports`) |
| **8717591319993** | **november 2025** | het actuele record, mét de drie declaraties |

Het XML-bestand onder de oude gln bestaat nergens meer — ook niet op productie
(`/media/Xxml/catalog/tradeItems/8712423033887/`, 24 bestanden, geen enkele voor dit GTIN; wel 18
oudere versies in `tradeItemBackup`, laatste van 5 maart 2025). Het product is dus verhuisd naar
een andere partij, en onze importtabel wijst nog naar de oude.

**Daarmee vervalt de conclusie uit §3.** De bron is niet afgeknepen door een gat in de opslag; de
oogst gebruikt een route die producten kwijtraakt zodra ze van partij wisselen. Hoe vaak dat
gebeurt binnen die 442 is niet gemeten — de steekproef van één laat drie gemiste keurmerken zien.

### Wat dit betekent voor de volgende stap

Niet: een grotere index of meer artwork. Wel: de declaratiebron veranderen — rechtstreeks uit de
productie-MongoDB lezen in plaats van een XML-bestand opvragen op een gln die kan verouderen.

Nog te meten, en niet triviaal: hoeveel van de 161.945 producten declareren een keurmerk. De velden
zitten in diep geneste, onregelmatige arrays; een enkelvoudige telling geeft of alles of niets terug
(beide geprobeerd: 161.945 respectievelijk 0). Dat vraagt een eigen uitleesroutine.

### Drie conclusies die vandaag sneuvelden, op volgorde

1. "De index dekt maar 815 van 1874 producten, herbouwen zet de kraan open." — Onjuist: +29
   producten, +1 code.
2. "De bron is uitgeput." — Onjuist.
3. "Het is een gat in de bestandsopslag van de catalogus." — Deels onjuist: het bestand ontbreekt
   werkelijk, maar de oorzaak is gln-verouderering.

Elke conclusie leunde op de vorige zonder tweede route. Friso wees er tweemaal op: eerst dat ik niet
op productie keek, daarna dat ik de Mongo-velden had moeten uitlezen in plaats van bestanden te
zoeken. Dat is vastgelegd als werkafspraak in het projectgeheugen.

## 8. Slotmeting — de bron is voor deze corpus wél zo goed als op (18 augustus, avond)

De terugvaloptie op een nieuwere gln is **gemeten waardeloos** (`review-20-18.md`, zelf
nagemeten): 0 van de 62 onderzochte "geen bestand"-gevallen worden opgelost, en bij het
kroongetuige-product geeft óók de nieuwe gln een 500. Story 20.18 staat daarom op *niet bouwen*.

Twee vervolgmetingen sluiten de resterende vragen:

**De gln is niet het probleem.** Van 80 willekeurige producten zonder declaratie bleken er 41 een
gewoon ophaalbaar XML-bestand te hebben. `VERIFIED` — bij alle tien gecontroleerde gevallen is de
werkende gln **exact dezelfde** als die in onze `artwork_imports` staat. Er is dus geen
gln-verouderering aan de hand; mijn steekproef bevatte simpelweg ook de groep "bestand laadt
prima, geen keurmerk gedeclareerd".

**Die groep declareert echt niets.** `VERIFIED` — vijf van die bestanden opgehaald (status 200,
10-17 kB) en doorzocht op `packagingMarkedLabelAccreditationCode` en `dietTypeCode`: **nul
treffers** in alle vijf. De uitlezer mist dus geen veld; er staat niets in.

### Eindstand van de oogstbron op deze corpus

| Groep | Aantal | Oordeel |
|---|---|---|
| In de index, geoogst | 815 | benut |
| Bestand laadt, geen keurmerk | ~429 | **terecht leeg** — niets te halen |
| Bestand ontbreekt (beide gln's) | ~442 | declaraties bestaan alleen in de productie-MongoDB |
| 404 | ~143 | grotendeels andere doelmarkten (16 van 20 in de steekproef) |

**Conclusie:** binnen de huidige architectuur is de bron voor déze corpus vrijwel uitgeput. Wat
overblijft is de groep van ~442, en die is alleen te bereiken als de acceptatie-omgeving bij
productiegegevens kan. Dat is geen story maar een besluit over gegevenstoegang.

Daarmee is de oorspronkelijke vraag ("is de bron uitgeput of geblokkeerd?") beantwoord met:
**grotendeels uitgeput, en het geblokkeerde deel vraagt een architectuurbesluit.**
