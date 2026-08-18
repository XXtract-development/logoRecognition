# Adversariële SPEC-review — Story 20.17 (scherper contextfragment)

- **Reviewer:** adversarial spec review (BMAD), 2026-08-17
- **Story:** `_bmad-output/implementation-artifacts/20-17-scherper-contextfragment.md` (status `draft`)
- **Code-basis:** branch `acc`, HEAD `9da6c5f`
- **Scope:** de SPEC getoetst tegen de echte code; er is niets geïmplementeerd. Deel B van de
  splitsing uit `review-20-15.md` (M7).

```
verdict: FAIL
severity_count: { high: 2, medium: 6, low: 5 }
```

**Eerst het goede nieuws, want dat was de hoofdvraag.** De gecorrigeerde beschrijving van het
mechanisme in "Wat de spec-review hier corrigeerde" is **VERIFIED juist**. De header wordt
uitgestuurd als `${left},${top},${rw},${rh},${W},${H}` in volledige-artwork-pixels
(`artwork-pipeline.ts:1046`); `left/top/rw/rh` worden berekend op `:1008-1015`, dus vóór `scale`
(`:1018`) en volstrekt onafhankelijk van `TARGET`. De client rekent terug met
`x: (left + rel.x * rw) / W` (`MobileReviewDeck.tsx:661-664`) — fracties van het getoonde
fragment, zonder enige pixelmaat. Er is niets dat mee moet schalen, en de waarschuwing in de spec
("wie er een schaalfactor bij zet, breekt de terugrekening die nu klopt") is terecht. Dit punt is
hersteld.

FAIL komt van twee andere dingen: **AC1 doet voor een flink deel van de items aantoonbaar niets**
(en het RED-bewijs dat AC8 eist is met de bestaande testopstelling niet te leveren), en **AC3
botst frontaal met AC7** terwijl de eis zoals opgeschreven technisch niet uitvoerbaar is op de
plek waar de ETag gezet wordt.

---

## 1. Bevindingen

### HIGH

**H1 — de 900-grens is voor de meeste items helemaal niet de begrenzing; AC1 is voor een deel van de items een byte-identieke no-op, en het RED-bewijs uit AC8 is met de bestaande fixture onmogelijk — high**

`artwork-pipeline.ts:1010-1020`, `:1017`; bestaande test `artwork-pipeline.routes.test.ts:543-576`.

De spec stelt: het fragment wordt "teruggeschaald naar maximaal 900 px", dus een breder deck
levert nauwelijks detail op. De helft daarvan klopt. Wat de spec mist is dat `scale` op `:1018`
geklemd is op **1**:

```
halfW = min(max(bw * 2.5, 250), cx, W − cx)      // :1010
rw    = round(halfW * 2)                          // :1014
scale = min(1, TARGET / max(rw, rh))              // :1018
```

Het uitsnedevenster is dus `5 × de bbox-zijde` (voor een bbox boven ~100 px), en er wordt **nooit
opgeschaald**. De werkelijke bovengrens van de scherpte is `min(5 × bbox, TARGET)` — niet `TARGET`.
Gevolg: zolang `5 × bbox ≤ 900`, dat wil zeggen **bbox ≤ 180 px**, verandert het verhogen van
`TARGET` naar 1600 exact niets. Zelfde afmetingen, zelfde bytes.

**VERIFIED (gemeten met de `sharp` uit deze repository, `node_modules/sharp`, synthetisch
artwork 3000 × 4000):**

| bbox (langste zijde) | venster | fragment bij 900 | bij 1600 | bij 2400 | winst 900→1600 |
|---|---|---|---|---|---|
| 60 px | 500 × 500 | 500 × 500 · 0,57 MB | **identiek** | identiek | **geen** |
| 120 px | 600 × 500 | 600 × 500 · 0,69 MB | **identiek** | identiek | **geen** |
| 180 px | 900 × 675 | 900 × 675 · 1,39 MB | **identiek** | identiek | **geen** |
| 240 px | 1200 × 900 | 900 × 675 · 1,45 MB | 1200 × 900 · 2,48 MB | idem | 1,33× |
| 320 px | 1600 × 1200 | 900 × 675 · 1,09 MB | 1600 × 1200 · 4,41 MB | idem | 1,78× |
| 480 px | 2400 × 1800 | 900 × 675 · 1,00 MB | 1600 × 1200 · 3,84 MB | 2400 × 1800 · 9,90 MB | 1,78× |

Pas vanaf **bbox ≥ 320 px** wordt de 1600 überhaupt gehaald.

**Hoe vaak is dat?** `VERIFIED` — de 42 geoogste crops in
`_bmad-output/test-artifacts/nutriscore-crops/` (proxy voor de bbox-grootte in artwork-pixels)
hebben een mediaan van **269 px** langste zijde: min 92, p25 191, mediaan 269, p75 420, max 622.
Daarvan zit **7 van de 42 op of onder 180 px** (nul verbetering) en haalt **19 van de 42** de
volle 1600. Voor de mediaan is de winst **1,49×**, niet de 1,78× die de spec suggereert.
`INFERENCE`: die crops zijn geoogste Nutri-Score-uitsneden, geen dwarsdoorsnede van de
reviewwachtrij, en een crop kan padding rond de bbox bevatten. De richting is desondanks
eenduidig: een substantiële minderheid van de items merkt niets van deze story.

