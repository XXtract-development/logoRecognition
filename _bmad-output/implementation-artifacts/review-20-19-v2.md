---
review_of: 20-19-declaraties-uit-de-tradeitem-database.md (versie 2)
reviewer: adversariële spec-review, verse context
date: 2026-08-19
branch: acc
verdict: FAIL
severity_count: { high: 4, medium: 7, low: 5 }
---

# Adversariële spec-review — story 20.19, versie 2

**Verdict: FAIL** — 4 high / 7 medium / 5 low.

Versie 2 heeft de vier highs uit de vorige ronde inhoudelijk goed te pakken: de gln-uitsluiting is
weg, de opzoekweg is de snelle sleutel geworden, de kwaliteitspoort wordt bij naam genoemd en de
vijf veldsoorten staan erin. Toch weer FAIL, om vier redenen die geen mening zijn:

1. **De opbrengst is met 238 hoger dan de 179-211 die de story belooft** — een acceptatiecriterium
   dat te laag mikt keurt een halve implementatie goed (§1, N3).
2. **Het governance-akkoord van 2026-07-04 dekt dit niet.** Dat gold voor één handmatig gestarte,
   off-peak leesactie; deze story maakt de productiedatabase een vaste afhankelijkheid van een
   terugkerende run (N1).
3. **AC5 schrijft voor om `oldValue` mee te nemen.** De vorige review noemde dat juist het risico —
   ingetrokken declaraties die valse kruischeck-akkoorden opleveren — en vroeg om een besluit. De
   herziening koos stilzwijgend de riskante kant (N2).
4. **AC3 hangt de terugval aan béide ingangen zonder de T3777-ingang te versmallen.** Die ingang
   voedt het live auto-akkoord met uitsluitend T3777-codes; er vijf codelijsten in duwen levert
   onterechte akkoorden op (N4).

## 1. De meting die bepaalt of de story zin heeft

**Vraag:** hoeveel van de 442 producten vind je met een DIRECTE `_id`-opzoeking op ONZE eigen gln
(`{gln}-{gtin}-{targetMarket}`), en hoeveel daarvan declareren daadwerkelijk een keurmerk?

**Antwoord, `VERIFIED`, volledige telling (geen steekproef, geen ondergrens):**

| | Aantal | Aandeel |
|---|---|---|
| Sleutels in de ACC-declaratiecache met reden `geen-tradeitem-bestand` | 442 | — |
| Daarvan een document op productie onder **precies onze eigen gln** | **442** | **100%** |
| Daarvan met ≥1 keurmerkcode (niet-lege `value`, alle vijf veldsoorten) | **238** | **53,8%** |
| Extra, alleen via `oldValue` (lege `value`) | +5 | |
| Totaal aantal code-instanties | 475 | |
| Code-instanties die alleen in `oldValue` staan | 17 | |

Per veldsoort (niet-lege `value`, over de 442):

| gdsn-veld | instanties | producten |
|---|---|---|
| `packagingMarkedLabelAccreditationCode` | 292 | 177 |
| `dietTypeCode` | 89 | 68 |
| `nutritionalScore` | 61 | 61 |
| `enumerationValue` binnen `consumerUsageLabelCode` | 33 | 22 |
| `localPackagingMarkedLabelAccreditationCodeReference` | **0** | **0** |

**Gevolg voor de story: het beloofde bereik 179-211 is te laag, en de tweede helft van de zin
"Ondergrens onder precies onze eigen gln: 179" is onjuist.** Onder precies onze eigen gln is het
238, dus hoger dan de bovengrens die de story als plafond opvoert. `INFERENCE`: review-20-19 telde
langs twee van de vijf veldsoorten (`packagingMarkedLabelAccreditationCode` en `dietTypeCode`) en
kapte de boomdoorloop af na 12 niveaus (`deepLeftMax=4`); daardoor viel `nutritionalScore` (61
producten) en de gescopete `consumerUsageLabelCode` (22 producten) buiten beeld.

**Ook weg is de hele gln-discussie.** De 59 producten met meer dan één gln, en de 32 die daarvan
declareren, spelen geen rol meer: alle 442 hebben een document onder onze eigen gln. Er valt niets
te kiezen en niets te gokken. Dat maakt AC2 van versie 2 feitelijk juist — maar de getallen die er
in versie 2 omheen staan kloppen niet meer.

