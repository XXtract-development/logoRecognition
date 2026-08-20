# Story 20.20: De declaratie-oogst weer aan de gang, en goedkoop houden

Status: **deel A gebouwd (AC1 t/m AC10) — wacht op code review. Deel B (AC11, AC12) is permission-gated en NIET uitgevoerd.**

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
| Keurmerkindex (herbouwd na story 20.19) | 89 codes, 1082 producten, **2376 unieke paren** |
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
| totaal in de index | 2377 rijen, **2376** unieke paren |
| **Nutri-Score** — sleutel `NutritionalScore/A`..`E`, maar de referenties heten `NUTRISCORE_A`..`E`; nul opbrengst, en er bestaat al een eigen Nutri-Score-oogst met een eigen markering | −209 |
| **43 codes zonder ook maar één actieve referentie** — de oogst zoekt strikt in de eigen referentiepool van een code, dus dit levert per definitie niets | −281 |
| **`RECYCLABLE_GENERAL_CLAIM` en `TRIMAN`** — overstroming. `VERIFIED`: allebei hébben ze een actieve referentie, dus geen van de twee uitsluitingen hierboven vangt ze | −537 |
| blijft over | **1349** paren, 39 codes, 867 producten |
| daarvan leverde al eens een item op (en wordt dus overgeslagen) | 252 |
| **echt door te rekenen** | **1097 → ~8,5 uur** bij ~28 s per paar *(uit `20-11-oogst-geheugengrens-batching.md:105`, gemeten op ACC — niet vandaag opnieuw gemeten)* |

*Versie 1 van deze spec noemde 1886 / 41 / 1005 en 1574. Dat was de kolom **zonder** de
overstromingsguard: die twee codes hebben een actieve referentie, dus ze bleven staan terwijl AC2 ze
uitsluit. AC2 en de opbrengsttabel spraken elkaar daarmee tegen (`review-20-20.md`, hoog 1).*

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

1. **Een vastgelegde bouwer maakt de kaart uit de index.** Nieuw script; het naaste precedent is
   `apps/api/src/scripts/build-nutriscore-declared-map.ts` — die bouwt al een code→GTIN-kaart voor
   een oogst. `build-keurmerk-index.ts` levert de vórm en de scriptstijl. Het script: leest
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

