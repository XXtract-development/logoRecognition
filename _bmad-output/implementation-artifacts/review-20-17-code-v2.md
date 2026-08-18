# HER-review CODE — Story 20.17 (scherper contextfragment)

```yaml
verdict: FAIL
type: her-review (toetst review-20-17-code.md, verdict FAIL 1 high / 4 medium / 5 low)
reviewed: HEAD 5e94b2d, branch acc — implementatie zit in commit 7711900, werkkopie schoon
scope: apps/api/src/api/v1/artwork-pipeline.ts + apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts
      + 20-17-scherper-contextfragment.md ("Code-review verwerkt")
status: H1 + M1 + M2 + M3 werkelijk verwerkt en met faalbewijs gedekt.
        M4 deels (tegenstrijdige zin blijft staan), L2/L3/L4 niet aangeraakt.
```

De code is in orde. De high en drie van de vier mediums zijn niet alleen gerepareerd maar ook
**mutatie-getoetst**: ik heb elke reparatie teruggedraaid en gemeten dat er een test rood wordt.
FAIL komt uitsluitend van de boekhouding: M4 is half verwerkt en laat een zin staan die het
tegenovergestelde beweert van de alinea erboven, en drie lows zijn niet aangeraakt terwijl de
vorige review ze onder "Wat moet wijzigen vóór PASS" zette. Dat is samen ongeveer tien minuten
werk plus één testje.

---

## Bevindingenmatrix

| # | Bevinding | Status | Bewijs |
|---|---|---|---|
| **H1** | Defensieve lezing valt terug op ondergrens | **VERWERKT** | `artwork-pipeline.ts:133-136` — `raw.trim() === ''` én `parsed <= 0` gaan naar `fallback`. 12 rommelwaarden endpoint-breed gemeten, allemaal 1500 px (zie hieronder). |
| **M1** | Klem uit AC2 nergens getest | **VERWERKT** (bovengrens) | Test `:683-699` pint 2400 px en 4x. **Mutatie A**: `return Math.min(max, Math.max(min, parsed))` → `return parsed` ⇒ **1 rood** ("expected 4000 to be 2000"). Gat: de ONDERgrens blijft ongetest (**N5**). |
| **M2** | Alfa wordt zwart i.p.v. wit | **VERWERKT** | `.flatten({ background: '#ffffff' })` op `:1125`; test `:723-756`. **Mutatie C** (regel eruit) ⇒ rood met exact `{r:0,g:0,b:0}`. Los nagemeten met sharp 0.33.5: zonder flatten `0,0,0`, met flatten `255,255,255`. |
| **M3** | AC5-test meet geen schaal-onafhankelijkheid | **VERWERKT** | Nieuwe test `:701-721`: hetzelfde kader (400 px) bij `MAX_PX=900` én `1600`, fragment aantoonbaar 900 vs 1600 px, header identiek. **Mutatie D** (header in fragment-pixels) ⇒ rood: `'540,315,900,900,…'` ≠ `'960,560,1600,1600,…'`. Echte invariant, geen tautologie. |
| **M4** | Kostenconclusie AC7 niet houdbaar | **DEELS** | Het voorbehoud is uitgebreid en "kost niets extra's" is bijgesteld (`20-17…md:132-139`). Maar de slotregel `:141-143` zegt nog steeds *"De verhouding tussen oud en nieuw is wel indicatief"* — precies de bewering die M4 als niet-gedragen aanwees, nu in tegenspraak met de alinea drie regels erboven. En de gevraagde meetopstelling (script/herhalingen/machine) ontbreekt nog; nog steeds n=1. |
| **L1** | Lijn kan dunner worden dan 3 px | **VERWERKT** | `:1102` `Math.max(3, …)`. |
| **L2** | AC6 heeft geen enkele test | **NIET** | Geen test leest `stroke`/`halo`/`haloGap` of de overlay-SVG. **Mutatie E** (`Math.max(3,` → `Math.max(2,`) ⇒ **63/63 groen**; L1's reparatie is dus zelf onbeschermd. |
| **L3** | 20.6 AC4 (mime ongewijzigd) wordt doorbroken zonder vastlegging | **NIET** | Story-record noemt 20.6 alleen als *"cache-gedrag dat intact blijft"* (`:99`, `:251`); nergens staat dat de mime-eis van 20.6 AC4 door AC3 vervalt. |
| **L4** | q82 twee keer los gedefinieerd | **NIET** | `CONTEXT_FRAGMENT_JPEG_QUALITY = 82` (`:140`) wordt alleen door `/source` (`:1126`) gebruikt; `/marked` houdt de literal `82` (`:1020`), `/artwork` idem (`:921`). |
| **L5** | Twee onschadelijke randgevallen | **n.v.t.** | Was informatief, vroeg geen wijziging. |

