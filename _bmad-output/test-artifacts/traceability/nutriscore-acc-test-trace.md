---
spec: _bmad-output/specs/spec-nutriscore-acc-test/SPEC.md
datum: 2026-11-24
gate: PASS (bouw en bewijs); meetuitkomst Nutri-Score: eis NIET gehaald
route: spec (BMAD). ATDD/build/trace met de hand door de werker, niet via de skills; spec-review als gebundelde ronde door de werker zelf (geen aparte Opus-agent).
---

# Trace SPEC-nutriscore-acc-test

| CAP | Test / bewijs | Uitkomst |
|---|---|---|
| CAP-1 sleutel naast lijst | `apps/api/src/__tests__/routes/logo-scans-keys-extra.test.ts` (a-f, eerst rood 2/6) + bestaande `logo-scans-auth.test.ts` | PASS (14/14); PR #32 CI groen |
| CAP-2 meetscript | `scripts/test_nutriscore_measure.py` (sleutel niet in uitvoer, hervatten, rescan, alleen `<id>.png`, geen-antwoord, verkleinen >9,5 MB) | PASS (9/9) |
| CAP-3 uitslag per letter | idem (vaste mini-set, n.v.t. bij 0 meldingen, eis-vlag) | PASS |
| CAP-4 ACC | Coolify deployment f841824 finished; `/health` 200; foute sleutel 401; nieuwe sleutel zonder bestand 400 (geauthenticeerd); `LOGO_PIPELINE_KEYS` `updated_at` 2026-10-11 ongewijzigd | PASS (n8n-acc afgeleid, niet getoetst) |

# Meting op ACC (352 bevestigde etiketten, 336 met antwoord, 16 zonder)

Route: oude route (LOGO_SCAN_ROUTE niet gezet). Gewichten Nutri-Score staan op ACC (methode `nutriscore-a2` 74x, `nutriscore-head` 3x, `embedding` 200x).
Waarheid: `nutriscore` in `toets/uitslag.json` (A 26, B 27, C 32, D 32, E 22; 213 zonder). Vals = aandeel gemelde letters dat fout is.

**Alle detecties (zoals de API ze teruggeeft)**

| letter | gevonden | vals | eis |
|---|---|---|---|
| A | 71% (17/24) | 72% (43/60) | niet |
| B | 30% (7/23) | 68% (15/22) | niet |
| C | 35% (11/31) | 62% (18/29) | niet |
| D | 26% (8/31) | 71% (20/28) | niet |
| E | 36% (8/22) | 11% (1/9) | niet |

**Alleen `nutriscore-a2`/`-head` (kleur-lezer + vangnet)**: vals 0-11% (A 1/9, rest 0), maar gevonden slechts A 33%, B 26%, C 16%, D 16%, E 32%.
**Alleen `embedding`** (nearest-reference): gevonden A 50%, B 9%, C 23%, D 10%, E 9%; vals 33-88%. De valse meldingen komen vrijwel allemaal hieruit.

Bevindingen
- Geen letter haalt de eis (≥80% gevonden en ≤10% vals).
- De `embedding`-route veroorzaakt de valse A/C/D-meldingen; de kleur-lezer is precies maar mist de meeste.
- 157 van 352 etiketten zijn groter dan 10 MB; het endpoint weigert die met 413. De meting stuurde die als JPEG q90 (zelfde pixels). 16 etiketten bleven zonder antwoord (12 >7 MB, een deel mislukte de scan; oorzaak niet onderzocht).
- Voorbehoud: referentiebeelden van de oude route kunnen uit dezelfde etiketten komen (trainingsoverlap niet gemeten); de waarheid is door mensen bevestigd.
- Ruwe antwoorden: `~/logo-meetset-20261018/nutriscore-acc-20261124/antwoorden` (buiten de repo).