4. **De oogst onthoudt wát hij nakeek — maar alleen wat blijvend waar is.** Dit is de duurste
   bevinding en de enige die deze story blijvend goedkoop maakt. Versie 1 wilde élke uitkomst
   onthouden; dat is fout, en het zou het vliegwiel afknellen.

   **Drie soorten uitkomst, en ze horen verschillend behandeld:**

   | uitkomst | onthouden? | waarom |
   |---|---|---|
   | kandidaat aangemaakt | **blijvend** | staat al in de wachtrij; opnieuw aanmaken is een duplicaat |
   | keyline-pagina (20.9) | **blijvend** | eigenschap van de pagina zelf, niet van de referenties |
   | onder de drempel | **voorlopig** | een oordeel tegen de referentiepool van dát moment |
   | cross-code afgewezen (20.7) | **voorlopig** | idem — de vergelijking loopt over referenties |
   | cap bereikt | **nooit** | een runbudget, geen oordeel. Vastleggen zou het paar voorgoed uitsluiten omdat er die nacht toevallig genoeg andere waren |

   **Eigenschap van dit ontwerp: achter een verzadigde code schuift de teller hooguit
   `PER_CODE_CAP` per run op.** De paren worden in vaste volgorde afgewerkt en de teller loopt mee
   met die volgorde. Zit er vooraan in de lijst een code met veel paren, dan raakt die zijn
   runbudget (`DECLARED_HARVEST_PER_CODE_CAP`, standaard 15) op vóórdat de teller voorbij zijn
   paren is — en de paren daarachter komen die nacht dus niet aan de beurt. Een afgeketst paar
   kost niets meer (geen pagina, geen analyse), maar het schuift de teller ook niet op.

   *Met 1349 paren, 39 codes en een cap van 15 is dat geen probleem: geen enkele code is groot
   genoeg om de nacht te vullen. Het wordt er wel één zodra één code honderden paren krijgt — dan
   houdt die code het vliegwiel achter zich traag. Dit staat hier opgeschreven omdat het een
   bewuste eigenschap van de volgorde is en geen fout: wie later ziet dat de teller nauwelijks
   beweegt, moet niet naar een bug gaan zoeken maar naar de codeverdeling kijken. De uitweg, als
   het zover komt, is de volgorde per ronde laten rouleren of de cap per code laten meeschalen —
   allebei buiten deze story.*

   **Waarom "voorlopig" en niet gewoon blijvend:** de oogst matcht tegen de actieve referenties van
   een code. Het hele punt van het vliegwiel is dat die verzameling groeit — een menselijk akkoord
   levert een nieuwe referentie op. Een paar dat vandaag onder de drempel blijft, kan morgen wél
   matchen. Blijvend onthouden sluit de oogst dus af voor precies de verbetering die hij zelf
   voortbrengt.

   **De oplossing: een vingerafdruk van de referentiepool.** Leg bij een voorlopige uitkomst vast
   tegen wélke pool geoordeeld is — het aantal actieve referenties voor die code plus de hoogste
   `updated_at` daarvan. Een voorlopig oordeel telt alleen zolang die vingerafdruk gelijk is;
   verandert hij, dan wordt het paar opnieuw bekeken. Zo blijft de winst behouden zonder het
   vliegwiel te blokkeren.

   **De controle verhuist naar vóór het dure werk, en filtert de hele paginagroep.** `VERIFIED`:
   `propose_regions` staat op `:477` en `review_item_exists` op `:548` — de controle staat dus ná de
   analyse. Maar let op: de pagina wordt **per groep één keer** geladen en gelokaliseerd
   (`for i in groups[src]`, met `page_loaded` als vlag). Een overslag per páár bespaart het
   decoderen en lokaliseren dus níet. Filter de hele groep weg zodra elk paar erin al is nagekeken;
   dat is waar de 8,5 uur vandaan komt.

   Haal de vastlegging **in bulk** op vóór de paginalus, niet per paar — anders vervang je dure
   beeldanalyse door duizenden losse database-opzoekingen.

   **Sleutel:** `(code, gtin, bronpagina)`, en dat is de enige. Versie 1 noemde op één plek
   `(code, gtin)`; die tegenstrijdigheid is weg. Verandert de paginakeuze voor een GTIN, dan is het
   een nieuw paar en mag het opnieuw bekeken worden.

   **Naast, niet in plaats van `review_item_exists`.** Die controle is bewust statusblind en houdt
   ook een eerder afgewézen item tegen; dat gedrag blijft. De nieuwe vastlegging voegt toe wat er
   nooit was: paren die zijn nagekeken en géén item opleverden.

5. **De vastlegging krijgt een eigen tabel, en verdwijnt niet stilzwijgend.**

   **Waar:** een eigen tabel in de database, niet in de objectopslag. Reden: dit vraagt opzoekingen
   per paar, en het bestaande opslagpatroon valt bij een leesfout fail-safe terug op "niets
   onthouden" — precies het dure geval, en dan onzichtbaar. De oogst heeft al een databaseverbinding.

   **Omvang:** in de orde van duizenden rijen (1349 paren nu), met een unieke sleutel op
   `(code, gtin, bronpagina)`. Verwaarloosbaar naast de 7.635 review-items.

   **Ontbreekt of onleesbaar:** de run **stopt met een duidelijke melding**. Hij begint níet stil
   opnieuw — dat is 8,5 uur rekenwerk dat niemand heeft gevraagd, en het zou als "traag" gelezen
   worden in plaats van als "kapot".

   De teller uit het bestaande voortgangsbestand blijft bestaan voor de volgorde binnen één run,
   maar is niet meer de drager van "al gedaan" — die rol gaat volledig naar de vastlegging. Leg vast
   welk proces welk bestand schrijft (de ml-service, niet de bouwer).

   **"De parenlijst verandert" wordt vastgesteld op de paren in de KAART**, niet op de door artwork
   gefilterde paren: die tweede hangt af van wat er die nacht in de opslag staat en zou de teller om
   niets laten terugspringen. **Loopt er een run?** Dan wordt de teller niet teruggezet en meldt de
   bouwer dat; hij wacht niet.

