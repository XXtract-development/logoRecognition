# Adversariële SPEC-review — Story 20.18 (verouderde GLN blokkeert de oogst)

- **Reviewer:** adversarial spec review (BMAD), 2026-08-18
- **Story:** `_bmad-output/implementation-artifacts/20-18-verouderde-gln-blokkeert-oogst.md` (status `draft`)
- **Achtergrond:** `_bmad-output/planning-artifacts/research/oogstbron-uitgeput-of-geblokkeerd-2026-08-18.md`
- **Code-basis:** branch `acc`, HEAD `5e29c05`
- **Meetomgeving:** ACC-api-container `app-qsookwow8koko0kwg00g0cwk-134318329338`, read-only.
  `CATALOG_API_BASE=https://catalog.stage.xxtract.com`, `T3777_TARGET_MARKET` niet gezet → `'528'`.
- **Scope:** de SPEC getoetst tegen de echte code en tegen live metingen; er is niets geïmplementeerd.

```
verdict: FAIL
severity_count: { high: 3, medium: 9, low: 6 }
```

FAIL omdat de **kernaanname van de story gemeten onjuist is**. De voorgestelde terugvaloptie levert
op het probleem dat de story wil oplossen — de 442 "geen trade-item-bestand" — **nul** extra
declaraties op. Dat is geen redenering maar een meting op 250 GTIN's uit het echte universum.

Dit is, in dezelfde vorm, de **vierde** conclusie die op één waarneming doorredeneert. De drie die
vandaag al sneuvelden staan in het onderzoek opgesomd; deze spec zet er een vierde bovenop en
verheft hem tot `VERIFIED`.

Constructief: er zit **wél** winst in dezelfde terugvaloptie, maar op het pad dat de story expliciet
buiten scope plaatst — de 143 404's. Daar werkt hij (gemeten 4 van 20). De story staat dus niet op
de verkeerde oplossing, maar op de verkeerde doelgroep.

---

## 1. Bevindingen

### HIGH

**H1 — De terugvaloptie levert op de 442 "geen bestand" niets op. Gemeten: 0 van 62. — high**

