# Story 19.9 — AC5 / Task 6: eval-reproductie (leave-one-GTIN-out nearest-reference)

Datum: 2026-07-12 · **read-only op ACC** (geen enkele write/mutatie) · Gemeten tegen ml-container image `ghcr.io/xxtract-development/logo-recognition-ml:7b9e2a7...` = huidige `acc` HEAD `7b9e2a7`.

**Verdict AC5: GEHAALD.** Micro top-1 **61% → 99%** (52/85 → 84/85). Alle klassen met ≥ k=3 echte crops én meer dan één query-crop springen naar **100%**. Geen guard-/precisie-regressie: geen enkele klasse zakt van conditie A naar C, en de flood-klasse RECYCLABLE trekt **0** query's van andere klassen naar zich toe.

---

## Meetopzet

Reproductie van de 19.7-spike-meting, nu met de PRODUCTIE-referentiebibliotheek (`reference_logos` + `reference_embeddings`) i.p.v. de gold-crops-als-referentie.

- **Query-set** = gold_set ECHT-crops op crop-niveau: `gold_set_records` met `label='ECHT'`, `crop_path IS NOT NULL`, actief (`replaced_by_id IS NULL`). **85 crops / 9 klassen.** Read-only uit MinIO gehaald en ge-embed via de productie-pad `model_manager.generate_embedding` (efficientnet_b0 ImageNet, 512-dim, geen training).
- **Conditie A (baseline, oud gedrag)** = rangschik elke query-crop tegen ALLEEN de gids-referenties (`source` ILIKE guide/wikimedia; 33 embeddings). Top-1 = klasse van de nearest gids-referentie.
- **Conditie C (19.9, nearest-reference)** = rangschik tegen gids + de ECHTE crop-referenties (`source` ≠ guide/wikimedia: `review-confirmed` / `realref-live-poc` / `synthetic-*`; 208 embeddings), **leave-one-GTIN-out**: echte referenties met dezelfde GTIN als de query-crop worden uit de pool verwijderd (blokkeert triviale self-/near-dup-match op hetzelfde artwork). De opgeslagen `reference_embeddings` zijn door hetzelfde productie-pad gegenereerd, dus dezelfde vectorruimte als de query-embeddings.
- **Top-1** = of de nearest-reference-klasse (hoogste cosine over de pool) gelijk is aan de echte klasse van de query-crop. Zuivere ranking-meting (geen drempel), conform de spike.

Reproductie-probe (read-only): `scratchpad/eval99.py` → `docker exec -w /app -e PYTHONPATH=/app <ml> python /tmp/eval99.py`. Geen writes; `psycopg2` met `set_session(readonly=True)`; MinIO alleen `get_training_image` (download).

---

## Per-klasse top-1 (A vs C)

| Klasse | n query | A: gids-only | C: nearest-ref | #echte refs | #ref-GTINs |
|--------|--------:|-------------:|---------------:|------------:|-----------:|
| GREEN_DOT | 42 | 21 (50%) | **42 (100%)** | 16 | 15 |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 17 | 10 (59%) | **17 (100%)** | 7 | 6 |
| EUROPEAN_V_LABEL_VEGAN | 13 | 13 (100%) | **13 (100%)** | 12 | 11 |
| RAINFOREST_ALLIANCE_PEOPLE_NATURE | 5 | 3 (60%) | **5 (100%)** | 26 | 24 |
| EU_ORGANIC_FARMING | 3 | 3 (100%) | **3 (100%)** | 10 | 10 |
| RECYCLABLE_GENERAL_CLAIM | 2 | 0 (0%) | **2 (100%)** | 26 | 3 |
| PREGNANCY_WARNING | 1 | 0 (0%) | 0 (0%) | 4 | 4 |
| SEPARATE_COLLECTION | 1 | 1 (100%) | 1 (100%) | 0 | 0 |
| TRIMAN | 1 | 1 (100%) | 1 (100%) | 6 | 6 |
| **MICRO** | **85** | **52 (61,2%)** | **84 (98,8%)** | | |

