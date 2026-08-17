# Story 20.17: Scherper contextfragment voor de beoordeling

Status: draft
Afhankelijk van: 20.15 (de meetbare test). Onafhankelijk van 20.16 — raakt alleen de serverkant.

<!-- Deel B van de splitsing uit review-20-15.md (M7). Losgeknipt omdat dit een ander bestand,
een andere testsuite en een ander risico is dan de opmaak: één rode api-test mag de opmaakfix
niet blokkeren, en omgekeerd mag deze er niet in de haast bij glijden. -->

## Story

Als **reviewer die een kader moet controleren of corrigeren**
wil ik **de contextweergave scherp genoeg om het keurmerk te herkennen**
zodat **ik niet inzoom op een beeld dat de server al onscherp heeft gemaakt.**

## Wat er nu gebeurt

`VERIFIED` — `apps/api/src/api/v1/artwork-pipeline.ts:1017`: het contextfragment ("Bekijk in
context", de weergave waarin een kader getekend wordt) wordt server-side teruggeschaald naar
maximaal **900 px** langste zijde. Het deck breder of hoger maken levert daar dus nauwelijks
detail op — dat verklaart een deel van waarom story 20.12 zo weinig hielp.

Ter onderscheid: de **gangbare** weergave (uitsnede mét kader, `/marked`) levert al 1600 px en
is niet het probleem. De `sharp`-tak één niveau hoger (`:1000`, `resize({ width: 1200 })`) is
een ánder pad en blijft ongemoeid.

## Wat de spec-review hier corrigeerde

`VERIFIED` (review-20-15, M1) — mijn eerdere formulering "de `X-Context-Window`-map schaalt
mee" was **onjuist**. De header wordt uitgestuurd in volledige-artwork-pixels
(`:1046`) en de client rekent een getekend kader terug uit **fracties** van het getoonde
fragment (`MobileReviewDeck.tsx:661-664`). Beide kanten zijn schaal-**onafhankelijk**, en dát is
waarom deze wijziging veilig is. Wie de oude formulering letterlijk zou uitvoeren, gaat zoeken
naar een schaalfactor die er niet is — of voegt er een toe en breekt daarmee de terugrekening
die nu klopt.

## Acceptatiecriteria

1. **Het contextfragment wordt maximaal 1600 px langste zijde**, in plaats van 900.

2. **De grens is instelbaar met een naam en een getal.** Omgevingsvariabele
   `CONTEXT_FRAGMENT_MAX_PX`, standaard `1600`, met een **harde bovengrens van 2400** —
   daarboven wordt het fragment groter dan enig beoordeelscherm en levert het alleen geheugen-
   en bandbreedtekosten op. Een waarde erboven wordt geklemd, niet overgenomen. Volg de
   conventie van `DEFAULT_CONCURRENCY` (`artwork-pipeline.ts:99-102`).
   Reden voor een harde grens: geheugen legde in story 20.11 een hele oogstronde om.

3. **Al bezochte items krijgen het scherpere fragment ook.** De ETag is nu
   `W/"${item.id}-${item.updatedAt}"` (`:79-96`) en bevat de fragmentgrootte niet. Verhoog je de
   grens, dan antwoordt de server voor een onveranderd item `304` en houdt de browser het oude
   900-px-fragment — precies bij de items waarmee iemand controleert of het werkt
   (review-20-15, M2). De fragmentgrootte moet daarom in de ETag of in de URL.

4. **De terugrekening van een getekend kader blijft identiek.** Te toetsen zonder browser: een
   kader op dezelfde relatieve plek levert dezelfde artwork-fracties bij grens 900 en bij 1600.
   De invariant is dat de `X-Context-Window`-header schaal-onafhankelijk **blijft** — er mag
   geen schaalfactor bij komen.

5. **De rode kaderoverlay blijft even goed leesbaar.** De lijndikte staat vast op 3 px
   (`:1030`, met witte halo op `:1032`); op een fragment van 1600 px is die lijn relatief bijna
   twee keer zo dun als op 900 px, terwijl juist die lijn het doel dient (review-20-15, L2).
   Laat de dikte meeschalen met de fragmentgrootte.

6. **Geheugen en tijd blijven binnen de perken.** Meet de piek-geheugengebruik en de duur van
   één fragment-aanroep bij 900 en bij 1600 op een representatief artwork, en leg beide in het
   story-record vast. Geen schatting: gemeten.

7. **Geen regressie.** De api-suite rond `artwork-pipeline` blijft groen; de `/marked`-,
   `/crop`-, `/source`- en `/artwork`-takken behouden hun cache-gedrag uit story 20.6
   (no-cache + zwakke ETag + 304).

8. **RED-bewijs** voor AC1 en AC3: draai de wijziging terug en toon dat exact de bedoelde test
   rood wordt.

## Taken

- [ ] 1. `TARGET` vervangen door de instelbare, geklemde grens (AC1, AC2).
- [ ] 2. Fragmentgrootte in de ETag opnemen (AC3).
- [ ] 3. Lijndikte laten meeschalen (AC5).
- [ ] 4. Test op de fractie-invariant bij twee grenswaarden (AC4).
- [ ] 5. Geheugen- en duurmeting bij 900 en 1600 (AC6).

## Bronverwijzingen

- [Source: review-20-15.md — M1 (mechanisme), M2 (ETag), M4 (naam en grens), L2 (lijndikte)]
- [Source: apps/api/src/api/v1/artwork-pipeline.ts:79-96,99-102,854,1000,1017-1032,1046]
- [Source: apps/web/src/components/review/MobileReviewDeck.tsx:652-668,976-981]
- [Source: 20-6-marked-crop-revalidatie-cache.md — het cache-gedrag dat intact moet blijven]

## Change Log

- 2026-08-17: Aangemaakt als deel B van de splitsing uit review-20-15.md, met de door de review
  gecorrigeerde beschrijving van het schaal-mechanisme.
