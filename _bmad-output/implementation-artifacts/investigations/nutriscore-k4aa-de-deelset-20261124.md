---
title: Nutri-Score K4-aa met D en E — deelset-meting op ACC
datum: 2026-11-24
omgeving: ACC, acc@5d8a0e3 (PR #35), LOGO_SCAN_ROUTE=k4aa tijdelijk
spec: _bmad-output/specs/spec-nutriscore-k4aa-de/SPEC.md
status: afgerond, ACC teruggezet, volledige 352 NIET gedraaid (drempel niet gehaald)
---

# Uitkomst

D wordt gevonden (84%, 7% vals). A, B, C en E halen de drempel niet; A, B en C vinden nu **minder** dan op 24-11 (voor de wijziging). De eis (≥80% gevonden, ≤10% vals per letter) is niet gehaald. Volledige reeks niet gedraaid (spec CAP-5b).

# Deelset (119 etiketten, 109 antwoorden, alle modelVersion `acc-20261006/k4aa`, 10 zonder antwoord)

| Letter | Gevonden | Vals | 24-11 gevonden (352, oude codelijst) |
|---|---|---|---|
| A | 31% (4/13) | 0% (0/4) | 92% |
| B | 20% (2/10) | 50% (2/4) | 45% |
| C | 33% (5/15) | 0% (0/5) | 79% |
| D | 84% (27/32) | 7% (2/29) | 0% |
| E | 14% (3/21) | 0% (0/3) | 0% |

Verwarring (waarheid → gemeld): A geen 9/A 4; B geen 8/B 2; C geen 9/C 5/B 1; D D 27/geen 5/B 1; E geen 16/D 2/E 3.
Bron: `~/logo-meetset-20261018/nutriscore-k4aa-de-20261124/deelset-rapport.md`, antwoorden in `deelset/`. Deelset en 24-11-meting verschillen van omvang: vergelijking is indicatief.

# Oorzaken

- VERIFIED: A/B/C/E eindigen vooral als "geen" (geen melding), niet als verkeerde letter. De meldingen die er zijn, zijn meestal juist.
- INFERENCE: de letterpoort (CAP-2) of de nieuwe "ander"-regel haalt echte A/B/C weg. Bewijs ontbreekt: het API-antwoord bevat geen `stats` (`letter_dropped`, `na_poort`). Bevestigen: scan een A-etiket met `stats` uit de ml-service-log, of draai `k4aa.scan` lokaal met ACC-referenties.
- INFERENCE: E→D (2) en E→geen (16): E-referenties op ACC zijn waarschijnlijk vervuild (manifest 12-07: 17 van 42 Nutri-Score-refs toonden een andere letter; 3 D, 10 E). Niet gemeten op de actuele set (CAP-3): `SELECT` per code op de referentietabel; opschonen is een schrijfactie op ACC en niet gedaan.
- UNVERIFIED: GTIN-overlap referenties/352 (CAP-5c) niet gemeten.

# ACC teruggezet

LOGO_SCAN_ROUTE (gewoon + preview) en LOGO_PIPELINE_KEYS_EXTRA (gewoon + preview) verwijderd; redeploy mwg484k0sc4oo80okc08g8cg; Coolify opnieuw uitgelezen: geen van beide variabelen meer. VERIFIED: /health 200; oude testsleutel → 401. Niet gedaan: testscan met modelVersion (geen geldige sleutel meer; route is uit omdat de variabele weg is). n8n-credential MSD1Anilm4mpTywX en flow AxwHAa2jGL9SkvNb blijven; Keychain-item LOGO_PIPELINE_KEYS_EXTRA/acc staat nog lokaal.
