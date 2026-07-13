# Story 12.11 (SPIKE) — resultaten: synthetische NutriScore-herkenning per letter

Datum: 2026-07-13 · **read-only / offline** — geen ACC-schrijf, geen registratie, geen model-training (efficientnet_b0 frozen). Gedraaid via `docker exec` in de gedeployde ml-container (base-image-tag `81c1012`); alleen bestaande code (`compose_synthetic`, Story 8.7). DB/MinIO read-only.

## Verdict: **NO-GO**

De vooraf gepinde drempel (**GO** = top-1-per-letter op A/B/E ≥ ~0,8 én diagonale verwarrings-matrix, bij een haalbaar N) wordt bij lange na niet gehaald. Synthetische `compose_synthetic`-referenties herkennen de echte Nutri-Score-crops **niet** per letter en discrimineren **niet** op kleur/vorm — vrijwel alle echte crops matchen naar synthetische-**C**, met **negatieve** cosine-marges.

---

## Meetopzet

- **Grondwaarheid (read-only):** echte crops A=8, B=3, E=7 (active `reference_logos`, `source ∈ review-confirmed/realref-live-poc/flywheel-promotion`). C/D niet als grondwaarheid (C=0, D=1-verdacht).
- **Zaden:** 5 synthetische Nutri-Score-zaden (`source=synthetic-nutriscore-bootstrap`, één per letter A–E) als basis-graphic.
- **Achtergronden:** 40 echte artwork-pagina's uit MinIO `artwork/…` (deterministisch, short side → 512px).
- **Synthese:** per letter A–E 30 geaugmenteerde crops via `compose_synthetic(background, reference=zaad_letter, seed=…)` met de BESTAANDE params (scale 0,30–1,00 · rotatie ±10° · HSV-jitter ±10% · blur 0–1,5px); de bbox-crop van de composite ge-embed.
- **Embedding:** `model_manager.generate_embedding` (efficientnet_b0, 512-dim, frozen).
- **Leave-real-out:** referentiepool = UITSLUITEND de synthetische refs (alle 5 letters); geen echte crop in de pool. Elke echte A/B/E-crop gerankt op nearest-reference cosine → top-1 = letter van de best-matchende synthetische ref. Sweep N ∈ {3, 10, 30}.

---

## Resultaten — top-1-per-letter (A/B/E)

| N per letter | A (n=8) | B (n=3) | E (n=7) | drempel |
|-------------:|:-------:|:-------:|:-------:|:-------:|
| 3 | 0% | 0% | 0% | ≥80% |
| 10 | 0% | 0% | 0% | ≥80% |
| 30 | 0% | 33% | 0% | ≥80% |

**Geen enkele N haalt de drempel.** A en E blijven 0%; B haalt hooguit 1/3 bij N=30 (ruis, geen signaal).

## Verwarrings-matrix (N=30) — echte letter (rij) × voorspelde synthetische letter (kolom)

| echt ↓ / voorspeld → | A | B | C | D | E |
|----------------------|:-:|:-:|:-:|:-:|:-:|
| **A** (8) | 0 | 0 | **8** | 0 | 0 |
| **B** (3) | 0 | 1 | **2** | 0 | 0 |
| **E** (7) | 0 | 1 | **6** | 0 | 0 |

De matrix is **niet diagonaal** maar **collabeert naar kolom C**: echte crops van álle letters matchen bij voorkeur de synthetische-C-refs. Dit patroon herhaalt zich bij N=3 en N=10 (respectievelijk 13/14 en 17/18 van alle echte crops → C).

## Cosine-marge (echte crop: eigen-letter-synth vs beste-andere-letter, mediaan)

| N | A | B | E |
|---|:-:|:-:|:-:|
| 3 | −0,043 | −0,025 | −0,081 |
| 10 | −0,104 | −0,029 | −0,035 |
| 30 | −0,072 | −0,007 | −0,042 |

**Alle marges negatief:** een echte crop ligt cosine-dichter bij een synthetische ref van een ANDERE letter dan bij zijn eigen letter. Er is dus geen per-letter-signaal om op te ranken.

---

## Diagnose (waarom NO-GO)

1. **Synthetisch→echt domeinkloof.** De `compose_synthetic`-composities (gids-achtig zaad op artwork-achtergrond) embedden naar een ander gebied dan de echte gefotografeerde crops. Dit spiegelt de 12.3/19.7-bevinding exact: het GIDS-/synthetische referentiebeeld heeft een domeinkloof; alleen ECHTE crops clusteren strak en matchen (conditie C haalt op A/B/E ~100% mét échte refs). Augmenteren van het zaad overbrugt die kloof niet.
2. **Bijna-degeneratie + collaps naar C.** De synthetische embeddings over de 5 letters liggen te dicht op elkaar (vorm + achtergrond domineren; de letter/kleur-nuance verdwijnt in de frozen embedding). C is willekeurig de nearest-cluster → alles matcht C.
3. **De augmentatie-engine werkt hier tégen.** De HSV-jitter (±10% op hue; hue wrapt op 180 in OpenCV) perturbeert juist het KLEURsignaal dat Nutri-Score-letters onderscheidt (A donkergroen → E rood is primair een hue-sweep). De engine is ontworpen voor VORM-gebaseerde keurmerkdetectie waar kleur-invariantie helpt — precies verkeerd voor een kleur-primaire taak.

---

## Alternatief (i.p.v. de synthetische route)

- **Bewezen route = ECHTE crops, niet synthese.** A/B/E werken al (~100% met échte refs, 19.9). C/D moeten dus met ECHTE Nutri-Score-C/D-productartwork gevuld worden. Omdat producten letterloos `GENERAL_FOODS` declareren (0 per-letter-declaratiebron, zie de investigation), is de kleinste route een **gerichte/handmatige bronronde**: bekende C- en D-producten opzoeken, hun artwork oogsten, en de crop door een mens per letter bevestigen — daarna draait conditie C zoals bij A/B/E.
- **Optioneel, groter, onbewezen:** een dedicated **kleur-bewuste classifier** (niet de frozen efficientnet) voor de 5 letters. Alleen overwegen als de handmatige bronronde onvoldoende C/D-artwork oplevert.
- **Niet aanbevolen:** de synthetische route "repareren" (HSV-jitter uit, tighter crop, witte achtergrond). De negatieve marges wijzen op een diepere frozen-embedding-domeinkloof, niet enkel een kleur-jitter-artefact — dit is speculatief en geen GO-pad.

---

## Build-blauwdruk

**N.v.t. — NO-GO.** Er komt geen synthetische-refs-BUILD-story. In plaats daarvan: een aparte story voor een **gerichte C/D-bronronde** (echte artwork sourcen + menselijke per-letter-bevestiging), als vervolg op de labelverdict-schoonmaak (12.9).

---

*Read-only, geen registratie, geen training. Grondwaarheid A8/B3/E7 (0 embed-fails), 40 achtergronden, 5 zaden, 30 synth/letter. Image-tag `81c1012`.*
