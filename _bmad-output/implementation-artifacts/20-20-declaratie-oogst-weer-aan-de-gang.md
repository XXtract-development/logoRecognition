# Story 20.20: De declaratie-oogst weer aan de gang, en goedkoop houden

Status: **spec versie 1 — wacht op tegenlezen.**

> **Eigen nummer, met opzet.** Nummer 20.2 is al bezet door de oogster zelf (`queue_harvest_declared.py`,
> zijn toetsen en het crop-voorvoegsel `20_2_`). Deze story maakt af wat daar open bleef en verwijst
> ernaar; hij vervangt het lege 20.2-record niet, hij vult het gat dat de tegenleesronde blootlegde
> (`review-20-2.md`, FAIL, 4 hoog / 9 middel / 3 laag).

## Story

Als **datamanager die het vliegwiel draaiende houdt**
wil ik **dat de declaratie-oogst vanzelf draait en alleen rekent aan wat kans maakt**
zodat **de beoordeelwachtrij zich vult zonder handwerk en zonder nachtenlang rekenwerk.**

## Wat er stilstaat, gemeten op 19 augustus 2026

`VERIFIED`, eigen metingen op de acceptatie-omgeving:

| | |
|---|---|
| Open items in de beoordeelwachtrij | **0** |
| Meest recente item | 27 juli 2026 |
| Keurmerkindex (herbouwd na story 20.19) | 89 codes, 1082 producten, **2377 paren** |
| De kaart die de oogst leest | **16 juli**, 39 codes, 791 producten |

Drie oorzaken, en ze stapelen:

**1. Niets bouwt de kaart.** `VERIFIED` via vier routes (hele git-geschiedenis, uitputtende lijst van
schrijvers naar `flywheel-index/`, een `grep -rl` over de hele werkmap inclusief niet-gevolgde
bestanden, en de `sourceNotes` in het bestand zelf die het handwerk documenteren): alleen
`queue_harvest_declared.py` noemt `declared-harvest-map.json`, en die **leest** hem. De kaart is met
de hand gemaakt en daarom op 16 juli blijven staan terwijl de index doorgroeide.

**2. Niets draait de declaratie-oogst.** `VERIFIED`: de enige planning op acceptatie is
`37 3 * * * /usr/local/bin/keurmerk-harvest.sh`, en dat script start
`python -m app.services.queue_harvest` — de **volume**-oogst. Er is geen tweede planning en geen
Coolify-taak voor de declaratie-oogst. Een meegroeiende kaart verplaatst het handwerk dus, in plaats
van het weg te nemen.

**3. De oogst rekent aan kansloze paren, en vergeet wat hij al nakeek.**

`VERIFIED`, per oorzaak geteld over de huidige index:

| | paren |
|---|---|
| totaal in de index | 2377 |
| **Nutri-Score** — sleutel `NutritionalScore/A`..`E`, maar de referenties heten `NUTRISCORE_A`..`E`; nul opbrengst, en er bestaat al een eigen Nutri-Score-oogst met een eigen markering | −209 |
| **43 codes zonder ook maar één actieve referentie** — de oogst zoekt strikt in de eigen referentiepool van een code, dus dit levert per definitie niets | −281 |
| blijft over | **1886** |
| daarvan leverde al eens een item op (en wordt dus overgeslagen) | 312 |
| **echt door te rekenen** | **1574 → ruim 12 uur** bij ~28 s per paar |

`VERIFIED` — en dit is de kern van de kosten: **de ontdubbeling onthoudt alleen paren die een item
opléverden.** `review_item_exists` (`queue_harvest_declared.py:548`) kijkt naar bestaande
review-items. De ruim 1200 paren die zijn nagekeken en niets opleverden staan nergens, en worden bij
elke nieuwe ronde opnieuw doorgerekend. De voortgang is alleen een **teller** in
`keurmerk-harvest/declared-harvest-state.json`; verandert de parenlijst, dan is die teller waardeloos
en is alle kennis over "al nagekeken" verdwenen.

`VERIFIED` — bovendien staat de ontdubbeling ná het dure werk: `propose_regions(img)` op `:479`,
`review_item_exists` op `:548`.

## Acceptatiecriteria

### Deel A — de bouw