**Patroon reproduceert de 19.7-spike:** conditie C tilt elke klasse met voldoende echte crops naar 100% (GREEN_DOT 50%→100%, FSC_MIX 59%→100%, RAINFOREST 60%→100%, RECYCLABLE 0%→100%). Klassen die in A al hoog stonden (V-Label, EU-organic) blijven op 100%. De absolute A-baseline ligt hier hoger dan de spike (61% i.p.v. 44%) doordat de gids-pool kleiner is (33 vs 43 klassen = minder afleiders) én de gold-set sinds de spike is gegroeid; de RICHTING (A matig → C ~100%) is identiek.

---

## RECYCLABLE-validatie (expliciete story-waarschuwing)

De story waarschuwt dat RECYCLABLE 26 actieve `realref-live-poc`-refs heeft waarvan **22 near-dups uit één GTIN** (bevestigd: 26 refs verdeeld over slechts **3 GTINs**), wat de nearest-reference-drempel kan vertekenen.

Bevindingen:
- **Eigen recall:** de 2 gold ECHT-query-crops van RECYCLABLE matchen in conditie C **100%** (2/2), terwijl A 0% scoorde (geen gids-match). De echte crops clusteren dus strak genoeg.
- **Geen magneet-effect:** `guard_recyclable_false_pull = 0` — ondanks dat RECYCLABLE de grootste referentiepool heeft (26), wordt **géén** query-crop van een andere klasse naar RECYCLABLE getrokken. De near-dup-concentratie veroorzaakt geen precisie-regressie in deze top-1-meting.
- **Eerlijke kanttekening:** RECYCLABLE heeft maar 2 gold-query-crops en zijn refs bestrijken slechts 3 GTINs, dus de leave-one-GTIN-out-fairness is voor deze klasse dunner dan voor bv. GREEN_DOT (15 GTINs). De 100% is bemoedigend maar op een kleine steekproef; blijf deze klasse monitoren zodra er meer diverse crops binnenkomen.

---

## Guard-/regressie-check

- **Geen enkele klasse regresseert** van conditie A naar C (elke C-score ≥ A-score).
- **Eén C-misser totaal:** `PREGNANCY_WARNING → TRIMAN` (1 crop). PREGNANCY_WARNING heeft géén gids-referentie (A was ook al 0%) en slechts **1** gold-query-crop; met leave-one-GTIN-out matcht die ene crop tegen 3 overgebleven refs naar een visueel verwant rond pictogram (TRIMAN). n=1 is niet statistisch betekenisvol en het is geen flood/precisie-lek — het trekt naar één andere pictogram-klasse, niet naar de flood-klasse.
- **Geen kruis-flooding:** de verkeerde match landt niet op een generieke/flood-klasse; RECYCLABLE-false-pull = 0.

De 5 kleppen (declaratie-guard 19.5, gold-set-regressie, dedup, class-cap, hard-negative) en NFR-6 vallen buiten deze eval — deze meting toetst uitsluitend de ranking-/discriminatie-as (AC5), zoals de spike. De guard-precisie in productie wordt bovendien beschermd doordat de 19.5-guard alleen declarerende producten doorzoekt.

---

## AC5-verdict: **GEHAALD**

1. ✅ Conditie C reproduceert de spike-verbetering: micro top-1 **61% → 99%**; alle klassen met ≥ k=3 echte crops én n>1 query-crops → **100%** (GREEN_DOT, FSC_MIX, V-Label, RAINFOREST, EU-organic, RECYCLABLE).
2. ✅ Geen guard-/gold-set-regressie: geen klasse zakt A→C; RECYCLABLE (flood-risico) trekt 0 vreemde query's aan.
3. ✅ RECYCLABLE gedraagt zich netjes ondanks de 22-near-dup-concentratie (eigen 100%, geen magneet), met kanttekening over de kleine/GTIN-arme steekproef.

**Enige nuance (geen blokker):** PREGNANCY_WARNING (n=1, geen gids-ref) mist in C. Dit is een steekproef-van-één zonder statistische waarde en geen precisie-regressie; het onttrekt niets aan het AC5-patroon.

Alles read-only gemeten; geen writes, geen container-mutatie, geen deploy.

---

## Task 8 — live-verificatie gedeployde conditie C (ACC 1d6733f)

Datum: 2026-07-12 · nieuwe ml-container `ml-service-...124642696409`, image `ghcr.io/xxtract-development/logo-recognition-ml:1d6733f...` (= de 19.9-code, ná mijn AC5-meting gedeployd). Doel: bewijzen dat de **daadwerkelijk gedeployde** `app.services.bootstrap_search.search_with_seed` conditie C live activeert. Hier is de ranking NIET herbouwd — de gedeployde functie is direct geïmporteerd en aangeroepen met haar echte handtekening.

