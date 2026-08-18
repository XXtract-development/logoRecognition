# HER-REVIEW code — Story 20.16 (beoordeelscherm: alle bediening in beeld, beeld niet afgekapt)

```yaml
verdict: FAIL
soort: her-review (toetst review-20-16-code.md tegen de huidige werkkopie)
reviewed: werkkopie (niet gecommit)
baseline: 5e94b2d
branch: acc
scope: >
  apps/web/src/components/review/MobileReviewDeck.tsx,
  apps/web/src/components/review/ImageStage.tsx,
  apps/web/src/components/review/MobileReviewDeck.fillviewport-20-14.test.tsx,
  apps/web/src/pages/ArtworkReviewPage.test.tsx,
  tests/e2e/review-deck-layout.spec.ts, tests/e2e/helpers/review-deck.ts, versions.md,
  _bmad-output/implementation-artifacts/20-16-beoordeelscherm-opmaak.md
resterend: { high: 0, medium: 3 (deels), low: 3, nieuw: 3 }
```

**De twee highs zijn écht dicht, en dat is zelf nagemeten — niet overgeschreven uit het
story-record.** De vloer van 400 px houdt bij vensterhoogte 700 zónder dat de test een `resize`
afvuurt, en de tekenzone omsluit het beeld exact bij drie bronformaten. Dat is de eerste keer in
dit dossier dat een claim over dit scherm de eigen meting overleeft.

**FAIL op wat eromheen is blijven staan, en dat is geen vormkwestie.** AC10 van deze story is
letterlijk *"het onjuiste commentaar gaat weg"*; er staan nog drie onjuiste passages, waarvan één
(`ImageStage.tsx:44-46`) woordelijk de zin is die de vorige review als M2 citeerde. AC4 en taak 3
beschrijven nog steeds een mechanisme (`minHeight` op `deck-stage-frame`) dat de implementatie
bewust NIET gebruikt, met taak 3 afgevinkt. En de tweede helft van H2 — de regressietest die een
kader op vaste coördinaten tekent en de doorgegeven fracties vergelijkt — is niet geleverd en
wordt in het record niet gemeld. Het record schrijft "Mediums, alle verwerkt"; drie ervan zijn
deels verwerkt.

---

## Status per oorspronkelijke bevinding