1. **Een vastgelegde bouwer maakt de kaart uit de index.** Nieuw script naast
   `apps/api/src/scripts/build-keurmerk-index.ts`, in dezelfde stijl: leest
   `flywheel-index/keurmerk-etiket-index.json`, schrijft `flywheel-index/declared-harvest-map.json`
   in de vorm `{"codes": {code: [gtin, ...]}}`.

   De invoer heeft de vorm `entries["<veldsoort>/<code>"] = [{gtin, gln, labels[]}, …]` —
   `VERIFIED` aan een echte invoer. Splits op de **eerste** schuine streep.

   **Standaard-modus:** `--dry-run` is de standaard en `--apply` schrijft, gelijk aan
   `scripts/correct_nutriscore_labels.py` en `backfill-gln-from-tradeitems.ts`. Noem die twee als
   precedent in de kop, zodat de keuze niet opnieuw ter discussie staat.

   De kaart draagt `builtAt`, de sleutel van de bronindex en **de toegepaste uitsluitingen**, zodat
   hij een eerlijke afgeleide is en niet stilzwijgend afwijkt van zijn bron.

2. **Drie uitsluitingen, elk met de reden erbij.**

   | uitsluiting | reden | paren |
   |---|---|---|
   | veldsoort `NutritionalScore` | sleutel geeft `A`..`E`, referenties heten `NUTRISCORE_A`..`E`; en de eigen Nutri-Score-oogst zou dubbele items opleveren | 209 |
   | codes zonder actieve referentie | de oogst zoekt strikt binnen de referentiepool van de code | 281 |
   | `RECYCLABLE_GENERAL_CLAIM` en `TRIMAN` | overstroming; dezelfde twee die de volume-oogst uitsluit (`queue_harvest.py:75`) | zie meting |

   De uitgesloten codes-zonder-referentie komen als **aparte lijst** in de kaart te staan onder een
   eigen sleutel ("wacht op een eerste referentie"), zodat zichtbaar blijft wat er blijft liggen en
   waarom. Dat is de brug naar de vervolgstory over die 43 codes.

3. **Botsende codes worden samengevoegd, niet overschreven.** `VERIFIED`: `PREGNANCY_WARNING` komt
   onder twee veldsoorten voor — `EU_consumerUsageLabelCodeList` (130 producten) en
   `PackagingMarkedLabelAccreditationCode` (2). Naïef omzetten gooit 130 producten weg voor 2. Voeg
   de productlijsten samen en ontdubbel.

4. **De oogst onthoudt wát hij nakeek, niet alleen wat hij opleverde.** Dit is de duurste bevinding
   en de enige die deze story blijvend goedkoop maakt.

   Leg per `(code, gtin)` vast dát het paar is nagekeken, met de uitkomst (kandidaat / onder de
   drempel / cross-code afgewezen / keyline / cap). Een volgende ronde slaat een nagekeken paar over
   **vóór** de regio-analyse.

   **De controle verhuist naar vóór het dure werk**: nu staat `propose_regions` op `:479` en de
   ontdubbeling op `:548`. Zonder die verhuizing bespaart onthouden niets.

   Sleutel de vastlegging op `(code, gtin, bronpagina)`. Verandert de paginakeuze voor een GTIN, dan
   is het een nieuw paar en mag het opnieuw — dat is het enige gat in de "opnieuw aflopen is
   veilig"-redenering en het hoort expliciet.

5. **De teller gaat terug zodra de parenlijst verandert, met een reden erbij.** Precedent: het
   voortgangsbestand draagt zelf `resetAt: 2026-07-27` met
   `resetReason: "kaart uitgebreid 8->11 codes; oude offset wees in de oude paren-lijst"`.
   Leg vast wélk proces dat bestand schrijft (de ml-service, niet de bouwer) en wat er gebeurt als er
   een lopende run is.

   Met AC4 erbij is terugzetten niet meer duur: de nagekeken paren worden goedkoop overgeslagen.

6. **Krimpbescherming.** Wordt de nieuwe kaart fors kleiner dan de bestaande, dan wordt hij **niet**
   geschreven maar gemeld. Reden: de index kapt standaard af op 500 GTINs
   (`KEURMERK_INDEX_LIMIT`, `build-keurmerk-index.ts:261-264`), dus een index die met de standaard
   gebouwd is zou de kaart stilzwijgend uitkleden. Kies een grens en noem hem.

