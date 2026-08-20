---
review_of: "Story 20.20 — De declaratie-oogst weer aan de gang, en goedkoop houden (deel A, AC1 t/m AC10)"
reviewed_commit: "4487952 feat(20.20): restart the declared harvest and keep it cheap (part A)"
reviewed_branch: epic-20-declaratie-oogst
reviewer: adversariële code review (verse context)
date: 2026-08-20
verdict: FAIL
severity_count: "4 hoog / 6 middel / 5 laag"
---

# Code review — story 20.20, deel A

> [!warning] FAIL
> De bouw is inhoudelijk sterk en de meeste criteria zijn echt vervuld, met toetsen die
> werkelijk gedrag vastpinnen. Maar drie dingen die de story zelf als hoofdzaak benoemt
> werken niet zoals opgeschreven: de **wekelijkse kaartherbouw kan niet draaien** (het script
> roept een bestand aan dat niet in het productiebeeld zit), het **slot dekt de inhaalronde
> niet** (het vervalt na 6 uur, de inhaalronde krijgt 10), en de **vingerafdruk kijkt langs de
> verzameling waarop de match werkelijk draait** (embeddings, niet referentierijen).

Alles hieronder is gelezen, niet gedraaid tegen een echte omgeving. Geen enkele schrijfactie
uitgevoerd; werkboom schoon (`git status --porcelain` leeg).

## Poorten, zelf nagedraaid

`VERIFIED`:

| suite | uitkomst |
|---|---|
| `apps/api` — `npx vitest run` | 1120 groen, 2 overgeslagen, 67 todo (eerste run gaf 1 flakey timeout, tweede en derde run schoon) |
| `apps/api` — `npx tsc --noEmit` | exit 0 |
| `apps/web` — `npx vitest run` | 200 groen |
| ml-suite in wegwerpcontainer | 220 groen, 1 fout (`test_phash_service.py`, mist `/app/requirements.txt` — mountprobleem, niet van deze story), 3 collectiefouten (bestaande baseline) |
| nieuwe api-suite alleen | 31 groen |

De poortclaim in `sprint-status.yaml` klopt dus.

---

## 1. AC-toets