Bron: eigen meting in de ACC-api-container, 18 augustus 2026. Gestratificeerde steekproef over het
volledige universum (`artwork_imports` waar `gln` gevuld is, 1862 unieke GTIN's, elke n-de rij).
Per GTIN: eerst dezelfde aanroep die de code doet
(`GET {base}/api/tradeitemxml/{gln}-{gtin}-528`), en bij `500 File not found` daarna exact de
terugvaloptie uit AC1 t/m AC3 (zoeken op `x-query`, filteren op `targetMarket === '528'`, sorteren
op `updated_at` aflopend met `id` als tiebreak, en de winnaar opnieuw ophalen).

| n | ok | 404 | geen-bestand | api-fout |
|---|---|---|---|---|
| 60 | 40 | 6 | 14 | 0 |
| **250** | **168** | **20** | **62** | **0** |

De 62 "geen bestand" uit de grote steekproef, uitgesplitst naar wat de terugvaloptie ermee doet:

| Uitkomst van de terugvaloptie | Aantal |
|---|---|
| Zoekopdracht geeft **maar één rij** — geen andere gln om op terug te vallen | **53** |
| Wel een andere gln voor dezelfde doelmarkt | 9 |
| → daarvan alsnog een bestand opgehaald | **0** |
| → daarvan opnieuw `500 File not found` | **9** |
| Zoekopdracht mislukt | 0 |

**Nul treffers op 62 gevallen.** Bovengrens bij 95% zekerheid (regel van drie): ten hoogste ~4,8%,
oftewel hooguit ~21 van de 442 — met 0 als puntschatting. De steekproefverhouding klopt bovendien
met de volledige run (62/250 = 24,8% tegen 442/1862 = 23,7%), dus de steekproef is representatief.

De reden is structureel en zichtbaar in de cijfers: in **53 van de 62** gevallen bestáát er helemaal
geen tweede gln. Het beeld "elk product staat onder twee gln's" uit §2 van het onderzoek gold voor
een steekproef van vijf en generaliseert niet.

**H2 — Het kroongetuige-bewijs in de spec meet iets anders dan wat de code doet — high**

Bron: `20-18-…md:33-39` (de bewijstabel) tegenover een eigen meting.

De tabel stelt dat gln `8717591319993` een **aanwezig** XML-bestand heeft met drie keurmerken. Die
drie keurmerken komen uit de **productie-MongoDB** (onderzoek §7). De spec presenteert ze in een
kolom "XML-bestand: aanwezig", alsof de catalogus-aanroep die de code doet zou slagen. Gemeten:

```
acc   / 8712423033887-08000146029059-528 → 500 File not found at path
acc   / 8717591319993-08000146029059-528 → 500 File not found at path
stage / 8712423033887-08000146029059-528 → 500 File not found at path
stage / 8717591319993-08000146029059-528 → 500 File not found at path
```

**De nieuwe gln geeft exact dezelfde fout als de oude, op beide omgevingen.** Het paradepaardje van
de story wordt door de story zelf niet gered. In de steekproef zit ook het zusterproduct
`08000146029349`, met dezelfde gln-wissel en dezelfde uitkomst (`fallback-ook-geen-bestand`).

Dit is precies de constructie waar het onderzoek voor waarschuwt: het bewijs komt uit bron A
(Mongo), de conclusie gaat over bron B (de catalogus-XML), en er is nooit een tweede route gelopen
om die brug te controleren. Eén aanroep van 200 ms had dit laten zien.

**H3 — AC6 is niet uitvoerbaar zoals opgeschreven: de tweede meting leest uit de cache — high**

Bronnen: `t3777-declarations.ts:641-647` (cache-lees vóór de fetch), `:530-534` (`ttlForReason`),
`:87` (`T3777_CACHE_TTL_S` default 86400).

`ttlForReason` verkort de TTL **alleen** voor `api-fout`. `geen-tradeitem-bestand` — precies de
uitkomst die de terugvaloptie moet omkeren — krijgt de volle 24 uur. En `marksCacheRead` staat
vóór `fetchTradeItemXmlWithRetry`. Een ná-run binnen 24 uur haalt die 442 dus uit de cache en
bereikt de terugvaloptie **nooit**; hij rapporteert identieke cijfers en dat ziet eruit als "de fix
doet niets".

Dat is geen theorie: het onderzoek meldt het al (§6) — "de tweede run putte uit de declaratie-cache
(1862 treffers, 0 missers)". De spec neemt dat onderzoek als bron op maar verwerkt deze
eigenschap niet in AC6.

Bijkomend, in dezelfde meting: `KEURMERK_INDEX_LIMIT` heeft default **500**
(`build-keurmerk-index.ts:261-264`) en poort 7d blokkeert bij `cutByLimit > 0`
(`:563-575`). Een meting over 1862 GTIN's vraagt dus expliciet om die env-variabele. AC6 noemt hem
niet, terwijl de bronverwijzing hem wel opsomt.

### MEDIUM

**M1 — De enige plek waar de terugvaloptie wél werkt, is expliciet buiten scope gezet — medium**

Bron: `20-18-…md:108-109` ("De 143 met een 404 … valt pas te beoordelen als AC1 draait") tegenover
dezelfde meting, nu op het 404-pad (n=250, 20 404-gevallen):

| Uitkomst | Aantal |
|---|---|
| Geen enkele rij voor doelmarkt 528 — het product hoort echt bij 056/276/203 | 16 |
| Wel een rij voor 528, onder een **andere** gln | 4 |
| → daarvan een bestand opgehaald | **4 (100%)** |

Vier van de vier. Geëxtrapoleerd naar de 143: ruwweg **29 producten** — dezelfde ordegrootte als de
+29 die een gewone herbouw al oplevert, maar met nieuwe declaraties erbij. Voorbeelden:
`04000539671302` (`8719328024019` → `8720098000004`), `08718989021221`, `08720098001704`,
`08721077490335`.

De story heeft haar doelgroepen dus omgedraaid: de 442 waar ze op mikt levert 0, en de 143 die ze
wegschrijft levert alles. Dit is de bevinding waar de story op herbouwd moet worden.

**M2 — AC1 en "Wat NIET in deze story zit" spreken elkaar tegen over de 404 — medium**

`:69-72` maakt van een `404` uitdrukkelijk een trigger voor de terugvaloptie; `:108-109` zet de 404's
even uitdrukkelijk buiten scope. Eén van beide moet weg. Gezien M1: AC1 heeft gelijk en de
scope-uitsluiting moet verdwijnen.

**M3 — `updated_at` is een aanraakdatum van de rij, geen zakelijk actualiteitssignaal — medium**

Gemeten op het voorbeeld uit de spec zelf:

| id | gln | `updated_at` | `lastChangeDateTime` | `status` |
|---|---|---|---|---|
| 103736 | 8712423033887 | 2025-11-18 13:57:49 | **2025-03-05** | 200 |
| 123431 | 8717591319993 | 2025-11-25 09:12:56 | **2025-11-25** | 100 |

Op `updated_at` liggen ze **7 dagen** uit elkaar; op `lastChangeDateTime` **acht maanden**. De
verouderde rij is op 18 november aangeraakt zonder dat er zakelijk iets veranderde — precies het
"oud record dat toevallig later is aangeraakt" waar deze story blind voor is. Eén herverwerking of
bulk-migratie zet `updated_at` op álle rijen gelijk en gooit de rangorde volledig om, zonder dat er
iets in de logging te zien is. `lastChangeDateTime` is het semantisch juiste veld; `status`
(200 versus 100) is een tweede, onafhankelijk signaal dat de spec niet noemt.

**M4 — Story 18.1 heeft precies de tegenovergestelde keuze al bevroren, en de spec noemt dat niet — medium**

Bron: `apps/api/scripts/backfill-gln-from-tradeitems.ts:18-20` en `:96-101`
(`decideOutcome`): *"Bij >1 GLN voor TM 528: NIET gokken → uitvalreden `meerdere-glns`"*, met
governance-akkoord van 2026-07-04.

AC2 van 20.18 doet exact wat 18.1 bewust weigerde: bij meerdere kandidaten er één aanwijzen. Dat mag
herzien worden, maar dan expliciet, met het argument waarom de eerdere afweging niet meer geldt —
niet stilzwijgend in een andere story. Zolang beide bestaan, spreken twee stukken code met dezelfde
gegevens elkaar tegen.

**M5 — De verwerping van de MongoDB-route rust op een onjuiste bewering — medium**

`:61-63` stelt: *"de applicatie heeft geen enkele Mongo-verbinding — niet in de code, niet in de
omgeving"*. In de code staat `apps/api/scripts/backfill-gln-from-tradeitems.ts`, dat de
`mongodb`-driver lazy importeert (`:228`) en de productie-URI uit `TRADEITEMS_MONGO_URI` leest
(`:321`), read-only, met governance-akkoord.

`VERIFIED` — de driver zit niet in `node_modules` (api noch root) en `TRADEITEMS_MONGO_URI` staat
niet in de ACC-omgeving, dus de *conclusie* ("er draait nu niets") klopt. Maar het gestelde bewijs
klopt niet, en het weggelaten feit is juist het feit dat telt: deze route is al eens bewandeld en
goedgekeurd. Gegeven H1 en H2 — de declaraties bestaan alléén in Mongo — is dit de weg die het
onderzoek aanwijst, en hij verdient een eerlijke afweging in plaats van een afwijzing op een
verkeerde grond.

**M6 — "Eén extra aanroep per mislukking" telt te laag — medium**

AC4 (`:82-84`). De terugvaloptie vraagt minimaal **twee** aanroepen: de zoekopdracht plus het
opnieuw ophalen van de XML onder de nieuwe gln. Loopt dat tweede ophalen via
`fetchTradeItemXmlWithRetry` (`t3777-declarations.ts:140-154`), dan komen daar bij een `api-fout`
tot 2 herkansingen bovenop — worst case 6 aanroepen per mislukking, niet 1.

**M7 — De gtin→gln-uitkomst past niet in de bestaande cachesleutel — medium**

AC4 zegt "gecachet zoals de bestaande declaratie-cache". Er zijn er **twee**, met verschillende
vorm: `t3777:{gln}:{gtin}:{tm}` (`:111-113`, **zonder** omgevingssegment) en
`marks:{envTag}:{gln}:{gtin}:{tm}` (`:520-522`, **met**). Een gtin→gln-uitkomst heeft geen gln in de
sleutel en past in geen van beide; hij vraagt een eigen namespace. Die moet het omgevingssegment
dragen om dezelfde reden als 19.16/AC8 (`:487-495`): stage en acc kunnen andere rijen hebben, en de
live ACC-paden lezen deze cache terug als ACC-waarheid.

Tweede, ongeadresseerde vraag: onder welke sleutel wordt het **geslaagde** resultaat weggeschreven?
Onder de oude gln (dan claimt die sleutel keurmerken die er niet bij horen) of onder de nieuwe (dan
mist de volgende run hem, want die begint weer bij de oude gln). AC4 moet dit uitspreken.

**M8 — De bronverwijzing naar `:295` wijst naar een functie die het oogstpad niet gebruikt — medium**

`:117` verwijst naar `t3777-declarations.ts:295` als "de `artworkImport.findFirst` die de gln
levert". Dat is `resolveGln`, gebruikt door `resolveDeclarations` — het **kruischeck**-pad. AC1
noemt `resolveDeclaredMarks`, en die krijgt in de indexbouwer de gln als parameter `knownGln` mee
(`build-keurmerk-index.ts:458`), afkomstig uit `loadGtinUniverse` (`:287-301`). De eigen
`findFirst` in `resolveDeclaredMarks` (`:622-627`) wordt op dat pad **niet** uitgevoerd. Wie de
story letterlijk volgt, wijzigt de verkeerde plek.

**M9 — Een mislukte zoekopdracht mag de kwaliteitspoort niet raken — medium**

AC7 (`:94-96`) dekt alleen "de zoekopdracht levert niets op". Niet gedekt: de zoekopdracht zelf
mislukt. Poort 7b (`build-keurmerk-index.ts:546-556`) telt `api-fout + timeout` over de verwerkte
GTIN's met drempel 5%. Wordt een mislukte *opzoeking* op `api-fout` gemapt, dan kan een storing op
één endpoint 585 GTIN's over die drempel duwen en de hele bouw blokkeren. AC7 moet eisen dat een
mislukte opzoeking terugvalt op de oorspronkelijke uitkomst en **geen** `api-fout` produceert.

### LOW

**L1 — `VERIFIED` op een steekproef van één — low.** `:29-31` verklaart de oorzaak van de 442
`VERIFIED`. Het onderzoek zelf schrijft (`:144`): *"Hoe vaak dat gebeurt binnen die 442 is niet
gemeten — de steekproef van één…"*. De spec verhoogt het bewijsniveau ten opzichte van zijn eigen
bron. Onder de bewijsregels hoort hier `INFERENCE` te staan — en na H1 is het weerlegd.

**L2 — `xmlFilepath` lijkt een uitweg maar is er geen; leg dat vast — low.** Het zoekresultaat draagt
een `xmlFilepath`. Gemeten: **beide** rijen van `08000146029059` hebben er een, óók de rij waarvan
het bestand niet bestaat. Het veld is dus geen "heeft-bestand"-signaal. Vastleggen voorkomt dat de
volgende ronde er alsnog op leunt.

**L3 — De goedkope lokale variant is ook dood — low.** Gemeten: van de 1862 GTIN's hebben er **8**
meer dan één gln in `artwork_imports`. "Probeer gewoon de andere rij uit onze eigen tabel" kan
hooguit 8 producten raken. Deur dicht, en dat is bruikbare informatie.

**L4 — AC8 (RED-bewijs) is bij een opbrengst van 0 niet te schrijven — low.** Er is op het
442-pad geen enkel echt geval dat rood wordt. Een test op een verzonnen fixture bewijst dan alleen
dat de code doet wat de code doet. Wordt de story op het 404-pad herbouwd (M1), dan zijn er vier
echte gevallen om op te ankeren.

**L5 — Het snelheidsbezwaar geldt niet; expliciet vrijgegeven — low.** Gemeten in de container: de
zoekopdracht kost gemiddeld **58 ms** (12 aanroepen). 585 extra opzoekingen bij parallellisme 3
(`getConcurrency`, default 3) kosten ~11 seconden op een budget van 20 minuten
(`getMaxRuntimeMs`). De deadline en poort 7d komen hierdoor **niet** in gevaar. Dit is dus géén
reden om de terugvaloptie af te wijzen.

**L6 — AC5 is goed, maar de reden erachter is sterker dan opgeschreven — low.** Niet bijwerken van
`artwork_imports` is niet alleen een scope-argument: `loadGtinUniverse` bepaalt uit diezelfde tabel
het universum én de gln die als `knownGln` meegaat. Een schrijfactie daar verandert de meting van
de volgende run met terugwerkende kracht. Dat argument hoort erbij.

---

## 2. Claim-audit per acceptatiecriterium

| AC | Claim | Oordeel | Bewijs |
|---|---|---|---|
| **AC1** | Bij 500/404 de actuele gln opzoeken en opnieuw ophalen | **Deels onjuist** | Werkt technisch (endpoint bestaat, 200), maar levert op het 500-pad 0/62 (H1). Op het 404-pad 4/20 (M1). Beschreven aangrijpingspunt klopt niet (M8). |
| **AC2** | Hoogste `updated_at`, dan hoogste `id`; keuze gelogd | **Onveilig** | `updated_at` is een aanraakdatum: 7 dagen verschil waar de zakelijke wijziging 8 maanden scheelt (M3). Botst met de bevroren keuze uit 18.1 (M4). Logging-eis is goed. |
| **AC3** | Doelmarkt leidend; alleen gelijke `targetMarket` telt | **KLOPT** | Gemeten: het zoekresultaat geeft `targetMarket` als string `"528"`, exact het formaat van `T3777_TARGET_MARKET` (default `'528'`, niet gezet op ACC) en van de URL. Ook drager: 16 van de 20 404's zijn echt 056/276/203 en worden door deze regel terecht uitgesloten. |
| **AC4** | Eén extra aanroep, gecachet zoals de bestaande cache | **Onjuist/onvolledig** | Minimaal 2 aanroepen, worst case 6 (M6). Past in geen van de twee bestaande sleutelvormen; omgevingssegment en schrijfsleutel niet geregeld (M7). |
| **AC5** | `artwork_imports` wordt niet bijgewerkt | **KLOPT** | Verstandig; argument mag scherper (L6). |
| **AC6** | Droge run vóór en ná, verschil vastleggen | **Niet uitvoerbaar** | Cache met 24u-TTL vóór de fetch maakt de ná-meting blind (H3); `KEURMERK_INDEX_LIMIT` ontbreekt in de opzet. |
| **AC7** | Mislukte opzoeking is geen fout; poort valt niet om | **Onvolledig** | Dekt niet het geval dat de zoekopdracht zelf mislukt; poort 7b telt dat als technische fout (M9). Snelheid/deadline is geen risico (L5). |
| **AC8** | RED-bewijs | **Niet haalbaar op het huidige doelwit** | Geen echt geval om rood te maken bij opbrengst 0 (L4). |
| **AC9** | Geen regressie, api-suite groen | **KLOPT** | Normale eis; bestaande dekking aanwezig (`t3777-declarations*.test.ts`, `build-keurmerk-index*.test.ts`). |

**Claims buiten de AC's:**

| Claim | Oordeel |
|---|---|
| "De oorzaak van die 500'en is een verouderde GLN" (`:29-31`, `VERIFIED`) | **Weerlegd.** In 53 van 62 gevallen bestaat er geen tweede gln; in de 9 die er wel een hebben, ontbreekt het bestand daar ook. |
| "8717591319993 — XML-bestand aanwezig" (`:38`) | **Onjuist voor de catalogus-API** op acc én stage (H2). Waar het bestaat, is als veld in de prod-Mongo. |
| "De applicatie heeft geen enkele Mongo-verbinding, niet in de code" (`:62`) | **Onjuist voor de code**, juist voor de draaiende omgeving (M5). |
| "Daarmee blijft alles binnen de bestaande architectuur" (`:58`) | Klopt — maar de bestaande architectuur bereikt de gegevens niet. |

---

## 3. Wat er moet wijzigen vóór dev

**Blokkerend — de story kan in deze vorm niet naar development.**

1. **Herricht de story op het 404-pad.** Dat is het enige pad met gemeten opbrengst (4/20 → ~29
   producten). Haal de 143 404's uit "Wat NIET in deze story zit" en maak ze het doelwit. (M1, M2)
2. **Verwijder de claim dat de terugvaloptie de 442 oplost**, of onderbouw hem met een eigen meting
   die de bovenstaande weerlegt. Vervang de bewijstabel bij `:33-39`: de drie keurmerken komen uit
   de prod-Mongo, de catalogus-aanroep onder de nieuwe gln geeft 500 op beide omgevingen. (H1, H2)
3. **Maak AC6 uitvoerbaar.** Kies één en schrijf hem op: (a) de ná-run draait onder een
   cachesleutel met een nieuw versiesegment, of (b) de betrokken `marks:*`-sleutels worden vooraf
   gericht verwijderd — geen `FLUSHDB`, en dat is een schrijfactie die apart voorgelegd moet worden.
   Neem `KEURMERK_INDEX_LIMIT=2000` expliciet in de meetopdracht op. (H3)
4. **Vervang `updated_at` door `lastChangeDateTime`** als rangschikkingssleutel, met `updated_at`
   hooguit als tiebreak, en neem `status` mee in de afweging. (M3)
5. **Verzoen met story 18.1** of leg vast waarom de bevroren keuze "bij >1 gln niet gokken" hier
   niet geldt. Eén regel per gegeven, in beide stukken code hetzelfde. (M4)

**Vóór dev te corrigeren, niet-blokkerend voor de richting:**

6. Herschrijf de verwerping van de MongoDB-route op het juiste feit: er ís code en governance
   (18.1), de driver en de URI ontbreken alleen in de huidige omgeving. Weeg hem opnieuw, want na
   H1/H2 is dit de enige bron waarvan is aangetoond dát de declaraties er staan. (M5)
7. AC4: schrijf "ten hoogste twee extra aanroepen" en regel expliciet of het her-ophalen door de
   herkansingslus mag. (M6)
8. AC4: geef de gtin→gln-cache een eigen namespace **met** omgevingssegment, en spreek uit onder
   welke sleutel een geslaagd resultaat wordt weggeschreven. (M7)
9. AC7: eis expliciet dat een mislukte opzoeking terugvalt op de oorspronkelijke reden en géén
   `api-fout` telt. (M9)
10. Corrigeer de bronverwijzing `:117` naar `build-keurmerk-index.ts:458` + `:287-301`
    (`knownGln`), en noem `resolveDeclaredMarks:601-675` als het te wijzigen punt. (M8)
11. Zet L2 en L3 als gesloten deuren in de story: `xmlFilepath` is geen bestandssignaal, en maar 8
    van 1862 GTIN's hebben een tweede gln in onze eigen tabel.
12. Verlaag `VERIFIED` naar `INFERENCE` waar het onderzoek zelf dat doet (L1), en noteer expliciet
    dat snelheid geen bezwaar is (L5, 58 ms per opzoeking).

---

## 4. Reproduceerbaarheid

Alle metingen zijn read-only en herhaalbaar vanuit de ACC-api-container. De kern in één regel:

```js
// per gtin: eerst de echte aanroep, bij 500 de terugvaloptie
GET {CATALOG_API_BASE}/api/tradeitemxml/{gln}-{gtin}-528          // header X-API-Key
GET {CATALOG_API_BASE}/api/tradeitemxml                            // header x-query: {"globalTradeItemNumber":"<gtin>"}
   → filter targetMarket === "528" && informationProvider !== gln
   → sorteer updated_at desc, id desc
   → GET .../{nieuweGln}-{gtin}-528
```

Universum: `prisma.artworkImport.findMany({ where: { gln: { not: null } }, select: { gtin: true, gln: true }, orderBy: { gtin: 'asc' } })`,
ontdubbeld op gtin, elke n-de rij als steekproef. Er is niets weggeschreven; de hulpscripts zijn na
afloop uit de container verwijderd.

## Change Log

- 2026-08-18: Adversariële spec-review. Verdict FAIL (3 high, 9 medium, 6 low).