**Waarom dit high is en niet medium.** AC8 eist RED-bewijs voor AC1: draai de wijziging terug en
toon dat de bedoelde test rood wordt. De enige bestaande `/source`-test
(`artwork-pipeline.routes.test.ts:543-576`) gebruikt bbox `80 × 60` op een artwork van
1000 × 800 → venster **500 × 500** → `TARGET` bijt niet. Die test is groen vóór én na de
wijziging en kán niet rood worden. Een ontwikkelaar die de bestaande fixture kopieert — de
natuurlijke greep — levert een groene suite, een afgetekende AC1, en een reviewer die op zijn
scherm niets ziet veranderen. Dat is letterlijk de faalmodus van 20.12 en 20.14, één laag dieper.

**Moet wijzigen:** (a) de "Wat er nu gebeurt"-alinea corrigeren — de begrenzing is
`min(5 × bbox, TARGET)`, en voor kleine keurmerken is het venster zelf de bovengrens, niet de 900;
(b) AC1 herformuleren als "voor een item waarvan het uitsnedevenster grotér is dan de grens" en er
het meetbare gevolg bij zetten; (c) AC8 dwingend maken over de fixture: **bbox ≥ 320 px op een
artwork van ≥ 2000 × 2000, gecentreerd**, anders is het RED-bewijs niet te leveren; (d) expliciet
vastleggen dat items met een bbox ≤ 180 px géén verbetering krijgen, en of dat acceptabel is —
want dat is precies de groep waarvoor "ik moet inzoomen" het hardst geldt. Zo niet, dan is de
échte oplossing een gróter venster (de `2.5×`-marge op `:1010`) of opschalen toestaan, en dát is
een andere story.

**H2 — AC3 en AC7 spreken elkaar tegen, en "de fragmentgrootte in de ETag" is niet uitvoerbaar op de plek waar de ETag gezet wordt — high**

`artwork-pipeline.ts:79-96` (de helper), aangeroepen op `:839` (`/artwork`), `:882` (`/crop`),
`:913` (`/marked`) en `:981` (`/source`); tests `artwork-pipeline.routes.test.ts:580-598`,
`:600-618`, `:620-639`, `:641-665`.

Drie problemen op één punt.

1. **Tegenspraak.** AC3 eist de fragmentgrootte in de ETag van `/source`. AC7 eist dat
   `/marked`, `/crop`, `/source` en `/artwork` "hun cache-gedrag uit story 20.6 behouden
   (no-cache + zwakke ETag + 304)". Voor `/source` kunnen die twee niet allebei letterlijk waar
   zijn. Zoals opgeschreven kiest de ontwikkelaar er zelf één, en dat is precies het soort
   waiver dat deze reviewketen moet voorkomen.
2. **Eén helper, vier endpoints.** `sendRevalidatingImageHeaders` is gedeeld. De kortste
   wijziging — de grootte in de helper opnemen — verandert de ETag van álle vier en maakt de drie
   20.6-tests die de exacte string `W/"ri-c1-<ms>"` vastpinnen (`:597`, `:608`, `:638`, `:664`)
   **rood**. AC7 verbiedt dat. De wijziging moet dus aantoonbaar tot `/source` beperkt blijven
   (extra parameter met een default, of de header voor `/source` apart zetten) — dat hoort in de
   taken te staan, niet als ontdekking tijdens het bouwen. `VERIFIED`: er bestaat géén test die de
   ETag van `/source` exact vastpint, dus een `/source`-only wijziging houdt de suite groen.
3. **De eis is technisch onjuist geformuleerd.** De 304-poort staat op `:981`, dus vóór
   `downloadTrainingObject` (`:983`) en vóór `sharp(buffer).metadata()` (`:995`). Op dat moment
   zijn `rw`, `rh`, `dispW` en `dispH` onbekend — de werkelijke fragmentgrootte is er niet.
   Alleen de **geconfigureerde** grens (`CONTEXT_FRAGMENT_MAX_PX`) is beschikbaar. AC3 zegt "de
   fragmentgrootte"; dat moet "de geconfigureerde grens" worden, anders herstructureert iemand de
   304-poort en verliest 20.6 zijn hele winst (de goedkope 304 zónder download).

**De `?v=`-route uit story 20.6 is hier bovendien niet gratis.** `/marked` heeft die omweg omdat
de client hem meegeeft (`MobileReviewDeck.tsx:978-980`, `editedVersion`). `/source` wordt
opgehaald door `fetchReviewItemSourceBlob` (`artworkReviewService.ts:196-212`), dat geen enkele
queryparameter kent. De URL-route vraagt dus een clientwijziging — en regel 4 van de story zegt
"raakt alleen de serverkant". Kies één route en maak de scope-regel kloppend.

**VERIFIED — andere caches op het pad, nagelopen:**

