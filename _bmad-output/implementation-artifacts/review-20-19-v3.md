---
review_of: 20-19-declaraties-uit-de-tradeitem-database.md (huidige tekst, 182 regels)
review_type: her-review — toetst uitsluitend de verwerking van review-20-19-v2 (FAIL, 4 high / 7 medium / 5 low)
reviewer: adversariële her-review, verse context
date: 2026-08-19
branch: acc
verdict: FAIL
severity_count: { high: 2, medium: 12, low: 10 }
---

# Her-review — story 20.19 tegen review-20-19-v2

**Verdict: FAIL** — 2 high / 12 medium / 10 low.

> **Let op — de story is tijdens deze her-review op schijf gewijzigd.** Halverwege verscheen de
> meting uit §0 (177 producten / 292 codes) in de story zelf, met een uitgesplitste tabel en een
> zin die zegt dat de opbrengst 177 is en niet 238. Deze review beoordeelt de tekst **zoals die er
> nu staat**. De wijziging haalt één high weg en scherpt een andere juist aan: AC4 zegt nu 177,
> terwijl AC8 onveranderd 238 belooft.

De herziening pakt de kern van drie van de vier highs uit v2 goed op: het governance-akkoord is
vastgelegd, `oldValue` is geschrapt en de regex-opzoeking uit 18.1 is expliciet buitengesloten. De
vierde — de versmalling naar `packagingMarkedLabelAccreditationCode` — is inmiddels van het
kostenplaatje voorzien (177 in plaats van 238), maar is nog altijd op **beide** ingangen toegepast
terwijl er maar één versmald hoeft te worden, en het acceptatiecriterium dat de uitkomst toetst
belooft nog steeds 238. Daarnaast zijn zeven bevindingen uit v2 volledig onaangeroerd gebleven en
staan er vier tegenstrijdigheden in de tekst die er vóór de herziening niet waren.

## 0. De meting: wat de versmalling kost

**Vraag uit de opdracht: hoeveel producten blijven er over met UITSLUITEND
`packagingMarkedLabelAccreditationCode`?**

`VERIFIED`, eigen meting op productie vandaag (19 augustus 2026), volledige telling, geen steekproef.
De 442 sleutels zijn opnieuw uit de ACC-declaratiecache gehaald (alleen `SCAN` + `MGET`), en de 442
documenten zijn op `_id` opgezocht met een volledige boomdoorloop in de client.

| | Producten | Code-instanties |
|---|---|---|
| Documenten gevonden op `_id = {gln}-{gtin}-528` | **442 / 442** | — |
| Met ≥1 niet-lege `value`, **alle vijf** veldsoorten | **238** | **475** |
| Met ≥1 niet-lege `value`, **alleen** `packagingMarkedLabelAccreditationCode` | **177** | **292** |
| **Verlies door de versmalling van AC4** | **−61 (−26%)** | **−183** |

Per veldsoort (niet-lege `value`, over de 442):

| gdsn-veld | instanties | producten |
|---|---|---|
| `packagingMarkedLabelAccreditationCode` | 292 | 177 |
| `dietTypeCode` | 89 | 68 |
| `nutritionalScore` | 61 | 61 |
| `enumerationValue` binnen `consumerUsageLabelCode` | 33 | 22 |
| `localPackagingMarkedLabelAccreditationCodeReference` | 0 | 0 |

Bijvangst: **17** code-instanties (niet 18) staan uitsluitend in `oldValue`; dat zou **5** extra
producten opleveren. Uniek `(fieldType, code)`-paren over de hele groep: 52.

Deze meting reproduceert die van v2 exact (442/442, 238, 475, 292/177, 89/68, 61/61, 33/22, 0/0),
langs een onafhankelijke route: v2 telde met een `$reduce`-boomdoorloop in de database, deze telling
haalde de documenten op en liep de boom in Python af. Cache-verdeling ongewijzigd: ok=848,
geen-tradeitem-bestand=442, lege-declaratie=429, 404-mogelijk-TM-mismatch=144 (1863 totaal).

**Stand na de wijziging van vandaag:** 177 en 292 staan inmiddels in de story (opbrengstsectie en
AC4). AC8 belooft nog steeds 238 met 475 codes — zie NIEUW-H1.

### Reproduceerbaar