| AC | oordeel | bewijs |
|---|---|---|
| **AC1** kaartbouwer, vorm, droogloop-standaard, herkomst | **VERVULD** | `build-declared-harvest-map.ts:177` bouwt `{codes:{code:[gtin]}}`; `:584` schrijft niets zonder `--apply`; `builtAt` + `sourceIndex` + `exclusions` staan in de kaart; splitsen op de **eerste** streep op `:158`. Vorm sluit aan op wat de oogst leest (`queue_harvest_declared._load_declared_map`, `:335`). |
| **AC2** drie uitsluitingen mét reden + wachtlijst | **VERVULD, met een telfout** (L1) | veldsoort `:206-210`, overstroming `:246-250`, zonder referentie `:251-255`; `awaitingFirstReference` `:277`; overstromingscodes komen bewust níet op die wachtlijst (test aanwezig). |
| **AC3** botsende codes samenvoegen | **VERVULD** | samenvoegen in `byCode` `:219-225`, ontdubbeling via `Set`; toets met 130 + 2 producten en een overlappende GTIN. |
| **AC4** blijvend / voorlopig / nooit, vingerafdruk, groepsfilter, bulk-ophaal | **DEELS** | Onderscheid `:158-171` (py) en `_already_checked` `:188`; groepsfilter vóór `page_order` `:665-672` — de pagina wordt écht niet geladen (toets bewijst het via `propose_calls` én `storage.gets`); bulk-ophaal `:601`, één query per run. **Maar** de vingerafdruk mist de bewegingen die er het meest toe doen (H3) en "cap nooit vastleggen" haalt zijn eigen doel niet (M2). |
| **AC5** eigen tabel, stoppen bij ontbreken, teller | **DEELS** | Tabel + unieke sleutel `(code, gtin, source_file)`: migratie 0021; stoppen bij een onleesbare vastlegging `:610-625` mét toets die bewijst dat er geen analyse en geen INSERT plaatsvindt. **Maar** "de parenlijst verandert" wordt op een tellíng vastgesteld (H4), en een onleesbare kaart wist nu stilzwijgend de teller (M3). |
| **AC6** krimpbescherming, `--force`, eerste run, droogloop meldt | **VERVULD** | `evaluateShrink` `:315`; grens ligt op precies 10% (899/1000 blokkeert, 900/1000 niet); geen kaart of nul paren blokkeert niet; droogloop meldt. Kleine smet: de droogloop geeft exitcode 1 (L4). |
| **AC7** aandrijving vastgelegd, inhalen ≠ bijhouden, kaart periodiek herbouwd | **NIET** | `20-20-aandrijving.md` legt wie/hoe vaak/welk budget netjes vast, en de twee scripts staan er. Maar `scripts/deployment/build-declared-harvest-map.sh:24` kan in het echte beeld niet draaien (H1), en de doc belooft slotdekking die er niet is (H2). |
| **AC8** slot tegen een tweede oogst | **DEELS** | `_lock_held` `:203`, geweigerd bij `:491`, marker met vervaltijd. Het slot doet zijn werk voor twee crons. Het dekt de inhaalronde níet (H2) en is niet atomair (M1). |
| **AC9** geen regressie op 20.7/20.9 | **VERVULD** | `_cross_code_rejected` en `_is_keyline` ongewijzigd (de diff raakt alleen de regels eróm heen); 20.2-suite groen, alleen het databasedubbel is aangevuld. |
| **AC10** RED-bewijs + geen regressie | **DEELS** | Toetsen bestaan voor elk genoemd criterium en pinnen echt gedrag vast. RED-vóór-GREEN is uit één samengeperste commit niet na te lopen; de AC7-toetsen zijn bovendien tekstvergelijkingen op een markdownbestand (M5) en misten daardoor precies H1. |

---

## 2. De gemelde afwijking: is `<aantal>|<hoogste created_at>` gelijkwaardig?

**Nee.** `VERIFIED`: `reference_logos` heeft inderdaad geen `updated_at` (schema `:243-271`, alleen
`createdAt`), dus de aanleiding klopt. De vervanging dekt echter minder dan de toelichting belooft.

**H3 (hoog) — de vingerafdruk telt de verkeerde verzameling.**
`VERIFIED`: de match draait op `reference_embeddings JOIN reference_logos`
(`database.py:702-712`). De vingerafdruk telt uitsluitend rijen in `reference_logos`
(`database.py:833-845`). Een referentierij die er al stond maar géén embedding had, en die er
later wél een krijgt, verandert de matchbare pool volledig terwijl `count` en `max(created_at)`
identiek blijven. Een voorlopig "onder de drempel" blijft dan geldig en het paar wordt nooit
opnieuw bekeken.

Dat is geen bedacht geval: precies deze toestand is in dit dossier al gemeten — RECYCLABLE had
26 actieve referentierijen met nul embeddings. De vingerafdruk faalt dus in het scenario dat het
vliegwiel juist moet losmaken.

**De drie gevallen uit de opdracht, apart:**

| beweging | gevangen? | waarom |
|---|---|---|
| referentie gedeactiveerd én weer geactiveerd | **deels** | de deactivatie verlaagt de telling en wordt gezien; is de heractivatie er vóór de volgende run, dan staat de telling weer op de oude waarde en is `max(created_at)` ongewijzigd → tussenstand onzichtbaar, eindstand terecht gelijk. Onschuldig. |
| referentie wisselt van code | **ja** | de verliezende code daalt in telling, de winnende stijgt. Beide kanten zien het. |
| gelijktijdig één erbij en één eraf | **NEE** | telling gelijk; is de nieuwe referentie ouder dan de zittende jongste (bijv. een teruggezette rij, of een backfill met historische `created_at`), dan blijft ook `max(created_at)` gelijk. Pool veranderd, vingerafdruk niet. |
| embeddings herbouwd of aangevuld | **NEE** | zie hierboven — de zwaarste. |

