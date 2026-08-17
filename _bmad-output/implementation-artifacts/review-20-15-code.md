# Adversariële CODE-review — Story 20.15 (meetbare opmaaktest beoordeelscherm)

```yaml
reviewed_commit: 23592d4 (werkkopie, niets gecommit)
baseline: 23592d4
branch: acc
scope: tests/e2e/helpers/review-deck.ts + tests/e2e/review-deck-layout.spec.ts
verdict: FAIL
severity_count: { high: 3, medium: 6, low: 5 }
```

De opzet werkt en dat is geen kleinigheid: ik heb de vijf tests zelf vier keer gedraaid met de
lokale Google Chrome en kreeg exact de getallen uit het story-record terug (522/1019/1053 bij
venster 1000, 222/1019/753 bij 700). Voor het eerst in deze reeks stories worden er echte pixels
gemeten in plaats van doorgifte. De PNG-generator is geldig, de routevolgorde klopt, en het
vangnet vangt een verplaatst endpoint wél af.

FAIL omdat het vangnet op drie punten iets ánders meet dan het zegt te meten — en dit is het enige
vangnet onder 20.16 en 20.17.

1. **`deck-accept` is niet de laagste bediening.** Gemeten op venster 1000: "Accepteer" eindigt op
   1053, "Ander keurmerk koppelen" op **1105** en de swipe-hint op **1129**. De test kan dus groen
   worden terwijl er nog 129 px bediening onder de vouw staat.
2. **De stub levert een kaart die één rij mist.** `reason: "stub"` valt door de poort
   `res.reason === 'ok'` (`MobileReviewDeck.tsx:331`), dus de declaratie-tag rendert nooit. Met
   `reason: "ok"` is het beeldvenster **490 px** in plaats van 522 — de vastgelegde nulmeting is
   32 px te ruim, en dat is precies het getal waaraan 20.16 wordt afgemeten.
3. **De gedocumenteerde oorzaak van de wedloop is de verkeerde.** Niet de uitlegalinea, maar
   `/auth/me`. Gemeten met een vertraagde `/auth/me`: beeldvenster 464 in plaats van 522 — exact de
   58 px uit het record — en `acceptVisible` slaat daarbij om naar **true**. De nulmetingstest kan
   dus op een tragere machine rood worden om een reden die niets met 20.16 te maken heeft.

---

## Bevindingen

### H1 — `deck-accept` is niet de laagste bediening; de meting is 76 px te optimistisch
`tests/e2e/helpers/review-deck.ts:321,331` (+ `review-deck-layout.spec.ts:142-147`,
`MobileReviewDeck.tsx:1371-1383,1385-1389`) — **high**

AC3 van deze story vraagt "de onderkant van de **laagste** beslisknop". `measureDeck` leest
`[data-testid="deck-accept"]` en `acceptVisible` vergelijkt die onderkant met de vensterhoogte.
Onder de knoprij (`:1293-1368`) staan echter nog twee zusjes van de kaart: de knop "Ander keurmerk
koppelen" (`:1371`, hoogte 44 + 8 marge) en de swipe-hint (`:1385`, marge 8).

**VERIFIED** (eigen probe, Google Chrome via `channel: 'chrome'`, venster 1440×1000, dezelfde
helper en dezelfde stubs):

```json
{"acceptBottom":1053,"relabelBottom":1105,
 "deckKinderen":[ … {"testid":"deck-relabel-open","bottom":1105},
                     {"tag":"SPAN","txt":"swipe → Accepteer · ← Wijs af · ‹ ","bottom":1129}],
 "docScrollHeight":1153}
```

Gevolg: 20.16 kan `acceptVisible === true` halen met een verbetering van 53 px, terwijl er dan nog
**76 px** bediening onder de vouw staat. Erger nog voor de bewijsvoering: het story-record schrijft
dat deze meting "H1 van `review-20-14-code.md`" bevestigt, maar die bevinding gaat expliciet over
het hele blok van "~142 px aan bedieningselementen" (`review-20-14-code.md`, H1). De test bevestigt
daar een derde van, en dekt de rest niet af.