| laag | oordeel |
|---|---|
| **browser-HTTP-cache** | **bijt.** `private, no-cache` (`:89`) dwingt revalidatie af; gelijke ETag → 304 (`:91-93`) → oude body. Dit is precies wat review-20-15 M2 beschrijft, en het geldt óók voor een XHR-blob (`responseType: 'blob'`, `:199`) — de HTTP-cache zit ervóór. |
| **in-memory blob-cache in het deck** | **bijt, en de spec noemt hem niet.** `srcCache.current[id]` (`MobileReviewDeck.tsx:354-366`) haalt per item exact één keer op zolang de component leeft. Zie **L3**. |
| **service worker** | **bijt vandaag niet.** `vite.config.ts:36-51` cachet alleen `/^https:\/\/api\./i` (NetworkFirst, 1 uur, 50 entries); in productie is `apiBaseUrl` leeg (`constants/index.ts:8`), dus same-origin `/api/v1/...` matcht niet. Zie **L4** voor wanneer dat kantelt. |
| **nginx-proxycache** | **bijt niet.** `infrastructure/docker/nginx/nginx.conf:199-205` cachet `/api/` 10 minuten, maar er staat geen `proxy_ignore_headers Cache-Control`, dus `private, no-cache` van upstream sluit het uit. `NIET geverifieerd`: of dit bestand de daadwerkelijk vóór ACC draaiende proxy is (Coolify/Traefik) — zie de verificatie-aantekening. |

**Moet wijzigen:** AC3 en AC7 met elkaar in overeenstemming brengen (AC7 uitzonderen voor
`/source`, of AC3 als expliciete verfijning van 20.6 formuleren); "fragmentgrootte" vervangen door
"de geconfigureerde grens"; vastleggen dat de wijziging `/source`-only is en dat de drie exacte
ETag-asserties groen blijven; en de `?v=`-route ofwel schrappen ofwel de scope-regel "alleen de
serverkant" laten vallen.

### MEDIUM

**M1 — AC2's bovengrens beschermt niet het geheugen dat het risico vormt, en de verwijzing naar 20.11 draagt niet — medium**

`artwork-pipeline.ts:995` (`sharp(buffer).metadata()`), `:1036-1041` (`sharp(buffer).extract(...)`),
`20-11-oogst-geheugengrens-batching.md:1-8`.

De piek zit niet in de uitvoer maar in de **decodering van het volledige bronartwork**: elk
`/source`-verzoek doet `sharp(buffer)` twee keer op de hele pagina. Bij een 300-dpi-artwork van
3000 × 4000 is dat ~36 MB ruwe pixels per verzoek (plus de libvips-werkbuffers), en dat getal
verandert **niet** door deze story. De uitvoer daarnaast: 900² ≈ 3,2 MB ruw, 1600² ≈ 10,2 MB,
2400² ≈ 23 MB (RGBA). De klem op de uitvoer is dus een klem op de kleinste term.

Daarbij: story 20.11 was een **OOM-kill van de Python-ml-container tijdens een oogstronde**
(`queue_harvest_declared.py`), niet van de Node-api. Die les overzetten naar een
api-endpoint-klem vraagt een expliciete brug (draait de api in een container met een
geheugenlimiet? hoeveel gelijktijdige `/source`-verzoeken?) die de spec niet legt. Zoals het er
staat leest het als een autoriteitsverwijzing, niet als een onderbouwing.

**Moet wijzigen:** de motivering onder AC2 vervangen door de werkelijke kostenpost (bytes over de
lijn, zie **M2**) of de brug naar de api-container expliciet leggen; en overwegen of de echte
geheugenmaatregel niet `sharp(buffer)` één keer hergebruiken is in plaats van twee keer decoderen.

**M2 — de bandbreedtekosten ontbreken volledig, en die zijn hier de dominante term — omdat `/source` PNG uitstuurt en `/marked` JPEG — medium**

`artwork-pipeline.ts:1040` (`.png()`) tegenover `:954` (`.jpeg({ quality: 82 })`).

De spec noemt "geheugen- en bandbreedtekosten" alleen als reden voor de bovengrens en meet ze
nergens. Gemeten (zie H1-tabel, synthetische ruisrijke bron — een **bovengrens**, echt artwork
comprimeert beter): 900 → 1,0-1,5 MB, 1600 → 2,5-4,4 MB, 2400 → 9,9-15,0 MB **per fragment**. De
groei is kwadratisch, en door 20.6's `no-cache` gaat elke 200 opnieuw over de lijn.

Het pijnlijke detail: `/marked` levert al 1600 px zoals de spec terecht opmerkt, maar dóét dat als
JPEG q82 — een orde van grootte kleiner. `/source` op 1600 in PNG kost per beeld meer dan het
volledige gemarkeerde artwork. Geen enkel criterium raakt het uitvoerformaat, terwijl dat de
goedkoopste knop is: `.jpeg({ quality: 82 })` op `/source` levert 1600 px scherpte tegen ongeveer
de bytes van het huidige 900-px-PNG. `INFERENCE`: of JPEG-artefacten op een keurmerkrand
acceptabel zijn is een echte afweging (het is dezelfde afweging die `/marked` al gemaakt heeft),
en die hoort in het keuzemenu, niet stilzwijgend in de code.