Een vingerafdruk over de tabel die de match echt gebruikt lost alle vier op, bijvoorbeeld
`count(*)` + `max(re.created_at)` over `reference_embeddings` gejoind op actieve
`reference_logos`, of een `md5(string_agg(rl.id::text, ',' ORDER BY rl.id))` van de actieve
referenties — dat laatste vangt ook de netto-nul-wisseling.

---

## 3. Hoog

### H1 — Het kaartherbouwscript kan in het productiebeeld niet draaien

`VERIFIED`. `scripts/deployment/build-declared-harvest-map.sh:24` draait

```
docker exec "$CONTAINER" npx tsx src/scripts/build-declared-harvest-map.ts --apply
```

Het beeld dat op acceptatie draait wordt gebouwd uit de root-`Dockerfile`
(`.github/workflows/build-push.yml:48-49`, `file: ./Dockerfile`, image `…-app`). Die runtime-laag
kopieert uitsluitend `dist`, `package.json`, `prisma`, `node_modules` en `public`
(`Dockerfile:82-94`). Er is **geen `src/`** in het beeld. En `tsx` staat in **geen enkele**
`package.json` in deze repository (`grep '"tsx"' package.json apps/api/package.json
apps/web/package.json` → nul treffers), dus `npx` zou het bovendien tijdens de cron-run van het
net moeten halen — als `appuser`, met `NODE_ENV=production`.

Gevolg: de wekelijkse herbouw uit AC7 — het onderdeel dat moet voorkomen dat deze story over een
maand weer stilstaat — faalt bij de eerste uitvoering. Dit is precies de bevinding die eerder al
als M10 in `review-20-19-v4.md` stond; hij is nu in een cron-regel beland.

De gecompileerde variant bestáát wel: `tsconfig.json` heeft `outDir: ./dist` en
`include: ["src/**/*"]`, dus `node dist/scripts/build-declared-harvest-map.js --apply` is het
werkende commando. De `require.main === module`-guard werkt daar ongewijzigd.

Bijkomend, kleiner: de standaardcontainernaam is `logo-recognition-api`, terwijl het gebouwde
beeld `…-app` heet (web + api in één container). Controleer de echte naam vóór plaatsing.

### H2 — Het slot vervalt na 6 uur, de inhaalronde duurt 10

`VERIFIED`. `LOCK_MAX_AGE_SECONDS` staat standaard op 21600 seconden
(`queue_harvest_declared.py:178`), en `_lock_held` `:203-227` beschouwt een marker ouder dan die
grens als achtergebleven en laat een nieuwe run door.

`20-20-aandrijving.md:29` en `:44` schrijven voor de inhaalronde
`DECLARED_HARVEST_MAX_SECONDS=36000` voor — tien uur — en `:47` stelt daarbij expliciet: "Het
slot uit AC8 zorgt dat deze run een tweede start weigert zolang hij loopt." Dat klopt de eerste
zes uur en daarna niet meer. Loopt de inhaalronde over 01:17 heen met een marker ouder dan zes
uur, dan start de nachtelijke cron een **tweede declaratie-oogst in dezelfde 8 GiB-container** —
exact het OOM-recept dat AC8 moet uitsluiten, en met de zwaarste run als slachtoffer.

Twee wegen, allebei goed: laat de inhaalronde met
`DECLARED_HARVEST_LOCK_MAX_AGE_SECONDS` ruim boven zijn eigen tijdsbudget draaien (en zet dat in
de runbook naast het budget), of laat de marker zijn vervaltijd uit `MAX_SECONDS` afleiden in
plaats van uit een losse constante. De runbook-zin moet hoe dan ook mee.

### H3 — De vingerafdruk kijkt langs de embeddings

Zie sectie 2.

### H4 — "De parenlijst verandert" wordt op een tellíng vastgesteld