6. **Krimpbescherming, met een getal.** Wordt de nieuwe kaart **meer dan 10% kleiner** in paren dan
   de bestaande, dan wordt hij **niet** geschreven maar gemeld; `--force` overschrijft dat bewust.
   Reden: de index kapt standaard af op 500 GTINs (`KEURMERK_INDEX_LIMIT`,
   `getIndexLimit()`, `build-keurmerk-index.ts:266`) van de 1862, dus een index die per ongeluk met de standaard
   gebouwd is zou de kaart stilzwijgend uitkleden tot een kwart. De grens is toetsbaar zonder echte
   kaart: geef de vergelijkfunctie twee tellingen.

   Twee gevallen die er expliciet bij horen: **is er nog geen kaart**, dan blokkeert de bescherming
   niet (eerste run). En de **droogloop meldt de krimp wél** — anders ontdek je de blokkade pas bij
   het schrijven.

   *De opgeslagen index draagt géén melding dát hij afgekapt is; `summary.gtinsWithData` (nu 1082)
   is het bruikbare tweede signaal om dat te zien.*

7. **De aandrijving wordt geregeld — inhalen en bijhouden zijn twee verschillende dingen.**
   Versie 1 vroeg een nachtelijke start én beloofde "~12 uur eenmalig". Die twee gaan niet samen:
   `VERIFIED` — een nachtelijke run haalt ongeveer 35 paren, dus 1097 paren zou **ruim 31 nachten**
   duren. Scheid ze:

   - **Inhalen:** één keer, met een ruim tijdsbudget, handmatig gestart en permission-gated
     (deel B). ~8,5 uur voor 1097 paren.
   - **Bijhouden:** daarna een nachtelijke start naast de bestaande volume-oogst. Die hoeft alleen
     nog het verschil te doen, en dat is klein — dat is precies de winst van AC4.

   Leg per start vast: wie hem aftrapt, hoe vaak, en met welk tijdsbudget.

   **Ook de kaart zelf wordt periodiek herbouwd**, niet alleen de oogst gestart. Zonder dat komen de
   43 wachtende codes nooit in de kaart zodra ze hun eerste referentie krijgen, en staat de story
   over een maand weer stil op precies dezelfde manier.

   *De twee diensten draaien in aparte containers, dus een omgevingsvariabele "op één plek" bestaat
   niet. Zeg per instelling waar hij gezet wordt.*

8. **Twee oogsters mogen elkaar niet in de weg lopen.** `VERIFIED`: ze draaien in **dezelfde**
   ml-service-container met 8 GiB, en de declaratie-oogst breekt zichzelf af boven 75% van dat
   gedeelde geheugen. De bestaande volume-oogst start om 3:37. Er is vandaag geen enkele
   bescherming: `in_progress` wordt nergens gelezen om een tweede start te weigeren.

   Vereist: een slot dat een tweede oogst weigert zolang er één loopt, én een starttijd die niet
   met 3:37 samenvalt. Een run die het slot niet krijgt stopt met een melding — hij wacht niet en
   hij draait niet alsnog.

9. **Geen regressie op de bestaande guards.** De cross-code-guard uit story 20.7
   (`_cross_code_rejected`) en de keyline-guard uit 20.9 (`_is_keyline`) blijven ongewijzigd en hun
   toetsen groen. *Bij naam, niet op regelnummer: de vorige ronde liet zien dat die verschuiven.*

10. **RED-bewijs** voor AC2 (elk van de drie uitsluitingen), AC3 (de botsing), AC4 (het onderscheid
    blijvend/voorlopig én overslaan vóór de analyse), AC6 en AC8 (het slot), en **geen regressie**:
    de api- en ml-suites blijven groen.

### Deel B — ná toestemming, niet onderdeel van de bouw

11. **Permission-gated.** Het schrijven van de kaart, het terugzetten van de teller, de
    inhaal-oogstrun **en het plaatsen van de periodieke start op `vanilla`** schrijven alle vier op
    acceptatie en wachten op expliciete toestemming van Friso. Dat laatste hoorde er in versie 1
    niet bij, terwijl een cron-regel plaatsen net zo goed een wijziging op die machine is. De **droogloop** mag wel — die schrijft niets.