**Moet wijzigen:** een AC over de bytes per fragment (met een gemeten getal), en het uitvoerformaat
expliciet maken — PNG houden mét de bytes als geaccepteerde kost, of naar JPEG zoals `/marked`.

**M3 — "volg de conventie van `DEFAULT_CONCURRENCY`" levert precies wat AC2 verbiedt — medium**

`artwork-pipeline.ts:99-102`.

```ts
const DEFAULT_CONCURRENCY = parseInt(process.env.ARTWORK_IMPORT_CONCURRENCY || '3', 10);
```

Die conventie heeft **geen klem** en **geen NaN-vangnet** — de twee dingen die AC2 juist eist.
Wie hem letterlijk volgt, levert een variabele zonder bovengrens. Erger, met
`CONTEXT_FRAGMENT_MAX_PX=groot` wordt het `NaN`; dan is `scale = min(1, NaN/…) = NaN`, worden
`dispW`/`dispH` `NaN`, gooit `sharp.resize` en valt de `catch` op `:1049-1058` terug op de **rauwe
bronbytes** — het meerdere-MB's-artwork dat dit endpoint juist wilde vermijden, stilzwijgend, met
alleen een `logger.warn`. Een verkeerde omgevingswaarde degradeert dus onopgemerkt naar het
traagst mogelijke gedrag.

Tweede punt: de conventie leest de variabele op **module-niveau**. AC4 wil een test bij twee
grenswaarden (900 en 1600) in dezelfde suite; met een module-constante vraagt dat
`vi.resetModules()` + herimport per geval, of een testbare helper
(`resolveContextFragmentMax(env)`). De spec kiest niet, en de bestaande suite doet dit nergens.

**Moet wijzigen:** AC2 laten voorschrijven dat de waarde geklemd wordt op `[1, 2400]` **en** dat
een niet-numerieke of ≤ 0 waarde terugvalt op 1600 (niet op `NaN`); en in de taken vastleggen hoe
de grens per test instelbaar is.

**M4 — de kaderloze tak van hetzelfde endpoint blijft op een hardgecodeerde 1200 px staan, en de spec noemt hem "een ánder pad" — medium**

`artwork-pipeline.ts:998-1002`.

De spec (regel 24-25) zet `:1000` (`resize({ width: 1200 })`) buiten scope als "de `sharp`-tak één
niveau hoger … een ánder pad". Dat is feitelijk onjuist: het is de **fallback binnen `/source`
zelf**, voor items zonder bruikbare bbox. Voor die items is "Bekijk in context" dus het hele
artwork op 1200 px breed — de minst scherpe weergave van allemaal, en de groep waar de reviewer
het meeste moet zoeken (er is immers geen kader dat de aandacht stuurt). AC1 zegt zonder
kwalificatie "het contextfragment wordt maximaal 1600 px"; een ontwikkelaar mag redelijkerwijs
denken dat dit er ook onder valt.

**Moet wijzigen:** benoemen of `:1000` mee onder `CONTEXT_FRAGMENT_MAX_PX` komt (consistent, en één
regel werk) of expliciet buiten scope blijft mét reden — en in beide gevallen de foutieve
omschrijving "een ánder pad" corrigeren.

**M5 — AC6 vraagt een meting waarvoor de opstelling en de norm ontbreken; zoals opgeschreven kan het criterium niet falen — medium**

`artwork-pipeline.routes.test.ts:543-551` (de bestaande `/source`-fixture).

Drie gaten.

- **Geen representatief artwork.** De api-suite bouwt zijn bron met
  `sharp({ create: { width: 1000, height: 800, background: wit } })` — een effen wit vlak van
  1000 × 800. Dat comprimeert tot enkele kB, decodeert tot 2,4 MB en zegt niets over de duur of
  het geheugen van een echt 300-dpi-artwork. Er is in de repository geen artwork-fixture die dat
  wél doet, en de opslag is in de suite gemockt (`downloadTrainingObject`).
- **"Piek-geheugengebruik" is in Node niet zomaar te meten.** `sharp` alloceert in libvips
  **buiten** de V8-heap, dus `process.memoryUsage().heapUsed` laat de fragment-allocaties niet
  zien. Bruikbaar is `rss` — maar dat is een momentopname, geen piek. Een uitvoerbare formulering
  is: `sharp.cache(false)` + `sharp.concurrency(1)`, `rss` bemonsteren op ~10 ms in een
  achtergrondinterval rond de aanroep, `n ≥ 5` herhalingen, mediaan van (piek-`rss` −
  basislijn-`rss`) rapporteren, samen met de wandkloktijd van `pipeline.toBuffer()`.
- **Geen norm.** "Meet en leg vast" kan niet falen. Er staat geen drempel, geen vergelijkingspunt
  en geen consequentie. Dit is dezelfde constructie die review-20-15 als M5 afkeurde.