### Reproduceerbaar

```bash
# 1. De 442 sleutels uit de ACC-declaratiecache (alleen SCAN + MGET, niets geschreven)
ssh vanilla "docker exec app-qsookwow8koko0kwg00g0cwk-134318329338 node -e '<ioredis: SCAN marks:* -> MGET -> groepeer op .reason>'"
# uitkomst 2026-08-19: ok=848  geen-tradeitem-bestand=442  lege-declaratie=429  404-mogelijk-TM-mismatch=144  (1863 totaal)
# sleutelvorm marks:{env}:{gln}:{gtin}:{tm}, env = "stage", tm = 528 voor alle 442

# 2. _id = {gln}-{gtin}-{tm} uit die sleutels, daarna op productie:
#    $match {_id: {$in: [442 sleutels]}}
#    + boomdoorloop met $reduce over $range(0,34) die per niveau
#      (a) knopen oogst met meta.gdsn in de vier platte veldnamen, plus
#          meta.gdsn == "enumerationValue" met "consumerUsageLabelCode" in de xpath,
#      (b) de frontier uitklapt: arrays direct, objecten via $objectToArray.
#    Afgebroken restant na 34 rondes: leftoverSum = 0 -> de telling is volledig, geen ondergrens.
```

## 2. Bevindingen uit review-20-19 (v1) — status