> [!warning] Migratie 0021 is ná zijn eigen commit nog gewijzigd
> `apps/api/prisma/migrations/0021_add_declared_harvest_checks/` kreeg in de review-verwerking
> commentaarregels en twee `COMMENT ON`-opdrachten erbij, ná de commit waarin hij is aangemaakt.
> Prisma bewaart per toegepaste migratie een checksum, dus **is hij ergens al toegepast, dan
> klaagt hij bij de eerstvolgende `migrate`-opdracht over een gewijzigde checksum**. Nu ongevaarlijk:
> niets past hem automatisch toe (`VERIFIED` in twee reviewrondes) en hij is op geen enkele
> omgeving gedraaid — de tabel `declared_harvest_checks` bestaat daar dus nog niet. Wie hem als
> eerste toepast heeft er geen last van. Wordt er ooit tóch een omgeving gevonden waar hij al
> staat: niet opnieuw wijzigen, maar de checksum daar bijwerken (`prisma migrate resolve`).

12. **Meetbare uitkomst**, vast te leggen ná toestemming:

    | wat | vóór (gemeten 19 aug) | verwacht | gemeten |
    |---|---|---|---|
    | open items in de wachtrij | 0 | — | *na de run* |
    | codes in de kaart | 39 | **39** | |
    | producten in de kaart | 791 | **867** | |
    | paren in de kaart | 1521 (oude lijst) | **1349** | |
    | paren om door te rekenen | — | **1097** | |
    | rekentijd van de inhaalronde | — | **~8,5 uur**, eenmalig | |
    | rekentijd van de vólgende nachtelijke ronde | — | **klein** — dat is de winst van AC4 | |

    *De kaart wordt in páren kleiner dan de oude (1349 tegenover 1521) omdat de overstromingsguard
    er 537 uithaalt. Dat is gewenst, maar het botst met de krimpbescherming uit AC6 — de eerste
    schrijfactie heeft dus `--force` nodig, mét die reden erbij. Leg dat vast, anders staat de
    ontwikkelaar voor een blokkade die niemand verwacht.*

    *De verwachte opbrengst in nieuwe items staat er bewust niet als hard getal: de historische
    verhouding komt van een andere codemix. De meting stelt hem vast.*

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

## Onderzocht en weerlegd

**"Een gescopete debugrun vervuilt `map_pairs`"** — gemeld tijdens de bouw, nagemeten en
**onjuist**. `map_pairs` komt uit `_all_pairs()`, en die functie is expliciet scope-onafhankelijk
(`queue_harvest_declared.py:572-580`, met de reden erbij: anders zou één debugrun de vingerafdruk
van dat ene stukje vastleggen en de nachtelijke teller om niets terugzetten). Gemeten met een
gescopete run over een kaart van drie paren: `map_pairs` blijft 3 terwijl `total_pairs` op 2 staat.

De voorgestelde reparatie — `map_pairs` een scope-achtervoegsel geven, net als de teller en de
vingerafdruk — is daarom **niet doorgevoerd**: die zou een scope-onafhankelijke waarde dupliceren
in een scope-veld, en daarmee juist de verwarring introduceren die hij moest wegnemen.

## Change Log

