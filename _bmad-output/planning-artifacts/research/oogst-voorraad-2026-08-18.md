# Onderzoek: waar zit nog oogstbaar materiaal?

**Datum:** 18 augustus 2026
**Aanleiding:** de kandidatenstroom staat sinds 27 juli stil. De nulmeting van 27 juli
concludeerde dat de oogst "uitgeput" was. Dit onderzoek toetst die conclusie.

**Uitkomst in één zin:** de oogst was uitgeput binnen zijn eigen zoekopdracht, niet binnen het
materiaal — **1078 GTINs met bruikbaar artwork hebben nog nooit één kandidaat opgeleverd.**

---

## 1. De stilstand, in cijfers

`VERIFIED` (ACC-database, 2026-08-18):

| | |
|---|---|
| Laatste kandidaat aangemaakt | 27 juli 2026 |
| Laatste referentie toegevoegd | 29 juli 2026 |
| Openstaande kandidaten | 0 |
| Actieve referenties | 499, over **61** keurmerken (38 met 3 of meer) |

## 2. De onaangeroerde voorraad

`VERIFIED`:

| | |
|---|---|
| GTINs met artwork in ACC | 1874 |
| GTINs die ooit een kandidaat opleverden | 784 |
| **GTINs met artwork, nooit bekeken** | **1090** |
| …waarvan met opslagpad, dus bruikbaar | **1078** |

Meer dan de helft van het ingeladen artwork is dus nooit doorzocht.

## 3. Waarom de bestaande kandidaten zijn ontstaan

`VERIFIED` — herkomst van alle 7635 kandidaten ooit:

| Aantal | Herkomst |
|---|---|
| 5904 | "Geen T3777-declaratie beschikbaar — verwacht handmatige review" |
| 641 | 12.6 acceptatie-kandidaat (assembler) |
| **327** | **declared-harvest** — het mechanisme dat gericht nieuwe voorbeelden zoekt |
| 91 | 12.6 free-from |
| 60 | 12.6 nutri-score (synthetische bootstrap) |

Dat is de kern van de diagnose: **77% van alle kandidaten ooit kwam uit "er was geen declaratie
om tegen te toetsen"**, niet uit gericht zoeken. De gerichte oogst heeft in totaal 327 kandidaten
opgeleverd, en die bron is per code afgelopen omdat hij op een vaste lijst codes werkte
(de acht uit de meting van story 20.1).

`INFERENCE` — de 1078 onaangeroerde GTINs zijn dus waarschijnlijk niet "leeg", maar vielen buiten
de zoekopdracht: hun declaraties gingen over codes waar toen niet op gezocht werd. Dit is nog
niet geverifieerd; daarvoor moeten de declaraties van die GTINs opgehaald worden (catalogus-API).

## 4. Tweede, kleinere voorraad: mislukte imports

`VERIFIED` — 836 van de 3502 imports (24%) staan op `failed`, en alle 836 op dezelfde oorzaak:

```
MediaServer file download failed for /8719328024019/...   (627 + 190 + 19)
```

Eén GLN, drie mappen. Dat oogt als één kapotte partij of één ontbrekende map, niet als 836
losse problemen. Onderzoeken is goedkoop; als het één oorzaak is, komt daar in één keer een
kwart van de import bij.

## 5. Wat dit betekent

De volgorde van waarde:

1. **De gerichte oogst loslaten op de codes die er al zijn.** 61 keurmerken hebben een
   voorbeeld; de oogst heeft op acht codes gezocht. Dezelfde machinerie op de overige codes
   richten gebruikt materiaal dat er al ligt.
2. **De 1078 onaangeroerde GTINs.** Eerst meten wat er in hun declaraties staat, dan pas oogsten.
3. **De 836 mislukte imports.** Eén oorzaak, dus mogelijk één reparatie.

Wat NIET de bottleneck is: het herkennen zelf. Dat haalt 85% op de gemeten set.

## 6. Openstaande punten

- De aanname in §3 (dat de 1078 buiten de zoekopdracht vielen) is nog niet geverifieerd.
- Onbekend of de mediaserver-fout uit §4 nog steeds optreedt of eenmalig was.
- Het bredere corpus op productie (~39k artworks over 151 GLNs, zie eerder onderzoek) is nooit
  in ACC ingeladen; ACC bevat een momentopname van 5 en 8 juni.