`VERIFIED`. `_counter_reset_needed` (`queue_harvest_declared.py:229-246`) vergelijkt
`state["map_pairs"]` met `len(_scoped_pairs(declared_map))` — twee gehele getallen. AC5 schrijft
voor dat de vaststelling gebeurt "op de paren in de KAART"; de implementatie gebruikt daarvan
alleen het aantal.

Twee kaarten met een gelijk aantal paren maar een andere inhoud (één GTIN eruit, één erin — bij
een wekelijkse herbouw uit een levende index geen uitzondering) laten de teller staan. De offset
wijst dan in een **andere** lijst: alles vóór de offset wordt nooit bekeken, en de run meldt
gewoon `complete`. Stil, en niet zelfherstellend zolang de telling toevallig gelijk blijft.

De bouwer schrijft al een deterministische kaart mét `builtAt`; `_load_declared_map`
(`:335-360`) gooit dat weg en houdt alleen `codes` over. Neem `builtAt` mee, of leg een
`md5` over de geserialiseerde parenlijst vast — dan is "verandert" exact in plaats van benaderd.

---

## 4. Middel

**M1 — Het slot is niet atomair, en de nieuwe volgorde maakt het raam groter.**
`INFERENCE`, op basis van gelezen code. De controle staat op `:491`, de marker wordt geschreven
op `:631`. Daartussen zitten: de volledige `list_training_images(prefix="artwork/")` (op
acceptatie tienduizenden sleutels), de opbouw van de parenlijst, de groepering, en twee
database-rondgangen. Twee runs die binnen dat raam starten zien allebei geen marker en draaien
allebei door. De verplaatsing van de marker naar ná de bulk-ophaal is als verbetering gemeld
(een gestrande run laat geen slot achter) en dat klopt — maar ze verruimt het raam van
"onmiddellijk" naar "tientallen seconden". Een echt slot zou een voorwaardelijke schrijfactie
moeten zijn (objectopslag met if-none-match, of een `pg_advisory_lock` op de database die de
oogst tóch al open heeft). Voor twee cron-regels op verschillende tijden is het risico klein;
in combinatie met H2 en met handmatig starten is het dat niet.

**M2 — "Cap bereikt wordt nooit vastgelegd" bereikt zijn doel niet.**
`VERIFIED`. De regel is letterlijk nagekomen: bij `:815` staat bewust geen `_note`. Maar het paar
is op `:749` al aan `done_idx` toegevoegd, dus de offset schuift eroverheen en de run eindigt
uiteindelijk op `complete`. Daarna wordt het paar pas opnieuw bekeken als de teller terugspringt —
en dat gebeurt alleen bij een gewijzigd párenaantal (H4). AC4's motivering — "vastleggen zou het
paar voorgoed uitsluiten omdat er die nacht toevallig genoeg andere waren" — wordt door het
offsetmechanisme dus alsnog waargemaakt. Wie de cap serieus als runbudget wil behandelen, moet
een cap-paar níet als afgehandeld tellen, of het expliciet als "opnieuw aanbieden" bijhouden.

**M3 — Een onleesbare kaart wist nu de teller en meldt "compleet".**
`VERIFIED`. `_load_declared_map` is fail-safe: een leesfout op de objectopslag levert `{}`
(`:329-334`). Sinds deze story loopt dat door in `map_pairs = len(_scoped_pairs(...))` = 0
(`:508`), waardoor `_counter_reset_needed` waar wordt, `next_offset` op 0 gaat, en het
"complete"-pad (`:545-556`) de stand met `map_pairs: 0` wegschrijft. Eén hikje in MinIO gooit dus
de voortgang weg en rapporteert `status: "complete"` — hetzelfde woord als een geslaagde volledige
ronde. Dat botst met de geest van AC5, die voor de vastlegging juist fail-loud eist. Behandel een
lege kaart als storing (eigen status, teller ongemoeid), niet als een kaart van nul paren.