**Moet wijzigen:** `DeckMeasurement` uitbreiden met de onderkant van `deck-relabel-open` (en de
swipe-hint, of het onderste zusje van `mobile-review-deck` generiek), en `acceptVisible` vervangen
door — of aanvullen met — `bedieningVolledigInBeeld`. Zonder dat is de kernvraag van 20.16 niet
gemeten maar benaderd.

---

### H2 — de stub rendert een kaart zonder declaratie-tag; de nulmeting is 32 px te ruim
`tests/e2e/helpers/review-deck.ts:203-205` (+ `:181-187`, `MobileReviewDeck.tsx:330-337,1163-1175`)
— **high**

Het commentaar op `:181-187` claimt dat de antwoordvormen "NIET verzonnen maar afgelezen uit de
service-laag" zijn. Voor de *vorm* klopt dat; de *waarde* is gemist. `fetchDeclaredMarks` geeft
`reason` ongewijzigd door (`artworkReviewService.ts:166-171`), en het deck gebruikt hem als poort:

```ts
// MobileReviewDeck.tsx:331
const has = res.reason === 'ok' && res.marks.length > 0;
```

De stub stuurt `reason: "stub"` → `has === false` → `deck-prior` (`:1163-1175`, Tag + `marginBottom: 8`)
wordt nooit gerenderd.

**VERIFIED** (eigen probe: identieke stubs, alleen `reason` op `"ok"`):

| stub | `deck-prior` aanwezig | beeldvenster (venster 1000) |
|---|---|---|
| zoals geleverd (`reason: "stub"`) | **nee** | **522 px** |
| `reason: "ok"` | ja | **490 px** |

De vastgelegde nulmeting meet dus een kaart die op het echte scherm niet bestaat zodra de GTIN een
declaratie heeft — en dat is het gangbare geval, want het hele reviewscherm draait op de
declaratie-kruischeck. Review-20-15 H1 rekende het verschil tussen "volle kaart" en "zonder
prior-tag" al op 60 px; dat verschil zit nu ongemerkt in de referentiegetallen van 20.16.

Hetzelfde patroon zonder rode test geldt breder: **geen enkele test controleert de samenstelling
van de kaart.** Zou `/auth/me` wegvallen, dan verschijnt de alinea "Beoordelen vereist
beheerdersrechten" (`ArtworkReviewPage.tsx:187-196`) en verdwijnt de knop "Verwerk geaccepteerde" —
de kaart blijft staan, alle vijf de tests blijven groen, en alle getallen verschuiven.

**Moet wijzigen:** `reason: "ok"` in de stub, en in de meettests vastleggen welke rijen op de kaart
horen te staan (`deck-reference-row`, `deck-prior`, `deck-context-toggle`, `review-catchup`) — een
`toBeVisible()` per rij is genoeg. Anders meet de volgende story stilzwijgend een ander scherm.

---