```bash
# 1. de 442 sleutels (read-only)
ssh vanilla "docker exec app-qsookwow8koko0kwg00g0cwk-134318329338 sh -c \
  'cd /app && node -'"  # ioredis: SCAN marks:* -> MGET -> filter reason == 'geen-tradeitem-bestand'
# 2. _id = {gln}-{gtin}-{tm}; op productie: find({_id: {$in: [442 sleutels]}})
#    recursieve boomdoorloop, verzamel knopen met meta.gdsn in de vijf namen,
#    enumerationValue alleen als 'consumerUsageLabelCode' in meta.xpath staat,
#    tel alleen niet-lege .value
```

## 1. De vier punten die de auteur zegt te hebben verwerkt

| # | Punt | Oordeel | Bewijs |
|---|---|---|---|
| 1 | Alleen de exacte `_id`-opzoeking, niet de regex-scan uit 18.1 | **VERWERKT — ondubbelzinnig** | Eigen sectie "Het bestaande patroon — wat wél en wat NIET hergebruikt wordt" (r. 76-84) noemt de regex letterlijk (`{ _id: { $regex: '...$' } }`), zegt waarom hij daar wél mocht en hier niet, en AC2 herhaalt het verbod. Een ontwikkelaar die dit leest kopieert de scan niet |
| 2 | Versmald tot uitsluitend `packagingMarkedLabelAccreditationCode` | **DEELS — kosten nu wél in de story, reikwijdte nog steeds te breed** | De versmalling houdt de vier vreemde codelijsten inderdaad weg bij de automatische bevestiging — `VERIFIED`: `resolveDeclarations` → `parseT3777Codes` levert uitsluitend `packagingMarkedLabelAccreditationCode` (`t3777-declarations.ts:98-108, 311`). **Maar AC4 versmalt de terugval als geheel**, dus ook de tweede ingang `resolveDeclaredMarks`, en dát is de ingang die de indexbouwer voedt (`build-keurmerk-index.ts`, mock in `build-keurmerk-index-19-16.test.ts:17-21`). Die verwerkt juist alle vijf veldsoorten (`MARK_FIELDS` + `CONSUMER_USAGE_FIELD_TYPE`, `t3777-declarations.ts:420-431`). Kosten, gemeten: **61 van de 238 producten**, 183 van de 475 codes — dat getal staat sinds vandaag wél in de story (opbrengstsectie + AC4), maar de reikwijdte is niet gecorrigeerd en AC8 belooft nog 238. Zie NIEUW-H1 en NIEUW-H2 |
| 3 | `oldValue` geschrapt, alleen `value` telt | **VERWERKT, consistent** | AC5 zegt "alleen `value`, NIET `oldValue`", met de reden erbij. `oldValue` komt in de hele spec alleen daar voor (r. 124-127); nergens een tegenstrijdige instructie. Eén foutje: "18 code-instanties" — gemeten 17 (zie NIEUW-L1) |
| 4 | Nieuwe redencode valt buiten de teller van poortregel 7b | **VERWERKT qua formulering** | `VERIFIED` tegen de poortcode: `const technical = reasons['api-fout'] + reasons.timeout;` (`build-keurmerk-index.ts:546`). Een nieuwe `CollectReason` valt dus automatisch buiten `technical` — mits hij niet via `mapDeclarationReason`'s `default: return 'api-fout'` alsnog daar belandt. AC6 eist beide (expliciete toewijzing én buiten 7b), dus de formulering volstaat. Wat nog ontbreekt: de vier codeplekken (M10) en de eigen time-out (N7) |

## 2. Bevindingen uit review-20-19-v2 — status

### High