| v1 | Kern | Status | Bewijs |
|---|---|---|---|
| **H1** | AC5 verwierp het eigen voorbeeld en 32 van de 211 | **VERWERKT** | v2 AC2 schrapt de gln-keuze en ankert op onze eigen gln. Sterker nog dan de story zelf zegt: gemeten hebben **442 van 442** een document onder precies onze eigen gln, dus er valt niets meer te kiezen (§1) |
| **H2** | De query was een collectiescan van 51 s per product | **VERWERKT, met een addertje** | v2 AC1 schrijft de `_id`-opzoeking voor met de gemeten 0 ms tegen 50.934 ms. Maar de story zegt óók dat het 18.1-patroon "hergebruikt" wordt, en de opzoeker dáárin is exact de niet-verankerde `_id`-regex die v1 verbood (`backfill-gln-from-tradeitems.ts:233-240`). Zie N6 |
| **H3** | De kwaliteitspoort valt om via `default → api-fout`, `timeout` en `niet-verwerkt` | **DEELS** | v2 AC6 noemt `mapDeclarationReason`, de default-tak en 23,7% tegen 5% — goed. Maar nergens staat de eis die het probleem oplost: een nieuwe `CollectReason` die **buiten de teller van poortregel 7b valt** (`technical = reasons['api-fout'] + reasons.timeout`, `build-keurmerk-index.ts:546`). "Expliciet toegewezen" mag ook betekenen: toegewezen aan `api-fout`, en dan blokkeert hij nog steeds. Zie N7 |
| **H4** | 2 van de 5 keurmerkveldsoorten, en geen veldtype-toewijzing | **DEELS** | v2 AC4 eist alle vijf "met de juiste veldtoewijzing", maar noemt de vijf niet, geeft de tabel gdsn → `fieldType` niet, en laat `trim()` / `toUpperCase()` / ontdubbelen per `(fieldType, code)` weg — alle drie stonden expliciet in v1. De bron is `MARK_FIELDS` + `CONSUMER_USAGE_FIELD_TYPE` in `t3777-declarations.ts:420-431`. Zie N5 |
| **M1** | "Niet meetbaar zonder deze story" was onjuist | **VERWERKT in vorm, onjuist in getal** | v2 heeft een sectie "De opbrengst — geteld, niet geschat". De getallen erin (211 / 179) zijn achterhaald: gemeten 238. Zie N3 |
| **M2** | Bestaand patroon en env-naam `TRADEITEMS_MONGO_URI` | **VERWERKT** | v2 gebruikt de bestaande naam en verwijst naar het 18.1-script. `VERIFIED`: de env-var staat vandaag niet op de ACC-applicatiecontainer (`env \| grep -c TRADEITEMS_MONGO_URI` = 0). Wél nieuw probleem met het akkoord waar de story zich op beroept — zie N1 |
| **M3** | De `mongodb`-driver ontbreekt overal | **VERWERKT** | v2 zegt het met zoveel woorden. `VERIFIED`: geen enkele package.json in de repo noemt `mongodb` als (dev)dependency — alleen transitieve peer-verwijzingen van OpenTelemetry — en `apps/api/node_modules/mongodb` bestaat niet |
| **M4** | `value` tegenover `oldValue`: besluit nemen en opschrijven | **VERKEERD VERWERKT** | v2 AC5 schrijft "**`value` én `oldValue`**" voor. v1 waarschuwde juist dat beide verzamelen verouderde declaraties oplevert die de XML-route niet geeft, dus valse kruischeck-akkoorden. Zie N2 |
| **M5** | `meta.targetMarket` is een array | **DEELS** | v2 AC5 noemt het, met het voorbeeld `["528"]`. Gemeten is de array vaak langer: 4.044 documenten hebben 2, 3 of 5 doelmarkten, en elementen kunnen gehele getallen zijn (`[123,456,789]`). Zie N12 |
| **M6** | Twee ingangen met eigen caches | **DEELS** | v2 AC3 noemt ze allebei en kiest "beide". Wat ontbreekt is het gevolg: `resolveDeclarations` levert **uitsluitend** T3777-codes aan het live auto-akkoord. Zie N4 |
| **M7** | De cache blokkeert de terugval 24 uur | **DEELS** | v2 AC7 beschrijft het probleem goed en eindigt met "Voorzie een manier om die reden gericht te verversen." Geen schakelaar bij naam, geen uitspraak over de 442 bestaande sleutels, en niet vermeld dat het verwijderen daarvan een schrijfactie is die toestemming vraagt — alle drie stonden in v1. Zie N11 |
| **M8** | 12 declarerende 404's laten liggen | **VERWERKT in vorm, op onjuiste grond** | v2 houdt ze buiten scope en noemt "23 bestaan, 12 declareren, het is geen nul". Gemeten langs de route die de story zélf voorschrijft: **0 van de 144** heeft een document onder onze eigen gln. Zie N8 |
| **M9** | Geen testnaad voor Mongo | **DEELS, met een onjuiste bewering** | v2 AC10 zegt "Er is nu geen testnaad voor Mongo". Die is er wél: 18.1 heeft het functietype `GlnLookup` plus injecteerbare `BackfillDeps` (`backfill-gln-from-tradeitems.ts:143-152, 219-250`) en een testbestand `apps/api/src/__tests__/services/backfill-gln-from-tradeitems.test.ts`. v1 vroeg om dát patroon over te nemen; die instructie is verdwenen. Zie N9 |
| **M10** | Nieuwe redencodes raken vier plekken | **NIET** | v2 noemt geen van de vier: `DeclarationReason` (`t3777-declarations.ts:49-57`), `CollectReason` + `emptyReasonCounts` (`build-keurmerk-index.ts:325-349`), `mapDeclarationReason` en de twee samenvattingsregels (`build-keurmerk-index.ts:633-634`) |
| **L1** | Doelmarkt komt uit `T3777_TARGET_MARKET` | **NIET** | v2 noemt de env-variabele nergens; AC1 en AC5 spreken van "targetMarket" zonder bron |
| **L2** | Bronverwijzing naar de 18.1-spec zonder pad | **NIET** | v2's Bronverwijzingen noemen wél het script, niet `_bmad-output/implementation-artifacts/18-1-gln-backfill-via-batch-export.md` — terwijl AC2 zich juist op de tekst van die story beroept |
| **L3** | 1862 tegenover 1863 cache-entries | **VERWERKT** | v2 claimt dat getal niet meer. Hertelling vandaag: 1863 (848 / 442 / 429 / 144), ongewijzigd |
| **L4** | Verbindingseisen zonder getallen | **NIET** | v2 AC9 zegt nog steeds "korte time-out, begrensde pool" zonder waarden, terwijl het budget per product 30 s is |
| **L5** | Afgebroken zin in 20.18 | **NIET** | `20-18-verouderde-gln-blokkeert-oogst.md:167-169` eindigt nog altijd met "…groter dan deze story., wacht op spec-review." en 20.19 haalt dat blok als bron aan |

## 3. Nieuwe bevindingen in versie 2

### HIGH