| # | Bevinding | Status | Bewijs |
|---|---|---|---|
| **H1** | Vloer van 400 px hield alleen ná een kunstmatige `resize` | **VERWERKT** | `tests/e2e/helpers/review-deck.ts:306` — `forceerHermeting = false` als default; alleen de wedloop-test zet hem aan (`spec:206`). Twee schone browserruns (`4 passed` elk): `klein.json` `stageFrameHeight: 400` bij `viewportHeight: 700`, `stabielNa: 2`. Eigen probe: vier metingen over 5 s bij venster 700 → `400, 400, 400, 400`. Injectie van een rij van 60 px ín de kaart ná de meting → **400** (was 340 in de vorige review): de nieuwe observer op `deck-stage-frame` (`MobileReviewDeck.tsx:242-244`) vangt het |
| **H2** | Tekenzone veel groter dan het beeld; kader stil bijgeknipt | **VERWERKT** (op één punt DEELS) | `ImageStage.tsx:281-303` — centreerlaag met `flex: 1`; de tekenzone (`wrapRef`, `:305-341`) krimpt om het beeld. Gemeten zone/beeld: **396/396** (venster 1000, bron 1600×1200), **374/374** (venster 700), **180/180** (bron 240×180). Rechthoeken zijn identiek: zone `t 561,5 b 741,5 l 600 r 840` = beeld idem. Sleep die 20 px bóven het beeld in het grijze beeldvenster begint levert **nul** kaders. **DEELS:** de door H2 geëiste regressietest op de doorgegeven fracties bestaat niet (`onConfirmBox` wordt alleen in jsdom getoetst, waar er geen lay-out is) |
| **M1** | Commentaar belooft een vloer die er niet staat | **DEELS** | Commentaar hersteld en nu juist (`MobileReviewDeck.tsx:1317-1320`). Maar **AC4** (`20-16-…:72`, "Deze grens landt op `deck-stage-frame` (`minHeight`)") en **taak 3** (`:141`, `[x]` "ondergrens naar `deck-stage-frame`") beschrijven nog het verworpen mechanisme. De review eiste dit expliciet ("AC4/taak 3 in overeenstemming brengen") |
| **M2** | Commentaren beweren dat beide helften nodig zijn | **DEELS** | `MobileReviewDeck.tsx:1325-1327` herschreven. Maar `ImageStage.tsx:44-46` bevat nog woordelijk *"Alleen de begrenzing repareren is niet genoeg — de ouder moet de root óók laten uitrekken (`alignItems: 'stretch'`), anders verandert er nog steeds niets."* Zie ook N1: die bewering is nu aantoonbaar onjuist |
| **M3** | AC11 niet geleverd | **VERWERKT** | `ArtworkReviewPage.test.tsx:141` (alinea weg zodra het deck er staat) en `:154` (blijft bij lege wachtrij) |
| **M4** | `tsc --noEmit` niet schoon | **VERWERKT** | `cd apps/web && npx tsc --noEmit` → exit 0, geen uitvoer |
| **M5** | Vangnet van `measureDeck` stomp; commentaar verouderd | **DEELS** | Vangnet hersteld: `review-deck.ts:366-372` neemt de laagste onderkant over **alle** afstammelingen; de veeg-hint staat binnen de kolom (`MobileReviewDeck.tsx:1536-1543`) en zou dus wél gezien worden. Maar `deckRoot` is nog steeds `cardEl.parentElement` (`:360`), dus iets dat als zusje náást de kolom terugkomt blijft onzichtbaar. En de twee verouderde commentaren staan er nog: de docstring `:291-300` ("meet zijn hoogte in een effect bij het monteren … story 20.16 (AC7) moet de hermeting zelf repareren") en de verwijzing naar `MobileReviewDeck.tsx:1371`/`:1385` op `:356` |
| **M6** | AC1 en AC3 nergens geasserteerd | **VERWERKT** | `review-deck-layout.spec.ts:123-127` (`controlsBelowCard ≤ 70`; gemeten 68) en `:129-141` (`deck-column.contains(deck-accept/deck-relabel-open)`) |
| **L1** | `columnHeight` vlag én waarde, geen ondergrens-guard | **NIET** | `MobileReviewDeck.tsx:1134` nog `Math.max(columnHeight, 0)`; `setColumnHeight` (`:202`) dwingt geen eigen ondergrens af. Niet geclaimd in het record |
| **L2** | Eerste meting telt de mobiele extra's mee | **DEELS (effectief opgelost in de browser)** | Het narekenen (`:212-215`) plus de drie observers corrigeren het: gemeten eindstand 400 bij venster 700, `stabielNa: 2`. In jsdom, zonder `ResizeObserver`, blijft de overschatting staan |
| **L3** | `versions.md` overdrijft | **VERWERKT** | De zin "de vrijgekomen ruimte gaat naar het etiket" is weg; `versions.md:11-14` zegt nu "zonder dat het vak voor het etiket veel kleiner wordt". Feitelijk (490 → 422) net houdbaar |
| **L4** | Icoonknop niet vindbaar zonder tooltip | **NIET** | `MobileReviewDeck.tsx:1497-1510` ongewijzigd; `aria-label` + `title` staan er, de UX-afweging is niet voorgelegd. Niet geclaimd |
| **L5** | Verouderd commentaar bij de meting | **NIET** | `MobileReviewDeck.tsx:153-156` nog steeds *"Story 20.14 — de kaart vult de ruimte … We MÉTEN waar de kaart begint"*, terwijl de meting naar de kolom is verhuisd. Stond in de PASS-lijst van de vorige review (punt 3) |

---

## Nieuwe bevindingen, ontstaan door de verwerking

### N1 — de beeldbegrenzing hangt volledig aan de gemeten pixelwaarde; de twee "helften" zijn inert — **medium**
`ImageStage.tsx:255-283` (`availableHeight`), `:44-46`, `MobileReviewDeck.tsx:1325-1327`