**Moet wijzigen:** AC6 een concrete opstelling geven (bronafmeting, meetmethode, aantal
herhalingen) en een faalbare norm (bijvoorbeeld: duur bij 1600 ≤ 2× die bij 900 op hetzelfde
artwork; extra `rss` per aanroep onder een genoemd getal). Zonder norm is dit een aantekening,
geen criterium.

**M6 — AC5 laat de lijn dunner worden voor precies de items die het het hardst nodig hebben, en vergeet de witte halo — medium**

`artwork-pipeline.ts:1027-1034`.

De overlay is positioneel correct en blijft dat — de terugrekening loopt via de header, niet via
de overlay, dus meeschalen kan de fractieberekening **niet** verstoren (`VERIFIED`, `:1022-1026`
tegenover `:1046` en `MobileReviewDeck.tsx:661-664`). Dat deel van de vraag is negatief
beantwoord. Twee andere dingen kloppen wel niet.

- **De richting van het meeschalen is niet bepaald.** "Laat de dikte meeschalen met de
  fragmentgrootte" is voor tweeërlei uitleg vatbaar. Een formule die de 900 als ijkpunt neemt
  (`3 × dispMax / 900`) maakt de lijn **dunner dan vandaag** voor elk fragment kleiner dan 900 px
  — en dat is volgens **H1** de meerderheid: een venster van 500 px krijgt dan 1,7 px in plaats
  van de huidige 3. Precies de kleine keurmerken, waar de lijn het meeste doet, gaan erop
  achteruit. Wat je wilt is een dikte evenredig aan de fragmentgrootte **met een ondergrens**,
  bijvoorbeeld `max(3, round(dispMax / 300))`.
- **De halo wordt vergeten.** De witte contour op `:1031-1032` heeft `stroke-width="1"` op een
  rechthoek die met `−2` / `+4` is verschoven. Die offsets zijn afgestemd op de rode lijn van 3.
  Schaal je alleen de dikte, dan gaan de twee lijnen overlappen (halo verdwijnt onder rood) of
  ontstaat er een gat. Offsets en beide diktes horen in één formule.

Let ook op: `/marked` doet dit al anders — rood `stroke-width="4"` met een halo van `6`
(`:947-949`). Twee endpoints, twee conventies; noem welke leidend is.

**Moet wijzigen:** AC5 een formule of een ondergrens geven ("nooit dunner dan de huidige 3 px"),
de halo-offsets expliciet meenemen, en de toets benoemen (uit de SVG-string van het antwoord af te
lezen; dat is zonder browser testbaar).

### LOW

**L1 — er staan twee constanten `TARGET` in het bestand — low.** `:933` (`/marked`, 1600) en
`:1017` (`/source`, 900). Taak 1 zegt "`TARGET` vervangen door de instelbare, geklemde grens"
zonder te zeggen welke. Een zoek-en-vervang raakt beide en maakt `/marked` ongemerkt
configureerbaar. Noem de regel erbij.

**L2 — AC4's test kan niet falen zoals hij is geformuleerd — low.** Omdat de terugrekening geen
enkele pixelmaat gebruikt, is "dezelfde fracties bij 900 en 1600" een tautologie zolang de
header-formule ongewijzigd blijft; hij vangt alleen de fout die AC4 wil vangen (iemand die een
schaalfactor toevoegt). Maak dat expliciet: assert dat de **`X-Context-Window`-header
byte-identiek** is bij beide grenswaarden voor hetzelfde item, en voeg een geval toe waarin de
grens daadwerkelijk bijt (bbox ≥ 320 px, zie **H1**) zodat de test ook de dimensies dekt.

**L3 — de blob-cache in het deck houdt binnen één sessie het oude fragment vast — low.**
`MobileReviewDeck.tsx:354-366`: `srcCache.current[id]` slaat het object-URL per item op zolang de
component leeft, dus na de eerste keer wordt er niet opnieuw opgehaald. Een reviewer die zijn
tabblad tijdens de uitrol open houdt, ziet het oude fragment ook als de ETag klopt. Één regel in
de story ("na uitrol een keer verversen") of een AC dat de cache-sleutel de grens meegeeft.

**L4 — de service worker bijt vandaag niet, maar kantelt met één omgevingsvariabele — low.**
`vite.config.ts:38-50` cachet `/^https:\/\/api\./i` met `NetworkFirst`, 1 uur, 50 entries. In
productie is `apiBaseUrl` leeg (`constants/index.ts:8`) → same-origin → geen match. Zet iemand
`VITE_API_BASE_URL=https://api.…`, dan komt er een cachelaag bij die de ETag-oplossing van AC3
gedeeltelijk omzeilt. Als open punt noteren.

**L5 — negatief bevonden, en de spec zou dat moeten zeggen: het grotere fragment werkt níet door in de herkenning — low.** De voor de hand liggende zorg (een groter contextfragment lekt via
oogst of kruischeck in de herkenning) is `VERIFIED` ongegrond. `/source` schrijft niets weg; het
resultaat wordt alleen als blob in de browser getoond. Een op het fragment getekend kader gaat als
**fracties** naar `POST /annotate`, dat de crop opnieuw uit het **volledige** artwork snijdt op
volle resolutie (`:1244-1260`, `extract` op `rel.x * W` enzovoort) — de fragmentgrootte raakt de
opgeslagen crop, de referentie en de embedding op geen enkel punt. Verder roept niets buiten het
reviewdeck `/source` aan (zie **claim-audit AC7**). Zet dit als expliciete niet-risico-regel in de
story; anders herhaalt iemand deze zoektocht bij de code-review.

