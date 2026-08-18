# Adversariële CODE-review — Story 20.17 (scherper contextfragment)

```yaml
reviewed: werkkopie (niet gecommit) t.o.v. HEAD 9da6c5f
branch: acc
scope: apps/api/src/api/v1/artwork-pipeline.ts + apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts
verdict: FAIL
severity_count: { high: 1, medium: 4, low: 5 }
```

De kern van de story staat en is aantoonbaar: de klem op 1 is weg, een klein kader levert nu
werkelijk een 3× vergroot fragment, de ETag-variant zit **alleen** op `/source` en de drie andere
endpoints houden hun vastgepinde ETag byte-identiek. Route-suite 59/59, volledige api-suite
1033/1033 groen — beide claims uit het verslag nagedraaid en juist.

FAIL komt van één plek: de "defensieve lezing" uit AC2 is niet defensief. Een lege-met-spatie,
`0` of negatieve omgevingswaarde valt niet terug op de standaard maar op de **ondergrens** — en
levert dan een fragment van 300 px, slechter dan de situatie vóór deze story, zonder enige
melding. Dezelfde klem is bovendien door geen enkele test gedekt: je kunt hem weghalen en de
suite blijft groen.

---

## Bevindingen

### H1 — de defensieve lezing valt terug op de ondergrens, niet op de standaard
`apps/api/src/api/v1/artwork-pipeline.ts:119-142` — **high**

```ts
const parsed = Number(raw);
if (!raw || !Number.isFinite(parsed)) return fallback;
return Math.min(max, Math.max(min, parsed));
```

`!raw` vangt alleen de lege string en `undefined`. Alles wat `Number()` naar een eindig getal
duwt gaat door de klem heen — óók waarden die AC2 "onzinnig" noemt.

**Gemeten** (losse probe met dezelfde functie, `node`, buiten de repository):

| `raw` | `CONTEXT_FRAGMENT_MAX_PX` | `CONTEXT_FRAGMENT_MAX_UPSCALE` |
|---|---|---|
| `""`, `undefined`, `"abc"`, `"1,5"`, `"Infinity"`, `"1600abc"` | 1600 (goed) | 3 (goed) |
| `"0"` | **300** | **1** |
| `"-5"` | **300** | **1** |
| `" "` / `"\t"` (spatie of tab) | **300** | **1** |
| `"9999"` / `"1e9"` | 2400 (goed) | 4 (goed) |