- 2026-08-20 (laatste ronde): **De vijf lage punten uit `review-20-20-code-v3.md` verwerkt.** Het
  hoge punt en de vier middelen zaten al in `d3e0d4c`.

  "Bucket bestaat niet" werd door de oogst gelezen als "eerste run" — de tekstmatch ving `does not
  exist`, en dat is precies de standaardboodschap van een ontbrekende bucket. Zo'n
  configuratiefout zou de teller op nul hebben gezet; nu stopt de run ermee, terwijl een
  ontbrekende sleutel gewoon een verse start blijft.

  Een run die netjes wijkt omdat er al een oogst loopt (`locked`) geeft geen alarm meer. De
  eenmalige inhaalronde duurt tien uur, en elke nacht dat die liep leverde een cron-mail
  "mislukt" op voor een run die precies deed wat hij moest doen — daar leren mensen die mail van
  wegklikken, en dan mist ook een échte storing.

  Vier toetsen die een tekenreeks in een ánder bestand zochten, meten nu gedrag: de startscripts
  draaien echt (met een nagemaakte `docker` in een wegwerpmap, geen enkele container aangeraakt)
  en bewijzen dat twee containers met dezelfde prefix de run tegenhouden, dat een onschrijfbaar
  logbestand een geslaagde run niet als mislukking rapporteert en de foutcode van het werk niet
  platslaat, en dat het tijdsbudget uit de runbook werkelijk aan de container wordt meegegeven.
  Het vingerafdrukveld wordt getoetst op een voortgangsbestand dat de oogst zélf heeft
  weggeschreven, in plaats van op de brontekst van de python-module.

  Nieuw is ook een toets die bewijst dat de exitcode de container werkelijk verlaat: dat
  `exit_code_for` de goede getallen gaf was gedekt, dat `__main__` ze aan `sys.exit` doorgeeft
  niet — en zonder die regel meldt elke mislukte oogst weer stilletjes succes.

  Tot slot staat nu opgeschreven wat het ontwerp doet achter een verzadigde code: de teller
  schuift dan hooguit `PER_CODE_CAP` per run op. Met 39 codes en een cap van 15 is dat geen
  probleem, maar wie later ziet dat de teller nauwelijks beweegt moet niet naar een fout gaan
  zoeken.

  **Terugdraai-bewijs** voor de drie gedragswijzigingen: met de bucket-uitsluiting uitgezet valt
  alléén de bucket-toets om (38 van 39 blijven groen), met `locked` terug in de alarmlijst alléén
  de wijk-toets, en met `sys.exit` uit `__main__` alléén de exitcode-toets. De twee nieuwe
  scripttoetsen zijn op dezelfde manier nagelopen: met `PIPESTATUS` teruggedraaid naar kale
  `pipefail` en met de multi-treffer-guard uitgezet worden precies die toetsen rood.

- 2026-08-20 (nog later): **De her-review verwerkt** (`review-20-20-code-v2.md`, FAIL, 1 hoog /
  3 middel / 6 laag). Het hoofddeel van het hoge punt zat al in commit `f051ddf`; de rest is nu
  gedaan, met terugdraai-bewijs voor het hoge punt en voor middel 2 en 3.

  **Hoog (restdeel).** Een cap van nul of lager zette de oogst permanent stil: élk paar ketste af
  op het runbudget, geen enkel paar telde als afgehandeld, de teller schoof nooit op en de run
  eindigde nooit op `complete` — elke nacht dezelfde paren, elke nacht hetzelfde niets. Zo'n run
  stopt nu meteen met status `cap_disabled`, vóór het model, de kaart, het slot en de teller.
  Nieuw is ook de toets die twee opeenvolgende runs met een volle cap naast elkaar legt: de teller
  schuift op, en de tweede run laadt de al beoordeelde en de afgeketste pagina's niet opnieuw.

  **Middel.** De droogloop van de bouwer besliste nog op een tellíng terwijl de oogst op een
  digest beslist — bij evenveel maar andere paren meldde hij dus het tegenovergestelde van wat er
  zou gebeuren, op precies het scherm waarop een mens over `--apply` beslist. De bouwer rekent nu
  dezelfde vingerafdruk uit (gemeten tegen de uitvoer van de draaiende python-module, niet
  nagerekend). De teller is scope-bewust geworden: een gescopete debugrun houdt zijn eigen teller
  en vingerafdruk in het voortgangsbestand en schrijft de nachtelijke teller niet meer over — die
  liet sinds de scope-onafhankelijke vingerafdruk een stil dekkingsgat achter. En een ONLEESBAAR
  voortgangsbestand krijgt nu dezelfde behandeling als een onleesbare kaart: "bestaat niet" blijft
  een verse start, een leesfout stopt de run met status `state_unavailable` in plaats van de stand
  te overschrijven.

  **Laag.** `stale_marker_cleared` meldt in een droogloop niet langer een opruiming die er niet
  was; de statussen waarop niets gebeurde (`map_unavailable`, `state_unavailable`,
  `checks_unavailable`, `locked`, `cap_disabled`) geven een niet-nul exitcode zodat de cron er niet
  stil op blijft staan; een onschrijfbaar logbestand draait die exitcode niet meer om (`PIPESTATUS`
  in plaats van kale `pipefail`, nagemeten in drie gevallen); de api-containerprefix wordt nu
  getoetst tegen twee namen waarop op acceptatie werkelijk `docker exec` is gedraaid; allebei de
  scripts stoppen bij méér dan één treffer in plaats van er met `head -n 1` één te gokken; de dode
  assert in de markertoets is vervangen door een echte volgordemeting, en de TS-slottoets rekent de
  vervaltijdformule niet meer na. Het poortgetal in `sprint-status.yaml` staat op de gemeten 1131.

  **Bewust niet gedaan:** de zeven `eslint`-waarschuwingen over ongebruikte `eslint-disable`-regels
  in de bouwer. Ze stonden in de toelichting van de review, niet in de lijst met te wijzigen punten,
  en ze zeggen niets over het gedrag.