---

## 2. Claim-audit per acceptatiecriterium

| AC | Verifieerbaar? | Bewijs / bezwaar |
|----|---------------|------------------|
| **AC1** — fragment maximaal 1600 i.p.v. 900 | **ja als formulering, nee als effect** | `TARGET = 900` op `:1017` klopt. Maar de werkelijke begrenzing is `min(5 × bbox, TARGET)`: bij bbox ≤ 180 px is de wijziging byte-identiek, bij de gemeten mediaan (269 px) is de winst 1,49×, en de volle 1600 wordt pas gehaald vanaf bbox ≥ 320 px (19/42 in de steekproef). → **H1**. Het criterium is af te tekenen zonder dat er iets zichtbaar verbetert. |
| **AC2** — `CONTEXT_FRAGMENT_MAX_PX`, standaard 1600, hard geklemd op 2400 | **ja, en dit is de sterkste verbetering t.o.v. 20.15-AC7** | Naam en getal staan er nu (review-20-15 M4 opgelost) en "geklemd, niet overgenomen" is toetsbaar. Drie bezwaren: de aangehaalde conventie `DEFAULT_CONCURRENCY` (`:99-102`) klemt níet en vangt `NaN` niet — precies wat AC2 eist (**M3**); de motivering (geheugen, 20.11) wijst naar het verkeerde geheugen en de verkeerde container (**M1**); en de reden voor 2400 ("groter dan enig beoordeelscherm") gaat voorbij aan het feit dat dit beeld juist bedoeld is om in te zoomen — de echte reden is bytes (**M2**). Getal 2400 zelf is redelijk: gemeten 9,9-15,0 MB per fragment is een verdedigbare bovengrens. |
| **AC3** — fragmentgrootte in de ETag | **nee, niet zoals opgeschreven** | De diagnose klopt (`:79-96`, aangeroepen op `:981`; gelijke ETag → 304 op `:91-93` → oude body). Maar: botst met AC7 op hetzelfde endpoint; de helper is gedeeld met drie andere endpoints waarvan de ETag exact vastgepind is in de suite (`:597`, `:608`, `:638`, `:664`); en de **werkelijke** fragmentgrootte bestaat nog niet op de plek waar de ETag gezet wordt — alleen de geconfigureerde grens. De `?v=`-route uit 20.6 vraagt bovendien een clientwijziging die de story's eigen scope-regel uitsluit. → **H2**. Andere caches nagelopen: browser-HTTP bijt, deck-blobcache bijt (**L3**), service worker en nginx vandaag niet (**L4**). |
| **AC4** — terugrekening blijft identiek | **ja — en de onderbouwing is nu correct** | `VERIFIED`: `left/top/rw/rh` worden op `:1008-1015` berekend vóór `scale` (`:1018`); de header op `:1046` staat in artwork-pixels; de client gebruikt fracties (`MobileReviewDeck.tsx:661-664`). Beide kanten schaal-onafhankelijk, precies zoals de spec nu zegt — review-20-15 M1 is hiermee opgelost. Kanttekening: de test kan daardoor alleen falen als de header-formule zelf verandert; maak hem sterker en voeg een geval toe waarin de grens bijt (**L2**). |
| **AC5** — lijndikte meeschalen | **deels** | De zorg is echt: `stroke-width="3"` absoluut op `:1030`. Meeschalen verstoort de terugrekening níet en de positie evenmin — nagerekend, de overlay is puur visueel (`:1022-1026`). Maar de richting is onbepaald en een 900-geijkte formule maakt de lijn **dunner** voor de meerderheid van de fragmenten, en de witte halo (`:1031-1032`, offsets `−2`/`+4`, dikte 1) wordt niet genoemd. → **M6**. |
| **AC6** — geheugen- en duurmeting bij 900 en 1600 | **nee, niet uitvoerbaar zoals opgeschreven** | Geen representatieve fixture (de suite gebruikt een effen wit 1000 × 800, `:545-549`, met gemockte opslag), geen meetmethode voor "piek" (sharp alloceert buiten de V8-heap, dus `heapUsed` meet niets), en geen faalbare norm. → **M5**. Dat de meting op zich kán: ja — `app.inject` met een echte `sharp`-bron werkt in deze suite (`:543-576`), dus met een concrete opstelling is dit dagwerk. |
| **AC7** — geen regressie; `/marked`, `/crop`, `/source`, `/artwork` behouden 20.6-gedrag | **ja, maar in tegenspraak met AC3** | De vier endpoints en hun helper-aanroepen zijn geverifieerd (`:839`, `:882`, `:913`, `:981`). **Andere afnemers van `/source`: geen** — `VERIFIED` via een repo-brede zoektocht op `review-items`: alleen `MobileReviewDeck.tsx` (via `fetchReviewItemSourceBlob`, `artworkReviewService.ts:196`) raakt `/source`; `ArtworkReviewItemCard.tsx:169` gebruikt `/marked`; de treffers in `bootstrap-run.ts`, `control-cohort.ts` en `workers.ts` zijn commentaarregels, geen aanroepen. Geen ml-service, geen n8n, geen script. De waarschuwing uit review-20-15 M7 ("AC7 raakt álle consumenten van `/source`") is daarmee **negatief beantwoord** — de story mag dat zelf vaststellen in plaats van het open te laten. Wel: de kaderloze tak van `/source` zelf blijft op 1200 (**M4**). |
| **AC8** — RED-bewijs voor AC1 en AC3 | **voor AC3 ja, voor AC1 niet met de bestaande opzet** | De eis is het juiste medicijn en de erfenis uit 20.15-AC9 is hier goed geland. Maar het RED-bewijs voor AC1 vraagt een fixture waarin de grens daadwerkelijk bijt: bbox ≥ 320 px op een artwork ≥ 2000 × 2000. De enige bestaande `/source`-fixture (bbox 80 × 60 op 1000 × 800 → venster 500 × 500) blijft groen bij élke waarde van `TARGET`. → **H1**. |