### H3 — de wedloop is verkeerd gediagnosticeerd, en de afgedwongen hermeting vangt hem niet betrouwbaar
`tests/e2e/helpers/review-deck.ts:284-295` (+ `:265-277`, story-record "Bevinding die niet in de
spec stond", `ArtworkReviewPage.tsx:148`, `MobileReviewDeck.tsx:153-170`) — **high**

Zowel het story-record als het commentaar in de helper wijzen de uitlegalinea aan als oorzaak van
het 58 px-verschil ("valt dat meetmoment vóór het binnenkomen van de wachtrij, dan staat de alinea
er nog"). Dat kan niet: de alinea rendert alleen bij `isMobile || items.length === 0`
(`ArtworkReviewPage.tsx:148`) en het deck rendert alleen bij `items.length > 0` in diezelfde
render (`:257-274`), met daarvóór nog een `loading`-poort (`:198`). Alinea en kaart kunnen nooit
tegelijk in de DOM staan.

**VERIFIED** (eigen probe, venster 1440×1000): `review-description` is afwezig zodra de kaart er
staat. De werkelijke oorzaak is `/auth/me`: `isAdmin` schakelt de knop "Verwerk geaccepteerde"
(`ArtworkReviewPage.tsx:174-183`) bij, de kop wordt hoger, en de kaart is dan al gemeten.

```json
// /auth/me 1200 ms vertraagd, verder identieke stubs
"zonderDuw": {"stageFrameHeight":464,"acceptBottom":995,"acceptVisible":true}
"metDuw":    {"stageFrameHeight":522,"acceptBottom":1053,"acceptVisible":false}
```

464 → 522 is exact de 58 px uit het record, en — dit is het punt — **`acceptVisible` slaat om naar
`true`**. De nulmetingstest (`spec:142-147`, `expect(acceptVisible).toBe(false)`) wordt dan rood met
de melding "controleer of dat de reparatie van 20.16 is", terwijl er niets gerepareerd is.

De afgedwongen `resize` beschermt daar maar half tegen. Hij wordt één keer afgevuurd, direct na het
laden van het beeld (`openDeck` wacht op `img.complete`, niet op de rest van de pagina). Komt
`/auth/me` daarná binnen, dan is de kaarthoogte opnieuw verouderd — en de stabilisatielus merkt dat
niet, want de kaart hermeet zich uitsluitend bij `resize` (`MobileReviewDeck.tsx:168`): de lus ziet
twee gelijke, foute metingen en meldt `stabielNa: 2`. Dat is precies het scenario dat de
ontwikkelaar zelf zag (164 vs 222) en dat ik in een van mijn probes onbedoeld reproduceerde
(beeldvenster 464 zonder duw).

**Moet wijzigen:** (a) de oorzaakbeschrijving in het record én in `:284-295` corrigeren — het is
`/auth/me`/`review-catchup`, niet de uitlegalinea; dit is de tekst waarop 20.16 AC7 gescopet wordt.
(b) vóór de duw wachten tot de pagina rustig is (`review-catchup` zichtbaar, of
`waitForLoadState('networkidle')`), of de `resize` in elke ronde van de stabilisatielus afvuren.

---

### M1 — de nulmeting op venster 1000 is nergens vastgeklikt
`tests/e2e/review-deck-layout.spec.ts:73-76` — **medium**

AC4 eist de kapotte waarden op **beide** vensterhoogtes. De twee `meet de opmaak`-tests toetsen
alleen `> 0` en de vensterhoogte; de getallen gaan naar een annotatie en een JSON-bestand. Alleen
`NULMETING — de knoppen staan niet betrouwbaar in beeld` (venster 700) en `kleine-bron` (venster
1000, maar over beeldvulling) hebben een falende bewering. Repareert 20.16 alleen het gedrag op
venster 1000, dan wordt geen enkele test rood en gaat de wijziging ongezien voorbij — de faalmodus
die deze story bestrijdt.

**Moet wijzigen:** een `acceptVisible === false`-bewering (of de opvolger uit **H1**) ook op venster
1000.

---

### M2 — de `hermeting`-test kan niet falen
`tests/e2e/review-deck-layout.spec.ts:126-129` — **medium**

`expect(naHermeting.stageFrameHeight).toBeGreaterThanOrEqual(bijMontage.stageFrameHeight)`.
`cardHeight = innerHeight − rect.top − 16` (`MobileReviewDeck.tsx:164-165`); een hermeting na een
`resize` kan de bovenkant van de kaart alleen gelijk houden of verlagen, dus de uitkomst kan alleen
gelijk blijven of groeien. Treedt de wedloop op, dan is de bewering waar; treedt hij niet op, dan
zijn beide zijden identiek en is de bewering waar. In alle vier mijn runs waren `bijMontage` en
`naHermeting` exact gelijk (222/753 bij venster 700).

Het verschil wordt uitsluitend als neveneffect in `test-results/review-deck-metingen.json` bewaard.
De story presenteert deze test als "legt het verschil vast in plaats van het weg te poetsen" — dat
doet hij niet; hij legt het hooguit vast als hij toevallig optreedt, en zwijgt in de bewering.

**Moet wijzigen:** ofwel de wedloop deterministisch uitlokken (vertraag `/auth/me` in de stub, zie
**H3**) en dan `naHermeting.stageFrameHeight).toBeGreaterThan(bijMontage…)` eisen, ofwel deze test
schrappen en het verschil in het story-record vastleggen. Een test die per constructie groen is,
is precies wat 20.15 afschaft.

---

### M3 — het meetartefact is onvolledig zodra Playwright parallel draait
`tests/e2e/review-deck-layout.spec.ts:30-41` — **medium**

`verzameld` is modulestatus per werkproces. `playwright.config.ts:20` zet `fullyParallel: true` en
`:26` laat `workers` lokaal ongezet (= aantal kernen ÷ 2), dus de vijf tests uit dit ene bestand
worden over meerdere processen verdeeld en elk proces schrijft alleen zijn eigen sleutels naar
hetzelfde pad. Laatste schrijver wint.

**VERIFIED** (repo-instellingen nagebootst, `fullyParallel: true`, `workers: 3`):

```
keys: [ 'hermeting' ]        ← 1 van de 5
```

Serieel (`workers: 1`) drie keer achter elkaar: alle vijf de sleutels. Het gedocumenteerde commando
van AC6 (`npx playwright test tests/e2e/review-deck-layout.spec.ts`) gebruikt de repo-config en valt
dus in het parallelle geval. In CI staat `workers: 1` (`:28`), daar gaat het goed — het is de
lokale draai, de draai die 20.16 gaat gebruiken, die kapot is.

**Moet wijzigen:** `test.describe.configure({ mode: 'serial' })` op de suite, of per test naar een
eigen bestand schrijven en die aan het eind samenvoegen.

---

### M4 — het artefact landt in een map die in versiebeheer zit
`tests/e2e/review-deck-layout.spec.ts:30-34` — **medium**

`test-results/` is géén genegeerde map: `test-results/.last-run.json` staat onder versiebeheer en
`.gitignore` bevat geen regel voor `test-results`. Elke run laat dus
`test-results/review-deck-metingen.json` als ongevolgd bestand in de werkkopie achter. Het
story-record zegt bij taak 1 uitdrukkelijk "geen bestanden in de repository" — voor de PNG's is dat
netjes opgelost, voor de metingen niet.

**Moet wijzigen:** naar `test-results/` schrijven en die map (plus `playwright-report/`) in
`.gitignore` zetten, of naar de `outputDir` van de testrun schrijven.

---

### M5 — het open punt over `channel: 'chrome'` is een lokale kwestie, niet een CI-kwestie
story-record "Commando (AC6)" — **medium**

Het record legt de vraag voor of `playwright.config.ts` een `channel: 'chrome'`-project moet krijgen,
"dat raakt de CI-configuratie en is daarom niet eigenmachtig gedaan". Nagelopen: CI installeert de
browser zelf.

- `.github/workflows/ci-cd.yml:359-360` — `pnpm exec playwright install --with-deps chromium`, daarna
  `playwright test` (`:363`).
- `.github/workflows/comprehensive-tests.yml:80-81` — `playwright install --with-deps`, daarna
  `pnpm test:e2e` (= `playwright test`, `package.json:21`).

De nieuwe spec staat niet in `testIgnore` (`playwright.config.ts:12-19`), dus hij draait mee in beide
workflows en heeft geen backend nodig. **Er is dus geen CI-blokkade en er is geen beslispunt.** Het
enige probleem is deze werkplek, en dat lost `npx playwright install chromium` op. Zoals het er nu
staat nodigt het open punt uit tot een configuratiewijziging die niets oplost en de CI-matrix
vertroebelt.

**Moet wijzigen:** het open punt herformuleren tot wat het is (lokale browsercache ontbreekt), met
de vaststelling dat CI de browser al installeert. AC6 blijft daarmee **niet gehaald**: het commando
is in deze repository nooit geslaagd.

---

### M6 — de getallen van het faalbewijs (AC5) rekenen niet uit
story-record "Faalbewijs (AC5)" — **medium**

`FILL_BOTTOM_GAP` van 16 naar 200 verlaagt `cardHeight` met 184 px op élke vensterhoogte
(`MobileReviewDeck.tsx:164-165`), tenzij de vloer `FILL_MIN_CARD_HEIGHT = 320` bindt.

- Venster 700: `max(320, 700 − 277 − 200) = 320`; onderkant kaart 597, "Accepteer" 597 + 12 + 56 =
  **665**. Het record noemt 665 — klopt.
- Venster 1000: geen vloer, onderkant kaart = 1000 − 200 = 800, "Accepteer" = 800 + 68 = **869**.
  Het record noemt **811**. Dat verschil van 58 px is verdacht precies de wedloop uit **H3** — het
  faalbewijs is waarschijnlijk in de instabiele stand gemeten.

Dat de test kán falen is los daarvan **wel** aangetoond, door mij en onafhankelijk van het record:
de probe met vertraagde `/auth/me` verschuift de opmaak 58 px en `acceptVisible` slaat om naar
`true` (zie **H3**) — dus de bewering op `spec:142-147` reageert aantoonbaar op een
opmaakverandering. Ik heb het faalbewijs zelf **niet** overgedaan; dat vraagt een wijziging in
`MobileReviewDeck.tsx` en die valt buiten deze review.

**Moet wijzigen:** het faalbewijs opnieuw draaien nadat **H3** is opgelost, en de tabel met de
uitgerekende waarden laten overeenkomen.

---

### L1 — `stabielNa` kan nooit 1 zijn
`tests/e2e/helpers/review-deck.ts:297-305` — **low**

`vorige` is `null` in ronde 1, dus de vroegste terugkeer is `i = 2`. Alle vijf de metingen in alle
vier mijn runs melden `stabielNa: 2`. Het veld belooft "hoeveel rondes er nodig waren" en meet in de
praktijk alleen "≥ 2". Ofwel de basis naar 0/1 verschuiven, ofwel het veld hernoemen naar iets dat
niet meer belooft dan het waarmaakt.

### L2 — `makePng` heeft geen ondergrens op de afmetingen
`tests/e2e/helpers/review-deck.ts:61-95` — **low**

**VERIFIED** — de bytestructuur is correct: handtekening, IHDR (breedte/hoogte, bitdiepte 8,
kleurtype 2, rest nul), `deflateSync` levert de zlib-wikkel die PNG voorschrijft, CRC over type +
data, filterbyte 0 per scanlijn, `1 + width * 3` bytes per rij. Uitgevoerd en teruggelezen met
`sips`: 1600×1200, 240×180, 201×97 (oneven én niet-vierkant), 3×7 en 1×1 worden alle vijf correct
gedecodeerd. Alleen 0×0 levert een bestand dat geen enkele decoder leest. Geen gebruiker vandaag,
maar 20.16/20.17 stellen de maten in; één regel `if (width < 1 || height < 1) throw` voorkomt een
onverklaarbaar leeg beeldvenster.

### L3 — de vastgelegde getallen zijn machinegebonden
story-record "De gemeten nulmeting" — **low**

522/1019/1053 komen uit macOS + Google Chrome; in CI draait Linux-chromium met andere
letterhoogtes, dus de kop boven de kaart en daarmee `stageFrameHeight` kunnen afwijken. De
*beweringen* zijn daar bestand tegen (`acceptVisible === false`, verschil `> 100`), de tabel niet.
Zet er de omgeving bij, zodat 20.16 niet tegen de verkeerde referentie vergelijkt.

### L4 — het vangnet antwoordt ook op mutaties met `200 {}`
`tests/e2e/helpers/review-deck.ts:179` — **low**

Elke niet-genoemde aanroep krijgt `200 {}`, ongeacht methode. Vandaag onschuldig (de tests klikken
niet), maar zodra 20.16/20.17 een accept- of annotate-pad aanraken lijkt elke mutatie te slagen.
Beperk het vangnet tot `GET`, of laat het `501` teruggeven zodat een nieuw endpoint hoorbaar is.

### L5 — bij `kleine-bron` faalt na 20.16 de verkeerde bewering eerst
`tests/e2e/review-deck-layout.spec.ts:98-106` — **low**

Vult het beeld straks wél de ruimte, dan struikelt eerst `imageHeight ≤ 200` met de melding "het
beeld rendert op zijn bronhoogte" — die leest als een defect. De uitleg "vervang deze nulmeting"
hangt aan de tweede bewering, die dan niet meer bereikt wordt. Zet de nulmeting-melding op beide.

---

## Wat expliciet is nagelopen en klopt

- **De routevolgorde in `stubReviewDeck` (`:170-243`) is correct.** Playwright draait
  onderscheppers in omgekeerde registratievolgorde; het vangnet staat bovenaan (draait dus als
  laatste) en de preflight met `fallback()` onderaan (draait als eerste). Werkend bevestigd: alle
  vijf de tests slagen, en een aanroep die geen specifieke stub heeft (`/crop-url`) valt netjes op
  het vangnet terug zonder de kaart te breken.
- **Het vangnet vangt een verplaatst of gewijzigd endpoint wél af.** Probe met de wikkel van de
  wachtrij van `data` naar `items` gewijzigd: `deck-swipe-card` verschijnt niet, `review-empty`
  wel → `expect(...).toBeVisible()` loopt af → **rood**. Probe met een 404 op het `/marked`-beeld:
  de kaart staat er wel, maar `waitForFunction(img.complete && img.naturalWidth > 0)`
  (`spec:55-60`) haalt het niet → **rood**. Die wachtvoorwaarde is de belangrijkste regel van het
  bestand en is goed gekozen.
- **De CORS-toelichting op `:112-128` klopt.** `apiClient.ts:5-7` zet `withCredentials: true` met
  `baseURL` op `http://localhost:8000` in dev (`constants/index.ts:8`), dus een wildcard-origin zou
  inderdaad geweigerd worden. De beeld-URL's zijn relatief (`MobileReviewDeck.tsx:117,978,986`) en
  lopen via de Vite-proxy (`vite.config.ts:77-82`), maar het patroon `**/api/v1/**` dekt beide.
- **`[data-testid="deck-stage"] img` is het juiste element.** `deck-stage` is de `wrapRef` van
  `ImageStage` (`ImageStage.tsx:257-286`) met `overflow: hidden`, en daarbinnen staat precies één
  `<img>` (`:288-303`). `getBoundingClientRect()` op dat `<img>` geeft de lay-outhoogte, niet de
  afgeknipte hoogte — dat is wat je hier wilt meten, en het is de reden dat 1019 px in een venster
  van 522 px zichtbaar wordt.
- **`deck-stage-frame` is het juiste "beeldvenster"** (`MobileReviewDeck.tsx:1191-1209`, `flex: 1`,
  `minHeight: 0`, `overflow: hidden`) en `deck-swipe-card` de juiste kaart (`:1030-1052`, de
  `cardRef` die de gemeten hoogte draagt).
- **AC7 (geen regressie) is schoon.** `git status` toont geen wijziging in `playwright.config.ts`,
  in `apps/web/src/**` of in enige vitest-configuratie; de `testIgnore`-lijst is ongewijzigd.
- **De nulmeting is reproduceerbaar.** Vier runs, drie daarvan direct achter elkaar, gaven identieke
  getallen en 5 passed / 0 failed.

---

## Claim-audit per acceptatiecriterium

| AC | Oordeel | Bewijs |
|----|---------|--------|
| **AC1** — testopzet toont het beoordeelscherm in een echte browser, zonder backend/database/inlog | **gedekt** | Zelf gedraaid (Google Chrome via `channel: 'chrome'`, alleen de Vite dev-server draaide): `5 passed`, kaart + `<img>` gerenderd, geen api, geen database, geen sessie. `stubReviewDeck` dekt `/auth/me`, `/review-queue`, `/feedback/uncertain`, `/declared-marks`, `/marked`, `/reference-logos` plus een vangnet. |
| **AC2** — herbruikbare hulpmodule met per antwoord instelbare afbeeldingsgrootte | **gedekt met voorbehoud** | `ReviewDeckStubOptions.image` en `.referenceImage` werken aantoonbaar (240×180 levert `imageHeight: 180`, 1600×1200 levert 1019). Maar de **samenstelling** van de kaart is niet instelbaar en staat vast op een variant die het echte scherm niet toont: de declaratie-tag ontbreekt structureel → **H2**. 20.16 en 20.17 kunnen de volle kaart dus niet meten. |
| **AC3** — vier grootheden uit de echte lay-out gelezen | **gedekt met voorbehoud** | Beeldvenster (522/222), beeldhoogte (1019), vensterhoogte (1000/700) en kaartonderkant zijn echt gemeten — geverifieerd in mijn eigen run. De vierde grootheid, "de onderkant van de **laagste** beslisknop", is 76 px te hoog gemeten: de laagste bediening is `deck-relabel-open` (1105) resp. de swipe-hint (1129), niet `deck-accept` (1053) → **H1**. |
| **AC4** — de huidige kapotte waarden vastgelegd op venster 1000 én 700, gemarkeerd als nulmeting | **niet gedekt** | De markering is er en is duidelijk (`spec:9-10`, `:104-106`, `:144-146`). Maar op venster 1000 klikt geen enkele bewering de nulmeting vast (**M1**), en de vastgelegde getallen horen bij een kaart die één rij mist (490 vs 522, **H2**). 20.16 wordt dus tegen een 32 px te ruime referentie afgezet, en een reparatie die alleen venster 1000 raakt gaat ongezien voorbij. |
| **AC5** — bewijs dat de test kán falen | **gedekt met voorbehoud** | Falsifieerbaarheid is aangetoond, maar door mij en langs een andere weg: een opmaakverschuiving van 58 px (vertraagde `/auth/me`) laat `acceptVisible` omslaan naar `true`, waarmee `spec:142-147` rood wordt. Het faalbewijs in het record zelf reken ik niet na tot 869 waar 811 staat (**M6**), en ik heb het niet overgedaan omdat het een wijziging in `MobileReviewDeck.tsx` vraagt. |
| **AC6** — één gedocumenteerd commando dat op een schone werkkopie slaagt | **niet gedekt** | Het record erkent het zelf: `npx playwright test tests/e2e/review-deck-layout.spec.ts` slaagt op deze machine niet (ontbrekende chromium-revisie). Daar komt bij dat datzelfde commando de repo-config gebruikt, en die schrijft het meetartefact stuk zodra er parallel gedraaid wordt — 1 van 5 sleutels (**M3**). Het bijbehorende open punt wijst bovendien de verkeerde kant op: CI installeert de browser al (**M5**). |
| **AC7** — geen regressie; vitest ongemoeid, uitsluitingen in `playwright.config.ts` blijven | **gedekt** | `git status` op `playwright.config.ts`, `apps/web/src/**` en de vitest-configuraties is leeg; er is uitsluitend toegevoegd (`tests/e2e/helpers/review-deck.ts`, `tests/e2e/review-deck-layout.spec.ts`). De tegenspraak jsdom/happy-dom is netjes als open punt genoteerd en niet stilzwijgend gelaten. |

---

## Wat moet wijzigen vóór PASS

1. **H1** — meet de werkelijk laagste bediening. `deck-relabel-open` (en de swipe-hint) opnemen in
   `DeckMeasurement`, en `acceptVisible` vervangen door een grootheid die de hele bedieningskolom
   omvat. Zonder dit kan 20.16 groen worden met 76 px bediening onder de vouw.
2. **H2** — `reason: "ok"` in de declaratie-stub, en de kaartsamenstelling vastleggen met een
   `toBeVisible()` per rij (`deck-reference-row`, `deck-prior`, `deck-context-toggle`,
   `review-catchup`). Daarna de nulmeting opnieuw vaststellen — hij wordt ongeveer 32 px kleiner.
3. **H3** — de oorzaakbeschrijving corrigeren (`/auth/me` en de knop "Verwerk geaccepteerde", niet
   de uitlegalinea) in `helpers/review-deck.ts:284-295` én in het story-record, want 20.16 AC7 wordt
   op die tekst gescopet. En wachten tot de pagina rustig is vóór de afgedwongen hermeting, anders
   is de nulmetingstest tijdgevoelig.
4. **M1** — een falende bewering over de nulmeting toevoegen op venster 1000.
5. **M2** — de `hermeting`-test deterministisch maken (wedloop uitlokken via de stub) of schrappen;
   in de huidige vorm kan hij niet rood worden.
6. **M3** — de suite serieel draaien (`test.describe.configure({ mode: 'serial' })`) of per test naar
   een eigen bestand schrijven; nu is het meetartefact bij het gedocumenteerde commando onvolledig.
7. **M4** — `test-results/` (en `playwright-report/`) in `.gitignore`, of naar de `outputDir`
   schrijven; nu blijft er na elke run een ongevolgd bestand in de repository achter.
8. **M5** — het open punt herschrijven: geen CI-kwestie, geen beslispunt, alleen een ontbrekende
   lokale browsercache. Daarna AC6 opnieuw beoordelen.
9. **M6** — het faalbewijs overdoen nadat **H3** is opgelost, met getallen die uitrekenen.
10. **L1-L5** — `stabielNa` eerlijk maken of hernoemen, `makePng` een ondergrens geven, de omgeving
    bij de nulmetingstabel zetten, het vangnet tot `GET` beperken, en de nulmeting-melding bij
    `kleine-bron` op beide beweringen zetten.

---

## Verificatie-aantekening

**VERIFIED (zelf gedraaid).** Vier volledige runs van `tests/e2e/review-deck-layout.spec.ts` met de
al geïnstalleerde Google Chrome (`channel: 'chrome'`) via een draai-configuratie **buiten** de
repository, tegen de Vite dev-server op 5173 zonder backend of database: `5 passed / 0 failed`, met
identieke getallen aan het story-record (venster 1000: 522/1019/1053/`acceptVisible: false`; venster
700: 222/1019/753/`false`; kleine bron: 180 in een venster van 522). Drie eigen probes, óók buiten de
repository, met dezelfde helper: (a) de onderkanten van alle zusjes van `mobile-review-deck` →
**H1**; (b) `reason: "ok"` tegenover `reason: "stub"` → **H2**; (c) `/auth/me` 1200 ms vertraagd →
**H3**; (d) gewijzigde wachtrij-wikkel en 404 op het beeld → het vangnet wordt rood. De PNG-generator
is los uitgevoerd en de uitvoer teruggelezen met `sips` (zes maatvoeringen) → **L2**. Het
parallel-effect op het meetartefact is nagebootst met `fullyParallel: true` + `workers: 3` → **M3**.
`npx playwright install` is **niet** uitgevoerd.

**VERIFIED (in de code nagelopen, `23592d4`).** De knoprij (`MobileReviewDeck.tsx:1293-1368`), de
relabel-knop (`:1371-1383`) en de swipe-hint (`:1385-1389`) als zusjes van `deck-swipe-card`
(`:1030-1052`); de `reason === 'ok'`-poort (`:331`) en de declaratie-tag (`:1163-1175`); de
kaartmeting alleen bij montage en `resize` (`:153-170`); `deck-stage-frame` (`:1191-1209`) en het
enkele `<img>` in `ImageStage` (`ImageStage.tsx:257-303`); de poorten in `ArtworkReviewPage.tsx`
(`:148`, `:174-183`, `:187-196`, `:198`, `:237`, `:257-274`); `withCredentials` in `apiClient.ts:5-7`
en de Vite-proxy (`vite.config.ts:77-82`); de CI-stappen die de browser installeren
(`ci-cd.yml:359-363`, `comprehensive-tests.yml:80-84`) en `package.json:21`; `testIgnore` en
`fullyParallel`/`workers` in `playwright.config.ts:12-28`; het ontbreken van een `test-results`-regel
in `.gitignore` naast een gevolgde `test-results/.last-run.json`.

**NIET geverifieerd.** Het faalbewijs van AC5 is niet overgedaan — dat vraagt een wijziging in
`MobileReviewDeck.tsx` en valt buiten deze review; de rekenkundige tegenspraak in **M6** is dus een
berekening, geen meting. Het gedrag onder Linux-chromium in CI is niet gedraaid (alleen macOS +
Google Chrome), dus **L3** berust op de bekende verschillen in letterhoogtes, niet op een meting.
De vitest-suites zijn niet gedraaid; AC7 is beoordeeld op `git status`, niet op een groene suite.
Het beoordeelscherm met échte data (ACC/productie) is niet bekeken — alle getallen komen van
gestubde antwoorden, wat de helper zelf ook eerlijk vermeldt.
