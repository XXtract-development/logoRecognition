# Story 20.15 (VERVALLEN): Beoordeelscherm écht bruikbaar — knoppen in beeld, beeld niet afgekapt, scherp genoeg

Status: superseded

> **Vervangen op 2026-08-17.** De spec-review (`review-20-15.md`) keurde deze story af met 3 high:
> AC3 (beeldvenster ≥ 600 px) is met AC1 erbij aantoonbaar onhaalbaar (gemeten 409 px) en levert op
> een 1080p-scherm zelfs een achteruitgang; de ondergrens uit AC4 geeft een overlopende kaart in
> plaats van een scrollende pagina; en de browsertest uit AC9 is in deze repository niet uitvoerbaar
> zonder eigen opzetwerk. Opgesplitst in drie stories, in deze volgorde:
> **20.15** `20-15-meetbare-opmaaktest-beoordeelscherm.md` (de meetbare test) →
> **20.16** `20-16-beoordeelscherm-opmaak.md` (de opmaak) →
> **20.17** `20-17-scherper-contextfragment.md` (de bronresolutie).
> Dit bestand blijft staan omdat de review eraan hangt; niet bouwen vanaf hier.

<!-- Aanleiding: de code-reviews van 20.12 (FAIL, 2 high) en 20.14 (FAIL, 2 high) op
2026-08-17, plus eigen verificatie in de code. Dit is de DERDE poging op dezelfde wens.
20.12 maakte het beeld breder maar niet hoger; 20.14 haalde het hoogtedak weg maar
duwde de beslisknoppen buiten beeld en kapt het beeld nu méér af dan vóór 27 juli.
Beide keren meldde de story "gedaan" terwijl Friso het tegendeel op zijn scherm zag. -->

## Story

Als **reviewer die honderden kandidaten per sessie beoordeelt**
wil ik **een beoordeelscherm waarop het keurmerk groot en scherp in beeld staat én de
beslisknoppen bereikbaar zijn**
zodat **ik per item één blik en één klik nodig heb in plaats van scrollen, zoomen en zoeken.**

## Waarom dit de derde poging is — en wat er structureel misging

Twee stories op rij zijn afgetekend terwijl het gedrag niet klopte. De oorzaak is niet
onoplettendheid maar de **testopzet**: alle tests draaien in jsdom, en **jsdom doet geen
layout**. Een test kon daardoor alleen vaststellen dát een instelling werd doorgegeven, niet
wélke hoogte het beeld kreeg. De code-review van 20.12 heeft dat empirisch aangetoond: met
`DECK_MAX_IMAGE_HEIGHT` terug op `'64vh'` én `maxWidth` terug op `880` — de hele
gedragswijziging teruggedraaid — bleven **alle 63 tests groen**, inclusief de vier nieuwe.

Daarom is de testeis in deze story anders dan in 20.12 en 20.14: er komt een echte
browsertest bij die pixels meet. Zonder die test is deze story niet af, hoe groen jsdom ook is.

## Gemeten beginsituatie (2026-08-17, code op `23592d4` = live op ACC)

| Wat | Waar | Wat er misgaat |
|---|---|---|
| Kaarthoogte | `MobileReviewDeck.tsx:158-168` | `avail = window.innerHeight − card.top − 16`; de kaart wordt tot 16 px boven de vensterrand gerekt |
| Knoppenrij | `MobileReviewDeck.tsx:1293` | staat **buiten** de kaart (die sluit op `:1291`) → belandt per definitie onder de vouw, met nog 12 px marge erbij |
| Commentaar | `MobileReviewDeck.tsx:1046-1048` | beweert dat de knoprijen hun eigen hoogte houden binnen de kaart — dat is feitelijk onjuist |
| Beeldbegrenzing | `MobileReviewDeck.tsx:1222,1256` → `ImageStage.tsx:255,283` | `maxHeight: '100%'` op een ouder zonder bepaalde hoogte begrenst niets; het beeld rendert op natuurlijke hoogte en `overflow: hidden` snijdt boven én onder weg |
| Bronresolutie | `apps/api/src/api/v1/artwork-pipeline.ts:1017` | `TARGET = 900`: het contextfragment wordt server-side op 900 px gekapt, dus een breder deck levert nauwelijks meer detail |

