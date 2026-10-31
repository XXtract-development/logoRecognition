---
titel: "K4-aa-route: lokale vergelijking met de spike en geheugenmeting"
datum: 2026-10-31
spec: _bmad-output/specs/spec-logo-scan-k4aa/SPEC.md (CAP-8)
code: feat/logo-scan-k4aa 628a36b
ruwe_uitvoer: ~/logo-meetset-20261018/ontwikkelmeting-20261028/k4aa-bouw/ (poort.json, route.json, geheugen.json; lokaal, klantmateriaal)
---

# K4-aa: lokale vergelijking met de spike

Script: `apps/ml-service/scripts/k4aa_vergelijk.py` (lokaal, MacBook M3 Pro; niet in een container). Etiketten: de eerste 20 van `voorlopige-selectie.json` (e001–e020). Referenties: de spike-momentopname (540 actief).

## (a) SigLIP-poort op de spike-vakken — gelijk

- VERIFIED: 50 van 50 behoud/weg-beslissingen gelijk aan `ruw/k2a-op-k1a/run1`; 0 verschillen, 0 gelijkstanden (`poort.json`).
- VERIFIED (tweede methode, los van de route): de beeldtoren uit transformers 4.38.2 geeft cosinus 1,000000 tegen de spike-embeddings (eerst 10, later 16 referenties).

## (b) Volledige route (betaalde aanroepen) — norm niet gehaald, ontheven door Friso

Telregel voor beide metingen (die van `k4aa_vergelijk.py`): een melding telt als teruggevonden als de andere kant een melding met dezelfde code en IoU ≥ 0,5 heeft; meerdere koppelingen toegestaan.

| vergelijking | treffers |
|---|---:|
| route → spike K4-aa run 1 | 21 / 23 |
| spike run 1 → route | 21 / 27 |
| spike run 2 → spike run 1 | 22 / 25 |
| spike run 1 → spike run 2 | 23 / 27 |

- **Norm (aangepast ná de meting, akkoord Friso 31-10-2026):** de route wijkt in beide richtingen niet meer af van spike run 1 dan spike run 2 van run 1. Vervangt de eerdere norm ≥ 90%, die de spike tegen zichzelf ook niet haalt.
- VERIFIED uitslag (`k4aa_vergelijk.py norm`, zonder nieuwe aanroepen): richting 1 gehaald (21/23 = 91% ≥ 22/25 = 88%); richting 2 **niet gehaald** (21/27 = 78% < 23/27 = 85%; 2 meldingen op 27).
- **Ontheffing Friso, 31-10-2026:** het verschil past bij de wisselvalligheid van Gemini; de echte kwaliteitstoets is de latere validatie door een mens op nieuwe etiketten.
- Correctie op een eerdere versie van dit verslag: daar stond de spike-spreiding als 21/27 en 21/25. Die cijfers waren één-op-één geteld, terwijl de route met de regel van het script was geteld. Met één regel voor beide metingen gelden de cijfers hierboven. Ruwe uitvoer vóór de herbeoordeling: `k4aa-bouw/route.voor-norm-cap8b.json`.
- INFERENCE: de afwijkingen zitten bijna allemaal in extra, verschoven tweede vakken van hetzelfde keurmerk (e007, e014, e015, e012) en een Groene Punt die de ene run wel en de andere niet meldt (e015, e017); dezelfde bron van onterechte meldingen als in BESLISRAPPORT §8.

## Privacy, kosten en tijd

- VERIFIED: alle 91 aanroepen gingen naar aanbieder `Google` (Vertex, nul-bewaring); geen enkele naar `Google AI Studio`. Elke aanroep droeg `provider {zdr: true, data_collection: "deny"}`.
- VERIFIED kosten: $0,2477 voor 20 etiketten = $0,0124 per etiket (spike: $0,0123 / $0,0115).
- VERIFIED tijd per etiket (Gemini + lokale SigLIP, meerdere threads): mediaan 6,0 s, p90 9,2 s, max 10,7 s (spike K4-aa: mediaan 8,0 / 7,4 s).

## Geheugen

| moment | RSS (MB, één proces, lokaal) |
|---|---:|
| start | 97 |
| na B0 (EfficientNet) | 343 |
| na laden SigLIP-beeldtoren | 519 |
| na één scan met 64 uitsneden | 1152 (piek 1174) |

- VERIFIED lokaal: SigLIP kost per werker ±0,8 GB extra na het eerste gebruik (laden +176 MB, rekenen +633 MB).
- VERIFIED ACC (31-10 09:44 UTC, `docker stats` en `docker top`, alleen gelezen): ml-service gebruikt nu al 6,57 GiB van 8 GiB, met 3 werkerprocessen van 1,52 / 2,70 / 2,29 GB (image b6a0857, draait sinds 13-10).
- INFERENCE: met de route aan komt daar per werker ±0,8 GB bij → ±9 GB voor 3 werkers, boven de grens van 8 GB. De lokale norm (4 × 1152 MB = 4,5 GB ≤ 7 GB) is op papier gehaald, maar onderschat ACC, waar werkers in de loop van de tijd tot 2,7 GB groeien. Besluit Friso 31-10: limiet op ACC naar 12G (`docker-compose.acc.yml`; host 30 GB, 11 GB vrij volgens `free -g` van Friso); de route blijft standaard `legacy` en gaat alleen aan tijdens proeven. Met de standaardstand `legacy` laadt SigLIP nooit en verandert het geheugen niet.