Gevolg van de onderste drie rijen: `CONTEXT_FRAGMENT_MAX_PX=" "` levert een contextfragment van
**300 px** — een derde van wat het endpoint vóór deze story deed — en
`CONTEXT_FRAGMENT_MAX_UPSCALE=0` zet de hele story stil uit (factor 1 = de oude klem terug). Er
is geen log, geen waarschuwing, geen zichtbaar verschil behalve een te klein beeld. Dat is
letterlijk de faalmodus die de spec-review als M3 beschreef ("een typefout in de omgeving werkt
stil door tot in de uitvoer") en die AC2 met "valt terug op de standaard" wilde afsluiten.

Een spatie of een `0` in een Coolify-omgevingsvariabele is geen exotisch geval; dat is de meest
voorkomende manier waarop iemand een instelling "uitzet".

**Wat moet wijzigen:** na de eindigheidstoets ook `parsed <= 0` (of `parsed < min`) op `fallback`
laten uitkomen in plaats van op `min`, en `raw.trim()` gebruiken zodat een whitespace-waarde als
leeg telt. Alleen boven `max` hoort te klemmen — daar is de ingestelde bedoeling wél duidelijk.

### M1 — de twee harde grenzen uit AC2 zijn nergens getest
`apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts:612-638` — **medium**

De twee tests met "AC2" in de naam draaien allebei op de **standaardinstelling** en meten dat de
factor bindt (1500) respectievelijk de pixelgrens (1600). Geen enkele test zet
`CONTEXT_FRAGMENT_MAX_PX` of `-MAX_UPSCALE`, dus geen enkele test raakt de klem op 2400/4 of de
terugval bij een onzinnige waarde.

Nagerekend: vervang de body van `readClampedNumber` door `return Number(raw) || fallback` — de
klem is dan volledig weg — en alle 59 tests blijven groen. De harde grenzen uit AC2, het meest
in het oog springende deel van het criterium, rusten dus uitsluitend op de code-lezing.

Dat de waarden module-constanten zijn maakt dit lastiger, niet onmogelijk: `readClampedNumber`
exporteren en direct testen (drie regels) dekt AC2 volledig en vermijdt `vi.resetModules()`.

### M2 — een bron met alfa wordt door de JPEG-stap zwart, niet wit
`apps/api/src/api/v1/artwork-pipeline.ts:1101-1106` — **medium**

`.jpeg()` op een beeld met alfakanaal doet in sharp een **flatten tegen zwart**, geen
`removeAlpha`. **Gemeten** met de `sharp` uit deze repository (0.33.5): een volledig transparante
RGBA-pixel `(255,0,0,α=0)` komt er als `(0,0,0)` uit; via `.png()` blijft het `(255,0,0,α=0)`.

Dat bron-artwork alfa kán hebben staat in dit bestand zelf, in de `/annotate`-tak: *"Bron-artwork
kan RGBA zijn (PDF-render/PNG met alfa)"* — en daar is bewust `removeAlpha()` gebruikt, dat de
RGB-waarden ongemoeid laat. Op `/source` gebeurt nu het tegenovergestelde: waar het artwork
transparant is, ziet de reviewer voortaan **zwart** in plaats van de doorschijnende achtergrond
die de PNG-tak gaf. Precies op het scherm waar hij een klein keurmerk moet herkennen.

Nuance, en de reden dat dit geen high is: `/marked` doet dit al sinds jaar en dag (`:1002`), dus
dezelfde artworks worden nu al zo getoond op de kaart, en `alpha=False` in de PDF-rasterisatie
(`apps/ml-service/app/services/artwork.py:90`) betekent dat gerasterde PDF-pagina's RGB zijn.
**Niet geverifieerd:** hoeveel van de daadwerkelijke `sourceFile`-objecten in ACC alfa dragen.

**Wat moet wijzigen:** `.flatten({ background: '#ffffff' })` vóór `.jpeg()` (of `removeAlpha()`,
consistent met `/annotate`), plus één regel in het story-record dat dit is nagegaan.

### M3 — de AC5-test meet geen schaal-onafhankelijkheid
`apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts:640-660` — **medium**

Wat de test wél doet is waardevol: hij pint `X-Context-Window` op `[1800,1300,500,500]` in een
geval waarin de schaal 3× is. Wie de header per ongeluk in fragment-pixels gaat uitsturen, wordt
rood. Dat is de echte regressie en die is afgedekt.

Wat de test **niet** doet, terwijl AC5 er expliciet om vraagt ("dezelfde artwork-fracties bij
grens 900, bij 1600 en bij een opgeschaald venster"):

- Er wordt nooit een tweede grenswaarde gedraaid. De grens is een module-constante en de suite
  herimporteert niets, dus "bij 900" is niet getoetst.
- De twee gevallen (`klein` 100 px, `groot` 400 px) hebben **verschillende** kaders en dus
  verschillende vensters. Het is niet hetzelfde item op twee schalen; van `groot` worden alleen
  `W` en `H` bekeken.
- De slotassertie is een tautologie:
  `fractieUitVenster(0.1)` rekent `(kl + 0.1*krw)/kW` uit met `kl=1800, krw=500, kW=4000` en
  vergelijkt dat met de handmatig ingevulde `(1800+50)/4000`. Beide kanten zijn dezelfde som met
  dezelfde getallen; hij kan alleen falen als de assertie drie regels erboven al gefaald is.

**Wat moet wijzigen:** de tautologie vervangen door een echte vergelijking — hetzelfde item bij
twee verschillende grenzen (via een geëxporteerde helper of `vi.resetModules()`) en asserteren
dat de header **byte-identiek** is. Dat is precies wat de spec-review als L2 vroeg.

### M4 — de kostenconclusie uit AC7 is niet houdbaar op dit testartwork
`20-17-scherper-contextfragment.md:129-148` — **medium**

De meting is uitgevoerd zoals AC7 vraagt en het voorbehoud staat er. Maar het voorbehoud dekt de
verkeerde helft. Er staat: *"de absolute kB's liggen in productie hoger. De verhouding tussen oud
en nieuw is wel indicatief."* Juist de **verhouding** is hier fixture-gestuurd: oud is PNG, nieuw
is JPEG, en de PNG/JPEG-verhouding hangt volledig af van hoe vlak het beeld is. Op een effen vlak
comprimeert PNG bijna perfect; de spec-review mat op ruisrijk synthetisch artwork **1,0-1,5 MB**
voor dezelfde 900-px-PNG waar dit verslag **35 kB** noteert — een factor 30 verschil, uitsluitend
door de fixture. De conclusie "bij een groot keurmerk kost het niets extra's — dat is het
JPEG-effect" is daarmee niet gedragen door deze meting (in werkelijkheid onderschat ze de winst
waarschijnlijk fors, maar dat is dan evengoed niet gemeten).

Daarbij: er is geen meetopstelling vastgelegd — geen script, geen aantal herhalingen, geen
machine. Duren van 6 ms tegen 32 ms bij `n=1` zijn niet te onderscheiden van ruis.

**Wat moet wijzigen:** het voorbehoud uitbreiden naar de verhouding (één zin), en de conclusie
"kost niets extra's" terugbrengen tot wat gemeten is, of de meting herhalen op een ruisrijke
bron. Het meetfragment erbij zetten zodat Friso hem kan overdoen.

### L1 — de lijn kan dunner worden dan vandaag
`apps/api/src/api/v1/artwork-pipeline.ts:1085-1088` — **low**. Bij `dispMax = 900` levert de
formule exact `3 / 1 / 2` — het ijkpunt uit AC6 klopt tot op de pixel. Maar de ondergrens is
`max(2, …)`, niet 3. Een fragment kleiner dan 900 px (venster < 300 px langste zijde, dus een
kader tegen de artworkrand of een klein artwork) krijgt `stroke = 2` waar het vandaag 3 is. De
spec-review vroeg als M6 "nooit dunner dan de huidige 3 px"; de herziene AC6 nam die ondergrens
niet over, dus dit is geen AC-overtreding — wel de restrisico dat M6 benoemde.

### L2 — AC6 heeft geen enkele test — **low**. Taak 4 is afgevinkt, maar geen test leest de
SVG-string of de overlay uit. De spec-review noemde dit expliciet als zonder browser toetsbaar.
Een revert van `stroke`/`halo`/`haloGap` naar de vaste 3/1/2 laat de suite volledig groen.

### L3 — 20.6 AC4 wordt bewust doorbroken zonder dat het ergens staat — **low**.
`20-6-marked-crop-revalidatie-cache.md:31` eist "de body/mime van een 200-respons blijft
ongewijzigd". 20.17 verandert de mime van `/source` van PNG naar JPEG. Dat is een legitieme,
gewenste supersede (AC3), maar AC10 van 20.17 noemt alleen "no-cache + zwakke ETag + 304" en
nergens staat dat 20.6 AC4 hiermee deels vervalt. Eén regel in het story-record volstaat.

### L4 — q82 staat nu twee keer los in het bestand — **low**. `CONTEXT_FRAGMENT_JPEG_QUALITY = 82`
(`:144`) naast de literal `82` van `/marked` (`:1002`). AC3 eist juist gelijkheid met `/marked`
("zodat beide weergaven er hetzelfde uitzien"); twee losse getallen kunnen uit elkaar lopen.

### L5 — twee randgevallen nagerekend, allebei onschadelijk — **low**. (a) Bij een kader dat de
artworkrand raakt kan `rx` 0 worden, waardoor de halo op `x = -haloGap` wordt getekend;
**gemeten**: librsvg klipt dat stilletjes, geen fout, alleen een halo die aan die zijde ontbreekt
— hetzelfde als vóór deze story, alleen iets breder. (b) Een venster dat tot 0 wordt afgeknepen
(kader buiten het artwork) laat `extract` gooien ("parameter width not set", gemeten) → de
`catch` serveert de rauwe bron. Dat gedrag is ongewijzigd; het is wel de tak waar het volledige
multi-MB-artwork alsnog over de lijn gaat.

---

## Claim-audit per acceptatiecriterium

| AC | Oordeel | Code-bewijs |
|----|---------|-------------|
| **AC1** — kleine uitsneden opgeschaald | **gedekt** | De klem op 1 is weg (`:1068-1072`); `scale = min(MAX_PX/langste, MAX_UPSCALE)`. Test `:612-623` meet 1500 px bij kader 100 (venster 500). Nagerekend dat dit vóór de wijziging 500 was → het is geen tautologie. |
| **AC2** — twee grenzen, defensief gelezen | **niet gedekt** | Namen en standaardwaarden kloppen (`:132-142`), de klem staat er als code. Maar `0`/negatief/whitespace komt op de **ondergrens** uit i.p.v. de standaard (**H1**, gemeten), en geen enkele test raakt de klem of de terugval (**M1**). De vergelijking met `DEFAULT_CONCURRENCY` is wél netjes vermeden: `Number.isFinite` vangt NaN, dus de stille degradatie naar rauwe bytes uit review-M3 kan niet meer optreden. |
| **AC3** — JPEG i.p.v. PNG | **gedekt, met kanttekening** | `.jpeg({ quality: 82 })` op `:1105`, `reply.type('image/jpeg')` op `:1113`, kwaliteit gelijk aan `/marked`. Getoetst via de aangepaste 12.19-test (`:567`). Kanttekening: alfa → zwart (**M2**), en q82 dubbel gedefinieerd (**L4**). De kaderloze fallback (`:1048`) en de catch-tak (`:1120-1122`) blijven PNG — bewust buiten scope, consistent met de story. |
| **AC4** — instellingen in de ETag, alléén op deze tak | **gedekt** | `VERIFIED`: de variant wordt op precies één plek meegegeven (`:1029`); `:887` (`/artwork`), `:930` (`/crop`) en `:961` (`/marked`) roepen de helper ongewijzigd aan, en de vier vastgepinde `W/"…-<ms>"`-asserties (`test:691,702,722,732,758`) zijn in de diff **niet aangeraakt** en blijven groen. De variant `cf1600x3j82` bevat alleen ETag-veilige tekens en is 11 tekens lang; ook bij een gebroken factor (`cf1600x2.5j82`) blijft dat waar. Bij uitrol met standaardwaarden wijkt de ETag af van de oude, dus een al bezocht item krijgt gegarandeerd een 200. |
| **AC5** — terugrekening blijft identiek | **deels** | De code raakt de header niet: `left/top/rw/rh` staan op `:1060-1063`, vóór `scale` (`:1069`), en `:1111` stuurt ze in artwork-pixels. De test pint ze in een 3×-opgeschaald geval, wat de echte regressie vangt. Maar de gevraagde vergelijking over twee grenzen ontbreekt en de fractie-assertie is een tautologie → **M3**. |
| **AC6** — lijndikte en halo meeschalen | **gedekt in code, ongetest** | `lineScale = dispMax/900` (`:1085`) reproduceert bij 900 exact de oude 3/1/2 — nagerekend, het ijkpunt uit AC6 klopt. Offsets schalen mee (`haloGap`), dus de verhouding blijft. Restrisico's: ondergrens 2 i.p.v. 3 (**L1**), geen test (**L2**). |
| **AC7** — bytes en duur gemeten | **deels** | Uitgevoerd en vastgelegd voor 100/200/400 px, oud tegenover nieuw. Maar de conclusie steunt op een effen synthetisch artwork dat juist de PNG/JPEG-verhouding vertekent, en het voorbehoud dekt alleen de absolute kB's → **M4**. Geen meetopstelling, `n=1`. |
| **AC8** — geheugenrisico benoemd | **gedekt** | Het story-record benoemt de twee decodeerslagen van het volledige artwork als de werkelijke piek, stelt vast dat AC2 die níet begrenst, en corrigeert de 20.11-verwijzing (Python-ml-container). Precies wat review-M1 vroeg. |
| **AC9** — RED-bewijs met geschikte fixture | **gedekt** | De fixture is 4000 × 3000 met kaders van 40/100/400 px — ruim boven de drempel die de spec-review eiste. Het claimde faalbewijs is nagerekend: met de klem op 1 terug levert kader 40 én kader 100 een venster van 500 → beide tests "expected 500 to be 1500" (2 rood), terwijl kader 400 (venster 2000 → 1600) groen blijft. De telling "2 tests rood" klopt dus exact, inclusief welke test níet meebeweegt. Het ETag-faalbewijs klopt eveneens: de regex `/cf\d+x\d+(\.\d+)?j\d+/` faalt zodra de variant weg is. |
| **AC10** — geen regressie | **gedekt** | Zelf gedraaid: `artwork-pipeline.routes.test.ts` **59 passed / 0 failed**; volledige api-suite **1033 passed / 0 failed**. Beide getallen uit het verslag zijn daarmee bevestigd. `private, no-cache` + zwakke ETag + 304 staan ongewijzigd (`:92-97`); alleen de mime van `/source` wijzigt, wat 20.6 AC4 deels superseedt zonder vastlegging (**L3**). |

**Over de aangepaste bestaande test** (`:564-567`, `image/png` → `image/jpeg`): dat is een
eerlijke aanpassing. De assertie is vervangen door de nieuwe waarheid, met de reden erbij, en de
rest van de test — inclusief de vastgepinde `[190, 80, 500, 500]` — is ongemoeid. Er is geen
bewering verzwakt: `toContain('image/jpeg')` is even scherp als het origineel. Dat die test met
kader 80 × 60 groen blijft is geen verzwakking maar precies de tekortkoming die de spec-review
aanwees, en die is met de nieuwe fixture apart afgedekt.

## Wat moet wijzigen vóór PASS

1. **H1** — `readClampedNumber` laten terugvallen op de standaard bij `parsed <= 0` en bij een
   whitespace-waarde (`raw.trim()`), zodat alleen de bovengrens klemt.
2. **M1** — `readClampedNumber` exporteren en direct testen: standaard, lege/onzinnige waarde,
   `0`, negatief, boven de bovengrens. Zonder die test is AC2 een bewering.
3. **M2** — `.flatten({ background: '#ffffff' })` (of `removeAlpha()`) vóór `.jpeg()`, plus een
   regel in het story-record dat de alfa-vraag is nagegaan.
4. **M3** — de tautologische fractie-assertie vervangen door een vergelijking van dezelfde
   `X-Context-Window` bij twee verschillende grenzen.
5. **M4** — het voorbehoud in AC7 uitbreiden naar de verhouding oud/nieuw en de conclusie
   "kost niets extra's" bijstellen tot wat de meting draagt.
6. **L1-L5** — ondergrens van de lijndikte op 3 zetten of het restrisico expliciet aanvaarden;
   een testje op de overlay-SVG; 20.6 AC4 als deels-superseded vastleggen; q82 uit één constante
   laten komen.

## Verificatie-aantekening

**VERIFIED (gedraaid).** `npx vitest run src/__tests__/api/artwork-pipeline.routes.test.ts` →
59/0. `npx vitest run` (volledige api-suite) → 1033/0. Beide op de ongecommitte werkkopie.

**VERIFIED (gemeten, losse probe buiten de repository, sharp 0.33.5 uit `node_modules`).** De
tabel bij **H1** (15 omgevingswaarden door dezelfde functie); de alfa-flatten naar `(0,0,0)` bij
**M2**; dat een overlay met negatieve coördinaten niet gooit maar klipt en dat `extract` met
breedte 0 wél gooit (**L5**). Er is niets in het project gewijzigd; het probescript staat in de
scratchpad.

**VERIFIED (in de code nagelopen).** De vier aanroepen van `sendRevalidatingImageHeaders`
(`:887`, `:930`, `:961`, `:1029`) en dat alleen de laatste een variant meegeeft; dat de vier
vastgepinde ETag-asserties in de testdiff niet zijn aangeraakt; dat `/source` maar één afnemer
heeft (`apps/web/src/services/artworkReviewService.ts:198`, blob + object-URL, geen canvas,
geen mime-afhankelijkheid); dat `POST /annotate` opnieuw uit het volledige artwork snijdt met
`removeAlpha()`, dus dat het fragmentformaat de opgeslagen crop, de referentie en de embedding
niet raakt; en `alpha=False` in de PDF-rasterisatie (`apps/ml-service/app/services/artwork.py:90`).

**NIET geverifieerd.** Hoeveel `sourceFile`-objecten in ACC daadwerkelijk een alfakanaal dragen
(geen opslagtoegang binnen deze review) — **M2** rust op het mechanisme plus de eigen
codecommentaar bij `/annotate`, niet op een telling. Evenmin: het gedrag in een echte browser
(geen visuele toets van de vergrote weergave of de meegeschaalde lijn), de daadwerkelijke
byte-omvang op productie-artwork, en het geheugen van de api-container onder gelijktijdige
`/source`-verzoeken.
