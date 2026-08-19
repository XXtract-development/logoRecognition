# Story 20.2: De beoordeelwachtrij vult zich weer, en blijft dat doen

Status: **spec versie 1 — wacht op tegenlezen.**

> **Aanleiding, gemeten op 19 augustus 2026.** Story 20.19 maakte de declaraties van 442 producten
> weer leesbaar en liet de keurmerkindex groeien van 815 naar 1082 producten. Maar de
> beoordeelwachtrij bleef leeg: **0 open items**, het meest recente item dateert van 27 juli. De
> index is de voorraadkast, niet de wachtrij — de oogst maakt er beoordeelbare kandidaten van, en
> die staat stil.
>
> Deze story bestond al als regel in het volgbestand (`in-progress`) zonder storybestand; de hele
> voortgang zat in een commentaarregel. Dit is dat storybestand.

## Story

Als **datamanager die het vliegwiel draaiende houdt**
wil ik **dat nieuw beschikbaar gekomen declaraties vanzelf beoordeelbare kandidaten worden**
zodat **de wachtrij zich vult zonder dat iemand een bestand met de hand hoeft bij te werken.**

## Wat er stilstaat, en waarom

`VERIFIED, eigen meting op de acceptatie-omgeving, 19 augustus 2026`:

| | |
|---|---|
| Open items in de beoordeelwachtrij | **0** |
| Afgehandelde items (afgewezen, geregistreerd, weggefilterd) | 7.635 |
| Meest recente item | **27 juli 2026** |

Er zijn twee oogsters, en ze staan allebei stil — elk om een eigen reden:

**1. De volume-oogst (`queue_harvest.py`) is aan het eind van zijn lijst.**
`VERIFIED`: `keurmerk-harvest/state.json` staat op `next_offset: 1857` van `total_gtins: 1857`. Hij
meldt "complete" en doet niets meer. Hij loopt producten af op volgorde en heeft **geen bescherming
tegen dubbele items** — `VERIFIED`: de `INSERT` op `queue_harvest.py:283-296` kent geen
`ON CONFLICT`, en de enige unieke sleutel op `artwork_review_items` is de primaire sleutel. Zijn
enige waarborg is dat de teller nooit terugloopt. Die teller terugzetten zou dus 1857 producten
opnieuw aflopen en duplicaten kunnen maken van de 7.635 bestaande items.

**2. De declaratie-gedreven oogst (`queue_harvest_declared.py`) leest een kaart die niet meegroeit.**
Dit is de oogster die hier hoort: hij werkt per `(code, product)`-paar uit een kaart in de opslag, en
hij ontdubbelt wél — `VERIFIED`: per code een eigen markering `declared-harvest:<code>`, gecontroleerd
met `review_item_exists`. Opnieuw aflopen is bij hem dus veilig.

`VERIFIED` — maar zijn kaart is verouderd, en dat is de kern van deze story:

| | |
|---|---|
| `flywheel-index/declared-harvest-map.json`, gebouwd op | **16 juli 2026** |
| Inhoud | 39 codes, 791 producten |
| De keurmerkindex, gebouwd op | **19 augustus 2026** — 90 sleutels, 1082 producten |
| Voortgang van deze oogst | `next_offset: 1521` van `total_pairs: 1521` — ook aan het eind |

**En de oorzaak daarvan:** `VERIFIED` — **niets in de codebase schrijft die kaart.** Een zoekopdracht
over `apps/` op `declared-harvest-map` vindt uitsluitend de twee regels in
`queue_harvest_declared.py` die hem *lezen*. De kaart is met de hand gemaakt. Daarom is hij op 16
juli blijven staan terwijl de index doorgroeide, en daarom vult de wachtrij zich niet vanzelf.

## De oplossing

Een **bouwer die de kaart afleidt uit de keurmerkindex**. Die index wordt al wél door een
vastgelegd script gebouwd (`apps/api/src/scripts/build-keurmerk-index.ts`) en draagt precies de
vorm die de oogst nodig heeft: `entries` is een verzameling `fieldType/code` met de producten
eronder. De kaart wordt daarmee een afgeleide in plaats van een handwerkstuk.

**Precedent voor het terugzetten van de teller.** `VERIFIED`: het voortgangsbestand draagt zelf
`resetAt: 2026-07-27` met `resetReason: "kaart uitgebreid 8->11 codes; oude offset wees in de oude
paren-lijst"`. Groeit de kaart, dan verandert de parenlijst en wijst een oude teller naar het
verkeerde punt. Dat is precies wat nu opnieuw gebeurt.

## Acceptatiecriteria

1. **Een vastgelegde bouwer maakt de kaart uit de index.** Nieuw script, naast
   `build-keurmerk-index.ts` en in dezelfde stijl: leest
   `flywheel-index/keurmerk-etiket-index.json`, schrijft
   `flywheel-index/declared-harvest-map.json` in de vorm `{"codes": {code: [gtin, ...]}}`.
   Met `--dry-run` als standaard, net als de andere scripts in dit dossier: hij toont wat hij zou
   schrijven en schrijft pas iets bij `--write`.

   De kaart draagt een `builtAt` en de sleutel van de index waaruit hij komt, zodat naderhand te
   zien is welke index eraan ten grondslag lag.

