# Story 20.16: Beoordeelscherm — knoppen in beeld, beeld benut de ruimte

Status: draft
Afhankelijk van: 20.15 (de meetbare test). Niet starten zonder die opzet.

<!-- Deel A van de splitsing uit review-20-15.md (M7). Derde poging op dezelfde wens: 20.12
maakte het beeld breder maar niet hoger, 20.14 haalde het hoogtedak weg maar duwde de
beslisknoppen buiten beeld en kapt het beeld nu méér af dan vóór 27 juli. -->

## Story

Als **reviewer die honderden kandidaten per sessie beoordeelt**
wil ik **de beslisknoppen altijd binnen bereik én het keurmerk zo groot mogelijk in beeld**
zodat **ik per item één blik en één klik nodig heb.**

## De afweging die 20.12 en 20.14 verstopten

`VERIFIED` (review-20-15, H1, gemeten in Chrome op de voorgeschreven structuur): als álle
bediening binnen de vensterhoogte moet vallen, houdt het beeldvenster over:

| Vensterhoogte | Beeldvenster | Ter vergelijking |
|---|---|---|
| 1000 | 409 px | |
| **900** (1080p-scherm) | **309 px** | vóór 20.12 was het kader vast **440 px** |
| 700 | 109 px | |

Op het gangbaarste scherm levert "alles in beeld" dus een **kleiner** beeld dan vóór 27 juli.
Dat is de kern van waarom de vorige twee pogingen niet konden slagen: de wens "alles zichtbaar"
en de wens "groot beeld" botsen onder ongeveer 1000 px vensterhoogte, en geen van beide stories
maakte dat expliciet.

**Besluit Friso, 2026-08-17:** er verdwijnt niets van het scherm (voorbeeldlogo, gedeclareerd-
melding en contextknop blijven), en de winst komt uit het beeld de ruimte laten benutten plus
een scherpere bron (20.17). Daaruit volgt de enige sluitende oplossing voor de botsing: de
gemeten hoogte wordt een **ondergrens** in plaats van een vaste hoogte. Past alles, dan past
alles; past het niet, dan groeit de kolom en scrollt de pagina — in plaats van het beeld tot
onbruikbaar te knijpen.

Eerlijk benoemd gevolg: op een 1080p-scherm blijven de knoppen dan **niet** vanzelf in beeld
zodra het beeld zijn ondergrens opeist. Dat is een bewuste ruil, geen omissie. De sneltoetsen
(A goedkeuren, R afwijzen) blijven de snelle route, en die staan al in de uitleg boven de kaart.

## Acceptatiecriteria

1. **De bediening zit binnen de gemeten kolom — door constructie.** De beslisknoppen, de
   navigatieknoppen en de relabel-knop zijn een afstammeling van het element dat de gemeten
   hoogte draagt; niet een zusje ernaast zoals nu (`MobileReviewDeck.tsx:1291` sluit de kaart,
   `:1293` opent de knoprij). Toets in jsdom als **noodzakelijke voorwaarde** (review-20-15,
   L1: de DOM-toets alleen bewijst het niet) én in de browsertest uit 20.15.

2. **Bij vensterhoogte 1000 valt de onderkant van de laagste knop binnen het venster.** Gemeten
   met de test uit 20.15, niet beredeneerd.

3. **De gemeten hoogte is een ondergrens, geen keurslijf.** In de vul-stand krijgt de kolom
   `minHeight` in plaats van `height`, zodat de kaartinhoud niet meer buiten de rand loopt
   (review-20-15, H2: bij venster 700 blijft er 7 px over voor 218 px aan vaste rijen, bij 600
   zelfs −93 px) en de pagina echt kan scrollen.

4. **Het beeldvenster wordt nooit kleiner dan 440 px.** Dat is de stand van vóór 20.12
   (`MobileReviewDeck.tsx:1201`). Past dat niet binnen het venster, dan scrollt de pagina
   (AC3). Zonder deze eis levert deze story een achteruitgang op het gangbaarste scherm —
   precies wat review-20-15 H1 aantoonde en wat geen enkel criterium van de vorige poging zag.

5. **Het beeld benut de ruimte, tot aan de bronresolutie.** Het `<img>` heeft nu alleen
   `maxWidth`/`maxHeight` en schaalt daardoor nooit óp (`ImageStage.tsx:288-303`), terwijl de
   server bovendien alleen verkleint (`artwork-pipeline.ts:854`, `withoutEnlargement`). Given
   een bron die groter is dan het venster, then vult het beeld het venster (verhouding intact).
   Given een bron die kleiner is, then wordt hij opgeschaald tot het venster **of** blijft hij
   klein met een vastgelegde reden. Meten met twee stub-groottes uit 20.15.
   *Correctie op een aanname die eerder in dit dossier stond:* in de gangbare tak (uitsnede mét
   kader) levert de server al 1600 px langste zijde en vult het beeld het kader wél; het gat
   zit in de kale-uitsnede-tak en in de contextweergave (die laatste is 20.17).