- 2026-08-20 (later die dag): **De code-review verwerkt** (`review-20-20-code.md`, FAIL, 4 hoog /
  6 middel / 5 laag). Alle vijftien punten doorgevoerd, geen waivers.

  **De vier hoge, elk met terugdraai-bewijs:** het kaartherbouwscript riep `npx tsx src/…` aan —
  een commando dat in het beeld op acceptatie niet kán draaien (alleen `dist` zit erin, en `tsx`
  staat in geen enkele `package.json`), dus de wekelijkse herbouw zou bij de eerste uitvoering
  gefaald hebben; het draait nu `node dist/scripts/build-declared-harvest-map.js --apply` en zoekt
  de containernaam op zijn voorste deel op in plaats van hem te raden. Het slot vervalt niet meer
  na een vaste zes uur maar draagt de vervaltijd van de run die het zette (tijdsbudget + marge),
  zodat de inhaalronde van tien uur gedekt is. De vingerafdruk van de referentiepool gaat over
  dezelfde bron als de match. En "de parenlijst verandert" is exact geworden: een digest over de
  paren, over de HELE kaart, in plaats van een telling binnen de env-scope.

  **De zes middelen:** de run-marker gaat er nu vóór het dure voorwerk op (het raam was tientallen
  seconden) en wordt op elk bewust stoppad opgeruimd; een paar dat op de cap afketst telt niet meer
  als afgehandeld, zodat de volgende run het echt opnieuw aanbiedt; een onbruikbare kaart is een
  storing (`map_unavailable`) in plaats van een kaart van nul paren die de teller wist en
  `complete` meldt; beide startscripts schrijven hun melding naar een logbestand én naar stdout;
  de AC7-toetsen leggen de commando's uit de scripts naast de werkelijke beschikbaarheid in plaats
  van naast dit document; en de kaartvingerafdruk hangt niet meer van `DECLARED_HARVEST_CODES` af.

  **De vijf lagen:** een uitgesloten paar dat via een andere veldsoort tóch in de kaart staat telt
  niet meer als uitgesloten; "er stond al een item" heeft een eigen uitkomstwaarde
  (`existing_item`); de bouwer vergelijkt referentiecodes hoofdlettergevoelig, net als de
  matchquery, zodat een afwijkend geschreven code zichtbaar op de wachtlijst landt in plaats van
  onzichtbaar in de kaart; de droogloop geeft geen exitcode 1 meer bij een geblokkeerde krimp; en
  de tabelcommentaar zegt nu dat verweesde rijen blijven staan.

