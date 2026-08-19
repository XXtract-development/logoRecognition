# Adversariële SPEC-review — Story 20.19 (declaraties uit de trade-item-database)

- **Reviewer:** adversarial spec review (BMAD), 2026-08-18
- **Story:** `_bmad-output/implementation-artifacts/20-19-declaraties-uit-de-tradeitem-database.md` (status `draft`)
- **Achtergrond:** `_bmad-output/planning-artifacts/research/oogstbron-uitgeput-of-geblokkeerd-2026-08-18.md`,
  `_bmad-output/implementation-artifacts/20-18-verouderde-gln-blokkeert-oogst.md` (afgekeurd),
  `_bmad-output/implementation-artifacts/review-20-18.md`
- **Code-basis:** branch `acc`, HEAD `5e29c05`
- **Meetomgeving:** ACC-api-container `app-qsookwow8koko0kwg00g0cwk-134318329338` (read-only),
  productie-MongoDB `application.tradeItems` via de MCP-server `mongodb-prod` (alleen `find`/`aggregate`/`explain`).
  Er is nergens iets weggeschreven.
- **Scope:** de SPEC getoetst tegen de echte code en tegen live metingen; er is niets geïmplementeerd.

```
verdict: FAIL
severity_count: { high: 4, medium: 10, low: 5 }
```

**Het goede nieuws eerst, en het is voor het eerst in dit dossier een gemeten getal:** de premisse
klopt. Van de 442 producten met een ontbrekend XML-bestand declareert **211 (47,7%)** wél minstens
één keurmerkcode in de productiedatabase. Dat is geen extrapolatie en geen steekproef — het is de
volledige 442, langs de echte veldstructuur uitgelezen. Anders dan bij 20.18 (0 van 62) staat hier
werkelijk iets tegenover de moeite.

**FAIL omdat de spec, zoals hij nu staat, dat getal niet kan verzilveren.** Vier dingen die geen
mening zijn maar een meting:

1. **AC5 sluit het eigen kroongetuige-product uit.** `08000146029059` heeft twee documenten voor
   doelmarkt 528 onder verschillende gln's — precies het geval dat AC5 verwerpt. Het enige uitgewerkte
   voorbeeld in de story levert onder de eigen regel dus niets op. Kosten van AC5 in totaal: 32 van de
   211 declarerende producten.
2. **De query die AC4 en AC5 nodig hebben duurt 51 seconden per product** op de productiedatabase
   (volledige collectiescan over 161.945 documenten; er is geen index op `meta.gtin`). Voor 442
   producten is dat ~6,3 uur scannen op productie. De indexbouwer geeft elk product 30 seconden en de
   hele run 20 minuten.
3. **De kwaliteitspoort valt daardoor wél om**, en langs een route die AC6 niet noemt: niet via
   `api-fout` maar via `timeout` en `niet-verwerkt`. Bovendien belandt élke nieuwe redencode — óók
   `db-terugval-gelukt` — in de `default`-tak van de indexbouwer, en die telt als `api-fout`.
4. **AC2 en AC3 spreken elkaar tegen.** De XML-route levert vijf keurmerkveldsoorten; AC3 leest er
   twee. "Dezelfde uitkomstvorm" is met die twee gdsn-namen niet te halen.

Alle vier zijn te repareren zonder het idee op te geven. De richting staat in §3.

---

## 1. Bevindingen

### HIGH

**H1 — AC5 verwerpt het eigen voorbeeld, en 32 van de 211 opbrengsten. — high**

Bron: `20-19-declaraties-uit-de-tradeitem-database.md:25` (het voorbeeld) tegenover regel 69-72 (AC5).

Gemeten op productie:

```
db.tradeItems.find({"meta.gtin":"08000146029059"}, {meta:1})
→ _id 8712423033887-08000146029059-528  meta.targetMarket ["528"]
→ _id 8717591319993-08000146029059-528  meta.targetMarket ["528"]
```

Twee documenten, dezelfde doelmarkt, verschillende gln. AC5 zegt: dan wordt de declaratie **niet**
gebruikt. Het product dat de story als bewijs opvoert valt dus onder de eigen uitsluitingsregel.