| v2 | Kern | Status | Bewijs |
|---|---|---|---|
| **N1** | Governance-akkoord van 2026-07-04 dekt dit niet | **VERWERKT** | Het story-record draagt nu een `AKKOORD (Friso, 19 augustus 2026)`-blok (r. 10-19) met de voorwaarden (alleen lezen, alleen `application.tradeItems`, opzoeken op primaire sleutel, geen collectiescan) en verwijst naar `_bmad-output/planning-artifacts/akkoordverzoek-productie-leestoegang-2026-08-19.md` — `VERIFIED`: dat bestand bestaat (3781 bytes) en benoemt zelf dat 4 juli "eenmalig, handmatig, buiten piekuren" was. Dat is de werkwijze die 18.1 voorschrijft. *Restpunt (low):* er is géén tijdvenster of verbindingsprofiel vastgelegd, en het akkoordblok staat in de kop, niet in de sectie "Voorwaarden buiten deze story" waar de rest van de voorwaarden staat |
| **N2** | AC5 schrijft `oldValue` voor | **VERWERKT** | Zie §1 punt 3 |
| **N3** | Beloofde opbrengst 179-211 tegenover gemeten 238 | **VERWERKT** | De opbrengstsectie noemt 238/475 én, sinds de wijziging van vandaag, de uitsplitsing per veldsoort met de conclusie "de opbrengst van deze story is **177 producten, niet 238**". AC4 herhaalt dat. Alleen AC8 loopt nog achter — zie NIEUW-H1 |
| **N4** | T3777-ingang niet versmald; plus omgevingsscheiding van de twee caches | **DEELS** | Versmalling er wél (AC4), maar op beide ingangen in plaats van alleen de T3777-ingang. Het **tweede** punt van N4 — dat `marks:{env}:…` een omgevingssegment draagt en `t3777:{gln}:{gtin}:{tm}` niet (`t3777-declarations.ts:521` tegenover `:112`), zodat het live ACC-pad langs deze route op productiegegevens kan gaan draaien — komt in de story helemaal niet voor |

### Medium

| v2 | Kern | Status | Bewijs |
|---|---|---|---|
| **N5** | Veldtabel gdsn → `fieldType`, scoping van `enumerationValue`, `trim()`/`toUpperCase()`/ontdubbelen per `(fieldType, code)` | **DEELS** | AC4 zegt "Leg de toewijzing gdsn → fieldType vast in een tabel in de code" maar geeft de tabel niet; de scoping van `enumerationValue` binnen `consumerUsageLabelCode` staat nergens; AC5 noemt alleen "dubbele codes ontdubbelen" — niet per `(fieldType, code)` — en `trim()`/`toUpperCase()` ontbreken, terwijl de XML-route ze wél doet (`parseT3777Codes`, r. 104). Door de versmalling van AC4 is de "tabel" bovendien één regel geworden, wat de eis inhoudsloos maakt |
| **N6** | Story verwijst naar een patroon dat AC1 tegenspreekt | **VERWERKT** | Zie §1 punt 1 |
| **N7** | AC6 benoemt de verkeerde handeling voor `timeout`/`niet-verwerkt`; eigen korte time-out ontbreekt | **DEELS** | De 7b-zin is toegevoegd (goed), maar de foutieve zin staat er onveranderd naast: "Elke nieuwe code moet daarom expliciet toegewezen worden, **inclusief `timeout` en `niet-verwerkt`**". Die twee zijn geen declaratieredenen — ze ontstaan in de indexbouwer zelf (`getGtinTimeoutMs`, `getMaxRuntimeMs`) en komen nooit langs `mapDeclarationReason`. `VERIFIED`: `DeclarationReason` (`t3777-declarations.ts:48-56`) kent ze niet. De eis van een eigen korte time-out op de databaseopzoeking, ruim onder de 30 s, ontbreekt nog steeds |
| **N8** | 404-groep levert langs de eigen route 0 op, niet 12 | **DEELS — nu tegenstrijdig** | De kop (r. 27-28) zegt "de 404-groep levert langs de `_id`-route **0** op (niet 12)". De sectie "Wat NIET in deze story zit" (r. 162-164) zegt onveranderd: "hiervan bestaan er 23 op productie en declareren er **12** … maar het is geen nul". Twee tegengestelde uitspraken in één document |
| **N9** | "Er is nu geen testnaad voor Mongo" klopt niet | **NIET** | AC10 zegt letterlijk nog steeds "Er is nu geen testnaad voor Mongo". `VERIFIED`: `apps/api/scripts/backfill-gln-from-tradeitems.ts:143-152` definieert `GlnLookup` en `BackfillDeps`, en `apps/api/src/__tests__/services/backfill-gln-from-tradeitems.test.ts` bestaat |
| **N10** | Overeenstemmingstoets database ↔ XML op de 848 | **NIET — en nu tegenstrijdig** | Er is geen acceptatiecriterium bijgekomen. De kop noemt de 2-van-100 afwijking als waarschuwing (r. 31-33), maar AC3 beweert onveranderd: "De 848 werkende producten leveren **byte-identiek** dezelfde declaraties op". Zie NIEUW-M2 |
| **N11** | Cache-maatregel te vaag | **NIET** | AC7 eindigt woordelijk onveranderd met "Voorzie een manier om die reden gericht te verversen." Geen schakelaar bij naam, niets over de 442 bestaande sleutels, en niet vermeld dat het opruimen ervan een schrijfactie is die toestemming vraagt |
| **M10** (v1) | Nieuwe redencode raakt vier plekken | **NIET** | De story noemt alleen `mapDeclarationReason`. Niet genoemd: `DeclarationReason` (`t3777-declarations.ts:48-56`), `CollectReason` + `emptyReasonCounts` (`build-keurmerk-index.ts:325-349`) en de twee samenvattingsregels (`:633-634`) — die laatste drukken de redenen bij naam af, dus een nieuwe reden is daar onzichtbaar tot hij toegevoegd wordt |
| **M5** (v1) | `meta.targetMarket` is een array van wisselende lengte | **DEELS** | AC5 noemt het met het voorbeeld `["528"]`; dat 4.044 documenten 2, 3 of 5 doelmarkten hebben en dat `_id` alleen de eerste draagt, staat er niet |