7. **De aandrijving wordt geregeld.** De declaratie-oogst krijgt een eigen periodieke start, naast
   de bestaande volume-oogst. Leg vast: wie start hem, hoe vaak, en met welke tijdslimiet. Zonder
   dit criterium maakt de story haar titel niet waar.

   *Let op: de twee diensten draaien in aparte containers, dus een omgevingsvariabele "op één plek"
   bestaat niet. Zeg per instelling waar hij gezet wordt.*

8. **Geen regressie op de bestaande guards.** De cross-code-guard uit story 20.7 (`:535`) en de
   keyline-guard uit 20.9 (`:480`) blijven ongewijzigd en hun toetsen groen.

9. **RED-bewijs** voor AC2 (elk van de drie uitsluitingen), AC3 (de botsing), AC4 (overslaan vóór de
   analyse) en AC6, en **geen regressie**: de api- en ml-suites blijven groen.

### Deel B — ná toestemming, niet onderdeel van de bouw

10. **Permission-gated.** Het schrijven van de kaart, het terugzetten van de teller en de echte
    oogstrun schrijven alle drie op acceptatie en wachten op expliciete toestemming van Friso. De
    **droogloop** mag wel — die schrijft niets.

11. **Meetbare uitkomst**, vast te leggen ná toestemming:

    | wat | vóór (gemeten 19 aug) | verwacht | gemeten |
    |---|---|---|---|
    | open items in de wachtrij | 0 | — | *na de run* |
    | codes in de kaart | 39 | 41 | |
    | producten in de kaart | 791 | 1005 | |
    | paren om door te rekenen | 1521 (oude lijst) | 1574 | |
    | rekentijd | — | ~12 uur eenmalig | |
    | rekentijd van de vólgende ronde | — | **klein** — dat is de winst van AC4 | |

    *De verwachte opbrengst in nieuwe items is bewust niet als hard getal opgenomen: de historische
    verhouding (~21%) komt van een andere codemix en zou een schijnnauwkeurigheid geven. De meting
    stelt hem vast.*

## Wat NIET in deze story zit

- **De 43 codes zonder actieve referentie.** Dat is de echte flessenhals — er zitten 281 paren
  achter die nu kansloos zijn — en het vraagt uitzoekwerk hoe je een eerste referentie betrouwbaar
  krijgt. Eigen story; deze story maakt ze wél zichtbaar (AC2).
- **De volume-oogst (`queue_harvest.py`) weer aan de praat krijgen.** Staat op 1857/1857 en mist
  ontdubbeling volledig (`VERIFIED`: geen `ON CONFLICT` op `:283-296`, enige unieke sleutel is de
  primaire). Eigen story.
- Het beoordelen zelf.

## Bronverwijzingen

- [Source: _bmad-output/implementation-artifacts/review-20-2.md — de tegenleesronde die deze story vormgaf]
- [Source: apps/ml-service/app/services/queue_harvest_declared.py:479, :535, :548 — regio-analyse, cross-code-guard, ontdubbeling]
- [Source: apps/ml-service/app/services/queue_harvest.py:75, :283-296 — uitsluitlijst en de INSERT zonder ontdubbeling]
- [Source: apps/api/src/scripts/build-keurmerk-index.ts:261-264 — de index en zijn standaardafkap]
- [Source: apps/api/src/scripts/build-nutriscore-declared-map.ts — het echte precedent voor een kaartbouwer]
- [Source: apps/api/scripts/backfill-gln-from-tradeitems.ts, apps/ml-service/scripts/correct_nutriscore_labels.py — precedent voor dry-run-als-standaard]
- [Source: _bmad-output/planning-artifacts/research/oogst-voorraad-2026-08-18.md — onderzoek dat dezelfde stilstand al analyseerde]
- [Source: _bmad-output/implementation-artifacts/20-19-declaraties-uit-de-tradeitem-database.md — de story die de index liet groeien]
- [Source: `/usr/local/bin/keurmerk-harvest.sh` op vanilla — de enige planning, en hij start de volume-oogst]

## Change Log

- 2026-08-19: Aangemaakt na `review-20-2.md` (FAIL). Eigen nummer omdat 20.2 bezet is. Kern van de
  herziening: de kaart laten meegroeien lost niets op zolang niets de oogst aandrijft (AC7) en
  zolang de oogst vergeet wat hij al nakeek (AC4). Eigen metingen: 2377 paren, waarvan 490 kansloos
  en 312 al afgehandeld, blijft 1574 over — ruim 12 uur, eenmalig.
