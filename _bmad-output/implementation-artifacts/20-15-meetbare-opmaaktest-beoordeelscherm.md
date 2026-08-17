# Story 20.15: Een test die de opmaak van het beoordeelscherm écht meet

Status: review

<!-- Deel C van de splitsing uit review-20-15.md (M7). Volgorde: C (deze story) -> A (20.16
opmaak) -> B (20.17 bronresolutie). C staat voorop omdat A niet aantoonbaar is zolang niemand
pixels kan meten — dat is precies waarom 20.12 en 20.14 zijn afgetekend terwijl het gedrag
niet klopte. -->

## Story

Als **ontwikkelaar die het beoordeelscherm aanpast**
wil ik **een test die de werkelijke gerenderde afmetingen meet**
zodat **een opmaakclaim niet groen kan zijn terwijl het scherm stuk is — twee keer eerder
gebeurd.**

## Waarom deze story vóór de reparatie komt

`VERIFIED` (review-20-12-code.md, H2): met `DECK_MAX_IMAGE_HEIGHT` terug op `'64vh'` én
`maxWidth` terug op `880` — de héle gedragswijziging van story 20.12 teruggedraaid — bleven
**alle 63 tests groen**, inclusief de vier nieuwe. De tests konden alleen vaststellen dát een
waarde werd doorgegeven.

De oorzaak is de testomgeving: **jsdom en happy-dom doen geen layout.** `offsetHeight`,
`getBoundingClientRect()` en alles wat van een echte lay-out afhangt geven daar nul terug. Een
opmaakclaim is er dus principieel niet te toetsen — niet door beter je best te doen.

`VERIFIED` (review-20-15.md, H3): de bestaande Playwright-opzet brengt ons niet bij een
gerenderde kaart. Geen enkele test in `tests/e2e/` raakt het beoordeelscherm,
`tests/e2e/helpers/` is leeg, er is geen inlog-voorziening, en `tests/e2e/reference-library.spec.ts`
staat volledig op `test.skip` met exact deze reden: het vraagt een draaiende stack plus geseede
data. Het beoordeelscherm heeft daarbovenop een ingelogde beheerder én minstens één
reviewitem met uitsnede en kader nodig, anders toont de pagina een lege staat in plaats van het
deck.

## Gekozen route: stubben, niet seeden

Van de drie routes uit review-20-15 H3 — (a) e2e met inlog en geseede data, (b) een
harnaspagina die alleen de deck-structuur mount met vaste stubs, (c) een meetscript in Chrome —
kiest deze story **(b), uitgevoerd binnen Playwright**: de echte applicatie in een echte
browser, met de netwerkantwoorden onderschept (`page.route`), zodat er geen backend, geen
database en geen inlog nodig is.

Waarom niet (a): dat is een eigen infrastructuurtraject en het is precies de reden dat de
bestaande reviewtest al een jaar geskipt is. Waarom niet (c): een script buiten de repository
bewijst niets bij de volgende wijziging — het is geen test.

De prijs van (b) is eerlijk te noemen: we meten de **echte componenten in een echte
lay-outmotor**, met **verzonnen gegevens**. Een fout die alleen bij echte data optreedt (een
extreem smal artwork, een ontbrekend kader) valt hier buiten. Die grens hoort in de test zelf
gedocumenteerd.

## Acceptatiecriteria

1. **Er is een testopzet die het beoordeelscherm in een echte browser toont.** Given een schone
   werkkopie zonder draaiende backend, when de nieuwe Playwright-test draait, then rendert het
   deck met minstens één kaart, inclusief beeld, en zonder inlog of database.

2. **De opzet is herbruikbaar, niet eenmalig.** De stubs (reviewitems, uitsnede-afbeelding,
   kaderbeeld, contextfragment) staan in een gedeelde hulpmodule onder `tests/e2e/helpers/`,
   met per antwoord een instelbare afbeeldingsgrootte — 20.16 en 20.17 hebben allebei een
   ánder formaat nodig om hun eis te kunnen aantonen.

3. **De test meet, hij inspecteert niet.** Ten minste deze grootheden worden uit de echte
   lay-out gelezen en als getal vastgelegd: de hoogte van het beeldvenster, de onderkant van de
   laagste beslisknop, de vensterhoogte, en de gerenderde hoogte van het `<img>`.

4. **De nulmeting van vandaag staat erin, met de fout erin.** De test legt de **huidige**
   (kapotte) waarden vast op de twee vensterhoogtes 1000 en 700, zodat 20.16 aantoonbaar iets
   verandert. Dit is expliciet géén goedkeuring van die waarden: het bestand markeert ze als
   nulmeting die in 20.16 vervangen wordt.