**M4 — De startscripts loggen niets, terwijl AC6 op een melding leunt.**
`VERIFIED` in beide scripts: geen omleiding, geen logbestand. Blokkeert de krimpbescherming, dan
verdwijnt die melding in de stdout van cron; hetzelfde geldt voor `status: locked` en
`checks_unavailable`. AC6 wil dat de krimp "gemeld" wordt en AC8 dat een geweigerde run "stopt met
een melding" — zonder logbestemming is dat op `vanilla` geen melding maar een geluidloze
mislukking. Voeg `>> /var/log/… 2>&1` toe, of laat het script een niet-nul exitcode met een
duidelijke regel produceren die de cron-mail haalt.

**M5 — De AC7-toetsen toetsen een markdownbestand, niet de aandrijving.**
`VERIFIED`. De hele `AC7`-beschrijving in `build-declared-harvest-map.test.ts` leest
`20-20-aandrijving.md` en controleert of daar `36000`, `1000`, `vanilla` en
`build-declared-harvest-map` in voorkomen, plus of de twee `.sh`-bestanden bestáán (`existsSync`).
Er wordt niet gekeken of een script een shebang heeft, uitvoerbaar is, of een commando bevat dat
in het beeld bestaat. Dit is het patroon waar dit dossier al twee keer op is gestruikeld: de toets
houdt het artefact tegen zichzelf. Dat H1 er ongehinderd doorheen kwam is het directe bewijs. Een
toets die het commando uit het script tegen de inhoud van het beeld (of minstens tegen
`tsconfig.outDir` / de aanwezigheid in `package.json`) legt, had hem gevangen.

**M6 — `map_pairs` volgt de env-scope, en een gescopete debugrun vergiftigt de gedeelde teller.**
`VERIFIED`. `_scoped_pairs` (`:314-322`) past `HARVEST_CODES` toe, en `map_pairs` wordt daaruit
afgeleid (`:508`) en persistent weggeschreven. Eén handmatige run met
`DECLARED_HARVEST_CODES=FSC` legt dus een klein aantal vast, zet `next_offset` op 0 en laat de
eerstvolgende nachtelijke run opnieuw resetten. Meet `map_pairs` over de **volledige** kaart, los
van de scope, of sla hem per scope apart op.

---

## 5. Laag

**L1 — Uitgesloten paren kunnen dubbel geteld worden.** `veldsoortParen` telt de GTIN's van een
`NutritionalScore`-sleutel (`:206-210`) vóór het samenvoegen. Staat dezelfde code óók onder een
andere veldsoort, dan tellen die paren zowel als "uitgesloten" mee als in de kaart. Op de huidige
index onschuldig; als getal in een rapportage misleidend.

**L2 — `skipped_duplicate` wordt vastgelegd als `outcome = "candidate"`.** (`:830`) De migratie
documenteert `candidate` als "kandidaat aangemaakt", maar hier gaat het om "er stond al een item".
De houdbaarheid is terecht dezelfde; de kolom verliest een onderscheid dat later nodig kan zijn om
te verklaren waar rijen vandaan komen. Een vijfde waarde (`existing_item`) met `permanent = true`
kost niets.

**L3 — De bouwer maakt codes hoofdletters, de matchquery vergelijkt hoofdlettergevoelig.**
`buildDeclaredHarvestMap` doet `code.toUpperCase()` (`:191`), terwijl
`find_similar_references_by_codes` vergelijkt met `rl.t3777_code = ANY($3::text[])`
(`database.py:711`) — exact. Een `reference_logos`-rij met een niet-hoofdlettercode zou dan stil
nul matches geven. Op de huidige codeverzameling waarschijnlijk geen probleem; leg de aanname
vast of vergelijk `upper()` aan beide kanten.

**L4 — De droogloop geeft exitcode 1 bij een geblokkeerde krimp.** `:575-582` retourneert 1 vóór
de droogloop-tak op `:584`. Een run die per definitie niets schrijft rapporteert daarmee een
mislukking; in een cron-keten of CI leest dat als kapot in plaats van als "let op".

**L5 — Geen opruiming voor verweesde rijen.** Verandert de paginakeuze voor een GTIN, dan is dat
per AC4 terecht een nieuw paar — maar de oude rij blijft eeuwig staan. Bij de huidige omvang
(orde 1.300 rijen) volstrekt verwaarloosbaar; noem het in de tabelcommentaar zodat niemand later
denkt dat het aantal rijen het aantal levende paren is.