En het is geen randgeval. Volledige telling over de 442 (aggregatie, zie §4):

| | Aantal | Aandeel |
|---|---|---|
| GTIN's met een 528-document op productie | 442 | 100% |
| Declareert ≥1 code (welke gln dan ook) | **211** | 47,7% |
| Meer dan één gln voor doelmarkt 528 | 59 | 13,3% |
| → daarvan declarerend (verworpen door AC5) | **32** | |
| → daarvan met tegenstrijdige documenten (de één declareert, de ander niet) | 23 | |
| **Opbrengst onder AC5 zoals geschreven** | **179** | **40,5%** |

Daar komt een tweede fout bovenop: **AC5 beroept zich op story 18.1, maar dat besluit ging over iets
anders.** 18.1 (`18-1-gln-backfill-via-batch-export.md:96,150`) legt vast dat je bij >1 gln niet mag
gokken **welke gln je in `artwork_imports` schrijft** — een herkomstregistratie die daarna alles
stuurt. In 20.19 wordt er niets geschreven en wordt er niets gekozen: onze gln is al bekend, hij komt
uit `artwork_imports` en zit letterlijk in de `_id` van het document (`{gln}-{gtin}-{tm}`). Het
document van *onze* gln opzoeken is geen gok. AC5 importeert een regel uit een andere context en
betaalt daar 32 producten voor, terwijl de veilige variant (alleen het document van onze eigen gln)
juist géén keuze bevat. De 23 tegenstrijdige gevallen laten zien dat het onderliggende besluit hout
snijdt — maar dan als *reden om op de eigen gln te ankeren*, niet als reden om af te haken.

**H2 — De query achter AC3/AC4/AC5 is een collectiescan van 51 seconden per product. — high**

Gemeten met `explain(executionStats)` op productie, vandaag:

| Query | Plan | Documenten bekeken | Tijd |
|---|---|---|---|
| `{"meta.gtin": "08000146029059"}` | **COLLSCAN** | **161.945** | **50.934 ms** |
| `{"_id": "8712423033887-08000146029059-528"}` | IDHACK | 1 | **0 ms** |