**VERIFIED (eigen probe, venster 1000, bron 1600×1200):** de basisstand is beeldvenster 422 /
beeld 396 / zone 396. Zet je daarna live `alignItems` van `deck-stage-frame` terug op `center`, óf
de `height: 100%` van de ImageStage-root op `auto`, óf allebei, dan verandert er **niets** —
396/396 blijft 396/396. Reden: de grens is sinds de verwerking een **pixelwaarde** die de
component zelf meet, en die is niet meer van die twee opmaakregels afhankelijk. De commentaren op
beide plekken beweren nog het tegendeel. Dat is dezelfde soort onjuistheid als M2, in een nieuwe
gedaante — en het is de leesbron voor wie hierna aan deze laag komt.
*(Voorbehoud: dit is een live DOM-omkering, geen bronomkering; een echte revert zou de meting van
`availableHeight` vanaf het begin anders laten uitvallen. Dat verandert niets aan het feit dat het
commentaar het huidige mechanisme verkeerd beschrijft.)*

### N2 — het narekenen heeft geen totaalplafond; alleen de 1-px-guard stopt een lus — **low**
`MobileReviewDeck.tsx:212-215, 195-200, 227-232`

`passesRef` is begrensd op 4, maar élke ResizeObserver-melding zet hem terug op 0. De enige
werkelijke rem is `lastAppliedRef`: verschilt de nieuwe uitkomst ≤ 1 px, dan gebeurt er niets. Twee
uitkomsten die meer dan 1 px uit elkaar liggen en elkaar afwisselen zouden dus onbeperkt kunnen
blijven rondgaan. **Niet waargenomen:** vier metingen over 5 s bij venster 700 gaven alle vier 400,
en in de console stond geen enkele `ResizeObserver loop`-melding (20 console-fouten, alle
`ERR_CONNECTION_REFUSED` van niet-gestubde endpoints). Het is een theoretisch risico, geen gemeten
gebrek — maar de rem verdient een expliciet plafond.

### N3 — `availableHeight === 0` valt stil terug op de prop — **low**
`ImageStage.tsx:285` — `fill && availableHeight ? availableHeight : maxHeight`. Meet de
centreerlaag even 0 (montage, verborgen tab), dan begrenst het beeld zich op `64vh` in plaats van
op de restruimte. De veilige kant op, maar stilzwijgend.

### Toegankelijkheid van de centreerlaag: geen bezwaar gevonden
De laag is een presentatie-`div` zonder rol, tabindex of aria-eigenschappen (`ImageStage.tsx:284-303`).
De `data-image-stage`-marker erop is nodig (`MobileReviewDeck` bepaalt de swipe-uitsluitingszone met
de dichtstbijzijnde voorouder die het attribuut draagt) en de bijbehorende suite
`MobileReviewDeck.touch-20-3.test.tsx` is groen. Geen dubbele focus, geen naamgevingsprobleem.

---

## Klopt het story-record?

| Claim in "Code-review verwerkt" / "Eindstand" | Oordeel |
|---|---|
| "`forceerHermeting` staat standaard uit" | **klopt** (`review-deck.ts:306`) |
| "drie runs achter elkaar 400 px bij vensterhoogte 700, zonder duwtje" | **klopt.** Twee volledig schone runs hier (`4 passed`, `4 passed`) plus vier probe-metingen: alle 400. Een derde run mislukte alleen op een opstart-time-out van de dev-server (`Test timeout … while setting up "page"`), niet op een assertie |
| "zone 396 bij beeld 396, 180 bij 180, 374 bij 374" | **klopt**, exact gereproduceerd |
| "68 px onder de kaart", "laagste 985 / 963" | **klopt** |
| "Vitest 71 passed / 0 failed" | **klopt** (10 bestanden, 71 tests) |
| "`tsc --noEmit`: schoon" | **klopt** (exit 0) |
| "Mediums, alle verwerkt" | **te mooi.** M1, M2 en M5 zijn elk maar deels verwerkt (zie tabel) |
| "De tekenzone-grens kreeg géén sluitend faalbewijs" | **eerlijk gemeld, maar te pessimistisch.** Eigen probe: draai de centreerlaag terug bij een bron van 240×180 en de tekenzone springt van **180 naar 396** bij een beeld van 180 — precies de assertie op `spec:167-172` wordt dan rood. Het faalbewijs bestáát; het is met de grote bron gezocht, waar zone en beeld toevallig samenvallen |
| De drie wél geleverde faalbewijzen | **niet opnieuw uitgevoerd** (vraagt om de code terugdraaien). Wel gecontroleerd dat de drie asserties die ze noemen werkelijk bestaan en faalbaar zijn: `spec:115-120` (ondergrens 400), `:123-127` (≤ 70 px), `:88-94` (beeld ≤ beeldvenster) |
| Niet gemeld in het record | L5, L1 en L4 onaangeroerd; AC4/taak 3 nog tegenstrijdig; de twee verouderde commentaren in `review-deck.ts`; de door H2 geëiste bbox-regressietest ontbreekt |