---

## 6. De losse vragen uit de opdracht, kort beantwoord

- **Tabel `declared_harvest_checks` — sleutel, volloop, gelijktijdigheid.** Sleutel klopt met AC4
  (`(t3777_code, gtin, source_file)`, uniek, plus een index op `source_file` voor de bulk-ophaal).
  Vollopen is geen risico (L5). Gelijktijdige runs botsen niet op de tabel: `record_...` doet
  `ON CONFLICT … DO UPDATE` (`database.py:872-880`), dus de laatste schrijver wint en dat is voor
  deze inhoud onschadelijk.
- **Bulk-ophaal — schaalt hij?** Ja. `VERIFIED`: één `fetch` per run over ten hoogste `BATCH`
  (400) tripels via `unnest`, plus één geaggregeerde vingerafdrukquery over de codes in het
  venster. Niet per pagina, niet per paar; de toets telt de aanroepen expliciet (één ophaal, zes
  tripels).
- **Groepsfilter — slaat het echt het laden over?** Ja. `VERIFIED`: volledig nagekeken groepen
  worden uit `groups` verwijderd (`:665-670`) vóór `page_order` (`:672`), dus ze komen nooit in
  `ordered_pages` en worden niet gedownload. De toets bewijst het via `propose_calls` én
  `storage.gets`, niet alleen via een teller — dat is precies de goede vorm.
- **Kan voorlopig per ongeluk blijvend worden, of andersom?** Niet via de code:
  `_note` (`:678-693`) leidt `permanent` af uit `_is_permanent(outcome)` en zet de vingerafdruk
  alléén bij een voorlopig oordeel. Bij een herhaald oordeel overschrijft de upsert beide velden
  consistent. Wél via H3: een voorlopig oordeel gedráágt zich blijvend zolang de vingerafdruk
  blind is voor de verandering.
- **Kaartbouwer — lege index, index zonder `entries`, code met een schuine streep.** `null` of
  onparseerbaar → melding en exitcode 1 (`:496-503`, met toets); index zónder `entries` wordt door
  `readSourceIndex` als `null` behandeld (`:475-482`) en valt in dezelfde tak; een lege maar
  geldige `entries` levert een kaart met nul paren, en de krimpbescherming blokkeert die zodra er
  een bestaande kaart is. Een code mét schuine streep blijft heel — `splitIndexKey` splitst op de
  eerste (`:158-165`), met toets. Alle drie in orde.