- 2026-08-20: **Deel A gebouwd** op tak `epic-20-declaratie-oogst`, alle tien criteria van deel A
  afgedekt met falende toetsen vooraf (ATDD) en daarna groen gemaakt. Nieuw: de kaartbouwer
  `apps/api/src/scripts/build-declared-harvest-map.ts` (droogloop als standaard, `--apply`
  schrijft, `--force` passeert de krimpgrens), de tabel `declared_harvest_checks` (migratie 0021)
  met de bulk-ophaal en het groepsfilter in `queue_harvest_declared.py`, het slot tegen een
  tweede gelijktijdige oogst, en de vastgelegde aandrijving in `20-20-aandrijving.md` met twee
  startscripts onder `scripts/deployment/`.

  **Eén afwijking van de spec, bewust en gemeld:** AC4 vraagt een vingerafdruk van
  "het aantal actieve referenties plus de hoogste `updated_at`". `reference_logos` heeft geen
  `updated_at`-kolom (migratie 0004 kent alleen `created_at`). De vingerafdruk is daarom
  `<aantal>|<md5 over de id's>`, gemeten over `reference_embeddings` gejoind op ACTIEVE
  `reference_logos` — precies de verzameling waarop de match draait
  (`find_similar_references_by_codes`).

  *Deze onderbouwing verving na de code-review van 20 augustus de eerdere
  (`<aantal actieve referenties>|<hoogste created_at>`, gemeten over `reference_logos`), die
  aantoonbaar niet dekte wat ze beloofde. Twee gaten:* **(1)** *de match draait op de
  embeddings, niet op de referentierijen: een actieve rij zónder embedding telde mee zonder
  iets bij te dragen, en kreeg hij er later één, dan veranderde de matchbare pool volledig
  terwijl de vingerafdruk gelijk bleef. Precies de toestand die in dit dossier al gemeten is —
  RECYCLABLE had 26 actieve referentierijen met nul embeddings.* **(2)** *een
  netto-nul-wisseling (één erbij, één eraf, met een oudere `created_at`) liet aantal én jongste
  tijdstempel ongemoeid. Het digest over de id's vangt beide, plus deactivatie en
  code-wisseling — dus méér dan een `updated_at` zou.*

  **Twee toevoegingen binnen de geest van de criteria:** een paar dat al een review-item heeft
  (`review_item_exists`) wordt nu óók vastgelegd, als blijvend — het is dezelfde klasse als
  "kandidaat aangemaakt", en zonder die regel werd de pagina elke ronde opnieuw geladen voor een
  paar dat allang af was. En de run-marker wordt pas gezet ná de bulk-ophaal, zodat een run die
  op een ontbrekende tabel strandt geen slot achterlaat.

  Deel B (AC11, AC12) is niet uitgevoerd: geen kaart geschreven, geen teller teruggezet, geen
  inhaalronde gedraaid en geen planning op `vanilla` geplaatst.
- 2026-08-19: **Versie 2** na `review-20-20.md` (FAIL, 4 hoog / 10 middel / 4 laag). Alle dertien
  punten verwerkt. Twee daarvan veranderden de story wezenlijk:

  **De derde uitsluiting stond in geen enkel getal.** `RECYCLABLE_GENERAL_CLAIM` en `TRIMAN` hebben
  allebei een actieve referentie, dus geen van de andere twee uitsluitingen ving ze. Alle cijfers
  liepen daardoor 537 paren te hoog. Zelf nagemeten en gecorrigeerd: **1349 paren, 39 codes, 867
  producten, 1097 door te rekenen, ~8,5 uur** — versie 1 zei 1886 / 41 / 1005 / 1574 / ~12 uur.

  **AC4 wilde te veel onthouden.** "Onder de drempel" is een oordeel tegen de referentiepool van dát
  moment; blijvend vastleggen zou de oogst afsluiten voor precies de referenties die het vliegwiel
  zelf oplevert. En "cap" is een runbudget, geen oordeel. Nu drie soorten uitkomst — blijvend,
  voorlopig (met een vingerafdruk van de referentiepool) en nooit — plus de eis dat de hele
  paginagroep vóór het laden gefilterd wordt, want de pagina wordt per groep geladen en een overslag
  per paar bespaart het decoderen niet.

  Verder: een eigen tabel voor de vastlegging met stoppen-bij-ontbreken in plaats van stil
  terugvallen; inhalen en bijhouden gescheiden (een nachtelijke run haalt ~35 paren, dus 1097 zou 31
  nachten duren); een slot tegen twee gelijktijdige oogsters in dezelfde 8 GiB-container; de kaart
  óók periodiek herbouwen; het plaatsen van de planning erkend als schrijfactie; een krimpgrens van
  10% met de eerste-run- en droogloop-gevallen erbij; en de correcties 2377→2376 unieke paren,
  `:479`→`:477`, `:261-264`→`:266`, plus de herkomst van de ~28 s per paar.
- 2026-08-19: Versie 1 aangemaakt na `review-20-2.md` (FAIL). Eigen nummer omdat 20.2 bezet is.
