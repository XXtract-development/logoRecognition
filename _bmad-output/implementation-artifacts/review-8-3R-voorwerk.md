# Adversarial review — Story 8.3R voorwerk (2026-06-06)

Reviewer: onafhankelijke agent (verse context), empirische verificatie met /tmp/ml-venv + OpenCV.
Verdict: **NO-GO → GO-MITS na verwerking** (alle bevindingen hieronder zijn verwerkt in de story-file, zie "Verwerking" per punt).

| # | Ernst | Bevinding (kern) | Verwerking in spec |
|---|---|---|---|
| 1 | 🔴 | CCOEFF_NORMED én SQDIFF_NORMED breken empirisch `test_template_matching_locates_known_mark` (zwart zero-variance fixture → match op (0,0) of score 0.0); alleen huidige 1−min/max SQDIFF slaagt. AC2 en AC5 konden niet allebei waar zijn. | Metric expliciet vastgelegd: CCOEFF_NORMED (clip [0,1]) mét zero/low-variance-fallback-tak naar het huidige SQDIFF-pad (template-stddev < LOCALIZE_MIN_VARIANCE). Fixtures doorlopen aantoonbaar de fallback-tak (reviewer-meting: score 1.0 op (100,150)). |
| 2 | 🔴 | AC1 ("ladder in match_templates") vs Task 1 ("ladder in endpoint") spraken elkaar tegen; in-functie laddering riskeert óók positie-drift op het fixture. | Beslist: ladder in de localize-flow (endpoint); `match_templates`-signatuur blijft byte-identiek; AC1 geherformuleerd. |
| 3 | 🔴 | Beste-schaal-collapse had geen uitvoeringsplek: NMS (IoU>0.5) redt 48px- vs 286px-boxes op zelfde centrum niet → duplicaten. | Expliciete pre-NMS collapse-stap per (t3777_code, tegel): hoogste score over schalen wint; nieuwe test (iv) dekt dit. |
| 4 | 🟠 | Alpha-kanaal wordt geplat (IMREAD_COLOR) → GREEN_DOT/FSC matchen op spookrechthoek. | Alpha-neutralisatie gespecificeerd: transparante pixels → gemiddelde van opake pixels (deviatie ≈ 0 onder CCOEFF); GREEN_DOT expliciet in kalibratie-validatie. |
| 5 | 🟠 | localize-endpoint heeft nul testdekking; AC3 herschreef het contract blind. | Endpoint-handler-test toegevoegd aan AC5/Task 4 (storage_path-mock, 422-pad, tunables-doorgifte). |
| 6 | 🟠 | 1446-FP-baseline is appels-met-peren (andere metric, caller-side scaling, "13 afbeeldingen" vs 12/9 elders). | Meetset gepind (12 ACC-artworks + 9 composieten); FP gerapporteerd bij gematchte composiet-recall; 1446 gedegradeerd tot context, niet vergelijkingscriterium. |
| 7 | 🟠 | Performance-intuïtie omgekeerd (kleine schalen domineren kosten: 48px→~593² map per ref per tegel); synchroon endpoint zonder budget. | Dev Note gecorrigeerd; expliciet request-budget (LOCALIZE_TIME_BUDGET_S, graceful afkap + warning in response/log) toegevoegd. |
| 8 | 🟡 | AC4c "natuurlijke opbrengst" kan niet falen → meting, geen AC. | Verplaatst naar Task 3 als meetactie; AC4a-gate gemotiveerd (composieten zijn uit dezelfde referenties gebouwd → 100% haalbaar en falsifieerbaar). |
| 9 | 🟡 | Ladder-definitie ambigu (max-dim vs schaalfactor; AR-verschillen 110×73 vs 110×146). | Vastgelegd: schaalfactor = doel-px / max(ref_w, ref_h), AR behouden; AR-afwijking echt-logo-vs-referentie expliciet buiten scope. |
| 10 | 🟡 | Variance-guard onder kleine schalen onbeslist (48px-downscale kan onder drempel zakken). | Beslist: guard op de geschaalde variant; weigeringen per schaal loggen t.b.v. kalibratie. |
| 11 | ℹ️ | AC4 hangt aan een nog te bouwen script (orkestratie is out-of-scope). | Scriptpad als deliverable in AC4: `apps/ml-service/scripts/remeasure_localization.py`; ADMIN-vrij, read-only m.u.v. applicatiepaden. |
| 12 | ℹ️ | min_score=0.8 wisselt van betekenis bij metric-wissel; fixtures geven 0.8 expliciet mee. | Genoteerd in AC2: score-semantiek per tak gedocumenteerd; fixture-gedrag op beide takken geverifieerd vóór sign-off (Task 4). |

Volledige review-tekst: zie sessie-transcript 2026-06-06; kernmeting reviewer:

```
=== black template (zero variance), geplakt op (100,150) ===
CCOEFF_NORMED  best score=1.0000 loc=(0, 0)      ← faalt fixture
SQDIFF_NORMED  score=0.0000      loc=(0, 0)      ← faalt fixture
huidig TM_SQDIFF 1−min/max: score=1.0000 loc=(100, 150)  ← enige die slaagt
```
