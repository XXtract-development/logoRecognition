---
title: Nutri-Score K4-aa ronde 2 — oorzaak verlies A/B/C
datum: 2026-11-24
status: diagnose klaar (offline, geen ACC-meting)
invoer: ronde-1-antwoorden ~/logo-meetset-20261018/nutriscore-k4aa-de-20261124/deelset (109), meting 24-11 ~/logo-meetset-20261018/nutriscore-acc-k4aa-20261124 (327), spike-momentopname 540 referenties (zelfde referentieversie "540:" als ACC)
scripts: nutriscore-k4aa-ronde2-cmp.py, nutriscore-k4aa-ronde2-gate_old.py (uitvoeren met ~/logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/.venv/bin/python3)
---

# Uitkomst

De letterpoort (CAP-2) veroorzaakt het verlies van A/B/C. SigLIP kan de vijf letters niet van elkaar onderscheiden, dus de regel "letter X moet de hoogst scorende letter zijn" gooit bijna elke juiste melding weg.

# Bewijs

- VERIFIED (`cmp.py`): van de etiketten waar op 24-11 de juiste letter A/B/C werd gemeld, geeft ronde 1 voor 17 niets meer (A 8, B 3, C 6), en voor 0 etiketten komt er een letter bij. Per etiket: A `A→-` 8×, B `B→-` 3×, C `C→-` 6×.
- VERIFIED (`gate_old.py`): de 58 Nutri-Score-vakken van de 24-11-meting op A/B/C-etiketten (50 met juiste letter, 8 met foute) door de huidige `gate()` met de 540 referenties: de oude poort houdt 49 van 50 juiste; de nieuwe letterpoort houdt 8 van 50 (16%). Foute meldingen: oud 8 van 8 behouden, nieuw 2 van 8.
- VERIFIED: de scores van de vijf letters liggen dicht bij elkaar: spreiding hoogste-laagste per vak mediaan 0,028 (max 0,043). De juiste letter staat in de juiste meldingen op plek 1 in 8 van 50 gevallen (16%, minder dan toeval 20%), plek 2 in 22, plek 3 in 19, plek 4 in 1.
- VERIFIED: 18 van de 19 etiketten waar oud de juiste letter vond en nu niet: elk oud juist vak faalt de nieuwe letterpoort. Het 19e (`8710624010003-08710624329426-528`, C) haalt de poort wel; daar meldt Gemini nu anders (INFERENCE: modelvariatie).
- VERIFIED: D scoort door de referentieverdeling vaak hoogst (D is de hoogst scorende letter in 30 van de 58 vakken, ook op A/B/C-balken). Dat verklaart de D-score van 84% zonder dat de poort iets onderscheidt: de poort is voor D toevallig mild, voor de rest streng. INFERENCE: ook valse D's (E→D 2) komen hierdoor door.
- Verband: het 24-11-probleem "A/B/C vals 21–44%" kwam van Gemini die D/E-balken als A/B/C meldde (D→C 5, D→B 1, E→C 3 in de 24-11-run, VERIFIED `cmp.py`); dat lost de codelijst met D/E op (D vals 7%).

# Grenzen van het bewijs (review 24-11)

- De 58 vakken komen uit de 24-11-meldingen die de oude poort al doorliet: "oud houdt 49/50" is daardoor bijna vanzelfsprekend. Wat de familiepoort weigert is offline niet gemeten. Op de 20 etiketten zonder Nutri-Score meldt geen van beide runs iets.
- De familiepoort houdt 58/58 vakken (ook alle 8 foute letters): letterfouten zijn Gemini-kant en blijven. Verwacht op 24-11-cijfers A ≈14%, B ≈22% vals.
- SigLIP: scheve voorkeur (D hoogst in 30/58), niet "geen signaal"; juiste letter plek 1/2/3/4/5 = 8/22/19/1/0.

# Niet vast te stellen offline

- INFERENCE: E 14% gevonden: onbekend of Gemini E-balken niet meldt of dat de poort ze wegneemt. Het API-antwoord bevat geen `stats` en er is lokaal geen provider-sleutel. De deelmeting na de fix bepaalt dit (stats staan niet in het antwoord: zie spec CAP-2c).
- De E-referenties op ACC (8 in de momentopname) hoeven niet opgeschoond te worden als de poort alle Nutri-Score-referenties als één familie laat stemmen: letterreferenties tellen dan niet meer mee. Geen ACC-schrijfactie nodig.

# Fix (voorgesteld)

Poort voor Nutri-Score op familieniveau: een melding NUTRISCORE_X blijft als een NUTRISCORE_*-code in de top-3 verschillende codes staat; de letter komt van Gemini, de poort bepaalt alleen "is dit een Nutri-Score". `one_letter` (één balk, één letter) kiest op stemmen (meeste overlappende meldingen van dezelfde letter), gelijk → laagste `orde`.
