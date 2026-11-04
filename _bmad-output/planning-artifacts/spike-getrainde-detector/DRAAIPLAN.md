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
> Elke betaalde stap rekent vóór de start de verwachte uitgave uit (al uitgegeven plus, per open etiket, 1 aanroep per 16
> tegels, minstens 1) en start niet boven de grens per post (stoppunt 5): voorinvulling $73 hard en voorlabels $55 hard
> (besluit Friso 02-11-2026 22:20; eerder $65 en $50 van 01-11-2026), de andere posten 1,5× de raming tot Friso anders beslist. Het gereedschap past die
> grenzen standaard toe; een andere grens alleen met `--grens` én een niet-lege `--besluit` (randvoorwaarden §3). Tijdens de stap wordt de aanroep die de grens zou passeren
> niet verstuurd. Tijden met "INFERENCE" zijn geschat, niet gemeten. Voorinvulling glutenvrij (besluit Friso 03-11-2026) heeft een eigen post, "voorinvulling glutenvrij (gate B)", met een cap van $1 per aanroep; zie het blok ronde 10 bij stap 3.

### Stap 1 — scheiding

Commando: `uv run python scheiding.py invoer --proef-map $PM && uv run python scheiding.py kies --proef-map $PM`
Uitvoer: `$PM/invoer/` (kopie van de zeven invoerbestanden + `sha256.json`) en `$PM/scheiding.json`: 5 trainingsleveranciers, zwakste waarde 16,5, de tabel uit toetsset §2 (GTIN's en leveranciers per rij), 265 uitgesloten GTIN's. Sinds ronde 5 staan er ook de 3 extra rijen in (Nutri-Score D, Nutri-Score E en V-label, vegan of vegetarisch), geteld met de gekozen leveranciers en gemarkeerd `buiten_keuze`, met de reden onder `rijen_buiten_keuze`: de keuze gebruikt alleen de 10 oorspronkelijke rijen, dus de 5 leveranciers van 31-10 blijven (besluit Friso 01-11-2026; met de extra rijen in de keuze zouden het er 6 zijn, toetsset §2). Wie stap 1 in ronde 5 opnieuw draait, krijgt dezelfde 5 leveranciers en een `scheiding.json` met de extra rijen erbij: een nieuwe versie met reden, vóór het bevriezen in stap 8 (toetsset §7).
Kosten: $0
Tijd: < 1 minuut
Ronde 9 (besluit Friso 02-11-2026), nu `scheiding.json` al bestaat: een nieuwe versie met de vier extra rijen (FSC met de varianten Mix, Recycled en 100%, Triman, kunststofcode, PlanetProof), met reden:
```sh
uv run python scheiding.py kies --proef-map $PM --reden "ronde 9 (besluit Friso 02-11-2026): vier extra rijen buiten de keuze"
```
Zonder `--reden` weigert `kies` een bestaande `scheiding.json` (exitcode 2, niets geschreven); met `--reden` schrijft hij alleen als de trainingsleveranciers gelijk blijven (anders exitcode 2, niets geschreven), bewaart eerst de vorige als `scheiding.<tijdstempel>.json` en zet de reden in `versie_reden`. Verwacht in de extra rijen (train / toets, GTIN's / leveranciers): FSC 145/2 · 292/36, Triman 77/3 · 682/53, kunststofcode 128/3 · 291/27, PlanetProof 54/1 · 43/2 (toetsset §2).
Stoppunt: geen; wijkt de tabel af van toetsset §2 (ook de extra rijen: V-label 11/1 train, 28/8 toets, en de vier van ronde 9), of zijn het niet dezelfde 5 leveranciers, dan is de invoer veranderd: niet doorgaan en melden.
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
Uitvoer: `$T/kandidaten.json` (±365 kandidaten: tot 40 per keurmerk, Nutri-Score 40 voor de groep, om de beurt over A–E (de eerste ronde van 31-10 verdeelde over A/B/C; die lijst blijft), V-label als eigen keurmerk, tot 10 gelijkende per keurmerk; rooktest 01-11: 365), gebouwde beelden met `manifest.json` (sha256, maat, `bron: origineel` waar geen print-laag is gebouwd; een doc waarvan de print-laag niet bouwde krijgt ook het origineel), `originelen-overgeslagen.tsv` (docs zonder bruikbaar origineel, met reden), `certificaten.json` (tekst van het PDF-origineel van elk doc dat er een heeft, ook met print-laag), `toets-docs.json` (na ontdubbelen op GTIN, sha256 en dHash ≤ 6). Geeft ssh zelf een fout (exitcode 255), dan stopt `origineel-paden`: dat is geen "geen origineel". `toets.py kandidaten` weigert als `kandidaten.json` of `kandidaten-paren.tsv` al bestaat: de lijst van 31-10 blijft (toetsset §4).
Kosten: $0
Tijd: ±1 uur, vooral rsync van ±365 docs (INFERENCE)
Stoppunt: 6 als een commando iets anders zou doen dan lezen op `banana` of `replica-db`.
ongetest: `kandidaten`, `ontdubbel`, de query, de rsync-/ssh-opdracht, samenvoegen, PDF-omzetting en opslaan zijn getest; de netwerkstappen zelf (ssh, rsync, de `ls` in de bekende docmap voor originelen) en de opdrachtregels draaiden in deze build niet tegen productie.

### Stap 3 — voorinvulling

Commando: `uv run python toets.py voorinvulling --proef-map $PM --manifest $PM/toets/gecombineerd/manifest.json --docs $PM/toets/toets-docs.json --zdr-logo $PM/logos/zdr-proef.png --model anthropic/claude-haiku-5.5 --grens 73 --besluit "besluit Friso 02-11-2026 22:20 (randvoorwaarden §3)"`
Uitvoer: `$PM/toets/zdr-proef.json` (uitkomst van de zdr-proef met een officieel logo, geen klantartwork), `voorinvulling.json` (per etiket de keurmerken die het model beoordeelde, sinds ronde 5 ook het V-label, Nutri-Score-letters A–E, hinttegels, gelijkende, model `anthropic/claude-haiku-5.5` (standaard sinds 03-11-2026, besluit Friso "Gebruik voortaan haiku"; met `--model anthropic/claude-sonnet-5.5` draait Sonnet), kosten, ruwe JSON, `beeldtype: jpeg`; een keurmerk zonder AI-oordeel blijft op de pagina zonder keuze; een mislukte voorinvulling heeft lege velden en `fout`), `items.json` en `beelden/` voor de invulpagina (een voorinvulling van vóór ronde 5 zonder V-label-oordeel krijgt daar het V-label uit zijn gelijkende keurmerken: `EUROPEAN_V_LABEL_VEGAN` of `EUROPEAN_V_LABEL_VEGETARIAN` = aanwezig, anders afwezig; zonder aanroep, `voorinvulling.json` blijft ongewijzigd, toetsset §5). Overzicht en tegels gaan als JPEG (kwaliteit 90); hinttegels en de beelden voor de pagina blijven PNG. Per aanroep het hele etiket plus hoogstens 16 tegels en hoogstens 20.000.000 beeldbytes (randvoorwaarden §5); een groot etiket krijgt extra aanroepen. Past het overzicht plus één tegel niet, dan wordt niets verstuurd en krijgt het etiket `fout: te_groot` (telt niet mee voor de vijf weigeringen). De gebruikte grens staat bij de start op het scherm. Na elk etiket weggeschreven; opnieuw starten slaat klare etiketten over en probeert mislukte opnieuw. Vijf etiketten op rij geweigerd door de aanbieder: de run stopt. Uitvoer per model (besluit Friso 03-11-2026: een nieuw bestand per model, geen overschrijving van een ander model): met het standaardmodel Haiku 5.5 heten de bestanden `voorinvulling-claude-haiku-5-5.json`, `items-claude-haiku-5-5.json` en `zdr-proef-claude-haiku-5-5.json`. Het Sonnet-bestand (`voorinvulling.json`, `items.json`, `zdr-proef.json`) blijft ongewijzigd; een run met Haiku raakt het live `items.json` niet. Uitvoer voor Sonnet (`--model anthropic/claude-sonnet-5.5`): de oude namen.
Kosten: ±$3 met het standaardmodel Haiku 5.5 (INFERENCE: $0,17 voor 19 etiketten in de vergelijking van 03-11, memlog; geschaald naar ±350; Haiku niet gemeten in de echte run). Met `--model anthropic/claude-sonnet-5.5`: ±$42 (±350 × $0,12 per etiket, gemeten; het memlog van 03-11 noemt $0,076 per etiket uit de run van $22,93 voor 301 etiketten: bronverschil niet opgelost). De startprojectie van het gereedschap blijft op het Sonnet-getal ($0,06 per aanroep) en is voor Haiku ruim te hoog, dus conservatief. Grens $73 hard (besluit Friso 02-11-2026 22:20; eerder $65), over herstarts heen bijgehouden in `$PM/uitgaven.json`
Tijd: ±7–8 uur (±910 aanroepen: ±350 etiketten × gemiddeld 2,6, ±30 s per aanroep, één voor één; INFERENCE op de Sonnet-meting; de snelheid van Haiku is niet gemeten)
Stoppunt: 3 als de zdr-proef mislukt of de aanbieder 404 geeft (geen zdr-endpoint); 5 bij de uitgavengrens.
ongetest: `voorinvulling` en de client zijn getest met een nagebootste aanbieder; de opdrachtregel (beelden, tegels, hinttegels, items.json) draaide niet, omdat de build geen klantartwork naar OpenRouter stuurt. Leg vóór de start `$PM/logos/zdr-proef.png` neer (bijvoorbeeld het Wikimedia-logo van EU-biologisch uit de momentopname).

**Ronde 9: voorinvulling van de vier nieuwe keurmerken** (besluit Friso 02-11-2026; toetsset §5). Alleen ná Friso's keuze over de grens (grens verhoogd naar $73 door Friso, besluit Friso 02-11-2026 22:20; raming ±$28,9 zonder lege tegels en ±$35,9 met alle tegels, binnen het restant van $36,61 (73 − 36,39 uitgegeven)).
Commando: `uv run python toets.py voorinvulling-r9 --proef-map $PM --manifest $PM/toets/gecombineerd/manifest.json --docs $PM/toets/toets-docs.json --zdr-logo $PM/logos/zdr-proef.png [--grens <bedrag> --besluit "<verwijzing naar het besluit van Friso>"]`
Uitvoer per model: met Haiku 5.5 `$PM/toets/voorinvulling-r9-claude-haiku-5-5.json` en `$PM/toets/items-r9-claude-haiku-5-5.json`; de samenvoeging leest dan `voorinvulling-claude-haiku-5-5.json` (stap 3 van hetzelfde model); met Sonnet de oude namen `voorinvulling-r9.json` en `items-r9.json`. Uitvoer: `$PM/toets/voorinvulling-r9.json` (per etiket alleen FSC, Triman, kunststofcode en PlanetProof plus hun gelijkende codes, hinttegels op etiketindex, model, kosten, `ronde: 9`; na elk etiket weggeschreven, klare etiketten worden bij een herstart niet opnieuw betaald, mislukte wel), hintbeelden voor de vier in `$PM/toets/beelden/` en `$PM/toets/items-r9.json` met per etiket de samengevoegde voorinvulling (de vier aangevuld, keurmerk 1–9 nooit overschreven). `voorinvulling.json` en de live `items.json` blijven ongemoeid; de wissel staat in het wisselplan bij stap 5. Tegels die vrijwel leeg zijn (standaardafwijking van de grijswaarden < 3) worden niet verstuurd. Vóór de client rekent hij de startprojectie uit: al uitgegeven in de post "voorinvulling toets" (`$PM/uitgaven.json`) plus het kostenmodel ($0,0022 per megapixel niet-lege tegel + $0,0164 per aanroep) over de open etiketten; boven de grens start niets (exitcode 2).
Model: standaard `anthropic/claude-haiku-5.5` sinds 03-11-2026 (besluit Friso; de raming hieronder is gefit op Sonnet-metingen, voor Haiku niet gemeten). Kosten: ±$28,9 (kostenmodel op de 352 toetsetiketten, INFERENCE op meting); binnen het restant van $36,61 van de post voorinvulling ($73, over herstarts heen). Stoppunt 5 blijft: boven de grens stopt de run vóór de eerstvolgende betaalde aanroep.
Tijd: ±3–4 uur (±660 aanroepen, gemeten op de 352 etiketten zonder lege tegels, één voor één; INFERENCE; gemeten met Sonnet, de snelheid van Haiku is niet gemeten)
Stoppunt: 5 als de startprojectie boven het restant van de post ligt (per 02-11-2026 22:20: $73 − $36,39 = $36,61; raming ±$28,9 zonder lege tegels, ±$35,9 met alle tegels); 3 als de zdr-proef mislukt.
ongetest: `voorinvulling_r9`, `samenvoegen`, `raming_r9` en de opdrachtregel zijn getest met een nagebootste aanbieder en verzonnen etiketten; tegen de echte aanbieder draaide niets (geen klantartwork naar OpenRouter in de build).

**Ronde 10: voorinvulling glutenvrij** (gate B, besluit Friso 03-11-2026: Haiku, cap $1 voor deze stap, eigen post). Glutenvrij zit niet in de voorinvulling van stap 3 of ronde 9. De route werkt de 352 toetsetiketten in deze volgorde af: eerst de 17 met glutenvrij-declaratie, daarna de rest. De cap wordt per aanroep afgedwongen: een aanroep die de cap van $1 zou passeren, wordt niet verstuurd en de run stopt (exitcode 2). `--grens` boven $1 weigert de route, tenzij Friso een nieuw besluit meegeeft.
Commando: `uv run python toets.py voorinvulling-r10 --proef-map $PM --manifest $PM/toets/gecombineerd/manifest.json --zdr-logo $PM/logos/zdr-proef.png`
Uitvoer: `$PM/toets/voorinvulling-r10-claude-haiku-5-5.json` (per etiket de glutenvrij-uitkomst, model en kosten; na elk etiket weggeschreven, klare etiketten worden bij een herstart niet opnieuw betaald), met `items-r10-claude-haiku-5-5.json` en `zdr-proef-r10-claude-haiku-5-5.json` ernaast. De Sonnet-bestanden (`voorinvulling.json`, `items.json`, `zdr-proef.json`, `voorinvulling-r9.json`, `items-r9.json`) worden niet gelezen of geschreven. De uitgave staat in de post `voorinvulling glutenvrij (gate B)` in `$PM/uitgaven.json`, die begint op $0.
Kosten: $1 hard, per aanroep. Raming (INFERENCE): ±$0,009 per etiket (Haiku, memlog 03-11: $0,17 voor 19 etiketten); de 17 eerst ±$0,15; de cap dekt naar verwachting ±110 etiketten. Saldo OpenRouter op 03-11-2026: $6,8562 (VERIFIED, creditendpoint: 2922,0035 − 2915,1473). Haiku is op de echte run niet gemeten.
Tijd: ±2–3 uur voor ±110 etiketten (±2,6 aanroepen per etiket, ±30 s per aanroep; INFERENCE, Haiku niet gemeten).
Stoppunt: 5 bij de cap van $1 (stop vóór de eerstvolgende betaalde aanroep die de cap zou passeren); 3 als de zdr-proef voor Haiku faalt (geslaagd 03-11-2026, memlog). Komt de bevestiging van glutenvrij onder 16 mét, dan is dat stoppunt 2: geen aanvulling zonder nieuw besluit van Friso.
ongetest: de route `voorinvulling-r10` en de cap zijn getest met een nagebootste aanbieder; tegen de echte aanbieder draaide nog niets.

### Stap 4 — stoppunt 2

Commando: `uv run python toets.py rapport --proef-map $PM`
Uitvoer: JSON met `rapport` (per keurmerk, 14 sinds ronde 10 (glutenvrij erbij; de telling neemt het nog niet mee, zie de open punten van ronde 10), 13 sinds ronde 9, het aantal etiketten waarop het volgens de voorinvulling waarschijnlijk staat; Nutri-Score als groep: minstens één letter A–E; V-label bij oudere voorinvullingen afgeleid uit de gelijkende keurmerken), `nutriscore_per_letter` (Nutri-Score per letter A–E, informatief) en `stoppunt_2`; de vier van ronde 9 komen uit `$PM/toets/voorinvulling-r9.json` als die bestaat (zonder dat bestand staan ze op 0); exitcode 2 als een van de 14 onder 16 staat (een letter onder 16 is geen stoppunt; het besluit valt op de groep).
Kosten: $0
Tijd: < 1 minuut
Stoppunt: 2 als een keurmerk (ook een van de vier van ronde 9) minder dan 16 waarschijnlijke etiketten heeft (scheiding versoepelen of het keurmerk zonder besluit laten: keuze van Friso; voor kunststofcode en PlanetProof waarschijnlijk, toetsset §2).
ongetest: `rapport` en `stoppunt2` zijn getest; de opdrachtregel niet.

In deze ronde is de volgende handeling bij stoppunt 2 al besloten: de eenmalige aanvulling vóór de bevestiging (besluit Friso 01-11-2026, toetsset §4). Na de eerste voorinvulling stond zwangerschap op 14, MSC op 18, Vegan Society op 17 en Weidemelk op 23. Draai daarom eerst de eenmalige aanvulling uit stap 6 (zwangerschap hoogstens 60 nieuwe kandidaten, print-laag eerst; MSC, Vegan Society en Weidemelk alles wat over is), daarna deze stap opnieuw, en pas dan stap 5. In ronde 5 (besluit Friso 01-11-2026) komt daar vóór de bevestiging nog het blok "ronde 5" uit stap 6 bij: het V-label (elk ongekozen toetsproduct met een vegan- of vegetarisch-declaratie) en hoogstens 20 nieuwe kandidaten voor Nutri-Score E; daarna deze stap opnieuw. Staat een keurmerk daarna nog onder 16, dan is dat opnieuw stoppunt 2; meer aanvullen vraagt een nieuw besluit van Friso.

### Stap 5 — bevestiging

Commando: `uv run python invul/server.py --map $PM/toets --poort 8765` en open `http://127.0.0.1:8765/`
Uitvoer: `$PM/toets/uitslag.json` volgens het schema van toetsset §6; de pagina toont per keurmerk (13) de stand tegen het doel (≥ 16 mét, ≥ 50 zonder). Het V-label is één keuze voor vegan of vegetarisch (meetregels §2), voorgevuld uit de voorinvulling; Nutri-Score is de verzameling zichtbare letters A–E of "letter onleesbaar". Een concept van vóór ronde 5 houdt zijn keuzes en toont voor het V-label de voorinvulling. Sneltoetsen: ←/→ vorige/volgende, `b` = bevestigd zoals ingevuld en door (alleen als bij alle 12 losse keurmerken (ronde 9: 8 + FSC, Triman, kunststofcode, PlanetProof), het V-label inbegrepen, en bij Nutri-Score een keuze staat; anders een melding en blijft het etiket staan); elke keuze wordt direct opgeslagen, opslagen gaan één voor één naar de server, een tussenstand laat "bevestigd" staan, en wat Friso typt staat als concept in de browser tot de server de opslag bevestigt. De server antwoordt alleen op `127.0.0.1`/`localhost` en neemt opslagen alleen aan vanaf de eigen pagina.
Ronde 9: de pagina toont 13 keurmerken (na het V-label FSC, Triman, kunststofcode, PlanetProof). Een etiket dat al bevestigd was vóór ronde 9 is "na te lopen": de voortgang telt ze ("· N na te lopen"), de pagina opent op het eerste etiket dat niet afgehandeld of na te lopen is, de eerdere antwoorden staan erin en alleen de vier nieuwe rijen zijn te controleren; "Bevestigen en volgende" slaat de eerdere antwoorden ongewijzigd mee op. Een keuze op een nieuwe rij telt pas na Bevestigen (`bevestigde_codes`, gezet door de server).

Wisselplan van de live pagina (ronde 9; de bouw zet niets live, de hoofdsessie wisselt pas na stap 3 ronde 9): (1) noteer `/stand` van de draaiende server (de aantallen van de 9 oude keurmerken); (2) stop de server; (3) maak een back-up van `$PM/toets/uitslag.json` (`cp uitslag.json uitslag.voor-r9.json`) en van `$PM/toets/items.json` (`cp items.json items.voor-r9.json`); (4) zet `$PM/toets/items-r9.json` op de plaats van `items.json`; (5) start de server opnieuw vanuit de nieuwe code met dezelfde map en poort (zelfde oorsprong, dus de concepten in de browser blijven en worden per keurmerk samengevoegd); (6) controleer dat `/stand` voor de 9 oude keurmerken dezelfde aantallen geeft als bij (1) en dat `na_te_lopen` gelijk is aan het aantal al bevestigde etiketten. Wijkt iets af: server stoppen, `items.voor-r9.json` en `uitslag.voor-r9.json` terugzetten, oude code starten, melden.

Aanvulling wisselplan (02-11-2026, voor de hoofdsessie): (a) vóór stap 2 `/stand` noteren, want Friso kan inmiddels antwoorden hebben opgeslagen; (b) `uitslag.json` wordt niet herschreven door de wissel, de nieuwe server leest bevestigde records van vóór ronde 9 als 8 codes en telt de vier nieuwe pas na een bevestiging (toetsset §6); (c) de nieuwe server draait vanuit de worktree `proef-ronde9` (of na samenvoegen vanuit `proef-getrainde-detector`), met `--map $PM/toets --poort 8767`; (d) controleer in de browser dat een etiket met een concept van vóór ronde 9 de vier nieuwe rijen uit de voorinvulling toont.

Samenvoeging ronde 9 (hoofdsessie; geen PR, geen merge naar acc of main): voorcontrole gedaan 02-11-2026: `git merge-tree` van `origin/spike/proef-getrainde-detector` (47edcb1) en `spike/proef-ronde9` geeft geen conflicten, en de remote-spiektak is een voorouder van de ronde-9-tak. Dus: na de laatste commit van `proef-ronde9` (en de volle suite groen) `git -C <proef-getrainde-detector> merge --ff-only spike/proef-ronde9` en `git push origin spike/proef-getrainde-detector`. Niet pushen zonder de volle suite op die commit.
Kosten: $0
Tijd: ±2 uur voor ±350 etiketten (±20 s per etiket; INFERENCE); ronde 9: ±30 minuten om de vier nieuwe rijen na te lopen (INFERENCE)
Stoppunt: geen

### Stap 6 — aanvullen

Commando: elke aanvulling krijgt een eigen lijst (`--naam`) en een eigen tussenmap `$T/$N` (ophaallijst, originelen, paden), zodat die van eerdere rondes blijven; gebouwde beelden gaan naar `$T/gecombineerd` en de PDF-tekst naar `$T/certificaten.json`, die beide worden aangevuld en niet overschreven. Geef elke eerdere lijst mee met `--bestaand` (herhaalbaar): geen GTIN komt terug. `--max-per` telt alleen nieuwe kandidaten; `--alle CODE` neemt alles wat voor dat keurmerk aan de toetskant overblijft, ook boven 40; `--alleen` en `--alle` zijn herhaalbaar (CODE = een keurmerk, `NUTRISCORE` of één letter `NUTRISCORE_A` t/m `NUTRISCORE_E`, niet dezelfde code bij beide; een letter beperkt de Nutri-Score-groep tot die letter met hetzelfde maximum). Een aanvulling vraagt `--bestaand` én `--alleen` of `--alle`, neemt geen gelijkende kandidaten en weigert (exitcode ≠ 0) als `<naam>.json` of `<naam>-paren.tsv` al bestaat.

**Eenmalige aanvulling vóór de bevestiging (besluit Friso 01-11-2026, toetsset §4).** In deze ronde direct na stap 4, vóór stap 5: zwangerschap hoogstens 60 nieuwe kandidaten, eerst alle ongekozen met print-laag (`$PM/invoer/pool-met-converted-laag-20261008.txt`) en daarna de rest in de vaste volgorde; MSC, Vegan Society en Weidemelk alles wat over is. Het hele blok:
```sh
T=$PM/toets
N=kandidaten-aanvulling-1
uv run python toets.py kandidaten --proef-map $PM --alleen PREGNANCY_WARNING --max-per 60 --alle MARINE_STEWARDSHIP_COUNCIL_LABEL --alle VEGAN_SOCIETY_VEGAN_LOGO --alle WEIDEMELK --bestaand $T/kandidaten.json --naam $N --print-laag-eerst
uv run python beelden.py ophaallijst --paren $T/$N-paren.tsv --uit $T/$N                 # ssh replica-db, alleen SELECT
uv run python beelden.py ophalen --lijst $T/$N/ophaal-paden.txt --doel $T/bron-raw        # rsync banana, nice -n 19, alleen lezen
uv run python beelden.py bouwen --ophaallijst $T/$N/ophaallijst.tsv --bron $T/bron-raw --uit $T/gecombineerd
uv run python beelden.py origineel-paden --paren $T/$N-paren.tsv --manifest $T/gecombineerd/manifest.json --uit $T/$N
uv run python beelden.py ophalen --lijst $T/$N/originelen-paden.txt --doel $T/bron-raw
uv run python beelden.py bouwen-origineel --originelen $T/$N/originelen.tsv --bron $T/bron-raw --uit $T/gecombineerd
uv run python beelden.py origineel-paden --paren $T/$N-paren.tsv --alleen-pdf --uit $T/$N      # route A: elk PDF-origineel
uv run python beelden.py ophalen --lijst $T/$N/pdf-originelen-paden.txt --doel $T/bron-raw
uv run python beelden.py pdftekst --originelen $T/$N/pdf-originelen.tsv --bron $T/bron-raw --uit $T/certificaten.json
uv run python toets.py ontdubbel --proef-map $PM --manifest $T/gecombineerd/manifest.json --kandidaten $T/$N.json
uv run python toets.py voorinvulling --proef-map $PM --manifest $T/gecombineerd/manifest.json --docs $T/toets-docs.json --zdr-logo $PM/logos/zdr-proef.png
uv run python toets.py rapport --proef-map $PM                                             # = stap 4 opnieuw
```
Daarna stap 5 (in ronde 5 eerst het blok hieronder). Staat een keurmerk in het rapport nog onder 16, dan is dat stoppunt 2.

**Aanvulling ronde 5, ook vóór de bevestiging (besluit Friso 01-11-2026, toetsset §4 punt 3 en 4).** V-label: elk toetsproduct met een V-label-declaratie (vegan of vegetarisch) dat nog geen kandidaat was, print-laag eerst (bij het besluit 18 GTIN's, 12 met print-laag); Nutri-Score E: hoogstens 20 nieuwe kandidaten, print-laag eerst. Eerst de scheiding opnieuw (de huidige `scheiding.json` kent de extra rijen nog niet; controleer daarna: dezelfde 5 trainingsleveranciers en `rijen_buiten_keuze` aanwezig, anders stoppen en melden), dan het hele blok:
```sh
uv run python scheiding.py kies --proef-map $PM                                           # zelfde 5 leveranciers, nu met rijen_buiten_keuze
T=$PM/toets
N=kandidaten-aanvulling-2
uv run python toets.py kandidaten --proef-map $PM --alle EUROPEAN_V_LABEL_VEGAN --alleen NUTRISCORE_E --max-per 20 --bestaand $T/kandidaten.json --bestaand $T/kandidaten-aanvulling-1.json --naam $N --print-laag-eerst
uv run python beelden.py ophaallijst --paren $T/$N-paren.tsv --uit $T/$N                 # ssh replica-db, alleen SELECT
uv run python beelden.py ophalen --lijst $T/$N/ophaal-paden.txt --doel $T/bron-raw        # rsync banana, nice -n 19, alleen lezen
uv run python beelden.py bouwen --ophaallijst $T/$N/ophaallijst.tsv --bron $T/bron-raw --uit $T/gecombineerd
uv run python beelden.py origineel-paden --paren $T/$N-paren.tsv --manifest $T/gecombineerd/manifest.json --uit $T/$N
uv run python beelden.py ophalen --lijst $T/$N/originelen-paden.txt --doel $T/bron-raw
uv run python beelden.py bouwen-origineel --originelen $T/$N/originelen.tsv --bron $T/bron-raw --uit $T/gecombineerd
uv run python beelden.py origineel-paden --paren $T/$N-paren.tsv --alleen-pdf --uit $T/$N      # route A: elk PDF-origineel
uv run python beelden.py ophalen --lijst $T/$N/pdf-originelen-paden.txt --doel $T/bron-raw
uv run python beelden.py pdftekst --originelen $T/$N/pdf-originelen.tsv --bron $T/bron-raw --uit $T/certificaten.json
uv run python toets.py ontdubbel --proef-map $PM --manifest $T/gecombineerd/manifest.json --kandidaten $T/$N.json
uv run python toets.py voorinvulling --proef-map $PM --manifest $T/gecombineerd/manifest.json --docs $T/toets-docs.json --zdr-logo $PM/logos/zdr-proef.png
uv run python toets.py rapport --proef-map $PM                                             # = stap 4 opnieuw
```
De melding op het scherm noemt per gekozen code (`EUROPEAN_V_LABEL_VEGAN`, `NUTRISCORE_E`) toegevoegd en over. Nieuwe voorinvullingen vragen het V-label als keurmerk, met tegels; de oudere krijgen het afgeleide V-label (stap 3). Daarna stap 5.

**Latere aanvullingen** (na de bevestiging, voor een keurmerk dat onder het doel blijft): hetzelfde, met een nieuwe naam en elke eerdere lijst als `--bestaand`:
```sh
T=$PM/toets
N=kandidaten-aanvulling-3        # nieuwe naam per aanvulling
uv run python toets.py kandidaten --proef-map $PM --alleen <CODE> --max-per 60 --bestaand $T/kandidaten.json --bestaand $T/kandidaten-aanvulling-1.json --bestaand $T/kandidaten-aanvulling-2.json --naam $N
uv run python beelden.py ophaallijst --paren $T/$N-paren.tsv --uit $T/$N
uv run python beelden.py ophalen --lijst $T/$N/ophaal-paden.txt --doel $T/bron-raw
uv run python beelden.py bouwen --ophaallijst $T/$N/ophaallijst.tsv --bron $T/bron-raw --uit $T/gecombineerd
uv run python beelden.py origineel-paden --paren $T/$N-paren.tsv --manifest $T/gecombineerd/manifest.json --uit $T/$N
uv run python beelden.py ophalen --lijst $T/$N/originelen-paden.txt --doel $T/bron-raw
uv run python beelden.py bouwen-origineel --originelen $T/$N/originelen.tsv --bron $T/bron-raw --uit $T/gecombineerd
uv run python beelden.py origineel-paden --paren $T/$N-paren.tsv --alleen-pdf --uit $T/$N
uv run python beelden.py ophalen --lijst $T/$N/pdf-originelen-paden.txt --doel $T/bron-raw
uv run python beelden.py pdftekst --originelen $T/$N/pdf-originelen.tsv --bron $T/bron-raw --uit $T/certificaten.json
uv run python toets.py ontdubbel --proef-map $PM --manifest $T/gecombineerd/manifest.json --kandidaten $T/$N.json
uv run python toets.py voorinvulling --proef-map $PM --manifest $T/gecombineerd/manifest.json --docs $T/toets-docs.json --zdr-logo $PM/logos/zdr-proef.png
```
De voorinvulling draait over alle toets-docs (standaardgrens $73), zodat de invulpagina alle etiketten toont; klare etiketten worden overgeslagen, dus alleen de nieuwe worden betaald. Herstart daarna de server (stap 5; hij leest `items.json` bij de start).
Uitvoer: `$T/<naam>.json` en `$T/<naam>-paren.tsv` met alleen nieuwe GTIN's, per keurmerk in de vaste volgorde (om de beurt per leverancier, binnen een leverancier op sha256("20261031" + GTIN); met `--print-laag-eerst` eerst het print-laagdeel); op het scherm per gekozen keurmerk `toegevoegd` (nieuwe kandidaten) en `over` (ongekozen toets-GTIN's die overblijven). Verder `$T/<naam>/` met de tussenbestanden, `gecombineerd/manifest.json` en `certificaten.json` aangevuld, `toets-docs.json` aangevuld met de nieuwe docs na ontdubbelen, en `voorinvulling.json` en `items.json` over alle toets-docs. Het aantal gebouwde etiketten wordt gemeld, niet afgedwongen: zwangerschap zonder print-laag bouwt vrijwel nooit.
Kosten: $0,12 per extra etiket (gemiddelde; valt onder de post voorinvulling, grens $73); de eenmalige aanvulling hoogstens 60 + 58 = 118 kandidaten: verwacht ±$14 bij het gemiddelde van $0,12 per etiket, tot ±$35 bij de p90 van $0,30 (INFERENCE); de aanvulling van ronde 5 ±18 V-label- en hoogstens 20 E-kandidaten: ±$2 + ±$1,5 (stand vóór ronde 5 $33,57; randvoorwaarden §3, INFERENCE). De startcontrole en de bewaking per aanroep stoppen vóór $65; lees na de aanvulling in `$PM/uitgaven.json` hoeveel er over is.
Tijd: per ronde ±30 minuten plus Friso's bevestiging (INFERENCE)
Stoppunt: 2 als een keurmerk na aanvullen nog onder 16 bevestigde etiketten mét blijft; na de eenmalige aanvulling vóór de bevestiging: 2 als een keurmerk in het rapport nog onder 16 waarschijnlijke etiketten staat (meer aanvullen vraagt een nieuw besluit van Friso).
ongetest: `kandidaten` (bestaande lijsten, maximum per keurmerk, `--alle`, print-laag eerst, de melding, nooit overschrijven), het aanvullen van `certificaten.json` en `manifest.json`, `ontdubbel` en de voorinvulling na een aanvulling zijn getest; het ophalen en bouwen van de aanvulling draaide niet tegen productie (netwerk).

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
Eindigt dit blok met een exitcode ≠ 0 (een overtreding in `"overtredingen"`), dan hier stoppen (stoppunt 4) en het volgende blok niet draaien: dat start de betaalde voorlabels.

De voorlabels hebben een vaste grens van $55 (besluit Friso 02-11-2026 22:20; eerder $50, randvoorwaarden §3); het commando past die standaard toe en start zonder nieuwe vraag als hij aan de beurt is. Bij ±1.100 etiketten (ronde 9: +±300 voor de vier klassen) rekent de startcontrole met ±$34–54 (1.100 × 2,6 aanroepen × $0,012–0,019; de bovenkant ±$54 ligt boven $50: dan stopt hij tot Friso kiest, zie SPEC.md Open Questions); komt al uitgegeven plus verwacht boven $50, dan start hij niet (stoppunt 5), en tijdens de run wordt een aanroep die de grens zou passeren niet verstuurd. Een andere grens alleen na een nieuw besluit van Friso, met `--grens` én `--besluit`. Daarna een kleine nagemaakte set maken en maat N meten:
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
Kosten: voorlabels ±$34–54 (randvoorwaarden §3; ±1.100 etiketten × gemiddeld 2,6 aanroepen × $0,012–0,019; INFERENCE), grens $55 hard (besluit Friso 02-11-2026 22:20), bijgehouden in `$PM/uitgaven.json`; snelheidsmeting $0
Tijd: voorlabels ±7 uur (±2.860 aanroepen: ±1.100 etiketten × gemiddeld 2,6; geschaald uit ±5 uur voor 2.080 aanroepen; INFERENCE); meting ±15 minuten
Stoppunt: 1 als MPS niet werkt, als één epoch met N volgens de meting langer dan het nachtvenster (9,5 uur) duurt, of als een fase volgens de meting meer dan 4 nachten nodig heeft (besluit Friso 02-11-2026: training alleen 's nachts, verdeeld over nachten); 4 als de licentiecontrole een overtreding meldt; 8 als RF-DETR niet installeert of niet traint; 3 en 5 voor de voorlabels.
ongetest: `generator.genereer`, `echt.naar_tegels`/`valsplit`/`voorlabels`/`rapport` en `train.snelheid` (rooktest `zwaar` op MPS) zijn getest; de opdrachtregels van `generator logos/tegels` en `echt dataset` draaiden alleen in een rooktest op verzonnen beelden in een tijdelijke map, `echt voorlabels` niet (geen klantartwork naar OpenRouter in de build).

### Stap 10 — training

Commando: twee fasen, daarna keuze en drempels op de validatieset van de trainingskant:
```sh
uv run python off.py ophalen --proef-map $PM                                              # OFF-uitsneden (CAP-17), hervatbaar
G="uv run python generator.py tegels --proef-map $PM --achtergronden $PM/train/echt/achtergronden.json --uit $PM/train/nagemaakt"
$G --n 5000 --off $PM/off/bronnen.json
$G --n 500 --split valid --seed 7
$G --n 100 --split test --seed 8
PY=$(uv run --group dev --group detector python -c 'import sys; print(sys.executable)')       # vaste python voor launchd
uv run python nacht.py plan --uit $PM/modellen/$MAAT-1 --epochs 20 --fase nagemaakt -- \
    $PY train.py train --fase nagemaakt --maat $MAAT --dataset $PM/train/nagemaakt --uit $PM/modellen/$MAAT-1 --epochs 20
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.xxtract.proef-nachttraining.$MAAT-1.plist   # draait elke dag om 22:00 nacht.py draai (label per uitvoermap)
uv run python nacht.py status --uit $PM/modellen/$MAAT-1                                  # epoch, gemiddelde duur, verwacht klaar
uv run python nacht.py stop --uit $PM/modellen/$MAAT-1                                  # handmatige pauze: SIGTERM naar het trainingsproces, uitkomst "gepauzeerd"
uv run python nacht.py vrijgeven --uit $PM/modellen/$MAAT-1                             # alleen na een besluit van Friso over stoppunt 1
# wacht tot status "afgerond" (train-resultaat.json bestaat), daarna de agent uitladen:
launchctl bootout gui/$(id -u)/com.xxtract.proef-nachttraining.$MAAT-1
df -h ~                                                                                    # eerst: genoeg vrije ruimte voor ±2 GB?
uv run python nutrigreen.py omzetten --zip $PM/nutrigreen/download/dataset.zip --csv $PM/nutrigreen/download/data.csv \
    --proef-map $PM --uit $PM/nutrigreen/coco --tegel 1024
uv run python scheiding.py dhash --toets $PM/toets/beelden --train $PM/nutrigreen/coco --uit $PM/dhash-nutrigreen.json
uv run python echt.py dataset --lijst $PM/train/lijst.json --voorlabels $PM/train/voorlabels.json --proef-map $PM \
    --uit $PM/train/echt --meng $PM/train/nagemaakt/train --meng-aantal 1000 --nutrigreen $PM/nutrigreen/coco
uv run python nacht.py plan --uit $PM/modellen/$MAAT-2 --epochs 20 --fase echt -- \
    $PY train.py train --fase echt --maat $MAAT --dataset $PM/train/echt --uit $PM/modellen/$MAAT-2 --epochs 20 --start $PM/modellen/$MAAT-1/checkpoint_best_total.pth
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.xxtract.proef-nachttraining.$MAAT-2.plist   # eigen label per uitvoermap; fase 1 is dan al uitgeladen
uv run python nacht.py status --uit $PM/modellen/$MAAT-2                                  # na elke nacht; wacht op "afgerond", dan launchctl bootout gui/$(id -u)/com.xxtract.proef-nachttraining.$MAAT-2
uv run python herken.py detecteer --model $PM/modellen/$MAAT-2/checkpoint_best_total.pth --maat $MAAT --lijst $PM/train/echt/validatie-lijst.json --uit $PM/train/valid-kandidaten.json
uv run python herken.py drempels --kandidaten $PM/train/valid-kandidaten.json --waarheid $PM/train/echt/validatie-waarheid.json --uit $PM/modellen/drempels.json
uv run python echt.py validatie-uitslag --waarheid $PM/train/echt/validatie-waarheid.json --uit $PM/train/echt/validatie-uitslag.json
uv run python herken.py beslis --kandidaten $PM/train/valid-kandidaten.json --drempels $PM/modellen/drempels.json \
    --lijst $PM/train/echt/validatie-lijst.json --referenties $PM/logos/referenties.json --grootboek $PM/uitgaven.json \
    --uit $PM/train/valid-da.json --meta $PM/train/valid-da-meta.json
uv run python tel_proef.py --uitslag $PM/train/echt/validatie-uitslag.json --route D+A=$PM/train/valid-da.json --meta D+A=$PM/train/valid-da-meta.json --uit $PM/train/valid-tabellen
```
NutriGreen (CAP-16, besluit Friso 01-11-2026): `dataset.zip` en `data.csv` staan in `$PM/nutrigreen/download/` (Zenodo-record 10020545; nooit in een git-werkboom; staan ze er nog niet, download ze dan uit die record naar die map: openbare data, geen klantdata). `nutrigreen.py omzetten` controleert eerst de md5 van de zip (anders weigert hij en schrijft niets), leest elk beeld los uit de zip (niet uitpakken), laat foto's van toetsleveranciers, met EXIF-oriëntatie ≠ 1, met een dubbele naam en annotaties zonder foto vallen en telt ze in `rapport.json`. Hij schrijft de foto's als JPEG kwaliteit 90, langste zijde 1024: ±2 GB (INFERENCE); controleer vóór de start met `df -h ~` of er genoeg vrije ruimte is. Daarna de bijna-duplicaatcontrole van toetsset §2 tegen de toetsbeelden: verwijder de beelden die in `$PM/dhash-nutrigreen.json` onder `uit_training` staan uit `$PM/nutrigreen/coco/_annotations.coco.json` vóór het mengen (handmatig, zoals in stap 7; nog geen gereedschap). `echt.py dataset --nutrigreen` mengt alleen in `train/` van fase 2 en neemt NutriGreen uit het mengbudget (`--meng-aantal`): eerst NutriGreen tot zijn grens, hoogstens 20% van de trainingstegels van fase 2 en hoogstens zoveel vakjes als de eigen echte vakjes, om de beurt per klasse en hoogstens 10% foto's zonder vakje; de rest nagemaakt. Nooit in `valid/` of `test/`: validatie, drempels en modelkeuze blijven op eigen materiaal. De attributie en licentie (CC-BY-SA-4.0, randvoorwaarden §4) komen in `$PM/train/echt/herkomst.json` en zo in `train-resultaat.json` van fase 2 (`data_herkomst`), en van elk model dat daarop verder traint. Een andere set categorieën dan de 13 klassen weigert het mengen.
Open Food Facts (CAP-17, besluit Friso 02-11-2026; trainingsset §11): `off.py ophalen` haalt per klasse hoogstens 1.000 uitsneden van benoemde logo's (alleen de crop-endpoint van Robotoff, nooit een hele foto) in de vaste volgorde, beleefd (User-Agent met `ict@xxtract.com`, minstens 0,6 s tussen verzoeken), en laat toets-GTIN's, toetsleveranciers (GTIN of cijfers 2–8 gelijk aan een toets-GLN) en bijna-duplicaten van de toetsbeelden vallen; afvallers per reden in `$PM/off/rapport.json`. Hij is hervatbaar (bewaarde pools, bestaande uitsneden, `$PM/off/status.json`) en draait vóór de training opnieuw op de definitieve toetsset: nieuwe afvallers worden vervangen door de volgende in de volgorde. Daarna bekijkt de agent per klasse een contactblad van 40 behouden uitsneden (hoogstens 2 van 40 fout; Nutri-Score: de gemarkeerde letter); faalt een klasse, dan stoppen en melden aan Friso. Alleen de nagemaakte trainingstegels krijgen de OFF-index: met kans 0,5 per geplakt logo van een klasse met uitsneden een OFF-uitsnede in plaats van de eigen bron; de generator weigert de index bij `valid` en `test` en schrijft de attributie in `$PM/train/nagemaakt/herkomst.json`. In fase 2 neemt `echt.py dataset` de nagemaakte tegels in vaste volgorde en houdt op vóór de tegel die de OFF-vakjes boven de eigen echte vakjes zou brengen (`_off` in `rapport.json`); de OFF-attributie komt dan naast die van NutriGreen in `herkomst.json` en zo in `data_herkomst`.
Nachttraining (CAP-18, besluit Friso 02-11-2026; trainingsset §12): elke fase traint alleen tussen 22:00 en 07:30. `nacht.py plan` legt de trainingsopdracht vast in `<uit>/nacht.json` en schrijft de launchd-agent `~/Library/LaunchAgents/com.xxtract.proef-nachttraining.plist` (dagelijks 22:00 `nacht.py draai --uit <uit>`); de agent laden (`launchctl bootstrap`) en na afloop uitladen (`launchctl bootout`) doet de hoofdsessie, pas na Friso's bevestiging van de toetsset (een procesafspraak, geen code-poort). Verwachte duur: elke nachtrun duurt het volle venster van 9,5 uur. Fase 2 wordt pas gepland als fase 1 "afgerond" is (één agent tegelijk). `nacht.py draai` start de training onder `caffeinate -i`, met `--hervat` het nieuwste leesbare `checkpoint_<n>.ckpt` van die fase (elk epoch laat er één achter), stuurt om 07:30 SIGTERM (het lopende epoch gaat verloren) en na 300 s SIGKILL, houdt de nieuwste twee checkpoints en raakt `checkpoint_best_*` nooit. Slaapstand: de Mac staat 's nachts aan netstroom en mag niet slapen; zet vóór de eerste nacht `sudo pmset -c sleep 0` (of in Systeeminstellingen › Batterij › Opties: "Voorkom automatische slaapstand bij netstroom"); `caffeinate -i` houdt hem tijdens de training wakker, en launchd haalt een om 22:00 gemiste start bij ontwaken in. `nacht.py status` toont fase, epochs klaar/totaal, gemiddelde epochduur, laatste start en stop en de verwachte einddatum (alleen vensteruren); dezelfde stand staat in `<uit>/nacht-status.json`. Raakt een nacht stoppunt 1 (zie hieronder), dan start `draai` niets meer tot `uv run python nacht.py vrijgeven --uit <uit>` na een besluit van Friso. Het startcheckpoint van fase 2 is `checkpoint_best_total.pth` in de uitvoermap van fase 1 (dat staat ook in het veld `checkpoint` van `train-resultaat.json` daar). Hervatten gaat altijd via `nacht.py draai`, nooit met de hand: `draai` kiest zelf het nieuwste checkpoint van die map en geeft `--hervat` mee; `--start` blijft in de opdracht staan. Een lopende run pauzeer je met `nacht.py stop --uit <uit>` (uitkomst `gepauzeerd`); zonder nieuw checkpoint in die run is dat ook een stoppunt 1.
De maat blijft N. Een ander aantal epochs of tegel 768/1536 probeer je alleen op de validatieset; kies daar, nooit op de toetsset (verwijder voor een nieuwe kandidaat `valid-kandidaten.json` en `valid-da.json`: beide slaan klare etiketten over). Een code die op een validatie-etiket alleen onzekere AI-vakjes heeft, staat in `validatie-waarheid.json` als `onzeker`: hij telt voor de drempels en de validatietabel niet als afwezig.
Uitvoer: `$PM/off/` (uitsneden, `bronnen.json`, `rapport.json` met per klasse het OFF-aantal, de pool, de afvallers per reden, het behouden aantal, de annotatoren en de bytes, `status.json`); per fase checkpoint, configuratie, seed, trainingslog, sha256, de 13 klassen (`klassen`; `detecteer` weigert een checkpoint zonder of met andere klassen) en herkomst van de voorgetrainde gewichten en van de data (`train-resultaat.json`; fase 2 neemt de herkomst van fase 1 over, `data_herkomst` met de NutriGreen-attributie); `$PM/nutrigreen/coco/rapport.json` (beelden en vakjes per klasse, afvallers) en in `rapport.json` van de echte set `_nutrigreen` (gebruikte NutriGreen-tegels, -beelden en -vakjes per klasse en de twee grenzen); `drempels.json` (`laag`/`hoog` per code, met terugval op gezamenlijke drempels); validatietabellen per kandidaatmodel; `rapport.json` met per keurmerk de echte etiketten en vakjes en de dHash-clusters die te groot waren voor de validatieset.
Glutenvrij (ronde 10, Gate C, besluit Friso 03-11-2026): een training met glutenvrij als klasse start pas als de poort `poort_glutenvrij` in `train.py` slaagt: minstens 16 bevestigde etiketten mét voor `DIET_FREE_FROM_GLUTEN` en minstens 35 bevestigde etiketten zonder glutenvrij, in `toets/uitslag.json`. De poort weigert bij een ontbrekend of onleesbaar bestand en noemt het aantal (fail-closed). Tot die tijd is alleen voorbereiden toegestaan.
Kosten: beoordelaar op de validatieset ±$1,5 (de post "beoordelaar" is samen met D+A en D ±$3; grens $4,50, bijgehouden in `$PM/uitgaven.json`); training $0
Tijd: per fase volgens stap 9 (zie "Snelheid"), alleen in nachtvensters van 9,5 uur: fase 1 ±1 nacht, fase 2 ±2 nachten (INFERENCE); OFF ophalen ±2–3 uur (±11.600 uitsneden en 14 pools bij minstens 0,6 s per verzoek, plus nieuwe pogingen; INFERENCE), ±0,1–0,4 GB; NutriGreen omzetten ±30–60 minuten (10.472 foto's uit een zip van 5,1 GB; INFERENCE); detectie op de processor ±5–20 s per etiket (INFERENCE)
Stoppunt: 9 als `off.py ophalen` stopt omdat `$PM/off` boven 3 GB komt of er minder dan 5 GB vrij is (exitcode 3; ook bij een noodstop na 20 mislukte uitsneden op rij: melden, niet omheen werken); 1 als `nacht.py status` `stoppunt_1` meldt (een volledig nachtvenster zonder nieuw checkpoint, een epoch langer dan 9,5 uur, of een verwachte einddatum meer dan 4 nachten na de eerste start; de planner start dan niets meer tot `nacht.py vrijgeven`), of als MPS niet werkt, of als N op de validatieset tekortschiet: lees in `$PM/train/valid-tabellen/tabellen.md`, sectie `## D+A`, de kolommen gevonden/aanwezig en vals/afwezig (k/n); een keurmerk met ≥ 10 mét en ≥ 30 zonder telt mee, ook als de kolom besluit "te weinig voorbeelden" zegt (die rekent met 16/35), en N schiet tekort als minstens één zo'n keurmerk gevonden < 80% of vals ≥ 10% heeft (puntschatting); dan beslist Friso over S/M/L of een GPU, en die maat draait alleen met `--besluit "<verwijzing>"`. Verder 8 (RF-DETR traint niet; terugval D-FINE is niet gebouwd), 5 (beoordelaar), 7 (`beslis` stopt als een code in de drempels geen referentieplaatje heeft).
ongetest: `config`, `train` en `snelheid` hebben een rooktest op MPS (`zwaar`), en hervatten ook: een rooktest stuurt via `nacht.py draai` SIGTERM midden in epoch 2 en hervat tot klaar; `nacht.py` (venster, hervatpunt, SIGTERM/SIGKILL, status, stoppunt 1, plist) is getest met een nagebootste klok en een nagebootst proces; het laden van de echte launchd-agent en een echte nacht draaiden niet; `drempels`/`beslis`/`beoordeel`, `tel_proef`, `nutrigreen.py omzetten` en `echt.py dataset --nutrigreen` (op een mini-zip en verzonnen beelden) zijn getest; de volle training, `--start` (bijtrainen), `--meng`, het omzetten van de echte zip (5,1 GB), `detecteer` op echte etiketten en `beslis` met de echte aanbieder draaiden in deze build niet; `off.py ophalen` (de geteste `ophalen` met een nagebootste aanbieder) draaide niet tegen de echte Robotoff, en `generator.py tegels --off` niet met echte uitsneden.

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
uv run python herken.py detecteer --bevroren $PM/bevroren.json --model $PM/modellen/$MAAT-2/checkpoint_best_total.pth --lijst $PM/toets/toets-lijst.json --uit $PM/uitvoer/toets-kandidaten.json --threads 8
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
Uitvoer: `k4aa-run1.json` (run-bestand zoals in stap 12; elke detectie binnen de 17 klassen (de 13 keurmerken; vegetarisch V-label telt als V-label) is een melding, ook met requires_review) en `k4aa-meta.json` (tijd, kosten, requires_review per etiket); de informatieve run met alle referenties apart. Na elk etiket weggeschreven; een afgebroken run (ook de uitgavengrens) krijgt `"status": "afgebroken"` met de reden en exitcode 3. Met `--bevroren` weigert de runner een referentieset die afwijkt van de bevroren set.
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

Fase 2 traint op de echte tegels plus 1.000 meng-tegels (NutriGreen tot zijn grens, de rest nagemaakt). Raming
02-11-2026 (trainingsset §5): 33 tegels per etiket in plaats van ±12 (33 is gemeten op de toetsetiketten en voor de
training aangenomen, INFERENCE). Op ±216–320 echte trainingsetiketten zijn dat ±8.100–11.600 tegels per epoch; fase 2 met 20 epochs duurt dan ±11,6–16,5 uur plus ±1,5–2,3 uur validatie, dus boven 8 uur (stoppunt 1).
Omdat de meting geen bovengrens is, liet fase 2 met hoogstens 7 epochs (±4,6–6,6 uur) ruimte; 8 epochs (±7,5 uur) was
krap. De keuze tussen minder epochs, minder tegels of een ander besluit was aan Friso, vóór de training (stoppunt 1).

> [!note] Besluit Friso 02-11-2026: 20 epochs, alleen 's nachts
> Fase 2 traint 20 epochs, verdeeld over nachten (22:00–07:30) met hervatten (`nacht.py`, stap 10). De grens van 8 uur
> per fase vervalt; stoppunt 1 is nu een epoch langer dan het nachtvenster (9,5 uur), een volledig venster zonder nieuw
> checkpoint, of een verwachte einddatum meer dan 4 nachten na de start. Met ±11,6–16,5 uur plus validatie is fase 2
> ±2 nachten (INFERENCE); de status van `nacht.py` geeft de echte einddatum.
OFF maakt fase 2 niet langer: de OFF-grens kan het aantal gemengde nagemaakte tegels alleen verlagen (zie `_nagemaakt`
en `_off` in `rapport.json`). Het echte aantal staat na `echt.py dataset` in
`train/_annotations.coco.json`; meet de snelheid opnieuw voor de gekozen tegelinstelling.

| maat | resolutie | s/iteratie | fase 1 (5.000 tegels × 20) | fase 2 (±8.100–11.600 tegels × 20) | uitkomst |
|---|---|---|---|---|---|
| N | 384 | 1,03 (eerdere meting 1,06) | ±7,2 uur + ±15 min validatie | ±11,6–16,5 uur + ±1,5–2,3 uur validatie (INFERENCE) | fase 1 net binnen 8 uur; fase 2 met 20 epochs was **stoppunt 1** (hoogstens 7 epochs); sinds 02-11 verdeeld over ±2 nachten |
| S | 512 | ±1,6 vóór het vastlopen (0,62 it/s) | ±11 uur | langer dan N (INFERENCE) | **stoppunt 1** |
| M, L | 576, 704 | niet gemeten | langer dan S | langer dan S | stoppunt 1 (INFERENCE) |

> [!note] Besluit Friso 01-11-2026: alleen maat N op deze Mac
> De meting voor S liep twee keer vast op iteratie 20 van 50 (het proces gebruikte 12 GB, het wisselgeheugen van de Mac
> stond vol). De snelheid tot dat moment gaf ±11 uur per fase, boven de grens van 8 uur. Alleen N past op MPS binnen
> de grens, met de validatie per epoch erbij ±7,5 uur. Friso besliste: eerst alleen N. S, M of L (of een GPU) alleen als N
> op de validatieset tekortschiet (stap 10, stoppunt 1) en na een nieuw besluit; `train.py` weigert die maten zonder
> `--besluit "<verwijzing>"`.

## Terugval

RF-DETR installeert of traint niet: stoppunt 8. D-FINE (Apache-2.0) is de gedocumenteerde terugval en is niet gebouwd.