**N1 — Het governance-akkoord van 2026-07-04 dekt deze story niet. — high**

`VERIFIED`, letterlijk uit de kop van het script waar de story zich op beroept
(`apps/api/scripts/backfill-gln-from-tradeitems.ts:1-21`):

> "**Eenmalig, HANDMATIG gestart** … **NOOIT automatisch bij deploy of migratie** (operationele
> envelope §3, ARCH-4). De echte read-only prod-export is een **aparte, door de mens afgetrapte
> operationele stap**; governance-akkoord is gegeven op 2026-07-04."

En in de spec van 18.1 zelf: *"Prod-MongoDB-toegang: uitsluitend read-only, **off-peak, na akkoord**"*
en *"de echte run is een gecontroleerde handmatige uitvoering"*.

Story 20.19 doet iets wezenlijk anders: de productiedatabase wordt een **staande afhankelijkheid**
van een terugkerende indexrun, en via AC3 mogelijk ook van het live detectiepad. De verbindingsreeks
komt bovendien als vaste env-var op een applicatiecontainer te staan, terwijl 18.1 vastlegt dat hij
"alleen op de uitvoerende machine" gezet wordt. De story presenteert dit als "bouwt daarop voort in
plaats van ernaast" — dat is precies de framing waarmee een besluit ongemerkt wordt opgerekt.

Dit is geen reden om de story af te blazen, wel om de vraag opnieuw voor te leggen: mag ACC
permanent op de productiedatabase lezen, in welk venster, en met welk profiel. Dat hoort in
"Voorwaarden buiten deze story" te staan, met dezelfde hardheid als de go/no-go van 18.1.

**N2 — AC5 schrijft `oldValue` voor; dat is de kant waar de vorige review tegen waarschuwde. — high**

v2 AC5: "**`value` én `oldValue`**: 18 code-instanties staan alleen in `oldValue`".
v1/M4 zei: *"Beide verzamelen levert verouderde declaraties op die de XML-route niet zou geven (en
dus valse crosscheck-akkoorden); alleen `value` is verdedigbaar maar moet er staan."* Er werd om een
**besluit met onderbouwing** gevraagd; de herziening maakte er een instructie van om beide te nemen,
zonder één zin argumentatie.

Gemeten over de 442, met alle vijf veldsoorten: **17 code-instanties** staan uitsluitend in
`oldValue`, verdeeld over **5 producten**. De hele winst van deze keuze is dus 5 producten (2% van
de 238). Daar tegenover staat dat de kruischeck op die producten kan auto-akkoorderen tegen een
declaratie die de leverancier heeft ingetrokken — in een systeem dat juist bedoeld is om de
verpakking tegen de waarheid te leggen. `oldValue` hoort weggelaten te worden, of de story moet
uitleggen waarom een ingetrokken declaratie hier toch als waarheid telt.

**N3 — De beloofde opbrengst (179-211) ligt lager dan de werkelijkheid (238). — high**

Zie §1. Een acceptatiecriterium dat "verwacht 179-211" als toetssteen neemt (AC8), keurt een run van
180 producten goed terwijl er 238 haalbaar zijn. Precies het gat dat ontstaat wanneer dev de
boomdoorloop bij twee modules begint — de fout die het getal 211 heeft veroorzaakt.

Gemeten liggen de vijf velden in **vier verschillende modules**:

| gdsn-veld | module |
|---|---|
| `packagingMarkedLabelAccreditationCode`, `localPackagingMarkedLabelAccreditationCodeReference` | `packagingMarkingModule` |
| `dietTypeCode` | `dietInformationModule` |
| `nutritionalScore` | `healthRelatedInformationModule` |
| `consumerUsageLabelCode/enumerationValueInformation/enumerationValue` | `consumerInstructionsModule` |

AC5 zegt alleen "Loop de boom af op `meta.gdsn`" en noemt geen startpunt. Wie bij twee modules
begint, verliest 61 producten met een Nutri-Score en 22 met een AISE/NIX18-pictogram.

**N4 — De T3777-ingang wordt niet versmald; dat kan onterechte auto-akkoorden opleveren. — high**

