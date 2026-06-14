# Case File — Review-queue: "geen enkel correct voorstel"

## Hand-off Brief (15-sec read)

De review-queue die de gebruiker beoordeelt is **niet** de live-detectie, maar de bevroren **Story-12.6
acceptatie-kandidaat-dataset**, op **2026-06-10** geassembleerd met de klassieke (rommel-)proposer +
de zwakke guide-only-referenties van toen + een bewust lage recall-floor (0,45). Geen van de latere
live-pijplijn-verbeteringen (real-crop-refs 12-06, drempel 0,80, keurmerk-gate 14-06) regenereert of
raakt deze statische dataset — daarom veranderde de queue niet. **Fix = de kandidaten her-assembleren
met de gate + huidige refs + hogere floor (of de getrainde detector).**

## Case Info
- Slug: queue-geen-correcte-voorstellen · Datum: 2026-06-14 · Status: Concluded · Confidence: **High**
- Symptoom (verbatim): "Er klopt weer helemaal niks van, Ik zie geen enkel correct voorstel."

## Problem Statement
Na meerdere sessie-interventies (referentie-fixes, gate) ziet de gebruiker nog steeds geen enkel correct
voorstel in `https://logo-detection.acc.xxtract.com/artwork-review`.

## Evidence Inventory
- **Confirmed** `artwork_review_items` open-reasons: "12.6 acceptatie-kandidaat/halal/free-from (assembler)"
  (DB-query) → de items komen van een 12.6-assembler, niet de crosscheck.
- **Confirmed** `apps/ml-service/scripts/assemble_acceptance_candidates.py:70,76,13` — gebruikt
  `propose_regions` (klassieke proposer), `find_similar_references(threshold=floor)`, floor default 0,45,
  docstring: "Deliberately HIGH-RECALL / low-precision (floor 0.45): the human rejects false positives".
- **Confirmed** `apps/api/scripts/populate-review-queue-12-6.js:5,18` — leest de assembler-output (top-25/code)
  en inserteert review-items met marker "12.6 acceptatie-kandidaat (assembler)", status 'open'.
- **Confirmed** timing: assembler-items `created_at` = 2026-06-10 12:40 / 15:25 / 15:51 (DB). Real-crop-refs
  gedeployed 12-06; keurmerk-gate 14-06 → **de dataset predateert alle fixes**.
- **Confirmed** (visuele steekproef, 13/14-06): kandidaat-crops zijn niet-keurmerk-regio's (voedingstabel,
  "GmbH"-tekst, kookpan-pictogram, merklogo FARM FRITES, award-medailles) gelabeld met willekeurige codes.

## Hypotheses
1. ~~Embedding/referenties zijn de fout~~ — **Refuted.** Live-sanity (RECYCLABLE→RECYCLABLE @1.0) bewijst
   embedding+refs werken; de queue gebruikt ze niet (statisch).
2. ~~Localisatie-bottleneck fixt de queue~~ — **Refuted voor de queue.** De localisatie-fix (gate) raakt de
   live-pijplijn; de queue is een bevroren 12.6-dataset.
3. **De queue is de bevroren 12.6-assembler-dataset, niet de live-detectie** — **Confirmed** (reasons +
   timing + scripts). Dit verklaart waarom élke fix de queue ongemoeid liet.

## Deduced Conclusions
- Alle sessie-interventies richtten zich op de **live-pijplijn**; de gebruiker beoordeelt een **statische
  June-10-dataset**. Disconnect tussen wat gefixt is en wat de gebruiker ziet.
- De kandidaat-kwaliteit is slecht omdat de assembler draaide met (a) de klassieke rommel-proposer,
  (b) zwakke guide-only-refs (June-10-embedding herkende keurmerken nauwelijks), (c) bewust lage floor 0,45.
- Bij-ontwerp bevat de dataset veel false positives (label-taak: afwijzen). "Geen enkel correct" duidt erop
  dat de selectie met het zwakke systeem grotendeels rommel opleverde.

## Source Code Trace
- Generator: `apps/ml-service/scripts/assemble_acceptance_candidates.py` (propose_regions + nearest-ref ≥ 0,45 ∈ top-N).
- Loader: `apps/api/scripts/populate-review-queue-12-6.js` (insert als open review-items, marker 12.6).
- Live-pijplijn (ongerelateerd aan de queue): `apps/ml-service/app/services/classification.py` (+ nieuwe
  `keurmerk_gate.py`), `crosscheck`, `find_similar_references`.

## Final Conclusion (Confidence: High)
De queue is een **bevroren 12.6-acceptatie-kandidaat-dataset (2026-06-10)**, geen live-detectie. Hij is
geassembleerd met de klassieke proposer + zwakke guide-refs + lage floor 0,45, bewust high-recall. De
sessie-fixes (refs, gate, drempel) raken alleen de live-pijplijn → de queue veranderde niet. Dat is de
volledige verklaring voor "geen enkel correct voorstel ondanks alle fixes".

## Fix Direction
1. **Her-assembleer de kandidaten** met het verbeterde systeem: keurmerk-gate vóór de nearest-ref-stap,
   huidige referenties, en een **hogere floor** (bv. 0,7–0,8 i.p.v. 0,45). Dan: `populate-review-queue-12-6.js`
   opnieuw (idempotent — ruimt z'n eigen 12.6-items op). Levert een schonere label-queue.
2. **Structureel** (de echte fix): de getrainde keurmerk-detector (Story 12.4) vervangt de rommel-proposer;
   her-assembleer daarna.
3. **Verwachtingsmanagement**: de 12.6-queue is per ontwerp een *label-taak* (accepteer echte, wijs valse af),
   niet een set zekere voorspellingen — maar bij de huidige kwaliteit is her-assemblage nodig.

## Reproduction
DB: `SELECT reason, created_at FROM artwork_review_items WHERE reason LIKE '12.6%(assembler)'` → June-10 marker.
Code: `assemble_acceptance_candidates.py` (floor 0,45, propose_regions) + `populate-review-queue-12-6.js`.