### Low

| v2 | Kern | Status | Bewijs |
|---|---|---|---|
| **L1** | Doelmarkt komt uit `T3777_TARGET_MARKET` | **NIET** | De env-naam komt in de story niet voor. `VERIFIED`: hij bestaat wél (`apps/api/src/__tests__/services/t3777-declarations.test.ts:79, 249-250`) |
| **L2** | Pad naar de 18.1-spec ontbreekt bij de bronverwijzingen | **NIET** | Bronverwijzingen (r. 168-174) noemen het script, niet `_bmad-output/implementation-artifacts/18-1-gln-backfill-via-batch-export.md` — `VERIFIED`: dat bestand bestaat |
| **L4** | Verbindingseisen zonder getallen | **NIET** | AC9 zegt onveranderd "korte time-out, begrensde pool" zonder waarden |
| **L5** | Afgebroken zin in 20.18 | **NIET** | `20-18-verouderde-gln-blokkeert-oogst.md` eindigt nog altijd met "…groter dan deze story., wacht op spec-review." |
| **N12** | `_id` draagt alleen de eerste doelmarkt | **NIET** | AC1 zegt `{gln}-{gtin}-{targetMarket}` zonder de nuance dat het om het eerste element van de array gaat |

## 3. Nieuwe bevindingen in de herziening

### HIGH

**NIEUW-H1 — AC4 en AC8 spreken elkaar letterlijk tegen. — high**

AC4 (r. 144-145): "deze versmalling levert **177 producten / 292 code-instanties** op in plaats van
238 / 475".
AC8 (r. 173-175, onveranderd): "hoeveel van de 442 alsnog een declaratie opleveren (**verwacht 238**,
met 475 codes)".

Twee acceptatiecriteria in dezelfde lijst noemen een ander verwacht resultaat voor dezelfde run.
Gemeten (§0) is 177/292 het juiste getal bij AC4. Een ontwikkelaar die AC4 correct bouwt, faalt AC8
met 61 producten verschil — of bouwt AC4 verkeerd om AC8 te halen. Dit is de scherpste vorm van de
fout die v2 aanwees: het toetsende criterium mikt op een getal uit een andere reikwijdte. AC8 moet
177/292 worden, of allebei de getallen dragen met vermelding van welke bij welke ingang hoort.

**NIEUW-H2 — De versmalling is op beide ingangen toegepast, terwijl v2 er één aanwees. — high**

`VERIFIED` in de code — er zijn twee uitgangen, met een verschillend contract:

- `resolveDeclarations` → `parseT3777Codes` → **uitsluitend**
  `packagingMarkedLabelAccreditationCode` (`t3777-declarations.ts:98-108, 311`). Dit voedt via
  `catalogDeclarationProvider` de automatische bevestiging. Hier is versmalling **noodzakelijk**.
- `resolveDeclaredMarks` → `parseDeclaredMarks` → `MARK_FIELDS` (vier) + `CONSUMER_USAGE_FIELD_TYPE`
  (`t3777-declarations.ts:420-431, 446, 601`). Dit voedt de **indexbouwer** (`build-keurmerk-index`,
  zie `build-keurmerk-index-19-16.test.ts:17-21, 107`). Hier is versmalling **schadelijk**: de index
  werkt juist mét vijf veldsoorten en `fieldType`-sleutels.