**Verdict Task 8: GEHAALD.** `ranking_active = true`, 16 echte refs geëmbed, **12/12 matches zijn conditie-C-winst** (gids-cosine < 0,60 maar ranking-cosine ≥ 0,60), en de contrast-run zonder refs levert **0** matches — de winst komt aantoonbaar van conditie C.

### Opzet (klasse GREEN_DOT)
- **seed_path** = `reference-logos/GREEN_DOT/default.png` (het GS1/wikimedia-gids-zaad — bewust het gids-logo om de conditie-C-winst zichtbaar te maken).
- **real_ref_paths** = 16 actieve ECHTE-crop-refs van GREEN_DOT (`reference_logos` active, source ∈ `review-confirmed`/`realref-live-poc`/`flywheel-promotion`), read-only uit de DB.
- **gtin_pages** = 2 declarerende GREEN_DOT-GTINs (`04001724023784`, `04001724023814`) met hun volledige artwork-pagina. **Leave-one-GTIN-out geborgd:** geen van deze GTINs zit in de 16 referentie-crops — elke match generaliseert dus over PRODUCTgrenzen, net als AC5.
- **params:** `threshold=0.60` (getBootstrapThreshold), `ranking_threshold=0.60` (getRankingThreshold, default == bootstrap), `min_refs=3` (getRankingMinRefs). Config-waarden geverifieerd in de gedeployde API-build `1d6733f`.

### Resultaat — run C (mét echte refs) vs run A (gids-only contrast)

| | ranking_active | real_refs_used | #matches |
|---|:---:|:---:|:---:|
| **Run C** (mét real_ref_paths) | **true** | 16 | **12** |
| **Run A** (zonder real_ref_paths) | false | 0 | **0** |

Alle 12 C-matches hebben **seed_cosine < 0,60** (bereik 0,389–0,540) én **ranking_cosine ≥ 0,60** (bereik 0,602–0,703) — dit zijn precies de "óók-matches" die het oude gids-only-pad zou hebben gemist. `seed_leaks_skipped=0` (NFR-6 intact). Representatieve matches:

| GTIN | seed_cosine (gids) | ranking_cosine (nearest-ref) | conditie-C-winst |
|------|-------------------:|-----------------------------:|:---:|
| 04001724023784 | 0,389 | 0,643 | ✓ |
| 04001724023784 | 0,416 | 0,626 | ✓ |
| 04001724023784 | 0,427 | 0,669 | ✓ |
| 04001724023784 | 0,465 | 0,653 | ✓ |
| 04001724023784 | 0,540 | 0,703 | ✓ |
| 04001724023814 | 0,424 | 0,602 | ✓ |
| 04001724023814 | 0,524 | 0,619 | ✓ |

**Interpretatie:** de gedeployde `search_with_seed` schakelt bij ≥ k=3 echte refs daadwerkelijk naar nearest-reference-ranking; regio's met een gids-cosine ver onder de drempel (tot 0,39) matchen nu via hun hoge cosine tegen echte crops van ANDERE producten. Zonder die refs (run A) valt elke match weg — sluitend bewijs dat de winst uit conditie C komt en niet uit de gate/region-proposer/zaad.

### NB — deployed `resolveSeedPath`
De gedeployde `resolveSeedPath` kiest de NIEUWSTE `reference_logo` (ongeacht source); voor GREEN_DOT is dat inmiddels een echte crop (`review-confirmed`). In deze verificatie is bewust het GIDS-zaad gebruikt om de conditie-C-winst-marge te tonen (bij een echte-crop-zaad zou de seed_cosine al hoog zijn). Dit raakt de conditie-C-schakel niet — die hangt aan `real_ref_paths` + `min_refs`, niet aan de zaadkeuze — maar is het vermelden waard voor de dev-story.

### Writes
Uitsluitend crop-staging naar MinIO `artwork-crops/{gtin}/17_1_bootstrap_*.png` (de bedoelde output van `search_with_seed`, 2×12 crops over de twee runs). **Geen** DB-write, **geen** bootstrap-queue-mutatie, **geen** flag-wijziging, **geen** container-restart/deploy.
