# Story 12.11 (SPIKE): Dedicated NutriScore-herkenning via synthetische augmentatie

Status: done

<!-- SPIKE UITGEVOERD 2026-07-13 (read-only/offline, image 81c1012). VERDICT: NO-GO. Synthetische augmentatie werkt NIET voor NutriScore: top-1-per-letter A/B/E = 0% (N=3/10/30), verwarrings-matrix collabeert naar C, negatieve cosine-marges. Twee oorzaken: (1) synthetisch→echt domeinkloof (zoals 12.3/19.7 — alleen ECHTE crops clusteren); (2) de HSV-jitter in compose_synthetic is kleur-invariant (voor vorm-detectie) en vernietigt juist het A→E-kleursignaal. Conclusie: C/D NIET synthetisch vulbaar. Enige realistische pad = gerichte/handmatige ECHTE C/D-productartwork sourcen + menselijke per-letter-bevestiging. Zie 12-11-spike-resultaten.md. GEEN build-blauwdruk (NO-GO) → aparte beslissing Friso. -->


<!-- SPIKE (validatie vóór build, mirror 19.7/12.2/12.4). Valideert of compose_synthetic-referenties de 5 Nutri-Score-letters per-letter herkennen — de fundering om de lege C en dunne D te vullen zonder productartwork. GEEN productie-wijziging, GEEN ACC-schrijf. -->

## Story

Als **datamanager van het keurmerk-vliegwiel**
wil ik **valideren of we met de bestaande synthese-engine (`compose_synthetic`) geaugmenteerde synthetische referenties per Nutri-Score-letter kunnen maken die de 5 letters betrouwbaar per-letter herkennen**
zodat **we weten of we NutriScore C (0 crops) en D (1 crop) — die niet via het declaratie-vliegwiel te vullen zijn — met een dedicated synthetische aanpak kunnen afmaken, vóór we die build committen** (FR-22; besluit Friso 2026-07-12).

### Afbakening (kritiek)
- **DIT IS EEN SPIKE:** alleen meten/valideren + een go/no-go + een build-blauwdruk. **GEEN productie-wijziging, GEEN ACC-schrijf, GEEN nieuwe referenties registreren, GEEN model-training** (efficientnet_b0 blijft frozen — 19.7 bewees dat het knelpunt de referentie is, niet de embedding). Read-only/offline in een wegwerp-ml-container (patroon van de 19.7/12.3-spikes).
- **Waarom nodig:** NutriScore is niet klaar. Ná de 12.9-opschoning: genuine echte crops **A=8, B=3, C=0, D=1, E=7** → A/B/E herkenning-klaar (≥ k=3), C leeg, D onder de drempel. C/D kunnen NIET via het vliegwiel gevuld worden: producten declareren letterloos `GENERAL_FOODS` (0 `NUTRISCORE_*`-sleutels in de MinIO-index, geen artwork-bron per letter — zie `investigations/nutriscore-letterloze-declaratie-en-labelintegriteit-investigation.md`). Daarom de dedicated aanpak.
- **Bewezen kansrijk:** Nutri-Score is een VASTE vorm met vaste kleuren (A donkergroen … E rood). Een synthetische opbouw (het logo per letter, geaugmenteerd) is technisch veel kansrijker dan declaratie-gedreven harvest.
- **Elke ACC-read met toestemming per geval** (de echte crops ophalen als grondwaarheid is read-only).

## Spike-vraag (meetbaar te beantwoorden)
Produceren met `compose_synthetic` geaugmenteerde synthetische referenties per Nutri-Score-letter embeddings die:
1. **(a) de ECHTE crops van die letter herkennen** — een echte A-crop matcht hoog (top-1) tegen de synthetische-A-referenties; én
2. **(b) de 5 letters ONDERLING onderscheiden** — een echte A-crop matcht synthetische-A, NIET synthetische-E (de kleur/vorm discrimineert)?

## Validatie-opzet (kritiek — C/D hebben geen grondwaarheid)
- **Meet op de letters MET echte crops (A/B/E):** genereer N synthetische referenties per letter uit het bestaande zaad (via `compose_synthetic` op echte artwork-achtergronden, met de bestaande augmentatie-parameters: rotatie/schaal/HSV-jitter). De synthetische refs zijn de ENIGE referentiepool (geen echte crops in de pool — "leave-real-out"). Toets of de echte A/B/E-crops top-1 hun eigen letter matchen tegen die synthetische pool (nearest-reference cosine, zelfde mechanisme als conditie C / `find_similar_references`).
- **Generaliseer-argument:** werkt synthetisch→echt voor A/B/E, dan geldt hetzelfde voor C/D (identieke vaste vorm) → we kunnen C/D synthetisch vullen. Werkt het NIET, dan is de dedicated-synthetische route ongeschikt en heroverwegen we (dedicated classifier / handmatige bronronde).
- **Sweep:** meet hoeveel synthetische augmentaties per letter nodig zijn voor robuuste top-1 (bv. 3 / 10 / 30), en of de kleur discrimineert (verwarrings-matrix over A–E).

## Acceptatiecriteria (spike)
1. **Given** N synthetische referenties per letter (via `compose_synthetic` uit de 5 zaden)
   **When** de echte A/B/E-crops leave-real-out tegen die synthetische pool gerankt worden
   **Then** is er een meetbare top-1-per-letter-accuratesse per N, en een verwarrings-matrix over A–E — meetbaar vastgelegd.

2. **Given** de meting
   **When** de spike-vraag beoordeeld wordt
   **Then** ligt er een expliciet **GO/NO-GO**: GO als synthetisch→echt op A/B/E een robuuste per-letter-top-1 haalt (drempel vooraf te pinnen, bv. ≥ ~0,8 top-1 én diagonale verwarrings-matrix) met een haalbaar aantal augmentaties; anders NO-GO met de reden en het alternatief.