**Wat de spec goed doet:**

- **Het mechanisme klopt nu.** De correctie op review-20-15 M1 is volledig doorgevoerd en de
  waarschuwing tegen een toegevoegde schaalfactor staat er scherp in. Dit was de hoofdvraag; het
  antwoord is ja.
- **De splitsing uit M7 is netjes uitgevoerd** — eigen bestand, eigen testsuite, expliciete
  onafhankelijkheid van 20.16, en de motivering waarom staat erbij.
- **AC2 heeft nu naam én getal** (review-20-15 M4), en AC8 neemt de RED-bewijseis mee.
- **`/marked` levert al 1600** (`:933`): nagelopen en juist. Ook juist: de overlay-math is
  positioneel correct bij elke `TARGET` (`:1022-1026`).
- **De ETag-diagnose is feitelijk juist** (`:79-96` bevat de fragmentgrootte niet); het bezwaar in
  **H2** gaat over uitvoerbaarheid en samenhang met AC7, niet over de waarneming.

---

## 3. Wat er moet wijzigen vóór dev

1. **H1** — "Wat er nu gebeurt" corrigeren: de begrenzing is `min(5 × bbox, TARGET)`, en voor een
   bbox ≤ 180 px is deze story een no-op. AC1 herformuleren met die conditie erin, en AC8
   dwingend maken over de fixture (bbox ≥ 320 px, artwork ≥ 2000 × 2000, gecentreerd) — anders is
   het RED-bewijs niet te leveren en tekent iemand een groene, effectloze story af. Leg daarbij de
   onderliggende keuze voor: accepteren we dat kleine keurmerken niets merken, of moet de
   `2.5×`-vensermarge op `:1010` mee (andere story)?
2. **H2** — AC3 en AC7 met elkaar in overeenstemming brengen: AC7 expliciet uitzonderen voor
   `/source`, "fragmentgrootte" vervangen door "de **geconfigureerde** grens" (de werkelijke maat
   bestaat niet op `:981`), vastleggen dat de wijziging `/source`-only is zodat de drie exacte
   ETag-asserties (`:597`, `:608`, `:638`, `:664`) groen blijven, en de `?v=`-route schrappen of
   de scope-regel "raakt alleen de serverkant" laten vallen.
3. **M3** — AC2 aanvullen: klemmen op `[1, 2400]` **en** terugvallen op 1600 bij een
   niet-numerieke of ≤ 0 waarde. De aangehaalde conventie (`:99-102`) doet geen van beide, en
   `NaN` degradeert stilzwijgend naar het rauwe multi-MB-artwork via de `catch` op `:1049`.
4. **M1 + M2** — de motivering onder AC2 vervangen door de gemeten kostenpost: bytes per fragment
   (900 → ~1-1,5 MB, 1600 → ~2,5-4,4 MB, 2400 → ~10-15 MB, PNG) in plaats van een verwijzing naar
   de OOM van een andere container. En een keuze maken over het uitvoerformaat: PNG houden met de
   bytes als geaccepteerde kost, of naar JPEG q82 zoals `/marked` (`:954`).
5. **M5** — AC6 uitvoerbaar maken: bronafmeting benoemen, meetmethode (`sharp.cache(false)`,
   `rss`-bemonstering op ~10 ms, `n ≥ 5`, mediaan van piek min basislijn, wandkloktijd van
   `toBuffer()`), en een faalbare norm. Zonder norm is het geen criterium.
6. **M6** — AC5 een formule met ondergrens geven ("nooit dunner dan de huidige 3 px",
   bijvoorbeeld `max(3, round(dispMax / 300))`), de halo-offsets op `:1031-1032` expliciet
   meenemen, en zeggen welke conventie leidend is — die van `/source` (3/1) of die van `/marked`
   (4/6).
7. **M4** — beslissen of de kaderloze tak binnen `/source` (`:1000`, hardgecodeerde 1200) mee
   onder de nieuwe grens komt, en in elk geval de omschrijving "een ánder pad" corrigeren: het is
   de fallback van hetzelfde endpoint.