AC4 maakt geen onderscheid en versmalt "de terugval" als geheel, terwijl AC3 twee zinnen eerder
eist dat **beide** ingangen geraakt worden. De motivering in AC4 — "de terugval hangt aan de
T3777-ingang" — is feitelijk onjuist: hij hangt aan allebei, en de indexingang heeft de versmalling
niet nodig.

Kosten voor het doel van de story — de beoordeelwachtrij vullen — zijn gemeten **61 producten (26%)**
en 183 code-instanties, waaronder alle 61 Nutri-Score-producten en 22 AISE/NIX18-pictogrammen. Die
61 worden nu betaald zonder dat er iets tegenover staat: de index kende die veldsoorten al en de
automatische bevestiging raakt ze sowieso niet. De juiste formulering is: de terugval levert alle
vijf veldsoorten met hun `fieldType` aan `resolveDeclaredMarks`, en `resolveDeclarations` filtert
daaruit uitsluitend `PackagingMarkedLabelAccreditationCode`.

De story maakt er nu een bewuste scopekeuze van ("Dat is een bewuste keuze — zie AC4"). Dat is een
verdedigbare keuze **als** hij op de juiste ingang wordt gemaakt; op de indexingang is het geen
scopekeuze maar verlies zonder tegenprestatie. Dit is het enige punt in deze her-review waar een
echte afweging ligt en dat is er één voor Friso, niet voor dev.

### MEDIUM

**NIEUW-M0 — Het akkoord is op 238 gegeven; de story levert er 177. — medium**

Het akkoordverzoek dat Friso op 19 augustus heeft goedgekeurd sluit af met "Verwachting op basis van
de telling: **238 producten**". Met AC4 zoals hij nu staat levert de story er 177 — 26% minder dan
waarop het akkoord berust. De opbrengstsectie erkent dat inmiddels, maar het akkoordverzoek is niet
bijgewerkt. Eén zin in het akkoordbestand of in het akkoordblok van de story volstaat: de eerste
stap levert 177, de resterende 61 komen uit een vervolgstory.

**NIEUW-M1 — De AC-nummering klopt niet; verwijzingen wijzen naar het verkeerde criterium. — medium**

De lijst bevat **twee** items met het nummer `3.` (r. 98 "Daarmee vervalt elke gln-keuze" en r. 106
"Alleen als terugval, nooit als vervanging"). Markdown hernummert een geordende lijst, dus alles
daarna schuift één op. Gevolg:

| Label in de bron | Rendert als | Onderwerp |
|---|---|---|
| `3.` (r. 98) | 3 | gln-keuze vervalt |
| `3.` (r. 106) | 4 | alleen als terugval |
| `4.` | 5 | versmalling |
| `5.` | 6 | uitlezen |
| `6.` | 7 | fail-open / poort |
| `7.` | 8 | cache |
| `8.` | 9 | meetbare uitkomst |
| `9.` … `11.` | 10 … 12 | leesrechten, testbaar, RED-bewijs |

De kop van de story zegt "De vier reviewpunten zijn verwerkt in de acceptatiecriteria hieronder
(AC2, AC4, AC5, AC6)". Gerenderd wijst AC4 naar "alleen als terugval", AC5 naar de versmalling en
AC6 naar het uitlezen — geen van drieën het bedoelde criterium. Idem voor "verwacht 238" in wat de
kop AC8 noemt maar wat als 9 rendert.

**NIEUW-M2 — AC3 beweert "byte-identiek" terwijl de kop het tegendeel meet. — medium**

AC3: "De 848 werkende producten leveren byte-identiek dezelfde declaraties op." Kop (r. 31-33): "de
database is niet identiek aan de XML — van 100 vergeleken producten weken er 2 af". Het
akkoordverzoek voert diezelfde afwijking op als aandachtspunt bij het besluit. Eén van beide moet
weg; gezien de meting is dat de bewering in AC3.

**NIEUW-M3 — Twee verschillende getallen voor de 429 "lege declaratie"-producten. — medium**

Regel 63-64: "van de 429 producten met een leeg keurmerkveld declareren er op productie slechts
**5**". Kop, regel 28-29: "3 declarerend op 220 gecontroleerd". Regel 161 herhaalt de 5. Beide
kunnen niet waar zijn, en géén van beide is een volledige telling over de 429 — v2 zegt zelf dat
het over 220 van de 429 liep. Zolang de rest niet geteld is hoort er "3 op 220 gemeten, rest niet
geteld" te staan, niet een afgerond totaal.

**NIEUW-M4 — De status "ready for dev" past niet bij de openstaande punten. — medium**

