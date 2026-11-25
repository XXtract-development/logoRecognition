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