8. **L1-L5** — kleine reparaties: de regel noemen bij "`TARGET` vervangen" want er zijn er twee
   (L1); AC4 laten asserten dat de `X-Context-Window`-header byte-identiek is bij beide
   grenswaarden, plus een geval waarin de grens bijt (L2); de blob-cache in het deck
   (`MobileReviewDeck.tsx:354-366`) benoemen als reden om na uitrol één keer te verversen (L3); de
   service-worker-regel (`vite.config.ts:38-50`) als open punt noteren voor het geval
   `VITE_API_BASE_URL` naar een `api.*`-host gaat wijzen (L4); en als expliciete niet-risico-regel
   opnemen dat het fragment nergens in de herkenning doorwerkt — `/annotate` snijdt opnieuw uit
   het volledige artwork (`:1244-1260`) en geen enkele andere afnemer roept `/source` aan (L5).

---

## Verificatie-aantekening

**VERIFIED (in de code nagelopen, op `9da6c5f`).** `TARGET = 900` (`:1017`) en de klem
`scale = min(1, …)` (`:1018`); de venstermath `:1008-1015` en dat die vóór `scale` staat; de
header in artwork-pixels (`:1046`) en de fractie-terugrekening (`MobileReviewDeck.tsx:661-664`);
de overlay-math `:1022-1034` inclusief de halo-offsets; de ETag-helper `:79-96` en zijn vier
aanroepen (`:839`, `:882`, `:913`, `:981`); `DEFAULT_CONCURRENCY` `:99-102` (geen klem, geen
NaN-vangnet); `/marked` op 1600 met JPEG q82 (`:933`, `:954`) tegenover `/source` met PNG
(`:1040`); de kaderloze fallback `:998-1002`; `POST /annotate` dat opnieuw uit het volledige
artwork snijdt (`:1244-1260`); de bestaande tests `artwork-pipeline.routes.test.ts:543-576` (bbox
80 × 60) en de vier 20.6-tests met exacte ETag-asserties (`:580-665`); de afnemers van `/source`
(alleen `artworkReviewService.ts:196-212` ← `MobileReviewDeck.tsx:364`); de blob-cache
`MobileReviewDeck.tsx:354-366`; de workbox-regel `vite.config.ts:36-51` en
`constants/index.ts:8`; `nginx.conf:199-205` zonder `proxy_ignore_headers`; en dat story 20.11
over de Python-ml-container ging (`20-11-…md:1-8`).

**VERIFIED (gemeten).** Met de `sharp` uit `node_modules` van deze repository is de exacte
`/source`-math (`:1008-1020`) nagerekend op een synthetisch artwork van 3000 × 4000 voor
bbox-zijden 60/120/180/240/320/480/640 px bij `TARGET` 900, 1600 en 2400 — daaruit komen de
tabel in **H1** en de bytegetallen in **M2**. Daarnaast zijn de 42 PNG's in
`_bmad-output/test-artifacts/nutriscore-crops/` op afmeting uitgelezen (mediaan 269 px langste
zijde; 7/42 ≤ 180 px; 19/42 ≥ 320 px). Het meetscript stond buiten de repository-broncode en is na
gebruik verwijderd; er is niets in het project gewijzigd.

**INFERENCE / gemodelleerd.** De bytegetallen komen van een **ruisrijke synthetische** bron en zijn
daarmee een bovengrens — echt artwork (vlakken, tekst, herhaling) comprimeert in PNG aanzienlijk
beter, dus de absolute MB's liggen in productie lager. De **verhoudingen** tussen 900, 1600 en
2400 en de dimensies zijn exacte math en gelden onverkort. De crop-afmetingen uit
`nutriscore-crops/` zijn een **proxy** voor de bbox-grootte van reviewitems: het is één
codefamilie, en een geoogste crop kan padding rond de bbox bevatten. De richting van **H1**
(een substantieel deel van de items merkt niets) staat los van die proxy — die volgt uit de klem
`scale ≤ 1`.

**NIET geverifieerd.** De werkelijke verdeling van bbox-groottes in de ACC-reviewwachtrij (geen
databasetoegang binnen deze review) — de meting hierboven is een proxy, en het percentage items
dat níets aan deze story heeft is daarmee **niet** vastgesteld; alleen dat de groep bestaat en
niet verwaarloosbaar lijkt. Evenmin geverifieerd: welke reverse proxy daadwerkelijk vóór ACC
staat (`infrastructure/docker/nginx/nginx.conf` is in de repository aanwezig, maar ACC draait via
Coolify — of dáár een proxycache met `proxy_ignore_headers` staat is niet nagegaan). Niet
gedraaid: de api-suite en de web-suites — AC7 is als **formulering** beoordeeld, niet als uitkomst.
En niet gemeten: het daadwerkelijke geheugen van de api-container onder gelijktijdige
`/source`-verzoeken; **M1** leunt op de code (`:995` + `:1036`, twee volledige decodeerslagen) en
op rekenwerk, niet op een productiemeting.
