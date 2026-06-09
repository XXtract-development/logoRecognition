# AC5-validatie — proof-slice (5 nieuwe keurmerken, geseed uit GS1 Label Guide)

Detectie-run op 347 reeds-geïmporteerde artwork-beelden, ná seeden van 5 nieuwe referentielogo's
(5→10 klassen). High-conf labelronde: 71 detecties (15 per code), menselijk gelabeld 2026-06-09.

## Resultaat: detecteerbaar ✅ — maar precisie onbruikbaar ✗ (8%)

| Nieuw keurmerk | ECHT | VALS | Precisie | Score-banden |
|---|---|---|---|---|
| RECYCLABLE_GENERAL_CLAIM | 0 | 15 | **0%** | alle VALS op **score 1,00** |
| MARINE_STEWARDSHIP_COUNCIL | 0 | 15 | **0%** | VALS 0,41–0,60 |
| EUROPEAN_V_LABEL_VEGETARIAN | 0 | 11 | **0%** | VALS 0,07–0,57 |
| BETER_LEVEN_1_STER | 1 | 14 | 7% | ECHT 0,95 · VALS 0,63–0,72 |
| TRIMAN | 5 | 10 | 33% | ECHT 0,68–0,93 · VALS 0,60–0,68 |
| **Totaal** | **6** | **65** | **8%** | |

Volledige run: 4357 detecties uit 347 beelden (RECYCLABLE alleen 3247, waarvan 681 ≥0,7).

## Interpretatie

1. **Recall werkt:** alle 5 geseede keurmerken vuren op echt artwork — seeden-uit-de-guide maakt ze detecteerbaar (AC1–4 bewezen).
2. **Precisie is onbruikbaar (8%)** met één officieel logo als referentie + de huidige classify (globale drempel,
   ImageNet-embedding). Dit bevestigt **Risico E + B** uit de adversariële review empirisch.
3. **Per-klasse drempel redt RECYCLABLE niet:** 15/15 vals-positief op **cosine 1,00**. De embedding maximaliseert
   op niet-matches → het onderscheidend vermogen ontbreekt, geen drempel lost dat op. (Mogelijk degenereert de
   RECYCLABLE-referentie-embedding — apart te checken, maar verandert de conclusie niet.)
4. **Faint signaal bij TRIMAN** (echt 0,68–0,93 vs vals 0,60–0,68) en BETER_LEVEN (echt 0,95) — een hoge per-klasse
   drempel zou hier een paar TP's kunnen isoleren, maar te weinig voor productie.

## Conclusie & richting

De proof-slice heeft zijn doel vervuld: **de seed-uit-guide-pijplijn werkt mechanisch end-to-end**, en legt
met data bloot dat **brede dekking méér vergt dan seeden** — de classify-kwaliteit is onvoldoende voor nieuwe,
fijnmazige of generieke logo's.

- **Niet auto-accepten:** de nieuwe klassen blijven review-only; bij 8% precisie zou auto-accept 92% ruis registreren.
- **De echte volgende stap is Story 12.2** (class-agnostische region-proposer + open-set-verwerping) **én
  embedding-fine-tuning** (metric learning) — de ImageNet-backbone scheidt deze logo's niet. Dit is nu
  evidence-based i.p.v. een aanname.
- **RECYCLABLE@1,00** verdient een snelle diagnose (degenererende referentie-embedding?) los van 12.2.

Bron-labels: `~/Downloads/labels-oogstrun.json` (71). Detectie-run: 150 GTINs / 347 beelden, 10 klassen.