De eerste twee zijn onafhankelijk van de review nagerekend: kaarthoogte + knoprij +
marge > vensterhoogte, ongeacht schermformaat.

## Acceptatiecriteria

1. **De beslisknoppen zijn altijd in beeld, door constructie.** Given een reviewer op desktop
   met ≥ 1 openstaand item, when het deck een kaart toont, then vallen "Wijs af", "Accepteer",
   de navigatieknoppen en de relabel-knop **binnen** het gemeten hoogtegebied — niet als
   zijelement ernaast. Aan te tonen in de DOM (de knoppen zijn een afstammeling van het
   element dat de gemeten hoogte draagt) én in de browser (onderkant van de laagste knop
   ≤ vensterhoogte) bij vensterhoogte 1000 én 700.

2. **Het beeld wordt niet meer afgekapt.** Given dezelfde reviewer, then past het volledige
   artwork binnen het beeldvenster (verkleind indien nodig, verhouding intact) en is er geen
   inhoud die door `overflow: hidden` buiten het kader valt. Concreet: de gerenderde
   beeldhoogte ≤ de hoogte van het beeldvenster, en de zichtbare fractie van het bronbeeld
   is 100% bij zoomfactor 1.

3. **Het beeld gebruikt de restruimte echt.** Given vensterhoogte 1000, then is het
   beeldvenster minstens 600 px hoog — gemeten aan het **beeldvenster**, niet aan de kaart
   eromheen (bevinding M1 op 20.14: de bestaande test meet de kaart en haalt de eis daardoor
   ten onrechte).

4. **Een lage viewport levert scrollen op, geen onbruikbaar beeld.** Given vensterhoogte
   ≤ 600, then geldt een ondergrens op het **beeldvenster** (niet op de kaart, bevinding M3 op
   20.14) en mag de pagina scrollen. Beter scrollen dan een beeld van 124 px.

5. **Meten blijft kloppen tijdens scrollen en bij formaatwijziging.** Given een gescrollde
   pagina, when het venster van formaat verandert, then blijft de hoogte correct — de huidige
   berekening gebruikt `rect.top` (vensterrelatief) en levert bij een gescrollde pagina een te
   grote kaart (bevinding M2 op 20.14). Herberekenen bij scroll, of meten op een manier die
   niet van de scrollpositie afhangt.

6. **Mobiel verandert niet.** Given een mobiele viewport, then is het gedrag gelijk aan vóór
   deze story én vóór 20.12. Let op: 20.12 veranderde de mobiele beeldbegrenzing van `'64vh'`
   naar `calc(100vh - 260px)` zonder `isMobile`-guard (bevinding M5 op 20.12). Dat wordt in
   deze story rechtgezet of expliciet als bewuste keuze vastgelegd — niet stilzwijgend gelaten.

7. **Scherper bronbeeld voor de contextweergave, met een grens.** Given de contextweergave
   ("Bekijk in context"), then levert de server een fragment van maximaal **1600 px** langste
   zijde in plaats van 900, instelbaar via een omgevingsvariabele met 1600 als standaard en
   een harde bovengrens. De rode kaderoverlay en de terugrekening van een getekend kader naar
   volledige-artwork-fracties blijven exact kloppen (de `X-Context-Window`-map schaalt mee).
   Reden voor de grens: geheugen legde in story 20.11 een hele oogstronde om; een
   onbegrensde vergroting is hier hetzelfde risico in een ander proces.

8. **De uitlegalinea mag geen sprong veroorzaken.** Het gedrag uit 20.14 (alinea verdwijnt bij
   een niet-lege wachtrij) blijft, maar krijgt de test die het nooit had (bevinding M4 op
   20.14) én de expliciete vaststelling dat er geen layout-sprong optreedt bij de overgang
   naar een lege wachtrij.

9. **De tests meten effect, niet doorgifte.** Verplicht per fix uit AC1, AC2 en AC3:
   RED-bewijs. Draai de fix terug en toon dat exact de bedoelde test rood wordt. Een test die
   groen blijft bij een teruggedraaide fix is geen test — dat is precies wat 20.12 en 20.14
   liet passeren. Minstens **één echte browsertest** (Playwright, aanwezig in
   `tests/e2e/` + `playwright.config.ts`) die de pixelhoogtes uit AC1 en AC3 meet; jsdom kan
   dat principieel niet.