`VERIFIED` in de code: `resolveDeclarations` levert `codes: string[]` uit `parseT3777Codes`, dus
uitsluitend `packagingMarkedLabelAccreditationCode`-waarden
(`t3777-declarations.ts:98-108, 311-339`). Die uitkomst gaat via `catalogDeclarationProvider` naar
de detectie-flow en bepaalt of een detectie automatisch akkoord krijgt.

v2 AC3 zegt: er zijn twee ingangen, "beide moeten geraakt worden". Wat er niet staat: dat de
terugval voor die ingang **alleen** `PackagingMarkedLabelAccreditationCode` mag teruggeven. Levert
hij daar ook `DietTypeCode`, `NutritionalScore` of `EU_consumerUsageLabelCodeList` aan, dan kan een
detectie akkoord krijgen op een code uit een heel andere codelijst.

Tweede punt bij dezelfde AC: de twee caches leven in verschillende omgevingen.
`marks:{env}:…` draagt een omgevingssegment dat uit `CATALOG_API_BASE` komt (19.16, AC8: de
scheiding is daar een **harde voorwaarde** genoemd); `t3777:{gln}:{gtin}:{tm}` heeft dat segment
niet. De index wordt op stage-declaraties gebouwd, en langs deze route zou het live ACC-pad ineens
op productiegegevens draaien. Dat verdient een expliciete regel, geen bijzin.

### MEDIUM

**N5 — AC4 en AC5 beschrijven twee mechanismen die niet op elkaar aansluiten. — medium**