Regel 3: "Status: ready for dev — akkoord gegeven; wacht alleen nog op de leesgebruiker en
`TRADEITEMS_MONGO_URI`". Er wachten meer dan die twee: de tegenstrijdigheid tussen AC4 en AC8, de
404-passage, de "byte-identiek"-bewering en de foutieve testnaad-bewering zijn alle vier zaken die
een ontwikkelaar verkeerd kan uitvoeren. `VERIFIED`: `TRADEITEMS_MONGO_URI` staat vandaag nog steeds
niet op de ACC-applicatiecontainer (`env | grep -c` = 0), dus dat deel klopt wel.

**NIEUW-M5 — De Change Log noemt de herziening van 19 augustus niet. — medium**

De laatste twee regels van de Change Log zijn allebei van 18 augustus. De wijzigingen van vandaag —
het akkoordblok, de versmalling van AC4, de opbrengsttabel, het schrappen van `oldValue` — staan er
niet in. Wie later wil weten waarom AC4 versmald is, vindt geen spoor.

### LOW

- **NIEUW-L1 — "18 code-instanties" in AC5; gemeten zijn het er 17** (§0). Het aantal extra
  producten (5) klopt wel.
- **NIEUW-L2 — Regel 34 is een weesregel**: "Voorwaarde: de toegang uit 'Voorwaarden buiten deze
  story' moet geregeld zijn." staat buiten het citaatblok en buiten elke sectie.
- **NIEUW-L3 — De bronverwijzing naar review-20-19 draagt nog het achterhaalde getal**: "[Source:
  review-20-19.md — de telling **211**/442 …]" (r. 170), terwijl de story zelf 238 hanteert en
  `review-20-19-v2.md` niet in de bronnenlijst staat.
- **NIEUW-L4 — Het governance-akkoord staat niet in de sectie "Voorwaarden buiten deze story"**
  maar in de kop, terwijl die sectie de twee andere voorwaarden wél opsomt. Geen tijdvenster en geen
  verbindingsprofiel vastgelegd.
- **NIEUW-L5 — Het meetfragment verwijst naar een bestand dat niet bestaat**: "de sleutels staan in
  `ids442.json`" (r. 80). `VERIFIED`: dat bestand komt in de hele repository niet voor. Zo is de
  meting niet over te doen; zet het opvraagcommando erbij in plaats van een bestandsnaam.
- **NIEUW-L6 — De opbrengstsectie noemt `dietTypeCode` en `nutritionalScore` "zelfstandige
  keurmerken in dit project"** (r. 70-71) zonder bron. Dat is een inhoudelijke bewering over de
  codelijsten; `MARK_FIELDS` in `t3777-declarations.ts:420-431` onderbouwt het wel, maar de story
  verwijst er niet naar.

## 4. Wat moet wijzigen vóór dev

1. **Splits AC4 per ingang** (NIEUW-H2): de terugval levert alle vijf veldsoorten mét `fieldType`
   aan `resolveDeclaredMarks`; de T3777-ingang (`resolveDeclarations`) filtert daaruit uitsluitend
   `PackagingMarkedLabelAccreditationCode`. Zonder die splitsing kost de story 61 van de 238
   producten.
2. **Trek AC8 gelijk met AC4** (NIEUW-H1). Met de splitsing uit punt 1 is het 238 producten / 475
   codes voor de index en 177 / 292 voor de automatische bevestiging; zonder splitsing is het overal
   177 / 292. Eén getal per ingang, en AC8 mag niet langer 238 zeggen terwijl AC4 177 zegt.
3. **Herstel de AC-nummering** (NIEUW-M1): het tweede `3.` wordt `4.`, en alle verwijzingen in de
   kop en in de acceptatiecriteria worden op de gerenderde nummers gezet.
4. **Schrap de tegenstrijdigheden**: "byte-identiek" uit AC3 (NIEUW-M2), de "12 declareren"-passage
   over de 404's (N8), en één van de twee getallen voor de 429 (NIEUW-M3).
5. **Corrigeer AC10**: er ís een testnaad — `GlnLookup`/`BackfillDeps` in
   `apps/api/scripts/backfill-gln-from-tradeitems.ts:143-152` plus
   `apps/api/src/__tests__/services/backfill-gln-from-tradeitems.test.ts` (N9).