3. **Given** een GO
   **When** de spike afsluit
   **Then** levert hij een **build-blauwdruk**: hoeveel synthetische refs per letter, welke augmentatie-parameters, hoe C/D gevuld worden (synthetische refs registreren als actieve referenties), en hoe de herkenning per letter aangetoond wordt — als input voor een aparte BUILD-story.

4. **Given** de spike-aard
   **When** hij draait
   **Then** is er GEEN ACC-schrijf, GEEN registratie, GEEN training — puur meten (read-only/offline). Vastgelegd in het rapport.

## Tasks / Subtasks
- [ ] 1. **Grondwaarheid + zaden ophalen (AC: 1, met toestemming, read-only)** — de echte A/B/E-crops (na 12.9: A8/B3/E7) + de 5 synthetische zaden (`source=synthetic-nutriscore-bootstrap`) + een set echte artwork-achtergronden ophalen uit MinIO. Read-only.
- [ ] 2. **Synthetische refs genereren (AC: 1)** — via `compose_synthetic(background, reference=zaad_letter, seed=...)` N geaugmenteerde crops per letter samenstellen (sweep N ∈ {3,10,30}). Embed ze (`model_manager.generate_embedding`).
- [ ] 3. **Leave-real-out meting (AC: 1, 2)** — rank elke echte A/B/E-crop tegen de synthetische pool (nearest-reference cosine); meet top-1-per-letter per N + de A–E-verwarrings-matrix. GEEN echte crop in de referentiepool.
- [ ] 4. **GO/NO-GO + blauwdruk (AC: 2, 3)** — beoordeel tegen de vooraf gepinde drempel; schrijf het go/no-go + (bij GO) de build-blauwdruk (refs-per-letter, augmentatie-params, C/D-vulplan, herkennings-aantoonplan).
- [ ] 5. **Rapport (AC: 1-4)** — meetrapport `12-11-spike-resultaten.md`: opzet, per-N top-1-tabel, verwarrings-matrix, go/no-go, blauwdruk, en "read-only/geen registratie/geen training".

## Dev Notes — Developer Context
### Bouwstenen (bestaand — hergebruiken, niet dupliceren)
- `apps/ml-service/app/services/synthesis.py` — `compose_synthetic(background, reference, seed=...)`: compositeert een referentie-mark met willekeurige rotatie (`_rotate_rgba`), schaal (`_SCALE_MIN=0.30`/`_SCALE_MAX=1.00`), HSV-jitter (`_apply_hsv_jitter`) op een echte artwork-achtergrond, deterministisch per `seed`. Retourneert het beeld + een bbox. Story 8.7. Dit IS de augmentatie-engine.
- De 5 synthetische Nutri-Score-zaden (één per letter, `source=synthetic-nutriscore-bootstrap`) als basis-graphic — al in `reference_logos`/MinIO (zichtbaar in de 12.9-galerij als A8/B5/C3/D3/E3-zaad).
- Embedding + nearest-reference: `app.ml.model_manager.generate_embedding` (efficientnet_b0, 512-dim, frozen) + de cosine-ranking zoals `bootstrap_search.py`/`find_similar_references` (conditie C, 19.9). Hergebruik het spike-patroon van `19-7-spike-resultaten.md` (leave-one-out top-1) en de eval-scripts (`spike_iter2_*`, `apps/ml-service/scripts/`).

### Wat behouden moet blijven / niet doen
- GEEN model-training (frozen embedding, bewezen in 19.7). GEEN ACC-schrijf/registratie. GEEN wijziging aan conditie C, gate, harvest, `field_type`. Puur een offline meting.

### Waarom dit de juiste eerste stap is
Spike-before-build is de bewezen projectnorm (19.7 bewees 44%→100% vóór 19.9 het bouwde; 12.2/12.4 spikes). Deze spike de-riskt de dedicated-synthetische route goedkoop: als synthetisch→echt op A/B/E werkt (waar we grondwaarheid hebben), kunnen we C/D vullen; zo niet, dan besparen we een verkeerde build.

### References
- [Source: investigations/nutriscore-letterloze-declaratie-en-labelintegriteit-investigation.md] — waarom C/D niet via het vliegwiel gaan + de dedicated-beslissing.
- [Source: nutriscore-labelverdict-friso-2026-07-12.md] — de opgeschoonde per-letter-stand (A8/B3/C0/D1/E7).
- [Source: apps/ml-service/app/services/synthesis.py] — `compose_synthetic` (de augmentatie-engine).
- [Source: 19-7-spike-resultaten.md] — het leave-one-out-spike-patroon (top-1-meting, frozen embedding).
- [Source: apps/ml-service/app/services/bootstrap_search.py] — nearest-reference/conditie C (het herkenningsmechanisme).
- Geheugen: `project_flywheel_resume`, `project_123_realref_pivot`, `project_keurmerk_dekking_strategie`.

### Project Structure Notes
- Spike-scripts in `apps/ml-service/scripts/` (naast de bestaande `spike_iter2_*`). Draai in een wegwerp-ghcr-ml-container. Geen productie-code, geen migratie, geen registratie.

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List

## Change Log
- 2026-07-13: aangemaakt via bmad-create-story. SPIKE (dedicated-beslissing Friso 2026-07-12) om te valideren of `compose_synthetic`-referenties de 5 Nutri-Score-letters per-letter herkennen (leave-real-out op A/B/E), als fundering om C/D synthetisch te vullen. Read-only/offline, geen registratie/training. Uitkomst = go/no-go + build-blauwdruk voor een aparte BUILD-story.