10. **Geen regressie.** `MobileReviewDeck*.test.tsx`, `ImageStage*.test.tsx` en
    `ArtworkReviewPage.test.tsx` blijven groen; de api-suite rond `artwork-pipeline` blijft
    groen na de wijziging uit AC7.

## Wat NIET in deze story zit

- De bevindingen uit de review van 20.13 (voorbeeldlogo-keuze): dat raakt een ander endpoint
  en een ander scherm-element. Aparte story.
- De weergavebreedte zelf (1600 px uit 20.12) blijft ongemoeid — die is niet stuk.
- Het gedrag van de teken-/zoomlaag (kader slepen, dubbelklik-zoom) verandert niet.

## Taken

- [ ] 1. `MobileReviewDeck`: kaart én knoppenrij binnen één gemeten kolom brengen, zodat AC1
      door constructie geldt in plaats van door een rekensom. De kaart wordt daarin het
      meegroeiende deel; kop-, GTIN- en knoprijen houden hun natuurlijke hoogte.
- [ ] 2. Het onjuiste commentaar op `:1046-1048` vervangen door wat de code werkelijk doet.
- [ ] 3. `ImageStage`: in de vul-stand een bepaalde hoogte door de keten geven, zodat de
      begrenzing op het `<img>` werkelijk iets betekent (AC2). Buitenste laag krijgt hoogte,
      het beeldvenster wordt het meegroeiende deel, de hinttekst houdt zijn eigen hoogte.
- [ ] 4. Ondergrens verplaatsen van de kaart naar het beeldvenster (AC4).
- [ ] 5. Meting scroll-onafhankelijk maken of bij scroll herberekenen (AC5).
- [ ] 6. Mobiele beeldbegrenzing terugzetten of de afwijking expliciet vastleggen (AC6).
- [ ] 7. `artwork-pipeline.ts`: `TARGET` instelbaar maken met standaard 1600 en een harde
      bovengrens; overlay- en terugrekenmath verifiëren op de nieuwe schaal (AC7).
- [ ] 8. Tests: structuurtest in jsdom (knoppen zijn afstammeling van de gemeten kolom) +
      Playwright-test die de pixelhoogtes meet + RED-bewijs per fix (AC9).

## Dev Notes

- De kern van AC1 is een **structuurwijziging**, geen getal. Elke oplossing die de knoprij
  buiten de gemeten hoogte laat staan en dat compenseert met een aftreksom, herhaalt de fout
  van 20.12 (260 px gokken) en 20.14 (16 px marge). De knoppen moeten binnen het gemeten
  gebied vallen, dan is er niets te gokken.
- `FILL_BOTTOM_GAP = 16` en `FILL_MIN_CARD_HEIGHT = 320` blijven bestaan maar krijgen een
  andere rol: de marge geldt voor de hele kolom, de ondergrens voor het beeldvenster.
- Let bij AC7 op de bestaande `sharp`-tak één niveau hoger (`:1000`, `resize({ width: 1200 })`)
  — dat is een ánder pad; niet verwarren met het contextfragment.

## Bronverwijzingen

- [Source: apps/web/src/components/review/MobileReviewDeck.tsx:151-168,1030-1051,1191-1209,1288-1301]
- [Source: apps/web/src/components/review/ImageStage.tsx:249-303,344]
- [Source: apps/web/src/pages/ArtworkReviewPage.tsx:144-155,261]
- [Source: apps/api/src/api/v1/artwork-pipeline.ts:1000,1017-1031]
- [Source: _bmad-output/implementation-artifacts/review-20-12-code.md — verdict FAIL, H1/H2, M3/M4/M5]
- [Source: _bmad-output/implementation-artifacts/review-20-14-code.md — verdict FAIL, H1/H2, M1-M4]

## Change Log

- 2026-08-17: Story aangemaakt na de code-reviews van 20.12 en 20.14 (beide FAIL) en eigen
  verificatie van beide zware bevindingen in de code. Status: draft, wacht op spec-review.