6. **Maak AC6 af** (N7, M10, L4): schrap "inclusief `timeout` en `niet-verwerkt`", voeg een eigen
   korte time-out op de databaseopzoeking toe mét een getal ruim onder de 30 s, en noem de vier
   codeplekken waar een nieuwe redencode landt.
7. **Maak AC7 uitvoerbaar** (N11): de schakelaar bij naam, wat er met de 442 bestaande cache-sleutels
   gebeurt, en de vermelding dat opruimen een schrijfactie is die toestemming vraagt.
8. **Zet de veldtabel in de spec** (N5): vijf gdsn-namen, vijf `fieldType`-waarden, de scoping van
   `enumerationValue` binnen `consumerUsageLabelCode`, plus `trim()`, `toUpperCase()` en ontdubbelen
   per `(fieldType, code)`.
9. **Regel de omgevingsscheiding van de twee caches** (N4, tweede punt): `marks:{env}:…` draagt een
   omgevingssegment, `t3777:{gln}:{gtin}:{tm}` niet.
10. **Voeg de overeenstemmingstoets op de 848 toe met een ondergrens** (N10).
11. **Werk het akkoordverzoek bij** (NIEUW-M0) en **vul de Change Log aan** met de herziening van
    19 augustus (NIEUW-M5).
12. **Kleine correcties**: `T3777_TARGET_MARKET` als bron van de doelmarkt (L1), het pad naar de
    18.1-spec en `review-20-19-v2.md` bij de bronverwijzingen (L2, NIEUW-L3), getallen bij de
    verbindingseisen (L4), de afgebroken zin in 20.18 (L5), de `_id`-nuance van de eerste doelmarkt
    (N12), 18 → 17 in AC5 (NIEUW-L1), de weesregel 34 (NIEUW-L2), en het akkoordblok verplaatsen naar
    "Voorwaarden buiten deze story" mét venster en profiel (NIEUW-L4), de dode verwijzing naar
    `ids442.json` (NIEUW-L5) en de onderbouwing bij "zelfstandige keurmerken" (NIEUW-L6).

## 5. Wat NIET geverifieerd is

- **Of de leesrechten-gebruiker bestaat.** Deze her-review las mee via de bestaande
  beheerdersverbinding, niet via een nieuw leesaccount.
- **Of de goedkeuring van 19 augustus buiten dit story-record ergens is vastgelegd.** Het
  akkoordverzoek-document en het story-record zijn er; een tweede spoor (ticket, mail) is niet
  gezocht. `INFERENCE`: volgens 18.1 is Friso zelf de goedkeurder, dus een tweede spoor is niet
  vereist.
- **De claim "volledige herbouw geeft +29 producten, +1 code"** — overgenomen, niet nagemeten.
- **De overeenstemming database ↔ XML** — de 2-van-100 uit v2 is niet opnieuw gemeten.
- **De 429 "lege declaratie"-producten** — niet opnieuw geteld; de tegenstrijdigheid tussen 3 en 5
  is vastgesteld op basis van de twee teksten, niet opgelost met een eigen meting.
- **Of `meta.gdsn == "enumerationValue"` ook buiten `consumerUsageLabelCode` voorkomt** — in de 442
  gemeten documenten kwam hij uitsluitend gescopet voor; over de hele collectie niet getoetst.
- **Er is nergens iets geschreven.** Alleen Redis `SCAN`/`MGET`, MongoDB `find`, `env | grep -c` en
  het lezen van bestanden. Het tijdelijke hulpscript in de ACC-container is direct verwijderd.

## Change Log

- 2026-08-19: Her-review op de herziening na review-20-19-v2. Verdict FAIL (2 high / 12 medium /
  10 low). De story wijzigde tijdens de review: de meting 177/292 is er halverwege in gezet, wat één
  high wegnam en de tegenstrijdigheid tussen AC4 en AC8 juist scherper maakte. Drie van de vier highs zijn goed verwerkt (governance, `oldValue`, regex-uitsluiting); de
  Drie van de vier highs uit v2 zijn goed verwerkt (governance, `oldValue`, regex-uitsluiting); de
  vierde is te breed toegepast: de versmalling naar `packagingMarkedLabelAccreditationCode` raakt
  ook de indexbouwer en kost gemeten 61 van de 238 producten. Zeven bevindingen uit v2 zijn
  onaangeroerd, en er zijn vier tegenstrijdigheden bijgekomen, waaronder een dubbel AC-nummer dat
  alle verwijzingen één plaats laat verschuiven.