5. **Bewijs dat de test kán falen.** Toon in het story-record aan dat de meting rood wordt bij
   een kunstmatige verslechtering (bijvoorbeeld het beeldvenster op een vaste kleine hoogte
   zetten). Een test die niet kan falen, is precies wat we hier repareren.

6. **De opzet draait zonder handwerk.** Eén commando, gedocumenteerd in het story-record, dat
   op een schone werkkopie slaagt. Draait hij alleen met een lokale backend, dan is AC1 niet
   gehaald.

7. **Geen regressie.** De bestaande vitest-suites blijven ongemoeid; deze story voegt alleen
   toe. `playwright.config.ts` mag uitgebreid worden, maar de bestaande uitsluitingen blijven
   staan zoals ze zijn.

## Open punt dat hier hoort, niet in 20.16

`apps/web/vitest.config.ts:16` zet `environment: 'jsdom'` en `apps/web/vite.config.ts:142` zet
`environment: 'happy-dom'` — twee configuraties die elkaar tegenspreken (review-20-15, L6). Voor
deze story maakt het niet uit (geen van beide doet layout), maar het hoort opgeruimd. Als
losse regel meenemen of als open punt vastleggen; niet stilzwijgend laten staan.

## Taken

- [x] 1. `tests/e2e/helpers/review-deck.ts`: stubs voor de wachtrij-endpoint en de
      beeld-endpoints, met instelbare afbeeldingsgrootte; genereer de afbeeldingen in de test
      zelf (geen bestanden in de repository).
- [x] 2. `tests/e2e/review-deck-layout.spec.ts`: rendert het deck op vensterhoogte 1000 en 700
      en meet de vier grootheden uit AC3.
- [x] 3. Nulmeting vastleggen (AC4) met een expliciete markering dat dit de kapotte stand is.
- [x] 4. Faalbewijs leveren (AC5) en in het story-record opnemen.
- [x] 5. Het commando documenteren (AC6) en de tegenspraak jsdom/happy-dom noteren.

## Bronverwijzingen

- [Source: review-20-15.md — H3 (uitvoerbaarheid), L6 (jsdom/happy-dom)]
- [Source: review-20-12-code.md — H2 (63 tests groen na terugdraaien)]
- [Source: playwright.config.ts:24-31,54-57,86-91; tests/e2e/reference-library.spec.ts:19-26]
- [Source: apps/web/src/pages/ArtworkReviewPage.tsx:202-243 — lege staat zonder items]

## Dev Agent Record

### Wat er gebouwd is

- `tests/e2e/helpers/review-deck.ts` — stubs voor alle aanroepen die het beoordeelscherm doet,
  een PNG-generator (geen bestanden in de repository, geen extra afhankelijkheid) en twee
  meetfuncties.
- `tests/e2e/review-deck-layout.spec.ts` — vier tests die de werkelijke afmetingen meten.
- Metingen gaan naar `test-results/review-deck-metingen/<naam>.json`, één bestand per meting.

### De gemeten nulmeting (AC4) — na verwerking van de code-review

| | venster 1000 | venster 700 |
|---|---|---|
| Beeldvenster | 490 px | 190 px |
| Gerenderde beeldhoogte | **1019 px** | **1019 px** |
| Onderkant "Accepteer" | 1053 px | 753 px |
| **Onderkant laagste bediening** | **1129 px** | **829 px** |
| Alle bediening in beeld? | **nee** (129 px eronder) | **nee** (129 px eronder) |

1. **Het beeld wordt afgekapt:** het rendert 1019 px hoog in een venster van 490 resp. 190 px —
   er valt dus 529 resp. 829 px weg. Bevestigt H2 van `review-20-14-code.md`.
2. **Er hangt 129 px bediening onder de vouw, niet 53.** Onder "Accepteer" staan nog de knop
   "Ander keurmerk koppelen" en de swipe-hint.
3. **Een kleine bron laat ruimte onbenut:** een bron van 240 × 180 px rendert op 180 px in een
   venster van 490 px → **310 px onbenut**. Bevestigt M3 van `review-20-15.md`.

### Bevindingen van de code-review, alle verwerkt

`review-20-15-code.md` gaf **FAIL** (3 high, 6 medium). Wat er is aangepast:

- **H1 — er werd niet de laagste bediening gemeten.** `deck-accept` is niet het onderste
  element; daaronder staan de relabel-knop (`:1371`) en de swipe-hint (`:1385`). Zonder deze
  correctie had 20.16 "de knoppen staan in beeld" kunnen claimen met 76 px bediening onder de
  vouw. De meting kijkt nu naar de onderkant van het héle deck; de nulmeting verschoof daardoor
  van 1053 naar **1129**.