### H1 — uitgetest met de gevraagde waarden

Endpoint-breed (tijdelijk de rommel-lijst in test `:662` uitgebreid, daarna teruggezet — bestand
byte-identiek): `' '`, `''`, `'abc'`, `'0'`, `'-5'`, `'2,5'`, `'1600px'`, `'\t'`, `'Infinity'`,
`'-0.5'`, `'  '`, `'NaN'` → **allemaal 1500 px** (standaard 1600/3x), **63/63 groen**. De suite
zelf dekt hiervan de eerste vijf.

De twee waarden die géén terugval horen te zijn, gemeten op de functie zelf:

| `raw` | `MAX_PX` | `MAX_UPSCALE` | correct? |
|---|---|---|---|
| `'1e9'` | 2400 | 4 | ja — bovengrens klemt, geen terugval |
| `'  1600  '` | 1600 | 4 | ja — `Number()` trimt zelf, spaties eromheen bederven een geldige waarde niet |

Het story-record claimt "vijf soorten rommel"; de werkelijkheid is ruimer dan de claim.

## Nieuwe bevindingen

**N1 — de volledige api-suite is op standaard-timeouts niet betrouwbaar groen — medium.**
Twee losse runs gaven **5** respectievelijk **17** rode tests, telkens andere bestanden, uitsluitend
`Test timed out in 5000ms` / `Hook timed out in 10000ms` plus één `Method 'POST' already declared`.
Met `--testTimeout=30000 --hookTimeout=40000`: **1037 passed / 0 failed** — exact het getal uit het
verslag. Géén van de rode tests zat in 20.17, en de route-suite is in alle runs 63/63. Dit is dus
bestaande flakiness op deze machine, niet iets wat 20.17 introduceert. Het verslag noteert echter
kaal "1037 passed / 0 failed" zonder die voorwaarde; op deze hardware is dat niet na te draaien
zoals het er staat.

**N2 — het per-verzoek lezen van de omgeving: kosten verwaarloosbaar, ETag-vingerafdruk stabiel.**
`contextFragmentSettings()` draait twee keer per `/source`-verzoek (`:1047` voor de ETag, `:1087`
voor de schaal). Kosten: twee `Number()`-aanroepen — niet meetbaar naast een sharp-render. De
vingerafdruk kán alleen binnen één verzoek uiteenlopen als de omgeving tússen die twee aanroepen
verandert (er zit een `await downloadTrainingObject` tussen); in een draaiend proces gebeurt dat
niet, en het is precies wat de tests toetsbaar maakt. Geen actie.

**N3 — de ETag-variant zit nog steeds ALLEEN op `/source`.** `VERIFIED`: `:905` (`/artwork`),
`:948` (`/crop`) en `:979` (`/marked`) roepen de helper zonder vierde argument aan, alleen `:1047`
geeft de variant mee. De vier vastgepinde `W/"…-<ms>"`-asserties (test `:787`, `:798`, `:818/828`,
`:854`) zijn sinds 9da6c5f **niet aangeraakt** en groen. In de hele testdiff sinds 9da6c5f is
precies één regel verwijderd: `image/png` → `image/jpeg`, mét reden erbij.

