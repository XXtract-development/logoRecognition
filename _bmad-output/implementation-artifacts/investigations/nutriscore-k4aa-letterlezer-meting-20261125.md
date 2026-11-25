---
titel: Nutri-Score ronde 3 — aparte letterlezer, deelmeting 119 op ACC
datum: 2026-11-25
spec: _bmad-output/specs/spec-nutriscore-k4aa-letterlezer/SPEC.md
code: acc@8cfa946126227d3d124b667f6d17b3991e8be27d (PR #39)
ruwe antwoorden: ~/logo-meetset-20261018/nutriscore-k4aa-letterlezer-20261125/ (antwoorden/, run.log, ml-scanlog.txt)
---

# Uitkomst

Op de deelset van 119 etiketten vinden A, B, C, D en E elk 100% terug. Alleen B heeft te veel foute meldingen: 21% (3 van 14), eis ≤10%. De overige vier letters halen de eis. De volle 352 is **niet** gedraaid, want de afgesproken drempel (A/B/C ≥70% gevonden én ≤10% fout) is voor B niet gehaald.

# Resultaat per letter (deelset 119, ACC, route k4aa)

VERIFIED: `scripts/nutriscore_measure.py --truth truth-deelset.json --images proef-detector/toets/beelden`, uitvoer in `run.log`.

| letter | ronde 2 gevonden | ronde 3 gevonden | ronde 3 fout (aandeel meldingen) | eis |
|---|---|---|---|---|
| A | 85% | 100% (13/13) | 0% (0/13) | gehaald |
| B | 100% (62% fout) | 100% (11/11) | 21% (3/14) | fout niet gehaald |
| C | 53% | 100% (15/15) | 0% (0/15) | gehaald |
| D | 91% | 100% (32/32) | 3% (1/33) | gehaald |
| E | 91% | 100% (22/22) | 0% (0/22) | gehaald |

Verwarring (waarheid → gemeld): A: 13×A, 1×B · B: 11×B · C: 15×C, 1×B · D: 32×D · E: 22×E, 1×D, 1×B.
C wordt dus nog maar 1 van 16 keer als B gemeld (ronde 2: 10 van 15).
Origineel (41 etiketten): B fout 1/3. Herschaald (78): B fout 2/11. De drie foute B's zitten op een A-, een C- en een E-etiket.

Zonder antwoord: 8 van 119 (7× HTTP 400 bij versturen, 1× scan `failed`); ronde 2 had er 10. INFERENCE: dezelfde etiketten die de scan al eerder weigerde; niet onderzocht.

# Tellers uit de ml-service (111 scans, `docker logs`, alleen lezen)

VERIFIED: `ml-scanlog.txt`, regels "K4-aa scan done".
- letterlezer-aanroepen: 179 · letter gewijzigd door de lezer: 44 · "ander" (balk laten vallen): 3 · lezer mislukt: 1 · budget-terugval: 0.
- kleurlezer (alleen geteld): 27 akkoord, 2 niet akkoord, 146 geen lezing.
- kosten volgens de logregels: $1,78 voor 111 scans · gemiddelde scantijd 23,0 s · langste 75,7 s.

# Beoordeling

- De aparte letterlezer lost het C→B-probleem op en tilt A/C/D/E boven de 80%.
- Wat overblijft is B: drie foute B-meldingen op 14. INFERENCE: ze komen uit de lezer zelf (een dubbelzinnige crop krijgt B); niet bewezen, want de losse lezer-antwoorden per balk staan niet in de API-uitvoer.
- n is klein (14 B-meldingen); 21% heeft een groot betrouwbaarheidsinterval. De 352 zou dat getal scherper maken.

# Opties

1. Volle 352 draaien (kosten ≈ $5 bij $1,78 voor 111; totaal ruim onder $10): geeft de eerlijke B-foutkans en toetst A–E op de volle meetset. Aanbevolen.
2. Eerst B-bars loggen (lezer-antwoord per balk) en de drie gevallen beoordelen, daarna een kleine aanscherping van de lezerinstructie (tweede iteratie, ≈ $2,5).
3. Stoppen en route aan laten staan als "onzeker, controle nodig" voor B (Nutri-Score staat nu niet in `BRUIKBAAR`).

# Traceerbaarheid (bmad-testarch-trace, kort)

| eis (spec) | test | uitkomst |
|---|---|---|
| CAP-1..4 lezer per balk, fallback, budget | `apps/ml-service/tests/test_k4aa_letterlezer_atdd.py` (28 tests) | groen, eerst rood (22 faalden) |
| CAP-5 deelmeting | dit document | A,C,D,E gehaald; B fout 21% |
| CAP-6 herstel ACC | nog uit te voeren na akkoord | open |

Poortuitkomst: CONCERNS — code gehaald, meetdoel voor B niet gehaald op de deelset.

# Volledige 352 op ACC (aanvulling, goedgekeurd door Sanne, opdracht msg_bf8cb2a36c65)

VERIFIED: `scripts/nutriscore_measure.py --truth proef-detector/toets/uitslag.json --images proef-detector/toets/beelden`, start 09:16 UTC; uitvoer `volledig/run.log`, tellers `volledig/ml-scanlog.txt` (map `~/logo-meetset-20261018/nutriscore-k4aa-letterlezer-20261125/`). 335 antwoorden, allemaal `acc-20261006/k4aa`. 17 zonder antwoord (11× HTTP 400 bij versturen, 6× scan `failed`).

| letter | gevonden | fout (aandeel meldingen) | eis |
|---|---|---|---|
| A | 100% (24/24) | 4% (1/25) | gehaald |
| B | 100% (23/23) | 4% (1/24) | gehaald |
| C | 100% (31/31) | 0% (0/31) | gehaald |
| D | 100% (31/31) | 3% (1/32) | gehaald |
| E | 100% (21/21) | 0% (0/21) | gehaald |

Verwarring (waarheid → gemeld): A: 24×A · B: 23×B · C: 31×C, 1×B, 1×A · D: 31×D · E: 21×E, 1×D. C→B: 1 van 33 (ronde 2: 10 van 15). Origineel (191 etiketten): alle letters 100% gevonden, 0% fout. Herschaald (161): A fout 1/14, B fout 1/22, D fout 1/29, rest 0.

Tellers alleen de volle run (totaal in log minus deelrun): 268 letterlezer-aanroepen, 74 letters gewijzigd, 2 "ander", 6 mislukt, 0 budget-terugval; kleurlezer 46 akkoord, 3 niet akkoord, 211 geen lezing. Gemiddelde scantijd 24 s, langste 148,5 s. Kosten: ≈ $4,87 volle run, ≈ $6,65 samen met de deelmeting (uit `cost=` in de ml-service-log).

Opmerking: B-fout op de deelset was 3/14, op de volle set 1/24 voor dezelfde route en code. INFERENCE: verschil door ruis van het model tussen runs en de kleine noemer (n=14); niet apart gemeten (commando: dezelfde 119 etiketten nogmaals draaien en matrices vergelijken).

Noot: de 233 etiketten buiten de deelset zijn niet apart doorgerekend; de volle-set-getallen omvatten de 119. Commando: `load_truth`-set filteren op sleutels buiten `truth-deelset.json` en de antwoordenmap opnieuw scoren.

Conclusie: A–E halen elk ≥80% gevonden en ≤10% fout op de 352 (route k4aa, 335 van 352 beantwoord). De 17 etiketten zonder antwoord tellen in de dekking niet mee; de vraag naar de oorzaak (400/failed) staat open.