---

## Wat moet wijzigen vóór PASS

1. **AC10 werkelijk halen** — drie onjuiste passages weg: `MobileReviewDeck.tsx:153-156` (L5),
   `ImageStage.tsx:44-46` (M2/N1), `MobileReviewDeck.tsx:1325-1327` (N1). Beschrijf wat de code
   nú doet: de grens is een door `ImageStage` gemeten pixelwaarde.
2. **AC4 en taak 3 in overeenstemming brengen** met het gekozen mechanisme (de vloer zit in de
   meting, niet als `minHeight` op `deck-stage-frame`). Of de AC herschrijven met reden, of hem
   expliciet intrekken — niet afvinken wat niet gebouwd is.
3. **De regressietest uit H2 alsnog schrijven**: teken een kader op vaste coördinaten in de
   browser en vergelijk de doorgegeven fracties met de verwachte. Dat was de helft van H2 die niet
   over opmaak gaat maar over wat er in de database landt.
4. **`review-deck.ts` bijwerken**: de docstring `:291-300` en de verwijzing `:356`; en overweeg
   `deckRoot` op `mobile-review-deck` te zetten in plaats van op de kolom.
5. **Het faalbewijs voor de tekenzone alsnog opnemen** — het bestaat (zie hierboven, met de kleine
   bron) en maakt de eerlijke maar te sombere aantekening overbodig.
6. **N2/N3, L1** — een totaalplafond op het narekenen, een expliciete ondergrens in
   `setColumnHeight`, en de 0-terugval in `ImageStage` benoemen of afvangen.

---

## Verificatie-aantekening

**VERIFIED (zelf uitgevoerd op de werkkopie, 2026-08-18, Chrome via `pw-lokaal.config.ts`,
dev-server 5173).**
`npx playwright test --config=<scratchpad>/pw-lokaal.config.ts` → **2× 4 passed / 0 failed**
(een eerdere run gaf 3 passed / 1 failed op een opstart-time-out van de dev-server, geen assertie);
metingen in `test-results/review-deck-metingen/*.json`: laptop 422/396/985/917/zone 396,
klein (700) **400**/374/963/895/zone 374, kleine-bron 422/180/zone 180, wedloop 400/400/400.
`cd apps/web && npx vitest run src/components/review src/pages/ArtworkReviewPage.test.tsx` →
**71 passed / 0 failed** (10 bestanden). `npx tsc --noEmit` → **exit 0**.
Eigen probes (buiten de repo, `<scratchpad>/rev2/`): rust bij venster 700 → 400/400/400/400;
rij van 60 px in de kaart geïnjecteerd → **400**; sleep 20 px boven het beeld → **0 kaders**;
zone- en beeldrechthoek identiek; `alignItems`/roothoogte live teruggedraaid → geen verschil;
centreerlaag teruggedraaid bij bron 240×180 → zone **396** bij beeld **180**;
console: 20 fouten, alle `ERR_CONNECTION_REFUSED`, **geen** `ResizeObserver loop`-melding.

**NIET geverifieerd.** De drie faalbewijzen van AC12 zijn niet opnieuw uitgevoerd (dat vraagt om
het terugdraaien van de fix in de bron; ik heb buiten dit reviewbestand niets in de repo
gewijzigd). Verder niet gemeten: ACC of productie, echt touch in een browser (alleen jsdom plus de
structurele vergelijking), browsers zonder `ResizeObserver`, de api-suite (het record claimt 1033
passed; niet gedraaid), gedrag bij zoom > 1 gecombineerd met pannen (daar kan `clamp01` nog steeds
stil bijknippen — dat is bestaand gedrag van vóór 20.16, geen regressie van deze story), en de
werkelijke bronresoluties van crops in productie. `npx playwright install` is **niet** gedraaid;
alle browsertests liepen op de geïnstalleerde Google Chrome.