2. **De sleutel van de index is `fieldType/code`, de kaart wil `code`.** `VERIFIED`: de index
   gebruikt sleutels als `PackagingMarkedLabelAccreditationCode/GREEN_DOT` en
   `NutritionalScore/A`; de kaart gebruikt de kale code. Splits op de eerste schuine streep.

   **Let op de botsing die dat kan geven:** `PREGNANCY_WARNING` komt in de huidige index onder
   **twee** veldsoorten voor (`EU_consumerUsageLabelCodeList` met 130 producten en
   `PackagingMarkedLabelAccreditationCode` met 2). Voeg de productlijsten in dat geval samen en
   ontdubbel; laat de tweede de eerste niet overschrijven.

3. **Overstromingsbescherming.** `VERIFIED`: de volume-oogst sluit `RECYCLABLE_GENERAL_CLAIM` en
   `TRIMAN` standaard uit (`queue_harvest.py:75`), en dat zijn precies de twee grootste posten in de
   huidige kaart (223 en 197 producten). De bouwer sluit dezelfde twee uit, met dezelfde
   omgevingsvariabele-vorm zodat de lijst op één plek te wijzigen is.

4. **De teller gaat terug zodra de parenlijst verandert, met een reden erbij.** Verandert het aantal
   `(code, product)`-paren, dan wordt `keurmerk-harvest/declared-harvest-state.json` teruggezet op 0
   met een `resetAt` en een `resetReason` die zegt wát er veranderde — hetzelfde patroon dat op 27
   juli met de hand is toegepast. Zonder dat wijst de teller in een lijst die niet meer bestaat.

   Opnieuw aflopen is veilig: de oogst ontdubbelt per `(code, product)` via de markering
   `declared-harvest:<code>`. Leg dat vast met een toets, want de hele veiligheid van het
   terugzetten hangt eraan.

5. **Eerst droog, dan echt.** De oogst kent `DECLARED_HARVEST_DRY_RUN`. De droogloop komt vóór de
   echte run en het aantal kandidaten uit beide moet overeenkomen; wijkt dat meer dan 5% af, dan
   eerst uitzoeken waarom.

6. **Meetbare uitkomst.** Vastleggen, vóór en ná:

   | wat | vóór (gemeten 19 aug) | ná |
   |---|---|---|
   | open items in de wachtrij | **0** | te meten |
   | codes in de kaart | 39 | te meten |
   | producten in de kaart | 791 | te meten |
   | `(code, product)`-paren | 1521 | te meten |

   De verwachting op basis van de index (90 sleutels, 1082 producten) hoort in de story vóór de run,
   zodat de meting iets kan weerleggen.

7. **Geen regressie op de bestaande guards.** De oogst draagt de cross-code-guard uit story 20.7
   (`queue_harvest_declared.py:535`) en de keyline-guard uit 20.9 (`:480`). Die blijven ongewijzigd
   en hun toetsen groen.

8. **RED-bewijs** voor AC1, AC2 (de botsing op twee veldsoorten) en AC4, en **geen regressie**: de
   api- en ml-suites blijven groen.

9. **Permission-gated, en dus NIET onderdeel van de bouw:** de echte oogstrun, het terugzetten van
   de teller op de acceptatie-opslag en het schrijven van de kaart. Die drie schrijven op
   acceptatie en gebeuren pas ná de bouw, met expliciete toestemming van Friso. De bouw levert de
   scripts en de toetsen; de droogloop mag wel (die schrijft niets).

## Wat NIET in deze story zit

- **De volume-oogst (`queue_harvest.py`) weer aan de praat krijgen.** Die staat op 1857/1857 en mist
  ontdubbeling; hem opnieuw laten lopen vraagt eerst die bescherming. Eigen story, met eigen meting.
- Het uitbreiden van de keurmerkindex zelf — die is op 19 augustus herbouwd en actueel.
- Het beoordelen zelf; dat is mensenwerk.

## Bronverwijzingen

- [Source: apps/ml-service/app/services/queue_harvest_declared.py — de oogst, zijn kaart en zijn ontdubbeling]
- [Source: apps/ml-service/app/services/queue_harvest.py:75, :283-296 — de volume-oogst, de uitsluitlijst en de INSERT zonder ontdubbeling]
- [Source: apps/api/src/scripts/build-keurmerk-index.ts — de index die de kaart moet voeden]
- [Source: _bmad-output/implementation-artifacts/20-19-declaraties-uit-de-tradeitem-database.md — de story die de index liet groeien]
- [Source: MinIO `flywheel-index/declared-harvest-map.json` (16 juli) en `keurmerk-harvest/declared-harvest-state.json` (1521/1521, reset 27 juli)]

## Change Log

- 2026-08-19: Aangemaakt nadat de meting liet zien dat de wachtrij leeg bleef ondanks de gegroeide
  index. Kernbevinding: niets in de codebase schrijft de kaart die de declaratie-oogst leest.