- **Deel B écht niet aangeraakt?** `VERIFIED`, vier routes: de diff bevat uitsluitend broncode,
  toetsen, migratiebestand, twee scripts en documentatie; er staat geen enkele aanroep van
  `writeMap` buiten `--apply` en geen aanroep van het script in de repository; er is nergens een
  automatische migratie (`grep 'migrate deploy|migrate dev|db push'` over `Dockerfile`,
  `package.json` en de deploy-yml's → nul treffers); en de werkboom is schoon. Geen cron geplaatst
  (de cron-regels staan alleen als tekst in `20-20-aandrijving.md` en in de scriptkoppen).

---

## Wat moet wijzigen

**Hoog — moet vóór `done`:**

1. **Laat het kaartherbouwscript het gecompileerde bestand aanroepen.**
   `scripts/deployment/build-declared-harvest-map.sh:24` → `node dist/scripts/build-declared-harvest-map.js --apply`.
   Controleer daarbij de echte containernaam (het beeld heet `…-app`, het script gokt op
   `logo-recognition-api`). Werk de gebruiksaanwijzing in de scriptkop van
   `build-declared-harvest-map.ts` bij zodat `npx tsx` daar als **lokale** route staat en het
   `node dist/…`-commando als de route op de omgeving.
2. **Dicht het gat tussen de vervaltijd van het slot en het budget van de inhaalronde.**
   Zet in `20-20-aandrijving.md` bij de inhaalronde een `DECLARED_HARVEST_LOCK_MAX_AGE_SECONDS`
   ruim boven de 36000, of leid de vervaltijd af uit `MAX_SECONDS`. Corrigeer de zin op `:47`, die
   nu een dekking belooft die er niet is.
3. **Neem de embeddings in de vingerafdruk op.** Tel wat de match gebruikt
   (`reference_embeddings` gejoind op actieve `reference_logos`), of gebruik een digest over de
   id's van de actieve referenties — dat vangt ook de netto-nul-wisseling. Werk de
   afwijkingsparagraaf in de story bij: de huidige onderbouwing ("het aantal vangt wat wegvalt,
   `created_at` wat erbij komt") dekt de embedding-beweging aantoonbaar niet.
4. **Maak "de parenlijst verandert" exact.** Laat `_load_declared_map` `builtAt` (of een digest
   over de parenlijst) doorgeven en vergelijk daarop in plaats van op een telling.

**Middel — hoort in dezelfde ronde mee:**

5. Maak het slot atomair, of schrijf de marker terug vóór het dure voorwerk en ruim hem op in een
   `try/finally` dat ook het `checks_unavailable`-pad dekt (M1).
6. Behandel een cap-overslag niet als afgehandeld paar, zodat AC4's motivering ook echt uitkomt
   (M2).
7. Geef een onleesbare kaart een eigen status en laat de teller met rust in plaats van hem via
   `map_pairs = 0` te wissen; `status: "complete"` is daar de verkeerde melding (M3).
8. Geef beide startscripts een logbestemming, zodat de meldingen uit AC6 en AC8 op `vanilla`
   ergens aankomen (M4).
9. Vervang de tekstvergelijkende AC7-toetsen door minstens één toets die het commando uit het
   script tegen de werkelijke beschikbaarheid legt (M5).
10. Bereken `map_pairs` los van `HARVEST_CODES`, of sla hem per scope apart op (M6).

**Laag — repareer waar je toch bent:** L1 (dubbeltelling in de uitsluitingscijfers), L2 (eigen
uitkomstwaarde voor "item bestond al"), L3 (hoofdletteraanname vastleggen of wegnemen), L4
(droogloop mag geen 1 teruggeven), L5 (regel in de tabelcommentaar over verweesde rijen).

---

## Wat NIET geverifieerd is

- **Niets is tegen een echte omgeving gedraaid.** Geen database, geen MinIO, geen container op
  `vanilla`, geen migratie. De uitspraken over het productiebeeld komen uit `Dockerfile`,
  `.github/workflows/build-push.yml` en `apps/api/tsconfig.json`, niet uit een `docker exec`.
- **Of de tabel `declared_harvest_checks` op acceptatie al bestaat** is niet gemeten — de review
  las alleen dat de migratie in de repository staat en dat niets haar automatisch toepast.
- **De getallen uit de story** (1349 paren, 39 codes, 867 producten, 1097 door te rekenen, ~8,5
  uur) zijn niet nagemeten; ze komen uit de spec en zijn hier alleen op interne samenhang
  gecontroleerd.
- **RED-vóór-GREEN** is niet aan te tonen: de tak draagt één samengeperste commit. Beoordeeld is
  alleen wat de toetsen in hun eindtoestand bewijzen.
- **De timingaanname "rond 01:34 klaar"** in de runbook berust op ~28 s per paar uit story 20.11
  en is niet opnieuw gemeten; met het groepsfilter erbij is de werkelijke duur waarschijnlijk
  korter, maar dat is een aanname.
- **`page_order`, `_pick_page`, `_cross_code_rejected` en `_is_keyline`** zijn gelezen maar niet
  inhoudelijk herbeoordeeld — ze vallen buiten deze story en hun toetsen zijn groen.
- **Het ene falende ml-toetsgeval** (`test_phash_service.py`, ontbrekende `requirements.txt`) is
  als mountartefact van de wegwerpcontainer beoordeeld, niet uitgezocht.