6. **Het beeld wordt niet afgekapt.** De begrenzing `maxHeight: '100%'` (`:1222`, `:1256`)
   werkt nu niet omdat de ouder geen bepaalde hoogte heeft (`ImageStage.tsx:255`); daardoor
   rendert het beeld op natuurlijke hoogte en snijdt `overflow: hidden` boven én onder weg.
   Na deze story past het volledige beeld binnen het venster bij zoomfactor 1.

7. **Meten blijft kloppen bij scrollen en bij veranderende opmaak erboven.** De huidige
   berekening gebruikt `rect.top` (vensterrelatief) met een listener op alléén `resize`
   (`:158-168`). Faalbare uitkomst: na scrollen en na het verschijnen of verdwijnen van de
   uitlegalinea (gemeten verschil 58 px, review-20-15 L4) klopt de hoogte nog steeds — te
   toetsen met de meting uit 20.15.

8. **Het verkeerde commentaar gaat weg.** Zowel `:1046-1048` ("de knoprijen houden hun eigen
   hoogte binnen de kaart") als `:50-63` ("de knoppen blijven zo zonder scrollen bereikbaar,
   ook op ~900px hoog") beweert iets dat aantoonbaar onwaar is (review-20-15, L3).

9. **De uitlegalinea krijgt de test die 20.14 nooit had**, op `review-description`
   (`ArtworkReviewPage.tsx:144-155`). De "vaststelling dat er geen sprong optreedt" vervalt als
   eis: review-20-14 M4 heeft dat al geverifieerd (de deck bevriest zijn wachtrij, de pagina
   toont bij een lege lijst geen kaart) — bronverwijzing volstaat (review-20-15, L5).

10. **Tests meten effect.** RED-bewijs verplicht voor AC2, AC4, AC5 en AC6: draai de fix terug
    en toon dat exact de bedoelde meting rood wordt.

11. **Regressie, met één uitzondering die benoemd is.**
    `MobileReviewDeck*.test.tsx` en `ArtworkReviewPage.test.tsx` blijven groen.
    `ImageStage.maxheight-20-12.test.tsx` **mag sneuvelen**: die vier tests leggen het verlaten
    20.12-ontwerp vast (default `'64vh'`, doorgifte van `calc(100vh - 260px)`) en review-20-12
    kwalificeerde ze als dode letter. Herschrijven naar het nieuwe ontwerp, niet groen houden
    om het groen houden (review-20-15, M6).

12. **De changelog wordt rechtgezet.** `versions.md:10-12` en `:23` beloven de eindgebruiker dat
    de knoppen altijd in beeld blijven en het beeld vrijwel de hele schermhoogte benut. Beide
    zijn aantoonbaar onwaar. Corrigeren in dezelfde commit (review-20-15, M7).

## Wat NIET in deze story zit

- De bronresolutie van het contextfragment (900 → 1600): story 20.17.
- De weergavebreedte van 1600 px uit 20.12: die is niet stuk.
- Het gedrag van de teken- en zoomlaag.
- **AC6 uit de afgekeurde spec (mobiel) vervalt**: 20.14 heeft de mobiele tak via `fillViewport`
  al op `48vh`/`440` teruggezet (`:1199-1201`, `ArtworkReviewPage.tsx:272`); mobiel krijgt
  `DECK_MAX_IMAGE_HEIGHT` alleen nog in de niet-vul-tak (review-20-15, M5). Wel blijft de eis dat
  de mobiele tak ongewijzigd blijft — als regressietest, niet als wijziging.

## Bronverwijzingen

- [Source: review-20-15.md — H1 (pixeltabel), H2 (overlopende kaart), M3, M5, M6, M7, L1, L3, L4, L5]
- [Source: review-20-14-code.md — H1, H2, M1-M4]
- [Source: review-20-12-code.md — H1, H2, M3, M5]
- [Source: apps/web/src/components/review/MobileReviewDeck.tsx:50-72,151-172,1030-1051,1191-1209,1288-1301]
- [Source: apps/web/src/components/review/ImageStage.tsx:249-303]

## Change Log

- 2026-08-17: Aangemaakt als deel A van de splitsing uit review-20-15.md, met de afweging uit
  H1 expliciet gemaakt en Friso's besluit erin verwerkt (niets van het scherm weghalen; winst
  uit beeldbenutting en bronresolutie).
