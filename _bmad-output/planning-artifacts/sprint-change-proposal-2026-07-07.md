# Sprint Change Proposal — Twee-traps-bootstrap (flywheel-effectiviteit)

Datum: 2026-07-07 · Epic 19 · Scope: Moderate (backlog-uitbreiding, geen PRD/architectuur-herziening)

## 1. Issue Summary

De end-to-end-belofte van het vliegwiel (lege keurmerkklassen zelf vullen met echte referentie-crops) wordt geblokkeerd door een **drie-kleps-keten**, deze sessie volledig op ACC in kaart gebracht:

1. **Declaratie-guard** (Story 19.5) — GEFIXT + live (5/5-velden).
2. **ml-search-drempel + search-gate** (Story 19.6) — GEFIXT + live. Meetbaar effect: crops worden nu GEVONDEN (sampler-run **0 → 6 crops** bereikten de nominatie).
3. **Promotie-drempel 0,90** (`nomination.ts:136-138`) — de 6 bootstrap-crops matchen tegen het GIDS-logo op cosine 0,60–0,74 en halen de 0,90 nooit → `skipped: onder-drempel` → **0 end-to-end nominaties** (0 vervuiling).

De eerste twee kleppen zijn opgelost; de derde blokkeert nu. Drempel-tuning lost klep 3 niet op (bootstrap-crops matchen inherent lager tegen een gids-logo). De structurele oplossing is de **twee-traps-bootstrap**, deze sessie bewezen (spike 19.7, VERDICT GO).

## 2. Impact Analysis

- **Epic Impact:** Epic 19 (in-progress) krijgt 3 nieuwe stories. Geen andere epics geraakt.
- **PRD:** GEEN wijziging — FR-22/FR-12 dekken de intentie al ("het vliegwiel produceert referenties"). Dit is een *hoe*-verfijning.
- **Architectuur:** GEEN spine-wijziging — de aanpak hergebruikt bestaande infra: het `review`-nominatiepad (`NominationOrigin = 'review'`), `reference_embeddings`/rebuild, en `queue_harvest`.
- **Bewijs dat de aanpak werkt + past:**
  - Spike 19.7 (GO): nearest-reference-**ranking** met echte crops = **44% → 100%** recall (leave-one-GTIN-out; GREEN_DOT 36→100, EU_ORGANIC 0→100), geen training. Rapport `19-7-spike-resultaten.md`.
  - Onderzoek `research/technical-flywheel-bootstrap-recall-research-2026-07-06.md`: twee-traps aanbevolen; off-the-shelf backbone-swap (DINOv2/CLIP) + detector-training bewezen doodlopend.
  - **Sleutelvondst** (`nomination.ts:129-140`): herkomst **`review` OMZEILT de 0,90-promotie-drempel** (menselijke bevestiging = de dubbele check). Dus fase 1 = bootstrap-crops via het BESTAANDE review-pad routen. **Geen nieuwe review-infra nodig.**

## 3. Recommended Approach

**Direct Adjustment** — voeg 3 stories toe aan Epic 19. Geen rollback, geen scope-reductie. Effort: klein→midden per story; risico laag (vangnet ongewijzigd, alles omkeerbaar/gescoped). De stories zijn sequentieel: 19.8 ontstopt het straaltje end-to-end; 19.9 maakt de volle kraan; 19.10 voedt en begrenst.

## 4. Detailed Change Proposals

### Nieuwe stories (Epic 19)

**Story 19.8 — Fase 1: bootstrap-crops uit lege klassen naar de review-wachtrij (herkomst `review`)**
- *Kern:* voor een klasse met < k=3 bevestigde echte referenties: nomineer de gevonden bootstrap-crops met herkomst **`review`** (omzeilt de 0,90-promotie-drempel) i.p.v. herkomst `bootstrap` (auto-promotie). Lage bar; de mens bevestigt ECHT/VALS in de bestaande review-wachtrij.
- *Waarom eerst:* dit ontstopt het straaltje **end-to-end** — de 6 crops die nu wegvallen zouden naar review gaan → eerste echte crops. Kleinste, hoogste-waarde-story.
- *Vangnet ongewijzigd:* guard (19.5), gold-set, dedup, class-cap. Hard-negative-blokkade (AD-12) blijft.
- *Betrokken:* `apps/api/src/services/flywheel/nomination.ts` + de sampler/bootstrap-herkomst-keuze; config voor de k-drempel.

**Story 19.9 — Fase 2: nearest-reference-ranking zodra een klasse ≥ k echte refs heeft**
- *Kern:* schakelmoment per klasse — bij ≥ k=3 bevestigde echte refs → match via **nearest-reference-ranking** (conditie C: echte crops + gids-fallback) i.p.v. de absolute cosine-drempel. Dit is de bewezen "volle kraan" (100%).
- *Betrokken:* `apps/ml-service/app/services/bootstrap_search.py` (ranking-pad) + `reference_embeddings`-gebruik; het schakelpunt in het api-nominatie-/zoekpad.
- *Meet-acceptatie:* recall per klasse aantoonbaar omhoog t.o.v. gids-only (spiegel de 19.7-meting), precisie tegen gold-set.

**Story 19.10 — Harvest-koppeling + scope-begrenzing**
- *Kern:* `queue_harvest` als doorlopende echte-crop-bron die klassen over de k-drempel tilt (voedt 19.9). Scope-begrenzing: top-N volume-keurmerken eerst; RECYCLABLE/TRIMAN apart valideren (0 echte crops in de gold_set, flood-gevoelig — universe-probe variant-family-plafond).
- *Betrokken:* `apps/ml-service/app/services/queue_harvest.py` + de klasse-selectie.

### Bestaande artefacten — status-correcties (geen inhoudelijke wijziging)
- Sprint-status 19.6: "NOG NIET gedeployed" → gedeployed (commit ecf7fad) + live-geverifieerd (0→6 crops gevonden; klep 3 blootgelegd).

## 5. Implementation Handoff

- **Scope:** Moderate (backlog-uitbreiding). Route: elke story via de normale dev-cyclus (`create-story` → ATDD → adversarial review → dev-story → code-review), sequentieel 19.8 → 19.9 → 19.10.
- **Succescriterium 19.8:** een bootstrap-crop uit een lege klasse belandt aantoonbaar in de review-wachtrij (i.p.v. `skipped: onder-drempel`); 0 vervuiling; vangnet intact.
- **Randvoorwaarden:** geen zware GPU-training; guard/gold-set/dedup/cap als vangnet; elke ACC-schrijf/deploy met toestemming; container zelfstandig herstartbaar.
- **NIET-in-scope (aparte sporen):** onnxruntime-mock-detector (gepeild LAAG — cleanup); open-vocab-detector Grounded SAM 2 (latere localisatie-verbetering).

## Alternatief overwogen
Een nieuw **Epic 20** i.p.v. uitbreiding van Epic 19 — verworpen voor nu: dezelfde doelstelling (het vliegwiel produceert bruikbare brandstof), Epic 19 is al in-progress met de hele keten. Optie blijft open als de lijn verder groeit.