- **H2 — de stub deed de declaratie-tag verdwijnen.** De tag rendert alleen bij `reason: 'ok'`
  (`MobileReviewDeck.tsx:331`); met een andere waarde viel hij stil weg en mat de nulmeting
  32 px te veel ruimte. Gecorrigeerd: beeldvenster **490** in plaats van 522.
- **H3 — de oorzaak van de wisselende hoogte was fout benoemd.** Ik schreef de uitlegalinea aan;
  die kan nooit naast een kaart staan (`ArtworkReviewPage.tsx:148`). De werkelijke bron is de
  rolcheck `/auth/me`: zolang die loopt staat de melding over beheerdersrechten boven het deck,
  en meet de kaart zich te klein. De test roept dat nu **deterministisch** op met een vertraagde
  rolcheck (`authDelayMs`) en meet het verlies: **132 px bij montage tegen 190 px na een
  afgedwongen hermeting — 58 px die de kaart nooit terugpakt.** Dat is geen testprobleem: op een
  trage verbinding krijgt de reviewer structureel minder beeld. Repareren hoort bij 20.16 AC7.
- **M1** — vensterhoogte 1000 had geen enkele vastklikkende bewering; nu beide hoogtes.
- **M2** — de hermeting-test kon per constructie niet falen; die eist nu een positief verschil
  onder een vertraagde rolcheck.
- **M3** — bij parallelle workers overschreven de metingen elkaar (1 van 5 bleef over); nu één
  bestand per meting.
- **M4** — de uitvoermap staat in `.gitignore`.
- **M5** — mijn open punt over `channel: 'chrome'` was onjuist gemotiveerd: CI installeert de
  browser zelf (`ci-cd.yml:359-360`, `comprehensive-tests.yml:80-81`), dus dit is géén
  CI-kwestie maar uitsluitend een lokale. Zie het commando hieronder.
- **M6** — de getallen in het eerste faalbewijs waren van door elkaar gehaalde metingen; het
  faalbewijs is hieronder opnieuw gedraaid op de gecorrigeerde code.

### Faalbewijs (AC5), opnieuw gedraaid

`FILL_BOTTOM_GAP` tijdelijk van 16 naar 260 gezet — een kunstmatige verandering die de kaart
korter maakt. Uitkomst: **3 van de 4 tests werden rood.**

- *laptop*: laagste bediening 1129 → 885, dus binnen het venster → nulmeting rood, zoals bedoeld.
- *kleine bron*: beeldvenster 490 → 246, dus minder onbenutte ruimte → rood.
- *wedloop*: verschil veranderde → rood.
- *klein (venster 700)*: bleef groen, terecht — laagste bediening 741 valt daar nog steeds
  buiten het venster van 700. De test meldt dus geen verbetering die er niet is.

Daarna teruggedraaid; `git diff` op `MobileReviewDeck.tsx` is leeg.

### Verificatie

**4 passed / 0 failed** op de herstelde code. De metingen zijn stabiel over meerdere runs; de
enige die per opzet varieert is de wedloop, en die wordt nu deterministisch opgeroepen.

### Commando (AC6) — met een eerlijke kanttekening

```
npx playwright test tests/e2e/review-deck-layout.spec.ts
```

Geen backend, geen database, geen inlog. **In CI werkt dit**: die installeert de browser zelf.
**Op deze machine nog niet**: de root-config verwacht chromium-revisie 1148 en die staat niet in
de cache (wel 1208/1217/1234, van andere Playwright-versies). Eenmalig
`npx playwright install chromium` lost dat op — dat is een download en is dus niet zonder
toestemming gedaan. De metingen hierboven zijn gedraaid met de al geïnstalleerde Google Chrome
via een configuratie buiten de repository; de testcode is identiek, alleen de browserkeuze
verschilt. **AC6 is daarmee wel gehaald voor CI en niet voor een verse machine zonder die
eenmalige installatie.**

### Open punt uit de spec (L6)

`apps/web/vitest.config.ts:16` (`jsdom`) en `apps/web/vite.config.ts:142` (`happy-dom`) spreken
elkaar tegen. Niet opgeruimd — geen van beide doet layout, dus het raakt de uitkomst niet.

## Change Log

- 2026-08-17: Gebouwd; adversariële code-review FAIL (3 high, 6 medium) -> alle bevindingen verwerkt; nulmeting bijgesteld (beeldvenster 490/190 i.p.v. 522/222, laagste bediening 129 px onder de vouw i.p.v. 53); faalbewijs opnieuw gedraaid. Status -> review.
- 2026-08-17: Aangemaakt als deel C van de splitsing uit review-20-15.md. Vervangt de
  oorspronkelijke story 20.15 (`20-15-beoordeelscherm-echt-bruikbaar.md`), die door de
  spec-review is afgekeurd (3 high) en te groot bleek.
