---
titel: Draaiplan proef getrainde detector
hoort-bij: SPEC.md (CAP-10)
datum: 2026-11-01
peildatum_code: spike/proef-getrainde-detector (zie git log van deze map)
---

# Draaiplan

Wie dit draait, volgt de stappen in deze volgorde (toetsset §4) en stopt bij elk stoppunt: dat gaat terug naar Friso, niet
zelf beslissen ([SPEC.md](SPEC.md#constraints)). Alle commando's draaien vanuit deze map. Klantdata staat alleen in
`PROEF_MAP`; elk gereedschap weigert te schrijven binnen een git-werkboom.

```sh
export PM=~/logo-meetset-20261018/proef-detector      # PROEF_MAP
MAAT=N                                                 # detectormaat N (besluit Friso 01-11-2026); S/M/L alleen na een nieuw besluit, met --besluit
set -a; . ~/claude-team-config/secrets/.env; set +a    # alleen OPENROUTER_API_KEY nodig; nooit in een bestand of log zetten
uv sync --group dev                                    # stap 9 en verder: uv sync --group dev --group detector
```

> [!note] Kosten en uitgavengrens
> Elke betaalde stap rekent vóór de start de verwachte uitgave uit en start niet boven 1,5× de raming (stoppunt 5); tijdens
> de stap wordt de aanroep die de grens zou passeren niet verstuurd. Tijden met "INFERENCE" zijn geschat, niet gemeten.

### Stap 1 — scheiding

Commando: `uv run python scheiding.py invoer --proef-map $PM && uv run python scheiding.py kies --proef-map $PM`
Uitvoer: `$PM/invoer/` (kopie van de zeven invoerbestanden + `sha256.json`) en `$PM/scheiding.json`: 5 trainingsleveranciers, zwakste waarde 16,5, de tabel uit toetsset §2 (GTIN's en leveranciers per rij), 265 uitgesloten GTIN's.
Kosten: $0
Tijd: < 1 minuut
Stoppunt: geen; wijkt de tabel af van toetsset §2, dan is de invoer veranderd: niet doorgaan en melden.
ongetest: de opdrachtregel heeft geen eigen automatische test; `lees_declaraties`, `kies` en `schrijf` zijn getest, de `lokaal`-test reproduceert de tabel op de echte invoer, en een rooktest op 01-11-2026 met een tijdelijke map gaf dezelfde tabel.

### Stap 2 — kandidaten

Commando: `uv run python toets.py kandidaten --proef-map $PM` en daarna ophalen en bouwen:
```sh
T=$PM/toets
uv run python beelden.py ophaallijst --paren $T/kandidaten-paren.tsv --uit $T            # ssh replica-db, alleen SELECT
uv run python beelden.py ophalen --lijst $T/ophaal-paden.txt --doel $T/bron-raw           # rsync banana, nice -n 19, alleen lezen
uv run python beelden.py bouwen --ophaallijst $T/ophaallijst.tsv --bron $T/bron-raw --uit $T/gecombineerd
uv run python beelden.py origineel-paden --paren $T/kandidaten-paren.tsv --manifest $T/gecombineerd/manifest.json --uit $T
uv run python beelden.py ophalen --lijst $T/originelen-paden.txt --doel $T/bron-raw
uv run python beelden.py bouwen-origineel --originelen $T/originelen.tsv --bron $T/bron-raw --uit $T/gecombineerd
uv run python beelden.py origineel-paden --paren $T/kandidaten-paren.tsv --alleen-pdf --uit $T      # route A: elk PDF-origineel
uv run python beelden.py ophalen --lijst $T/pdf-originelen-paden.txt --doel $T/bron-raw
uv run python beelden.py pdftekst --originelen $T/pdf-originelen.tsv --bron $T/bron-raw --uit $T/certificaten.json
uv run python toets.py ontdubbel --proef-map $PM --manifest $T/gecombineerd/manifest.json
```
Uitvoer: `$T/kandidaten.json` (±365 kandidaten: tot 40 per keurmerk, Nutri-Score 40 over A/B/C, tot 10 gelijkende per keurmerk; rooktest 01-11: 365), gebouwde beelden met `manifest.json` (sha256, maat, `bron: origineel` waar geen print-laag is gebouwd; een doc waarvan de print-laag niet bouwde krijgt ook het origineel), `originelen-overgeslagen.tsv` (docs zonder bruikbaar origineel, met reden), `certificaten.json` (tekst van het PDF-origineel van elk doc dat er een heeft, ook met print-laag), `toets-docs.json` (na ontdubbelen op GTIN, sha256 en dHash ≤ 6). Geeft ssh zelf een fout (exitcode 255), dan stopt `origineel-paden`: dat is geen "geen origineel".
Kosten: $0
Tijd: ±1 uur, vooral rsync van ±365 docs (INFERENCE)
Stoppunt: 6 als een commando iets anders zou doen dan lezen op `banana` of `replica-db`.
ongetest: `kandidaten`, `ontdubbel`, de query, de rsync-/ssh-opdracht, samenvoegen, PDF-omzetting en opslaan zijn getest; de netwerkstappen zelf (ssh, rsync, de `ls` in de bekende docmap voor originelen) en de opdrachtregels draaiden in deze build niet tegen productie.

### Stap 3 — voorinvulling

Commando: `uv run python toets.py voorinvulling --proef-map $PM --manifest $PM/toets/gecombineerd/manifest.json --docs $PM/toets/toets-docs.json --zdr-logo $PM/logos/zdr-proef.png`
Uitvoer: `$PM/toets/zdr-proef.json` (uitkomst van de zdr-proef met een officieel logo, geen klantartwork), `voorinvulling.json` (per etiket de keurmerken die het model beoordeelde, Nutri-Score-letters, hinttegels, gelijkende, model `anthropic/claude-sonnet-5.5`, kosten, ruwe JSON; een keurmerk zonder AI-oordeel blijft op de pagina zonder keuze; een mislukte voorinvulling heeft lege velden en `fout`), `items.json` en `beelden/` voor de invulpagina. Per aanroep het hele etiket plus hoogstens 16 tegels; een hoog etiket krijgt extra aanroepen. Na elk etiket weggeschreven; opnieuw starten slaat klare etiketten over en probeert mislukte opnieuw. Vijf etiketten op rij geweigerd door de aanbieder: de run stopt.
Kosten: ±$21 (±350 × $0,06); grens $31,50, over herstarts heen bijgehouden in `$PM/uitgaven.json`
Tijd: ±3 uur (±30 s per aanroep, één voor één; INFERENCE)
Stoppunt: 3 als de zdr-proef mislukt of de aanbieder 404 geeft (geen zdr-endpoint); 5 bij de uitgavengrens.
ongetest: `voorinvulling` en de client zijn getest met een nagebootste aanbieder; de opdrachtregel (beelden, tegels, hinttegels, items.json) draaide niet, omdat de build geen klantartwork naar OpenRouter stuurt. Leg vóór de start `$PM/logos/zdr-proef.png` neer (bijvoorbeeld het Wikimedia-logo van EU-biologisch uit de momentopname).

### Stap 4 — stoppunt 2

Commando: `uv run python toets.py rapport --proef-map $PM`
Uitvoer: per keurmerk (8) het aantal etiketten waarop het volgens de voorinvulling waarschijnlijk staat; exitcode 2 en de lijst `stoppunt_2` als een keurmerk onder 16 staat.
Kosten: $0
Tijd: < 1 minuut
Stoppunt: 2 als een keurmerk minder dan 16 waarschijnlijke etiketten heeft (scheiding versoepelen of het keurmerk zonder besluit laten: keuze van Friso).
ongetest: `rapport` en `stoppunt2` zijn getest; de opdrachtregel niet.

### Stap 5 — bevestiging

Commando: `uv run python invul/server.py --map $PM/toets --poort 8765` en open `http://127.0.0.1:8765/`
Uitvoer: `$PM/toets/uitslag.json` volgens het schema van toetsset §6; de pagina toont per keurmerk de stand tegen het doel (≥ 16 mét, ≥ 50 zonder). Sneltoetsen: ←/→ vorige/volgende, `b` = bevestigd zoals ingevuld en door (alleen als bij alle 7 keurmerken en bij Nutri-Score een keuze staat; anders een melding en blijft het etiket staan); elke keuze wordt direct opgeslagen, opslagen gaan één voor één naar de server, een tussenstand laat "bevestigd" staan, en wat Friso typt staat als concept in de browser tot de server de opslag bevestigt. De server antwoordt alleen op `127.0.0.1`/`localhost` en neemt opslagen alleen aan vanaf de eigen pagina.
Kosten: $0
Tijd: ±2 uur voor ±350 etiketten (±20 s per etiket; INFERENCE)
Stoppunt: geen

### Stap 6 — aanvullen

Commando: `uv run python toets.py kandidaten --proef-map $PM --alleen <CODE> --max-per 60 --bestaand $PM/toets/kandidaten.json` (CODE = het keurmerk onder het doel, of `NUTRISCORE`; `--alleen` zonder `--bestaand` weigert), daarna voor `kandidaten-aanvulling-paren.tsv` de ophaal- en bouwregels van stap 2, dan `uv run python toets.py ontdubbel --proef-map $PM --manifest $PM/toets/gecombineerd/manifest.json --kandidaten $PM/toets/kandidaten-aanvulling.json` (ontdubbelt tegen de bestaande `toets-docs.json` en voegt de nieuwe docs eraan toe), stap 3 opnieuw (klare etiketten worden overgeslagen) en de server herstarten (hij leest `items.json` bij de start).
Uitvoer: `$PM/toets/kandidaten-aanvulling.json` met alleen nieuwe GTIN's, in dezelfde vaste volgorde (om de beurt per leverancier, binnen een leverancier op sha256("20261031" + GTIN)); `toets-docs.json` aangevuld.
Kosten: $0,06 per extra etiket (valt onder de post voorinvulling)
Tijd: per ronde ±30 minuten plus Friso's bevestiging (INFERENCE)
Stoppunt: 2 als een keurmerk na aanvullen nog onder 16 bevestigde etiketten mét blijft.
ongetest: de volgorde komt uit de geteste functie `kandidaten`; de weigering van `--alleen` zonder `--bestaand` en het samenvoegen in `ontdubbel` zijn getest, het ophalen van de aanvulling niet (netwerk).

### Stap 7 — dHash-controle

Commando: bouw eerst de echte trainingsetiketten (zelfde gereedschap als stap 2, aan de trainingskant) en vergelijk ze met de definitieve toetsset:
```sh
uv run python toets.py kandidaten --proef-map $PM --kant train --max-per 80     # → $PM/train/kandidaten.json (rooktest: 461)
# ophalen en bouwen als in stap 2, met map $PM/train in plaats van $PM/toets
uv run python scheiding.py dhash --toets $PM/toets/beelden --train $PM/train/gecombineerd --uit $PM/dhash-controle.json
```
Uitvoer: `$PM/dhash-controle.json` met de trainingsbeelden op dHash-afstand ≤ 6 van een toetsbeeld (die gaan uit de training; het toetsbeeld blijft) en de aantallen.
Kosten: $0
Tijd: ±1 uur, vooral ophalen (INFERENCE)
Stoppunt: geen
ongetest: `dhash` en `bijna_gelijk` zijn getest; de opdrachtregel en het ophalen aan de trainingskant niet. Verwijder de genoemde trainingsbeelden uit `$PM/train/gecombineerd/manifest.json` vóór stap 10 (handmatig, nog geen gereedschap).

### Stap 8 — scheiding bevriezen

Commando: `uv run python bevries.py hash --pad $PM/scheiding.json --uit $PM/scheiding-bevroren.json`
Uitvoer: `$PM/scheiding-bevroren.json` met de sha256 van `scheiding.json` en het tijdstip; het bestand wordt niet overschreven. Vanaf hier wijzigt de scheiding niet meer (toetsset §7).
Kosten: $0
Tijd: < 1 minuut
Stoppunt: geen
ongetest: alleen een sha256 vastleggen (zelfde functie als de geteste bevriezing); de opdracht `hash` zelf heeft geen test.

### Stap 9 — snelheidsmeting

Commando: eerst de licentiecontrole, in een eigen blok:
```sh
uv sync --group dev --group detector && uv run --group dev --group detector python licenties.py
```
Eindigt dit blok met een exitcode ≠ 0 (een overtreding in `"overtredingen"`), dan hier stoppen (stoppunt 4) en het volgende blok niet draaien: dat start de betaalde voorlabels. Anders een kleine nagemaakte set maken en maat N meten:
```sh
uv run python generator.py logos --proef-map $PM
uv run python echt.py voorlabels --lijst $PM/train/lijst.json --proef-map $PM --uit $PM/train/voorlabels.json --zdr-logo $PM/logos/zdr-proef.png
uv run python echt.py dataset --lijst $PM/train/lijst.json --voorlabels $PM/train/voorlabels.json --proef-map $PM --uit $PM/train/echt
uv run python generator.py tegels --proef-map $PM --achtergronden $PM/train/echt/achtergronden.json --uit $PM/train/snelheid --n 200
uv run python generator.py tegels --proef-map $PM --achtergronden $PM/train/echt/achtergronden.json --uit $PM/train/snelheid --n 8 --split valid --seed 7
uv run python generator.py tegels --proef-map $PM --achtergronden $PM/train/echt/achtergronden.json --uit $PM/train/snelheid --n 8 --split test --seed 8
uv run python train.py snelheid --maat $MAAT --dataset $PM/train/snelheid --uit $PM/modellen/snelheid-$MAAT
```
`$PM/train/lijst.json` = `[{doc_id, gln, pad}]` van de gebouwde trainingsetiketten uit stap 7 (nog geen gereedschap: maak hem uit `$PM/train/gecombineerd/manifest.json`). De voorlabels (ook de achtergrondscreening) horen bij de post "voorlabels + achtergrondscreening" en zijn ook nodig voor stap 10; een mislukt etiket wordt bij een herstart opnieuw geprobeerd, vijf weigeringen op rij stoppen de run. `echt.py dataset` maakt `train/`, `valid/` en `test/` (kopie van `valid`, omdat `rfdetr` een testmap wil) en `achtergronden.json` alleen uit de trainingskant, zodat validatie-etiketten nooit via de generator in de training komen. De meting gebruikt 50 iteraties × batch 4 = 200 trainingstegels (vandaar `--n 200`) en 4 validatietegels.
Uitvoer: het licentierapport (aantal pakketten, overtredingen, lijst "even ruim"); voor maat N seconden per iteratie, apparaat (MPS) en de verwachte duur van een trainingsfase in `snelheid.json`. Rooktest 01-11-2026: N ±7,2 uur per fase; S liep vast en kwam op ±11 uur, waarna Friso besliste: alleen N. Een meting van een andere maat hoort alleen bij een nieuw besluit (`--besluit "<verwijzing>"`, komt in `snelheid.json`); zie "Snelheid" hieronder.
Kosten: voorlabels ±$10 (±800 etiketten × $0,012; grens $15, bijgehouden in `$PM/uitgaven.json`); snelheidsmeting $0
Tijd: voorlabels ±2 uur (INFERENCE); meting ±15 minuten
Stoppunt: 1 als een trainingsfase met N volgens de meting langer dan 8 uur duurt of MPS niet werkt; 4 als de licentiecontrole een overtreding meldt; 8 als RF-DETR niet installeert of niet traint; 3 en 5 voor de voorlabels.
ongetest: `generator.genereer`, `echt.naar_tegels`/`valsplit`/`voorlabels`/`rapport` en `train.snelheid` (rooktest `zwaar` op MPS) zijn getest; de opdrachtregels van `generator logos/tegels` en `echt dataset` draaiden alleen in een rooktest op verzonnen beelden in een tijdelijke map, `echt voorlabels` niet (geen klantartwork naar OpenRouter in de build).

### Stap 10 — training

Commando: twee fasen, daarna keuze en drempels op de validatieset van de trainingskant:
```sh
G="uv run python generator.py tegels --proef-map $PM --achtergronden $PM/train/echt/achtergronden.json --uit $PM/train/nagemaakt"
$G --n 5000 && $G --n 500 --split valid --seed 7 && $G --n 100 --split test --seed 8
uv run python train.py train --fase nagemaakt --maat $MAAT --dataset $PM/train/nagemaakt --uit $PM/modellen/$MAAT-1 --epochs 20
uv run python echt.py dataset --lijst $PM/train/lijst.json --voorlabels $PM/train/voorlabels.json --proef-map $PM \
    --uit $PM/train/echt --meng $PM/train/nagemaakt/train --meng-aantal 1000
uv run python train.py train --fase echt --maat $MAAT --dataset $PM/train/echt --uit $PM/modellen/$MAAT-2 --epochs 20 --start <checkpoint uit $MAAT-1>
uv run python herken.py detecteer --model <checkpoint uit $MAAT-2> --maat $MAAT --lijst $PM/train/echt/validatie-lijst.json --uit $PM/train/valid-kandidaten.json
uv run python herken.py drempels --kandidaten $PM/train/valid-kandidaten.json --waarheid $PM/train/echt/validatie-waarheid.json --uit $PM/modellen/drempels.json
uv run python echt.py validatie-uitslag --waarheid $PM/train/echt/validatie-waarheid.json --uit $PM/train/echt/validatie-uitslag.json
uv run python herken.py beslis --kandidaten $PM/train/valid-kandidaten.json --drempels $PM/modellen/drempels.json \
    --lijst $PM/train/echt/validatie-lijst.json --referenties $PM/logos/referenties.json --grootboek $PM/uitgaven.json \
    --uit $PM/train/valid-da.json --meta $PM/train/valid-da-meta.json
uv run python tel_proef.py --uitslag $PM/train/echt/validatie-uitslag.json --route D+A=$PM/train/valid-da.json --meta D+A=$PM/train/valid-da-meta.json --uit $PM/train/valid-tabellen
```
De maat blijft N. Een ander aantal epochs of tegel 768/1536 probeer je alleen op de validatieset; kies daar, nooit op de toetsset (verwijder voor een nieuwe kandidaat `valid-kandidaten.json` en `valid-da.json`: beide slaan klare etiketten over). Een code die op een validatie-etiket alleen onzekere AI-vakjes heeft, staat in `validatie-waarheid.json` als `onzeker`: hij telt voor de drempels en de validatietabel niet als afwezig.
Uitvoer: per fase checkpoint, configuratie, seed, trainingslog, sha256 en herkomst van de voorgetrainde gewichten (`train-resultaat.json`; fase 2 neemt de herkomst van fase 1 over); `drempels.json` (`laag`/`hoog` per code, met terugval op gezamenlijke drempels); validatietabellen per kandidaatmodel; `rapport.json` met per keurmerk de echte etiketten en vakjes en de dHash-clusters die te groot waren voor de validatieset.
Kosten: beoordelaar op de validatieset ±$1,5 (de post "beoordelaar" is samen met D+A en D ±$3; grens $4,50, bijgehouden in `$PM/uitgaven.json`); training $0
Tijd: per fase volgens stap 9 (zie "Snelheid"); detectie op de processor ±5–20 s per etiket (INFERENCE)
Stoppunt: 1 als een fase volgens de meting langer dan 8 uur duurt, of als N op de validatieset tekortschiet: lees in `$PM/train/valid-tabellen/tabellen.md`, sectie `## D+A`, de kolommen gevonden/aanwezig en vals/afwezig (k/n); een keurmerk met ≥ 10 mét en ≥ 30 zonder telt mee, ook als de kolom besluit "te weinig voorbeelden" zegt (die rekent met 16/35), en N schiet tekort als minstens één zo'n keurmerk gevonden < 80% of vals ≥ 10% heeft (puntschatting); dan beslist Friso over S/M/L of een GPU, en die maat draait alleen met `--besluit "<verwijzing>"`. Verder 8 (RF-DETR traint niet; terugval D-FINE is niet gebouwd), 5 (beoordelaar), 7 (`beslis` stopt als een code in de drempels geen referentieplaatje heeft).
ongetest: `config`, `train` en `snelheid` hebben een rooktest op MPS (`zwaar`), `drempels`/`beslis`/`beoordeel` en `tel_proef` zijn getest; de volle training, `--start` (bijtrainen), `--meng`, `detecteer` op echte etiketten en `beslis` met de echte aanbieder draaiden in deze build niet.

### Stap 11 — bevriezen

Commando: eerst de referentieset van K4-aa, de lijst bevestigde toetsetiketten en de instellingen, dan `bevroren.json`:
```sh
uv run --project <hoofdrepo>/apps/ml-service python k4aa_lokaal.py --ml-service <hoofdrepo>/apps/ml-service --proef-map $PM \
    --lijst $PM/toets/toets-lijst.json --uit $PM/uitvoer/k4aa.json --meta $PM/uitvoer/k4aa-meta.json --alleen-referentieset
uv run python toets.py lijst --proef-map $PM --manifest $PM/toets/gecombineerd/manifest.json
printf '{"maat": "%s", "tegel": 1024, "overlap": 256, "drempel": 0.05, "beoordelaar_model": "google/gemini-3.8-flash", "k4aa_budget": 300}\n' "$MAAT" > $PM/instellingen.json
uv run python bevries.py bevries --uit $PM/bevroren.json \
    --onderdeel scheiding=$PM/scheiding.json --onderdeel uitslag=$PM/toets/uitslag.json \
    --onderdeel model=$PM/modellen/$MAAT-2 --onderdeel drempels=$PM/modellen/drempels.json \
    --onderdeel beoordelaar=beoordelaar.py --onderdeel referentieplaatjes=$PM/logos/referenties.json \
    --onderdeel instellingen=$PM/instellingen.json --onderdeel k4aa=$PM/uitvoer/k4aa-referentieset.json \
    --onderdeel telcode=tel_proef.py --onderdeel gewichten=$PM/modellen/$MAAT-2/train-resultaat.json \
    --onderdeel toetslijst=$PM/toets/toets-lijst.json
```
Uitvoer: `$PM/bevroren.json` met de sha256 van elk onderdeel uit meetregels §6 (een map krijgt één sha256 over al zijn bestanden; `referentieplaatjes` één over de inhoud van elk genoemd beeld; `code` vult `bevries` zelf in, over `herken.py`, `beoordelaar.py`, `openrouter.py`, `uitslag.py`, `tel_proef.py`, `k4aa_lokaal.py` en `fase-b/tel.py`). De K4-aa-referentieset bevat de id's én de sha256 van `embeddings.npz`, en het tijdsbudget. Leg in de opmerking bij de run de commit van `apps/ml-service/app/services/k4aa.py` vast (`8c9373d`).
Kosten: $0
Tijd: ±10 minuten
Stoppunt: 7 als een verplicht referentieplaatje ontbreekt: `generator.py logos` meldde op 01-11-2026 dat `PREGNANCY_WARNING` er nog geen heeft (publiek pictogram ophalen, beschrijven in `$PM/logos/handmatig.json`, `generator.py logos` opnieuw).
ongetest: `bevries`, `controleer` en `registreer_run` zijn getest; `toets.py lijst` en `--alleen-referentieset` van de K4-aa-runner niet.

### Stap 12 — toetsrun D+A

Commando: controle, registratie van de run, detectie op de processor en de beslissing; `--bevroren` controleert de bevriezing opnieuw en neemt maat, tegel, overlap, drempel en beoordelaarmodel uit de bevroren instellingen:
```sh
uv run python bevries.py controleer --bevroren $PM/bevroren.json          # weigert bij een gewijzigd onderdeel
RUN=$(uv run python bevries.py run --map $PM/uitvoer --route da)            # eerste run telt
uv run python herken.py detecteer --bevroren $PM/bevroren.json --model <checkpoint uit $MAAT-2> --lijst $PM/toets/toets-lijst.json --uit $PM/uitvoer/toets-kandidaten.json --threads 8
uv run python herken.py beslis --bevroren $PM/bevroren.json --kandidaten $PM/uitvoer/toets-kandidaten.json --drempels $PM/modellen/drempels.json \
    --lijst $PM/toets/toets-lijst.json --referenties $PM/logos/referenties.json --certificaten $PM/toets/certificaten.json \
    --grootboek $PM/uitgaven.json --uit $RUN --meta $PM/uitvoer/da-meta.json
uv run python herken.py beslis ... --uit $PM/uitvoer/d.json --meta $PM/uitvoer/d-meta.json   # zelfde zonder --certificaten (route D, ter informatie)
```
Uitvoer: `da-run1.json` = `{"status": "voltooid", "etiketten": {doc: [meldingen] | {"fout": klasse}}}` en `da-meta.json` (leverancier, tijd, kosten, beoordelaaraanroepen, meldingen door een certificaatnummer); idem voor D. Na elk etiket weggeschreven: valt het proces om, dan zet dezelfde opdracht met dezelfde `$RUN` de run voort. Stopt de run (zdr-weigering, sleutel, tegoed, uitgavengrens), dan staat er `"status": "afgebroken"` met de reden, en eindigt de opdracht met exitcode 3.
Kosten: beoordelaar ±$1,5 (post "beoordelaar" samen met validatie en D; grens $4,50)
Tijd: ±350 × 5–20 s detectie op de processor met 8 threads, plus beoordelaar (INFERENCE)
Stoppunt: 3 (zdr-weigering stopt de run), 5. Na een afgebroken run start een nieuwe run met `bevries.py run --map $PM/uitvoer --route da --herhaling --reden "<reden van de stop>"`; de afgebroken run telt nooit (stap 14 neemt de laatste voltooide).
ongetest: de bouwstenen (`controleer`, `registreer_run`, `laatste`, `beslis`, `beoordeel`, `certificaten`, de uitgavengrens van `beslis`) zijn getest; `detecteer` en `beslis` als opdrachtregel op echte toetsbeelden niet.

### Stap 13 — toetsrun K4-aa

Commando: controle, registratie van de run en de lokale K4-aa-runner in de omgeving van de ml-service (eerst een zdr-proef met een officieel logo, dan de etiketten; tijdsbudget uit de bevriezing):
```sh
uv run python bevries.py controleer --bevroren $PM/bevroren.json
RUN=$(uv run python bevries.py run --map $PM/uitvoer --route k4aa)
uv run --project <hoofdrepo>/apps/ml-service python k4aa_lokaal.py --ml-service <hoofdrepo>/apps/ml-service --proef-map $PM \
    --bevroren $PM/bevroren.json --zdr-logo $PM/logos/zdr-proef.png \
    --lijst $PM/toets/toets-lijst.json --uit $RUN --meta $PM/uitvoer/k4aa-meta.json
uv run --project <hoofdrepo>/apps/ml-service python k4aa_lokaal.py ... --alle-referenties --uit $PM/uitvoer/k4aa-volledig.json --meta $PM/uitvoer/k4aa-volledig-meta.json   # alleen informatief
```
Uitvoer: `k4aa-run1.json` (run-bestand zoals in stap 12; elke detectie binnen de 8 keurmerken is een melding, ook met requires_review) en `k4aa-meta.json` (tijd, kosten, requires_review per etiket); de informatieve run met alle referenties apart. Na elk etiket weggeschreven; een afgebroken run (ook de uitgavengrens) krijgt `"status": "afgebroken"` met de reden en exitcode 3. Met `--bevroren` weigert de runner een referentieset die afwijkt van de bevroren set.
Kosten: ±$8 voor beide runs (2 × ±350 × $0,012; post "k4aa", grens $12, bijgehouden in `$PM/uitgaven.json`); vóór elk etiket stopt de runner als het volgende de grens zou passeren
Tijd: ±350 × 20–60 s per run (INFERENCE)
Stoppunt: 3 (`no_zdr_provider` of een mislukte zdr-proef stopt de run), 5, 6 (de runner leest geen ACC-database; hij vervangt alleen in het eigen proces de referenties door de gefilterde momentopname). Na een stop: nieuwe run met `--herhaling --reden "<reden van de stop>"`.
ongetest: `filter_referenties`, `meldingen_uit`, `draai_etiket`, `draai` (met de uitgavengrens) en `_matrix` zijn getest met een nagebootste k4aa-module en een kleine verzonnen momentopname; `main` (laden van de ml-service-code, de omgeving van de ml-service) draaide in deze build niet.

### Stap 14 — telling

Commando: neem per route de laatste voltooide run en tel precies de drie routes D+A, D en K4-aa (gefilterd):
```sh
DA=$(uv run python bevries.py laatste --map $PM/uitvoer --route da)
K4=$(uv run python bevries.py laatste --map $PM/uitvoer --route k4aa)
uv run python tel_proef.py --uitslag $PM/toets/uitslag.json --route D+A=$DA --meta D+A=$PM/uitvoer/da-meta.json \
    --route D=$PM/uitvoer/d.json --meta D=$PM/uitvoer/d-meta.json --route K4-aa=$K4 --meta K4-aa=$PM/uitvoer/k4aa-meta.json \
    --uit $PM/uitvoer/telling
```
De informatieve K4-aa-run met alle referenties (`k4aa-volledig.json`, stap 13) telt niet mee en wordt hier niet als route meegegeven: hij zou de nakijklijst en de steekproef veranderen. Wie er een tabel van wil, telt hem los, met alleen die route, in een eigen map (bijvoorbeeld `$PM/uitvoer/telling-informatief`).
Uitvoer: `tabellen.json` en `tabellen.md` (per route en keurmerk: gevonden k/n met Wilson-ondergrens, vals k/n met Wilson-bovengrens, verkeerde letter, spreiding per leverancier, leveranciers, besluit; per route tijd, kosten, beoordelaaraanroepen, foutpercentage) en de blinde `nakijklijst.json`: elk paar (etiket, keurmerk) waar minstens één route van Friso's oordeel afwijkt, plus een steekproef van de paren waar alle drie routes overeenkomen (per keurmerk en kant mét/zonder 10%, naar boven afgerond, minstens 1 bij een niet-lege kant; vaste seed 20261101 in `tel_proef.py`, dus elke keer dezelfde trekking). Elke regel heeft alleen nummer, etiket, keurmerk en Friso's eerdere oordeel, door elkaar geschud. In de aparte map `niet-voor-nakijker/` staan `nakijk-sleutel.json` (per nummer: verschil of steekproef) en `verschil.json` (D+A min elke andere route in procentpunten, met de etiketten waarop ze verschillen); die map opent Friso niet vóór het nakijken. `nakijk-sha256.json` legt de sha256 van `nakijklijst.json` en `nakijk-sleutel.json` vast: bewaar die vóór het nakijken (bijvoorbeeld in de opmerking bij de run). Een run die niet voltooid is wordt geweigerd; een zdr-weigering in een route: geen tabellen, exitcode 1.
Kosten: $0
Tijd: < 1 minuut
Stoppunt: geen (foutpercentage boven 2% maakt de run ongeldig; dat staat in de tabel).

### Stap 15 — blind nakijken

Commando: Friso kijkt `$PM/uitvoer/telling/nakijklijst.json` na (per regel nummer, etiket, keurmerk en zijn eerdere oordeel; niet de map `niet-voor-nakijker/`) en legt voor elke regel een oordeel vast in `$PM/uitvoer/nakijken.json` als `{"<nummer>": oordeel}`: Nutri-Score als lijst zichtbare letters `["A".."E"]` of `"onleesbaar"`, de andere keurmerken `"aanwezig"`, `"afwezig"` of `"onzeker"`. Daarna:
```sh
uv run python tel_proef.py <zelfde argumenten als stap 14> --nakijken $PM/uitvoer/nakijken.json
```
Vindt de steekproef bij een keurmerk K minstens één fout, dan staat er `$PM/uitvoer/telling/nakijklijst-ronde2-<K>.json` met alle overige overeenkomende paren van K, en is het besluit voor K "mens bevestigt (voorlopig)". Friso kijkt die tweede ronde op dezelfde manier na (een oordeel voor elke regel, in `$PM/uitvoer/nakijken-ronde2-<K>.json`) en telt opnieuw, of kiest uitdrukkelijk om hem over te slaan:
```sh
uv run python tel_proef.py <zelfde argumenten als stap 14> --nakijken $PM/uitvoer/nakijken.json --nakijken-ronde2 <K>=$PM/uitvoer/nakijken-ronde2-<K>.json
uv run python tel_proef.py <zelfde argumenten als stap 14> --nakijken $PM/uitvoer/nakijken.json --ronde2-overgeslagen <K>
```
Uitvoer: `tabellen-na-nakijken.json/.md` naast de tabellen van vóór het nakijken; het besluit geldt op de uitslag ná nakijken (voor alle routes dezelfde correcties). Per keurmerk en kant de steekproef (nagekeken, fouten in Friso's eerdere oordeel, Wilson-bovengrens; "–" bij 0) en de gevoeligheid (informatief: het besluit als die bovengrens in het nadeel van de route werd toegepast). Een fout is elk oordeel dat afwijkt van het eerdere, ook naar "onzeker" of "onleesbaar" en elke andere verzameling Nutri-Score-letters. Besluit: "te weinig voorbeelden" gaat voor; dan "mens bevestigt (voorlopig)" zolang een tweede ronde openstaat; na de tweede ronde het gewone besluit, na `--ronde2-overgeslagen` "mens bevestigt". Ontbreekt een oordeel, staat er een nummer buiten de lijst of een ongeldige waarde in, of hoort een ronde-2-optie bij een keurmerk zonder tweede ronde: foutmelding, exitcode 1 en geen tabellen ná nakijken.
Kosten: $0
Tijd: ±10 s per regel voor Friso; de steekproef voegt ±230 regels toe (±40 minuten), een tweede ronde ±290 regels per keurmerk (±50 minuten) (INFERENCE)
Stoppunt: geen
ongetest: `nakijklijst` (steekproef en sleutel), `--nakijken`, `--nakijken-ronde2` en `--ronde2-overgeslagen` zijn getest op verzonnen werelden; er is geen invulpagina voor het nakijken gebouwd (de lijsten zijn JSON).

## Snelheid (rooktest stap 9, 01-11-2026)

Gemeten met `train.py snelheid` op een kleine nagemaakte COCO-set op deze Mac (M3 Pro, 18 GB), apparaat `mps`: 40
trainingstegels van 1024 px, herhaald tot 50 iteraties × batch 4 = 200 tegels (zelfde werk per iteratie als de 200 tegels
van stap 9), en 4 validatietegels. Gemeten is de wandkloktijd van `model.train` voor één epoch: 50 trainingsiteraties,
validatie op 4 tegels en het wegschrijven van de checkpoints, gedeeld door 50. **Niet** meegeteld: het bouwen van het
model, het laden van de gewichten en het verkleinen van de tegels naar de trainingsschaal (eenmalig per fase, enkele
seconden tot minuten), en de volle validatie die de echte training na elke epoch doet (500 tegels in fase 1). De
schatting is dus geen bovengrens.

Verwachte duur fase 1 = 5.000 tegels / 4 × 20 epochs × seconden per iteratie. Plus de validatie per epoch: 500 tegels
zonder terugrekenen kost naar schatting een derde van een trainingsiteratie per batch, ±125 × 0,35 s ≈ 45 s per epoch
voor N, ±15 minuten over 20 epochs (INFERENCE).

Fase 2 traint op de echte tegels plus 1.000 nagemaakte. Op ±320 echte trainingsetiketten (70% van de ±460 kandidaten
uit stap 7) en ±12 tegels per etiket (etiketten van ±3.000 × 4.000 px, tegel 1.024 met overlap 256) zijn dat ±3.800 +
1.000 ≈ 4.800 tegels per epoch, dus vrijwel even lang als fase 1 (INFERENCE; het echte aantal staat na `echt.py dataset`
in `train/_annotations.coco.json`).

| maat | resolutie | s/iteratie | fase 1 (5.000 tegels × 20) | fase 2 (±4.800 tegels × 20) | uitkomst |
|---|---|---|---|---|---|
| N | 384 | 1,03 (eerdere meting 1,06) | ±7,2 uur + ±15 min validatie | ±6,9 uur + validatie (INFERENCE) | net binnen 8 uur |
| S | 512 | ±1,6 vóór het vastlopen (0,62 it/s) | ±11 uur | ±11 uur (INFERENCE) | **stoppunt 1** |
| M, L | 576, 704 | niet gemeten | langer dan S | langer dan S | stoppunt 1 (INFERENCE) |

> [!note] Besluit Friso 01-11-2026: alleen maat N op deze Mac
> De meting voor S liep twee keer vast op iteratie 20 van 50 (het proces gebruikte 12 GB, het wisselgeheugen van de Mac
> stond vol). De snelheid tot dat moment gaf ±11 uur per fase, boven de grens van 8 uur. Alleen N past op MPS binnen
> de grens, met de validatie per epoch erbij ±7,5 uur. Friso besliste: eerst alleen N. S, M of L (of een GPU) alleen als N
> op de validatieset tekortschiet (stap 10, stoppunt 1) en na een nieuw besluit; `train.py` weigert die maten zonder
> `--besluit "<verwijzing>"`.

## Terugval

RF-DETR installeert of traint niet: stoppunt 8. D-FINE (Apache-2.0) is de gedocumenteerde terugval en is niet gebouwd.
