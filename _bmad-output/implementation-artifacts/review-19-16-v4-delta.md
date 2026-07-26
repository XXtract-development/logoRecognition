# Delta-check ronde 4 — Story 19.16 v4 (alleen AC1/AC7/AC9)

reviewed_artifact: `_bmad-output/implementation-artifacts/19-16-indexbouwer-volledige-corpus.md` (v4, 2026-07-25)
scope: uitsluitend de 3 blokkerende punten V1/V2/V3 uit `review-19-16-v3.md` + bonus V6. Geen volledige review.
reviewer: adversarial delta (story-tekst getoetst, niets geïmplementeerd)

**verdict: PASS**

## 1. V1 — volledigheidsvoorwaarde (7d) — OPGELOST
AC7d: *"Given de run niet álle GTINs uit het universum heeft verwerkt (≥1 GTIN met reden `niet-verwerkt`, bv. door de AC9-deadline), then wordt de index **NIET overschreven** tenzij `--allow-partial` expliciet is meegegeven."* Aftekenbaar: de voorwaarde is een telling (`niet-verwerkt` > 0), de ontsnapping is één expliciete vlag.
De onjuiste bewering in AC9 is gecorrigeerd: *"waar **7d** (volledigheid) het overschrijven blokkeert. *Expliciet NIET 7c: een afgekapte run kan méér sleutels bevatten dan de kleine bestaande index en zou 7c dus passeren.*"* Het door ronde 3 bewezen gat (40 > 32 sleutels) is daarmee dicht.
Glipt er nog iets door? Getoetst:
- **Alle GTINs `gln-ontbreekt`** → 7b telt hem niet, 7d niet geraakt, maar `distinctKeys` = 0 < 32 → **7c blokkeert**. Bovendien maakt Task 8 deze reden vrijwel onmogelijk (`loadGtinUniverse` filtert al op `gln: { not: null }`).
- **Universum van 0 GTINs** → idem: 7d niet geraakt, 7c blokkeert op krimp.
- **Resterend randje (niet blokkerend, twee gelijktijdige storingen nodig):** massa-404 (= normale reden, telt niet in 7b) **én** een onleesbare bestaande index (7c uitgeschakeld, zie punt 2) → een lege index passeert. Relevant omdat de story zelf meet dat de ACC-catalog 0/10 oplost. Aanbeveling voor dev: één ondergrens (`gtinsWithData` > 0) of "geen vergelijkingsbasis ⇒ eerste bouw ⇒ `--first-build` vereist".

## 2. V2 — 7c-randgeval — OPGELOST (eenduidig, andere keuze dan geadviseerd)
AC7c: *"**Randgeval:** is de bestaande index afwezig of onleesbaar (het script leest hem vandaag helemaal niet — die lees-actie moet worden toegevoegd), dan is 7c niet van toepassing en beslissen 7a/7b/7d alleen; log expliciet dát er geen vergelijkingsbasis was."*
Dev hoeft niet meer te raden (doorlaten, mét logregel) en de ontbrekende MinIO-leesactie is expliciet als werk benoemd. De story kiest bewust "doorlaten" waar ronde 3 "blokkeren tenzij `--first-build`" voorstelde; dat is een legitieme keuze, maar zij is de enige oorzaak van het randje in punt 1. Geen blokkade.

## 3. V3 — AC1 vs AC9 — OPGELOST
AC1: *"AC1 geldt dus als geslaagd wanneer de run álle GTINs verwerkt binnen de deadline; wordt de deadline geraakt, dan is dat een gecontroleerde mislukking mét zichtbare reden — niet 'ook goed'."* Plus: *"de resterende GTINs krijgen reden `niet-verwerkt` en AC7d blokkeert het overschrijven."*
Niet meer tegenstrijdig en aftekenbaar: een afgekapte Task 10-run = AC1 niet gehaald. **Rest (klein, tijdens dev):** de exitcode van een afgekapte **droge** run blijft onbenoemd — daar draait de AC7-poort niet, dus per AC3 wordt dat 0 = "succes". Eén zin volstaat: exitcode ≠ 0 zodra ≥1 `niet-verwerkt`, ook in de droge run.

## 4. V6 (bonus) — Redis-voetafdruk — AANWEZIG
AC9: *"**Redis-voetafdruk vóór de verificatierun** (her-review N8): … Stel vóór Task 10 vast dat dit past binnen het geheugenbudget en het eviction-beleid van die Redis — een `allkeys-lru`-eviction zou live queue-sleutels kunnen verdringen. Bevindt zich hier een risico, dan een aparte DB-index of TTL-verlaging, en dat vastleggen."* Controlepunt staat er, mét mitigatie en vastleggingsplicht. Kleine traceability-hiaat: Task 10 verwijst er niet naar en geen enkele task draagt deze check. Niet blokkerend.

## Nog open (allemaal "tijdens dev", geen FAIL)
- `niet-verwerkt` ontbreekt nog in de reden-enumeratie van de AC7-slotbullet (`ok/404/lege-declaratie/api-fout/timeout/api-key-ontbreekt/gln-ontbreekt`), terwijl 7d erop steunt — redactioneel.
- Verkeerde taakverwijzing "(Task 9)" in AC7b staat er nog; hoort Task 10 te zijn (V9, was al low).

**Conclusie:** de drie blokkerende punten uit ronde 3 zijn opgelost; wat resteert is één-zin-werk dat tijdens dev opgelost mag worden. Story kan naar dev.