Er is geen index op `meta.gtin`. AC4 ("alleen documenten met de gevraagde doelmarkt") en AC5 ("is er
meer dan één document voor dezelfde doelmarkt") kunnen alleen beantwoord worden door álle documenten
van een GTIN op te halen — en dat kan uitsluitend via `meta.gtin` of via een niet-verankerde
`_id`-regex. Beide zijn een volledige scan. 442 × 51 s ≈ **6,3 uur volledige collectiescans op de
productiedatabase**, buiten elk onderhoudsvenster.

Dat botst hard met de bestaande begrenzingen in `build-keurmerk-index.ts`:
- `KEURMERK_INDEX_GTIN_TIMEOUT_MS` = 30.000 ms per GTIN (`getGtinTimeoutMs`, regel ~310) — de
  terugval haalt de eerste seconde-grens niet;
- `KEURMERK_INDEX_MAX_RUNTIME_MS` = 20 minuten voor de hele run (`getMaxRuntimeMs`).

Let op: het bestaande 18.1-script gebruikt exact dit trage patroon
(`apps/api/scripts/backfill-gln-from-tradeitems.ts:236-240`, `_id: {$regex: "…-{gtin}-{tm}$"}` —
óók een collectiescan). Voor 19 GTIN's viel dat niet op; voor 442 wel. Kopieer dat patroon niet.

De story mag niet naar dev zonder dat de spec de toegangsweg vastlegt: **exacte `_id`-lookup**
(`{gln}-{gtin}-{tm}`, 0 ms), eventueel gebundeld met één `$in` over alle 442 sleutels tegelijk.
Wil je AC5 tóch letterlijk houden, dan is een index op `meta.gtin` een voorwaarde buiten deze story
— en dat is een schrijfactie op productie.

**H3 — De kwaliteitspoort valt wél om. AC6 dekt de verkeerde route af. — high**

`apps/api/src/scripts/build-keurmerk-index.ts:360-379`:

```ts
function mapDeclarationReason(reason: string): CollectReason {
  switch (reason) {
    case 'ok': …
    case 'geen-tradeitem-bestand': …
    default:
      return 'api-fout';
  }
}
```

Drie gevolgen die AC6 (regel 74-78) niet ziet:

1. **Elke nieuwe redencode landt in `default` → `api-fout`.** Ook `db-terugval-gelukt`. Poortregel 7b
   (`evaluateGate`, regel ~546) telt `api-fout + timeout` en blokkeert boven 5%. 442 van 1862 = 23,7%.
   Een geslaagde terugval zou de indexbouw dus blokkeren. AC6 zegt "een databasefout is géén
   `api-fout`" alsof dat een eigenschap is; het is een wijziging die nergens in de story staat.
2. **De trage query levert `timeout`**, niet `api-fout` — en `timeout` zit in dezelfde teller van 7b.
   AC6 verbiedt alleen `api-fout` en laat het echte risico open.
3. **De 20-minutendeadline** zet `niet-verwerkt` en dat blokkeert 7d onvoorwaardelijk
   (`deadlineHit || notProcessed > 0`), ongeacht foutratio.

Er is nog een vierde plek: `resetMarksCacheStats`/`emptyReasonCounts` en de twee printregels
(regel ~631-635) tellen redenen op naam; nieuwe codes vallen daar stilletjes buiten beeld.

**H4 — AC2 en AC3 spreken elkaar tegen: de terugval levert 2 van de 5 keurmerkveldsoorten. — high**

`apps/api/src/services/t3777-declarations.ts:410-434` — de XML-route (`parseDeclaredMarks`,
Story 19.2, "volledige 5/5 keurmerkveld-dekking") levert:

| local-name / bron | `fieldType` |
|---|---|
| `packagingMarkedLabelAccreditationCode` | `PackagingMarkedLabelAccreditationCode` |
| `localPackagingMarkedLabelAccreditationCodeReference` | `AdditionalPackagingMarkingsCode` |
| `dietTypeCode` | `DietTypeCode` |
| `nutritionalScore` | `NutritionalScore` |
| `consumerUsageLabelCode/…/enumerationValue` (gescopet) | `EU_consumerUsageLabelCodeList` |

AC3 (regel 60-64) noemt er **twee**. AC2 (regel 56-58) belooft tegelijk "dezelfde structuur … zodat
alles erachter ongewijzigd blijft". Dat kan niet allebei. Concreet weggegooid: Nutri-Score
(`nutriscoreDeclaredCodes`, regel ~570, leest `fieldType === 'NutritionalScore'`), de
AISE/NIX18-pictogrammen en de aanvullende verpakkingsmarkeringen.

Daar komt bij dat AC3 de **fieldType-toewijzing helemaal niet noemt**. De uitkomst is
`DeclaredMark { code, fieldType }` en `fieldType` moet de canonieke `reference_logos.fieldType` zijn,
anders koppelt een gevonden mark nergens aan. Een lijst kale codes voldoet niet aan AC2.

En de detailregels die de XML-route wél heeft en AC3 niet: `trim()`, `toUpperCase()`, ontdubbelen per
`(fieldType, code)`. Zonder die drie wijkt de terugval af van de primaire bron.

### MEDIUM

**M1 — "Niet meetbaar zonder deze story" is onjuist; het getal is vandaag gemeten. — medium**

Story regel 31-32 en AC7 (regel 80-84) rusten op de aanname dat de opbrengst pas na de bouw
zichtbaar wordt. Dat klopt niet: de 442 sleutels staan in de Redis-declaratiecache van de ACC-api
(`marks:{env}:{gln}:{gtin}:{tm}`, 1863 entries, TTL 24 uur) en de declaraties staan in een database
waar deze review read-only bij kan. Uitkomst: **211 van 442 declareren, 179 onder AC5**. Dat had de
spec zelf moeten dragen. De story is nu de vijfde in de rij die op één product redeneert — met dit
verschil dat het antwoord deze keer gunstig uitvalt.

**M2 — Het patroon bestaat al, inclusief governance-akkoord, en de story noemt het niet. — medium**

`apps/api/scripts/backfill-gln-from-tradeitems.ts` (story 18.1) leest exact deze collectie:
read-only, lazy dynamische `mongodb`-import, env `TRADEITEMS_MONGO_URI`, `_id`-conventie
`{gln}-{gtin}-{targetMarket}`, dezelfde doelmarkt-env `T3777_TARGET_MARKET`. In de kop staat
bovendien: *"governance-akkoord is gegeven op 2026-07-04"*.

De story stelt in "Voorwaarden buiten deze story" (regel 40-47) een **nieuwe** instelling
`TRADEITEM_MONGO_URI` voor — enkelvoud, één letter anders dan de bestaande. Twee bijna identieke
namen voor dezelfde verbinding is een storingsbron die niemand ooit terugvindt. Neem de bestaande
naam over, of leg vast waarom niet, en hergebruik `createMongoGlnLookup`/`parseGlnFromId` in plaats
van ernaast te bouwen.

**M3 — De `mongodb`-driver ontbreekt volledig; ook het bestaande script draait vandaag niet. — medium**

`apps/api/package.json` bevat geen `mongodb`, niet als dependency en niet als devDependency, en
`node_modules/mongodb` bestaat niet. Het 18.1-script importeert hem dynamisch en faalt dus nu al bij
uitvoering. De story noemt deze afhankelijkheid nergens, terwijl AC8 wel eisen aan de verbinding
stelt. En het bestaande voorbeeld voldoet níet aan AC8: `new MongoClient(uri)` zonder
`serverSelectionTimeoutMS`, `connectTimeoutMS`, `maxPoolSize` of `socketTimeoutMS`.

**M4 — AC3 zwijgt over `value` tegenover `oldValue`. Gemeten: 18 codes zitten alleen in `oldValue`. — medium**

Elk veldobject draagt beide:

```json
{"meta":{"gdsn":"packagingMarkedLabelAccreditationCode"},"oldValue":"TRIMAN","remark":"","value":"TRIMAN"}
```

AC3 zegt "verzamel elke waarde waarvan `meta.gdsn` gelijk is aan X" en laat in het midden wélke
waarde. Over de 442 gemeten: **18 code-instanties staan in `oldValue` en niet in `value`**. Beide
verzamelen levert verouderde declaraties op die de XML-route niet zou geven (en dus valse
crosscheck-akkoorden); alleen `value` is verdedigbaar maar moet er staan. Ook de lege waarde
(`value: ""`) komt massaal voor — AC3 vangt dat gelukkig af met "sla lege waarden over".

**M5 — AC4 leest `meta.targetMarket` als een waarde; het is een array. — medium**

`meta.targetMarket` is `["528"]`. "Alleen documenten met de gevraagde `meta.targetMarket`" gelezen als
gelijkheid (`{"meta.targetMarket": "528"}`) werkt toevallig wél in MongoDB (impliciete
array-doorloop) maar níet in applicatiecode (`doc.meta.targetMarket === '528'` is altijd onwaar).
Precies het soort detail waar deze story al twee keer op is gestruikeld. Leg het expliciet vast — en
merk op dat de doelmarkt sowieso al in de `_id` zit, dus voor de exacte lookup is de vergelijking
overbodig.

**M6 — AC1's afbakening is niet zo scherp als hij klinkt: er zijn twee ingangen. — medium**

`t3777-declarations.ts` heeft twee onafhankelijke resolvers die allebei `geen-tradeitem-bestand`
kunnen opleveren:

| Functie | Gebruiker | Cache-sleutel | Levert |
|---|---|---|---|
| `resolveDeclarations` (regel ~307) | live kruischeck (`catalogDeclarationProvider` → detection-flow) | `t3777:{gln}:{gtin}:{tm}` — **zonder** omgevingssegment | alleen T3777-codes |
| `resolveDeclaredMarks` (regel ~600) | indexbouwer, review-prior | `marks:{env}:{gln}:{gtin}:{tm}` | alle 5 veldsoorten |

De story noemt er geen van beide. Haakt de terugval alleen aan de indexbouwer, dan ziet de live
kruischeck voor hetzelfde product andere declaraties dan de index — een stille inconsistentie in
precies de laag die auto-akkoord geeft. Haakt hij aan allebei, dan is "848 producten blijven
onaangeroerd" nog steeds waar, maar raakt de wijziging wél het live detectiepad, en dat verdient een
eigen regel in AC1. Kies, en schrijf het op.

**M7 — De cache is niet te omzeilen, en het probleem is groter dan meten. — medium**

AC7 vraagt "een manier om de cache over te slaan". Die bestaat niet:
- `marksCacheRead` staat vóór de fetch (regel ~648) en er is geen vlag, env of parameter om hem over
  te slaan;
- `ttlForReason` (regel ~528) verkort alléén `api-fout` naar 300 s; `geen-tradeitem-bestand` houdt de
  volle `T3777_CACHE_TTL_S` = 86.400 s.

Dat raakt niet alleen de meting. **Na uitrol bereikt de terugval die 442 producten pas als hun
cache-entry verlopen is** — tot 24 uur "er verandert niets", precies het beeld dat dit hele dossier
al een week produceert. De spec moet dus twee dingen regelen: een expliciete overslag-schakelaar
(bijv. `KEURMERK_INDEX_NO_CACHE=1`, die zowel de lees- als de schrijfkant overslaat) én wat er met de
bestaande entries gebeurt. Het gericht verwijderen van 442 Redis-sleutels is een schrijfactie en
hoort met toestemming, niet en passant.

**M8 — De uitsluiting van de 404's laat 12 producten liggen die dezelfde terugval gratis oplevert. — medium**

Story regel 98 sluit de 143 (feitelijk 144) 404's uit met "grotendeels andere doelmarkten (16 van 20
in de steekproef)". Gemeten over alle 144:

| | Aantal |
|---|---|
| Heeft een 528-document op productie | 23 van 144 |
| → daarvan declarerend | **12** |
| → daarvan met meer dan één gln | 0 |

Twaalf producten, allemaal ondubbelzinnig (één gln), bereikbaar met exact dezelfde code. "Grotendeels
andere doelmarkten" is waar (121 van 144), maar het is geen argument om de rest weg te gooien. Review
20-18 kwam op dit pad tot een vergelijkbare conclusie langs een andere route; de story neemt die
bevinding niet mee.

**M9 — Geen testnaad voor de database; AC9 en AC10 zijn zo niet uitvoerbaar. — medium**

De driver wordt lazy geïmporteerd en is niet geïnstalleerd; de api-suite draait zonder Mongo. AC9
("draai de terugval terug en toon dat exact de bedoelde test rood wordt") en AC10 ("de api-suite
blijft groen") vragen dus om een injecteerbare opzoeker — precies wat 18.1 al doet met een pure kern
plus een `GlnLookup`-functietype (`backfill-gln-from-tradeitems.ts:46-56, 219-250`). Dat patroon
hoort in de spec te staan, anders bouwt dev het opnieuw of test het niet.
Bestaande tests die geraakt worden: `apps/api/src/__tests__/services/t3777-declarations.test.ts`,
`…/t3777-declarations-19-16.test.ts`, `apps/api/src/__tests__/scripts/build-keurmerk-index.test.ts`,
`…/build-keurmerk-index-19-16.test.ts`.

**M10 — De nieuwe redencodes raken vier plekken die de story niet noemt. — medium**

`DeclarationReason` (`t3777-declarations.ts:52-59`), `CollectReason` + `emptyReasonCounts`
(`build-keurmerk-index.ts:~330-352`), `mapDeclarationReason` (zie H3) en de twee samenvattingsregels
(`build-keurmerk-index.ts:~631-635`). Daarnaast: de cache slaat `reason` op als string, dus na een
terugdraai leest de code oude entries met een onbekende reden terug — `marksCacheRead` accepteert die
kritiekloos (`parsed.reason ?? 'ok'`).

### LOW

**L1 — De doelmarkt komt uit `T3777_TARGET_MARKET` (default `'528'`), niet uit de lucht. — low**
AC4 spreekt van "de gevraagde doelmarkt" zonder de bron te noemen. Eén regel, voorkomt een
hardgecodeerde 528.

**L2 — De bronverwijzing naar story 18.1 heeft geen pad. — low**
Story regel 108. Het bestand is `_bmad-output/implementation-artifacts/18-1-gln-backfill-via-batch-export.md`;
het besluit staat op regel 96 en 150. Zonder pad moet elke lezer opnieuw zoeken — en 20.18 sneuvelde
er onder meer op dat dit besluit niet vindbaar in de spec stond.

**L3 — "1862 treffers, 0 missers" (AC7) tegenover 1863 cache-entries vandaag. — low**
Cosmetisch, maar in dit dossier telt elk getal: de cache bevat nu 1863 `marks:`-sleutels
(848 ok / 442 geen-bestand / 429 leeg / 144 404).

**L4 — AC8 stelt eisen zonder getallen. — low**
"Korte time-out en een begrensde pool" is niet toetsbaar. Noem waarden (bijv.
`serverSelectionTimeoutMS: 3000`, `maxPoolSize: 2`) en zet ze af tegen het 30-secondenbudget per GTIN.

**L5 — Het afkeurblok van de voorganger eindigt in een afgebroken zin. — low**
`20-18-verouderde-gln-blokkeert-oogst.md:168-169`: "…groter dan deze story., wacht op spec-review."
20.19 haalt dat blok aan als bron; een lezer die daar terechtkomt vindt een halve zin.

---

## 2. Claim-audit per acceptatiecriterium

| AC | Claim | Oordeel | Bewijs |
|---|---|---|---|
| Premisse (r18-26) | 442 bestanden ontbreken echt; declaraties staan wél in de database | **BEVESTIGD, en nu becijferd** | 442/442 hebben een 528-document; 211 declareren ≥1 code |
| Premisse (r28-30) | Eén op twee declareert; omvang niet aangetoond | **ACHTERHAALD** | Gemeten 211/442 = 47,7% — de schatting klopte toevallig, de onderbouwing niet |
| Premisse (r31-32) | "Niet meetbaar zonder deze story" | **ONJUIST** | M1 — vandaag gemeten met read-only toegang |
| Voorwaarden (r42-47) | Leesrechten + `TRADEITEM_MONGO_URI`; netwerkpad bestaat al | **DEELS** | Netwerkpad bevestigd (`10.0.0.8:27017` open vanuit de container). Maar: `TRADEITEMS_MONGO_URI` bestaat al (M2), driver ontbreekt (M3), governance-akkoord bestaat al (M2) |
| AC1 | Alleen terugval; 848 werkende producten onaangeroerd | **DEELS** | Waar voor de 848, maar er zijn twee ingangen met eigen caches (M6) |
| AC2 | Dezelfde uitkomstvorm | **NIET HAALBAAR met AC3** | H4 — 2 van 5 veldsoorten, geen fieldType-toewijzing |
| AC3 | Boomdoorloop op `meta.gdsn` | **DEELS CORRECT, ONVOLLEDIG** | Doorloop werkt (zelf uitgevoerd, §4). Mist: 3 veldsoorten (H4), `value`/`oldValue` (M4), trim/upper/dedup (H4) |
| AC4 | Doelmarkt leidend | **ONNAUWKEURIG** | M5 — `targetMarket` is een array; doelmarkt zit al in de `_id` |
| AC5 | Bij meerdere gln's niet gokken, conform 18.1 | **VERWIJZING KLOPT, TOEPASSING NIET** | H1 — 18.1 gaat over schrijven in `artwork_imports`; kost hier 32 producten en het eigen voorbeeld |
| AC6 | Fail-open; poort valt hier niet op om | **ONJUIST** | H3 — `default → api-fout`, plus `timeout` en `niet-verwerkt` |
| AC7 | Meten met de cache omzeild | **NIET UITVOERBAAR ZOALS GESCHREVEN** | M7 — geen overslagmogelijkheid; raakt ook de uitrol |
| AC8 | Alleen `find`, korte time-out, begrensde pool | **DEELS** | Read-only is juist en aantoonbaar. Maar de enige query die AC4/AC5 kunnen bedienen is een scan van 51 s (H2); geen getallen (L4) |
| AC9 | RED-bewijs | **NIET UITVOERBAAR ZOALS GESCHREVEN** | M9 — geen testnaad, driver niet geïnstalleerd |
| AC10 | Geen regressie, 848 byte-identiek | **HAALBAAR** | Mits AC1 aan één ingang haakt en de cache-sleutels ongemoeid blijven |
| Buiten scope: 429 "leeg" | Terecht leeg, niets te halen | **BEVESTIGD** | Zelf nagemeten over alle 429: slechts 5 declareren op productie, waarvan 1 met één gln. De uitsluiting houdt stand |
| Buiten scope: 143 404's | Grotendeels andere doelmarkten | **DEELS ONJUIST** | M8 — 121 van 144 inderdaad, maar 12 declareren wél en zijn gratis mee te nemen |

---

## 3. Wat er moet wijzigen vóór dev

1. **Vervang AC5 door "anker op onze eigen gln".** Zoek het document op met exacte sleutel
   `{gln}-{gtin}-{targetMarket}`, waarbij `gln` de gln uit `artwork_imports` is die de indexbouwer al
   meegeeft. Dat is geen gok, het is dezelfde sleutel die de XML-route gebruikt, en het lost H1 en H2
   in één keer op. Verantwoord expliciet hoe dat zich verhoudt tot 18.1 (daar werd een gln *gekozen*,
   hier is hij *gegeven*). Wil Friso de strengere variant, dan hoort daar het prijskaartje bij: 179
   in plaats van 211 producten, en een index op `meta.gtin` op productie als voorwaarde.
2. **Leg de toegangsweg vast met de gemeten cijfers erbij**: exacte `_id`-lookup (0 ms, IDHACK) —
   nooit `meta.gtin` en nooit een niet-verankerde `_id`-regex (51 s, 161.945 documenten). Overweeg
   één `$in`-batch over alle betrokken sleutels aan het begin van de run in plaats van 442 losse
   aanroepen binnen het 30-secondenbudget.
3. **Maak AC6 uitvoerbaar.** Noem `mapDeclarationReason` bij naam en schrijf voor dat de nieuwe
   redencodes een eigen `CollectReason` krijgen die buiten de teller van poortregel 7b valt — samen
   met `emptyReasonCounts`, de printregels en `DeclarationReason`. Voeg toe dat een trage of
   onbereikbare database niet tot `timeout` of `niet-verwerkt` mag leiden (eigen, korte time-out
   ruim onder de 30 s).
4. **Verzoen AC2 en AC3.** Of de terugval dekt alle vijf veldsoorten met de juiste `fieldType`
   (`PackagingMarkedLabelAccreditationCode`, `AdditionalPackagingMarkingsCode`, `DietTypeCode`,
   `NutritionalScore`, `EU_consumerUsageLabelCodeList`) inclusief trim/uppercase/ontdubbelen, óf AC2
   wordt afgezwakt en de story benoemt welke sporen de terugval bewust mist en wat dat kost.
5. **Beslis over `value` tegenover `oldValue`** en schrijf het besluit op, met het gemeten getal (18
   code-instanties staan alleen in `oldValue`).
6. **Kies één ingang** (`resolveDeclaredMarks` of ook `resolveDeclarations`) en zeg het in AC1.
7. **Regel de cache in twee delen**: een expliciete overslag-schakelaar voor de meting én een
   uitspraak over de bestaande 442 entries na uitrol (opruimen is een schrijfactie en vraagt
   toestemming).
8. **Neem het bestaande patroon over** uit `apps/api/scripts/backfill-gln-from-tradeitems.ts`:
   dezelfde env-naam `TRADEITEMS_MONGO_URI`, dezelfde lazy import, een injecteerbare opzoeker voor de
   tests. Voeg `mongodb` toe aan `apps/api/package.json` — zonder dat draait ook het bestaande script
   niet.
9. **Vervang "niet meetbaar zonder deze story" door de meting**: 211 van 442 declareren (179 onder de
   strenge variant), en zet de verwachte indexgroei ernaast als toetsbare belofte in AC7.
10. **Haal de 12 declarerende 404's binnen scope**, of leg uit waarom niet.

---

## 4. Reproduceerbaarheid

**De 442 sleutels** komen uit de declaratiecache van de ACC-api (geen nieuwe indexrun nodig):

```bash
ssh vanilla "docker exec app-qsookwow8koko0kwg00g0cwk-134318329338 sh -lc '…'"
# node + ioredis: SCAN 'marks:*' → MGET → JSON.parse → groepeer op .reason
# uitkomst 2026-08-18: ok=848  geen-tradeitem-bestand=442  lege-declaratie=429  404-mogelijk-TM-mismatch=144
# sleutelvorm: marks:{env}:{gln}:{gtin}:{tm}
```

**De declaratietelling op productie** — de velden zitten in onregelmatig geneste arrays, dus een vast
pad werkt niet (AC3 heeft daarin gelijk). Wat wél werkt zonder server-side JS (`$function` is op deze
server uitgeschakeld) is een boomdoorloop met vaste diepte in de aggregatiepijplijn: begin met
`nodes = [$packagingMarkingModule, $dietInformationModule]` en herhaal 12 keer één stap die
(a) uit `nodes` alle objecten met `meta.gdsn ∈ {packagingMarkedLabelAccreditationCode, dietTypeCode}`
oogst en (b) `nodes` één niveau uitklapt met `$objectToArray` voor objecten en directe opname voor
arrays. Daarna `$match {tm: "528"}`, groeperen per GTIN en tellen.

```
442-groep : gtinsFound=442  anyCodes=211  multiGln=59  multiGlnWithCodes=32
            singleGlnWithCodes=179  totalCodeInstances=400  oldValue-extra=18
404-groep : gtinsFound=23 (van 144)  anyCodes=12  multiGln=0
leeg-groep: gtinsFound=429  anyCodes=5  singleGlnWithCodes=1
```

**Voorbehoud bij dit getal.** Na 12 niveaus resteerden bij sommige documenten nog maximaal 4
onuitgeklapte knopen (`deepLeftMax=4`). De 211 is dus een **ondergrens**; een diepere doorloop kan
alleen méér vinden, nooit minder. Alle andere getallen (442 gevonden, 59 met meerdere gln's) staan
los van de diepte.

**De planmeting:**

```
explain({"meta.gtin":"08000146029059"})                       → COLLSCAN, 161.945 docs, 50.934 ms
explain({"_id":"8712423033887-08000146029059-528"})           → IDHACK,   1 doc,      0 ms
```

**Wat NIET geverifieerd is:**
- Of de leesrechten-gebruiker uit "Voorwaarden" al bestaat — de review las mee via de bestaande
  MCP-verbinding, niet via een nieuw account.
- Hoeveel van de 442 een document hebben onder **precies onze eigen gln** met een declaratie. De
  bovengrens is 211 en de ondergrens 179; het exacte getal vraagt een `_id`-lookup op alle 442
  sleutels en is niet uitgevoerd.
- De feitelijke opbrengst in nieuwe keurmerkcodes en indexgroei — dat blijft AC7, en dat kán nu wél
  vooraf geschat worden uit `totalCodeInstances = 400`.
- Er is niets geschreven, op geen enkele omgeving: alleen `find`, `aggregate`, `explain`, Redis
  `SCAN`/`MGET` en een TCP-connectietest.

---

## Change Log

- 2026-08-18: Adversariële spec-review uitgevoerd. Verdict FAIL (4 high / 10 medium / 5 low). De
  premisse is voor het eerst becijferd en houdt stand (211 van 442); de spec zelf kan dat getal in de
  huidige vorm niet verzilveren.