**N4 — de alfa-reparatie is niet doorgetrokken — low.** Binnen `/source` zit geen tweede
alfa-lek: de kaderloze tak (`:1066`) en de catch (`:1141-1143`) blijven PNG respectievelijk rauw.
Maar `/marked` (`:1020`) en `/artwork` (`:921`) doen nog steeds `.jpeg()` zonder `flatten` op
hetzelfde soort bron. De vorige review noemde `/marked` bewust buiten scope; nu M2 is gerepareerd
is dat een inconsistentie in één bestand: dezelfde doorzichtige bron wordt op `/source` wit en op
`/marked` zwart.

**N5 — alleen de bovengrens is getest, de ondergrens niet — low.** **Mutatie B**
(`Math.max(min, parsed)` eruit) ⇒ **63/63 groen**. `CONTEXT_FRAGMENT_MAX_PX=50` zou dan 50 px
opleveren in plaats van de bedoelde 300. Klein, want het vereist een bewuste onzinnige instelling
die wél een geldig getal is.

## Wat moet wijzigen vóór PASS

1. **M4** — de slotzin *"De verhouding tussen oud en nieuw is wel indicatief"* schrappen of
   omkeren; hij spreekt de alinea erboven tegen. En het meetfragment (script + aantal
   herhalingen + machine) erbij, zodat de meting overdoenbaar is.
2. **L3** — één regel in het story-record: 20.6 AC4 ("body/mime van een 200 blijft ongewijzigd")
   vervalt voor `/source` door AC3.
3. **L4** — `/marked` en `/artwork` de constante `CONTEXT_FRAGMENT_JPEG_QUALITY` laten gebruiken
   in plaats van de losse `82`.
4. **L2** — één test op de overlay (bijvoorbeeld: bij een fragment van 900 px is `stroke` 3, bij
   1600 px is hij dikker), zodat L1's ondergrens niet stil terug kan.
5. **N4 / N5** — óf meenemen, óf expliciet als aanvaard restrisico in het story-record.

## Verificatie-aantekening

**VERIFIED (gedraaid, HEAD 5e94b2d, schone werkkopie).**
`npx vitest run src/__tests__/api/artwork-pipeline.routes.test.ts` → **63 passed / 0 failed**.
Volledige api-suite met verhoogde timeouts → **1037 passed / 0 failed**; op standaard-timeouts
twee keer rood (5 en 17, allemaal timeouts, zie **N1**).
`npx tsc --noEmit -p apps/api/tsconfig.json` → schoon.

**VERIFIED (mutatie-getoetst).** Vijf mutaties, elk apart aangebracht en daarna teruggezet;
`shasum` van beide bestanden vóór en ná identiek (`01c34382…`, `8edc14ec…`), `git status` schoon.

| Mutatie | Gevolg |
|---|---|
| A — bovenklem eruit (`return parsed`) | 1 rood (AC2-bovengrenzen) |
| B — alleen ondergrens eruit | **groen** → **N5** |
| C — `.flatten()` eruit | 1 rood, exact `{r:0,g:0,b:0}` |
| D — header in fragment-pixels | 3 rood, waaronder de nieuwe 900/1600-test |
| E — `stroke` ondergrens 3 → 2 | **groen** → **L2** |

**VERIFIED (losse probe, sharp 0.33.5 uit `node_modules`).** Alfa zonder `flatten` → `(0,0,0)`,
met `flatten` → `(255,255,255)`. De functie `readClampedNumber` woordelijk gekopieerd en met 13
waarden gedraaid.

**NIET geverifieerd.** Het beeld in een echte browser (geen visuele toets van de vergrote weergave
of de meegeschaalde lijn); de byte-omvang op productie-artwork (**M4** blijft daarmee onbewezen in
beide richtingen); hoeveel `sourceFile`-objecten op ACC werkelijk alfa dragen; het geheugengebruik
van de api-container onder gelijktijdige `/source`-verzoeken; en of de flakiness uit **N1** ook op
CI optreedt of alleen op deze machine.