AC4 eist vijf veldsoorten met de juiste veldtoewijzing; AC5 schrijft één mechanisme voor ("loop de
boom af op `meta.gdsn`"). Het vijfde veld heet in de database niet naar zijn codelijst maar
`enumerationValue`, en krijgt zijn betekenis pas van de omringende `consumerUsageLabelCode` — in de
XML-route staat daar een aparte, bewust gescopete parse voor, mét de reden erbij
(`t3777-declarations.ts:436-482`). Een platte match op `meta.gdsn == "enumerationValue"` is dus
niet hetzelfde. De spec moet de vijf gdsn-namen, de scoping en de tabel naar `fieldType` bevatten:

| gdsn in de database | `fieldType` |
|---|---|
| `packagingMarkedLabelAccreditationCode` | `PackagingMarkedLabelAccreditationCode` |
| `localPackagingMarkedLabelAccreditationCodeReference` | `AdditionalPackagingMarkingsCode` |
| `dietTypeCode` | `DietTypeCode` |
| `nutritionalScore` | `NutritionalScore` |
| `enumerationValue` binnen `consumerUsageLabelCode` | `EU_consumerUsageLabelCodeList` |

Terzijde, gemeten: `localPackagingMarkedLabelAccreditationCodeReference` levert over de 442
**nul** niet-lege waarden. De terugval dekt in de praktijk vier van de vijf.

**N6 — De story verwijst naar een patroon dat AC1 tegenspreekt. — medium**

"Het bestaande patroon, dat hergebruikt wordt" wijst naar `backfill-gln-from-tradeitems.ts`, en
noemt daarbij "uitsluitend `find`". De opzoeker in dat bestand is
`{_id: {$regex: "-{gtin}-{tm}$"}}` (regel 233-240) — een niet-verankerde regex, dus exact de
collectiescan van 51 s die AC1 verbiedt. Wat wél overgenomen moet worden is de vorm (lazy import,
env-naam, injecteerbare opzoeker), niet de query. Dat verschil hoort in de spec te staan, anders
kopieert dev het bestand.

**N7 — AC6 benoemt de verkeerde handeling voor `timeout` en `niet-verwerkt`. — medium**

AC6: "Elke nieuwe code moet daarom expliciet toegewezen worden, inclusief `timeout` en
`niet-verwerkt`." Die twee zijn geen declaratieredenen die je kunt toewijzen: ze ontstaan in de
indexbouwer zelf, uit de race van 30 s per product (`getGtinTimeoutMs`, regel 311) en de globale
deadline van 20 minuten (`getMaxRuntimeMs`, regel 313). De eis die het risico afdekt is een andere:
de databaseopzoeking krijgt een **eigen, korte time-out ruim onder de 30 s**, zodat een trage of
onbereikbare database nooit `timeout` of `niet-verwerkt` veroorzaakt — en de nieuwe `CollectReason`
valt buiten `technical` in poortregel 7b. Beide zinnen ontbreken.

**N8 — De 404-groep levert langs de eigen route van de story nul op, niet twaalf. — medium**

`VERIFIED`: van de 144 sleutels met reden `404-mogelijk-TM-mismatch` heeft **0** een document met
`_id = {onze gln}-{gtin}-528`. De 23 documenten en 12 declaraties uit v1 werden gevonden via
`meta.gtin`, dus onder een **andere** gln. De story schrijft nu "het is geen nul … aparte story
waard"; onder de opzoekweg die diezelfde story voorschrijft is het wél nul. Wie daar een story op
baseert, herhaalt de fout van 20.18.

**N9 — De bewering "er is nu geen testnaad voor Mongo" klopt niet. — medium**

Zie M9 hierboven. Het gevolg is dat AC10 dev naar een nieuwe constructie stuurt terwijl er een
werkend, getest voorbeeld staat.

**N10 — Database en catalog-XML zijn niet dezelfde bron, en dat is meetbaar. — medium**

Steekproef van 100 van de 848 producten waarvoor beide bronnen bestaan: de declaraties uit de
database zijn bij **98** identiek aan wat de XML-route in de cache heeft staan, en wijken bij **2**
af:

```
8710466000019-08710466310521-528  XML: RAINFOREST_ALLIANCE_PEOPLE_NATURE   DB: RAINFOREST_ALLIANCE
8710552001005-05038483364345-528  XML: TRIMAN                              DB: GREEN_DOT
```

De eerste is geen ontbrekende code maar een **andere** code voor hetzelfde product. De database is
het invoermodel van de redactie (met `oldValue`, `remark`, `xpath`), de catalog-XML het gepubliceerde
resultaat; dat die twee uiteenlopen is logisch, maar de story gaat er stilzwijgend van uit dat de
terugval "dezelfde" declaratie oplevert. Voeg een acceptatiecriterium toe dat de overeenstemming op
de 848 meet — dat is gratis, want beide bronnen zijn er — en leg een ondergrens vast.

*Voorbehoud: de XML-kant komt uit de declaratiecache en kan tot 24 uur oud zijn; een deel van de
2% kan tijdverschil zijn in plaats van bronverschil.*

**N11 — De cache-maatregel is te vaag om uitvoerbaar te zijn. — medium**

"Voorzie een manier om die reden gericht te verversen" laat drie dingen open die v1 wél benoemde:
welke schakelaar (lees- én schrijfkant), wat er met de 442 bestaande sleutels gebeurt na uitrol, en
dat het verwijderen van die sleutels een schrijfactie is die vooraf toestemming vraagt. Zonder dat
laatste loopt dev het risico dat "even de cache legen" tijdens de bouw gebeurt.

### LOW

**N12 — Het `_id`-formaat geldt niet voor álle documenten. — low**

Gemeten over de volledige collectie (161.949 documenten):

| | Aantal |
|---|---|
| `_id` = `{gln}-{gtin}-{targetMarket[0]}` | 161.931 |
| Afwijkend `_id` (onderstreepjes, of alleen een volgnummer) | 18 |
| `meta.targetMarket` met 2, 3 of 5 waarden — `_id` draagt alleen de eerste | 4.044 |

De afwijkers zijn grotendeels testrecords (gln `1000000000001`), maar niet allemaal: er zijn
documenten met een echte gln en een `_id` als `08710537042528_3983283`. Belangrijker voor de story:
`528` staat, waar het voorkomt, **altijd** als eerste in de array — dus de opzoeking op `-528` mist
niets. Die eigenschap is nergens vastgelegd en geldt niet vanzelf voor een andere doelmarkt. Eén zin
in AC1 volstaat: de sleutel draagt de eerste doelmarkt, en voor 528 is dat vandaag gemeten sluitend.

**L1-L4 (uit v1, nog open):** doelmarkt-bron `T3777_TARGET_MARKET` niet genoemd; geen pad naar de
18.1-spec; geen getallen bij de verbindingseisen; de afgebroken zin in 20.18 staat er nog.

## 4. Wat moet wijzigen vóór dev

1. **Vervang alle opbrengstgetallen door de gemeten 238** (§1) en stel AC8 daarop af: 442 van 442
   vindbaar, minstens 238 met een declaratie, 475 code-instanties. Zet erbij dat de vijf velden in
   vier modules liggen, zodat de doorloop niet bij twee begint.
2. **Leg de governance-vraag opnieuw voor** (N1). Het akkoord van 2026-07-04 gold een eenmalige,
   handmatige, off-peak leesactie; deze story maakt er een vaste verbinding van. Neem in
   "Voorwaarden buiten deze story" op: welk profiel, welk venster, en wie akkoord geeft.
3. **Schrap `oldValue`**, of onderbouw waarom een ingetrokken declaratie hier meetelt (N2). De winst
   is 5 producten; de kosten zijn valse kruischeck-akkoorden.
4. **Versmal de T3777-ingang** tot `PackagingMarkedLabelAccreditationCode` en zeg wat er met de
   omgevingsscheiding van de twee caches gebeurt (N4).
5. **Zet de veldtabel in de spec** — vijf gdsn-namen, vijf `fieldType`-waarden, de scoping van
   `enumerationValue` binnen `consumerUsageLabelCode`, plus `trim()`, `toUpperCase()` en ontdubbelen
   per `(fieldType, code)` (N5, H4).
6. **Maak AC6 uitvoerbaar**: een eigen `CollectReason` die buiten `technical` van poortregel 7b
   valt, doorgevoerd in `DeclarationReason`, `CollectReason`, `emptyReasonCounts`,
   `mapDeclarationReason` en de twee samenvattingsregels — plus een eigen korte time-out op de
   databaseopzoeking ruim onder de 30 s, met een getal (N7, M10, L4).
7. **Maak AC7 concreet**: noem de schakelaar, zeg wat er met de 442 bestaande cache-sleutels
   gebeurt, en markeer het opruimen ervan als schrijfactie die toestemming vraagt (N11).
8. **Corrigeer het testnaad-verhaal**: verwijs naar `GlnLookup`/`BackfillDeps` uit 18.1 en naar het
   bestaande testbestand, in plaats van te stellen dat er niets is (N9).
9. **Zeg erbij dat het 18.1-patroon qua vorm wordt overgenomen, maar de regex-opzoeking níet** (N6).
10. **Corrigeer de 404-passage**: langs de route van deze story leveren ze nul op (N8).
11. **Voeg een overeenstemmingstoets toe** op de 848 producten waar beide bronnen bestaan, met een
    ondergrens (N10).
12. **Kleine correcties**: `T3777_TARGET_MARKET` als bron van de doelmarkt, het pad naar de
    18.1-spec bij de bronverwijzingen, en de `_id`-nuance uit N12.

## 5. Wat NIET geverifieerd is

- **Of de leesrechten-gebruiker uit "Voorwaarden" bestaat.** Deze review las mee via de bestaande
  MCP-verbinding, niet via een nieuw account.
- **De claim "volledige herbouw geeft +29 producten, +1 code".** Niet nagemeten; overgenomen uit
  eerder onderzoek.
- **Of `meta.gdsn == "enumerationValue"` ook búiten `consumerUsageLabelCode` voorkomt.** In een
  steekproef van 41 documenten kwam hij uitsluitend gescopet voor; over de hele collectie niet
  getoetst. De code zelf noemt het risico wél expliciet.
- **De vergelijking database tegenover XML** is een steekproef van 100 van de 848, en de XML-kant
  komt uit een cache die tot 24 uur oud kan zijn.
- **De hercontrole van de 429 "lege declaratie"-producten** liep over 220 van de 429: daarvan
  declareren er **3** (alle 220 hebben wel een document onder onze eigen gln). De uitsluiting in de
  story houdt daarmee stand.
- **Er is nergens iets geschreven.** Alleen `find`, `aggregate`, Redis `SCAN`/`MGET`, een
  TCP-connectietest en `env | grep -c`.

## Change Log

- 2026-08-19: Adversariële spec-review op versie 2. Verdict FAIL (4 high / 7 medium / 5 low). De
  premisse is sterker dan de story zelf beweert — 442 van 442 vindbaar op onze eigen gln, 238
  declarerend in plaats van de beloofde 179-211 — maar het governance-akkoord dekt deze vorm van
  toegang niet, AC5 kiest stilzwijgend voor verouderde declaraties, en de T3777-ingang wordt niet
  versmald.
