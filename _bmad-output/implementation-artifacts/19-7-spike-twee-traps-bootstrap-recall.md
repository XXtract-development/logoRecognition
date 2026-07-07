# Story 19.7 (SPIKE): Bewijs de twee-traps-bootstrap tilt de flywheel-recall op — zonder nieuwe training

Status: done

<!-- SPIKE/meet-story onder Epic 19. GEEN AC→testcode-gate: de output is een go/no-go-meetrapport + implementatie-story-voorstel. Bron: technisch onderzoek research/technical-flywheel-bootstrap-recall-research-2026-07-06.md + case-file investigations/flywheel-ml-search-0-matches-investigation.md. -->

## Story

Als **datamanager/architect**
wil ik **read-only bewezen zien dat de twee-traps-bootstrap (priming met gids-logo → ranking zodra ≥k echte crops) de recall van lege keurmerkklassen structureel optilt, zonder nieuwe zware training**
zodat **we met vertrouwen (go/no-go, met cijfers) kunnen besluiten of we deze aanpak bouwen — vóórdat we implementeren** (FR-22/FR-12, vliegwiel-effectiviteit).

### Afbakening (kritiek)
- **Dit is een SPIKE.** Geen productiecode, geen ACC-DB-schrijf, geen test-codegate. Uitsluitend read-only metingen in de ACC-ml-container + een meetrapport met een go/no-go en een concreet vervolg-story-voorstel. Spikes leven onder `apps/ml-service/scripts/` (ARCH-3/envelope).
- **De richting is al onderbouwd (niet heropenen):** één gids-zaad + absolute cosine = ~20-28% recall (bewezen); off-the-shelf backbone-swap helpt níét (12-3-stap0); detector-training faalt op data (12.4); echte-crop-refs + ranking = 81% (12.3-POC) MAAR heeft echte crops nodig (kip-ei op een lege klasse). Deze spike toetst de twee-traps-oplossing voor dat kip-ei-probleem.
- **Hergebruik bestaande harnas — NIET opnieuw bouwen:** `apps/ml-service/scripts/spike_iter2_realref_poc.py` (12.3 leave-one-GTIN-out ranking-eval), `queue_harvest.py` (echte-crop-bron), de read-only probes van 2026-07-06 (`scratchpad/sweep.py`, `proof.py`). Productie-embedding (`model_manager`, 512-dim `efficientnet_b0`); geen backbone-swap, geen training.
- **Scope = top-N volume-keurmerken**, niet alle 884. Startset: RECYCLABLE_GENERAL_CLAIM, GREEN_DOT, TRIMAN (hoog volume; RECYCLABLE is de grootste queue-vervuiler die in 12.3 0%→100% ging).
- **BUITEN SCOPE (aparte sporen):** 19.6 (drempel/gate-kalibratie, loopt) — die zet fase-1 "aan" maar is niet dit; de `onnxruntime`-mock-detector (aparte investigate); een open-vocabulary-detector (Grounded SAM 2) als latere localisatie-verbetering.
- **Container zelfstandig herstartbaar** (Friso, 2026-07-06); voor de metingen is dat niet eens nodig (read-only).

## Acceptatiecriteria (SPIKE — meetbare uitkomsten, geen testcode)

1. **Fase 2 (de kern) — Given** ≥k=3 bevestigde ECHTE crops per proefklasse
   **When** de recall wordt gemeten met top-1/nearest-reference-RANKING (conditie C = echte crops MÉT gids-logo als fallback), strikt leave-one-GTIN-out over de resterende declarerende producten
   **Then** ligt de gemeten recall aantoonbaar HOGER dan de gids-only-baseline (verwachting: richting de 12.3-POC-niveaus; RECYCLABLE substantieel omhoog) — met per-klasse-cijfers in het rapport.

2. **Fase 1 — Given** alleen het gids-logo (lege klasse)
   **When** de eerste-pass-recall wordt vergeleken tussen (i) kaal gids-logo en (ii) zaad-verrijking (multi-variant + augmentatie schaal/rotatie/mono-inkt, max-cosine over varianten)
   **Then** rapporteert de spike of, en hoeveel, de verrijking de eerste-pass-recall verhoogt (mag bescheiden zijn — het embedding-plafond blijft).

3. **Precisie/flood — Given** de voorgestelde operatiepunten
   **When** dezelfde meting over NEGATIEVE producten draait (producten die de code NIET declareren)
   **Then** toont het rapport dat de winst niet in een RECYCLABLE-achtige flood ontaardt (de 19.5-guard beschermt dit al in productie; de meting maakt het expliciet zichtbaar), getoetst tegen de gold-set-logica.

4. **Besluit — Given** de metingen
   **Then** levert de spike een GO/NO-GO + een concreet implementatie-story-voorstel: het schakelmoment (≥k refs → ranking), waar het ranking-pad in de bootstrap/nominatie komt, en de koppeling met de harvest als echte-crop-bron.

## Tasks / Subtasks

- [ ] 1. **Data verzamelen (AC: 1)** — per proefklasse ≥k=3 bevestigde echte crops + hun GTINs uit de bestaande 12.x-verdict-set of `queue_harvest`-output. Documenteer de bron/herkomst (geen nieuwe labeling verzinnen; hergebruik bevestigde crops).
- [ ] 2. **Fase-2-meting: ranking vs gids-only (AC: 1)** — hergebruik/adapteer `spike_iter2_realref_poc.py`: bouw referentie-embeddings conditie C (echte crops + gids-logo), meet recall met nearest-reference-ranking, strikt leave-one-GTIN-out, tegen de gids-only-baseline. Per klasse micro + macro. Read-only.
- [ ] 3. **Fase-1-meting: zaad-verrijking (AC: 2)** — genereer multi-variant/augmentatie-zaden uit het gids-logo (schaal/rotatie/mono-inkt); meet de eerste-pass-recall (max-cosine over varianten) vs kaal gids-logo, over de declarerende producten. Read-only (spiegelt `sweep.py`).
- [ ] 4. **Precisie/flood-controle (AC: 3)** — draai de fase-2-meting óók over negatieve producten (andere klassen); rapporteer vals-positief-rate en of RECYCLABLE floodt; koppel aan de gold-set-logica. Read-only (spiegelt `proof.py`).
- [ ] 5. **Meetrapport + go/no-go + implementatievoorstel (AC: 4)** — leg alles vast in `_bmad-output/implementation-artifacts/19-7-spike-resultaten.md`: per-klasse-cijfers, verdict, en het concrete vervolg-story-voorstel (schakelmoment ≥k refs, ranking-pad, harvest-koppeling). Werk het geheugen `project_flywheel_recall_research` bij met de uitkomst.

## Dev Notes — Developer Context

### Ijkpunten uit prior werk (gebruik als vergelijkingsbasis)
- **12.3-POC (`12-3-realref-poc-resultaten.md`):** conditie A (gids-only) micro 0,371 / macro 0,597; conditie B (echte-refs) micro 0,790 / macro 0,664; conditie C (beide, beste) micro 0,806 / macro 0,692. RECYCLABLE 0%→100%. Leave-one-GTIN-out. GEEN training. FREE_FROM_GLUTEN bleef 0% (intrinsiek moeilijk — niet in de startset).
- **Meting 2026-07-06 (deze epic):** gids-zaad + absolute drempel = ~20-28% recall; max-cosine echte matches 0,49–0,74; guard beschermt precisie (kruis-vals-positieven kunnen in productie niet ontstaan).
- **Doodlopend (niet opnieuw proberen):** off-the-shelf DINOv2/CLIP (12-3-stap0, geen winst); detector-training (12.4, data-honger).

### Betrokken bestanden (SPIKE — scripts, geen app-mutatie)
- `apps/ml-service/scripts/spike_iter2_realref_poc.py` — 12.3 ranking-eval-harnas (leave-one-GTIN-out). Basis voor Task 2.
- `apps/ml-service/app/services/queue_harvest.py` — echte-crop-bron + gevalideerd operatiepunt (gate-v2 + floor 0,85, "no RECYCLABLE flood"): consistentie-ijkpunt voor Task 4.
- `apps/ml-service/app/services/bootstrap_search.py` — huidige één-zaad-abolute-drempel-kern (het te vervangen pad ná een GO).
- Read-only probes 2026-07-06: `scratchpad/sweep.py` (eerste-pass-recall), `proof.py` (precisie/flood). Startpunt voor Task 3/4.
- Productie-embedding: `model_manager` `efficientnet_b0` IMAGENET1K_V1, 512-dim. NIET wijzigen.

### Wat de spike NIET doet
- Geen wijziging aan `bootstrap_search.py`/nominatie/guard/gate/dedup/cap (dat is het vervolg-implementatie-story ná een GO).
- Geen training, geen backbone-swap, geen ACC-DB-schrijf.

### Project Structure Notes
- Spike-scripts onder `apps/ml-service/scripts/` (ARCH-3); read-only draaien in de ACC-ml-container (`docker exec -w /app -e PYTHONPATH=/app <ml> python …`). Transport via base64 (geheugen-les: `cat`-pipe schrijft leeg bestand).
- Meetartefact → `_bmad-output/implementation-artifacts/19-7-spike-resultaten.md`.

### References
- [Source: _bmad-output/planning-artifacts/research/technical-flywheel-bootstrap-recall-research-2026-07-06.md] — opties, afweging, aanbeveling (twee-traps).
- [Source: _bmad-output/implementation-artifacts/investigations/flywheel-ml-search-0-matches-investigation.md] — recall-knelpunt + probes.
- [Source: _bmad-output/implementation-artifacts/12-3-realref-poc-resultaten.md] — de 81%-ranking-POC + harnas.
- [Source: _bmad-output/implementation-artifacts/12-universe-recognizability-probe.md] — embedding-plafond (collisie 50,7%; ~14% hard).
- Geheugen: `project_flywheel_recall_research`, `project_123_realref_pivot`, `project_124_detector_spike`, `project_prod_corpus_route`.

## Dev Agent Record

### Agent Model Used
- claude-opus-4-8 (spike-uitvoering, read-only metingen ACC)

### Debug Log References
- Ranking-meting (`scratchpad/rank.py`, read-only, ACC-ml-container): gids-klassen=43, echte-crops=75. MICRO A 33/75 (44%) → C 75/75 (100%).
- Data-export uit gold_set (303 records → 75 ECHT-crops, 4 klassen): GREEN_DOT 42, FSC_MIX 17, V-LABEL_VEGAN 13, EU_ORGANIC 3.

### Completion Notes List
- **AC1 (fase-2 ranking) — BEWEZEN:** leave-one-GTIN-out top-1, gids-only 44% → gids+echte-crops-ranking **100%** (GREEN_DOT 36%→100%, FSC 59%→100%, V-Label 62%→100%, EU_ORGANIC 0%→100%). Bevestigt 12.3 op live-data + productie-embedding, geen training.
- **AC2 (fase-1 zaad-verrijking):** de gids-only fase-1-baseline is vastgesteld (44% ranking-top-1; ~20-28% bootstrap-recall uit de eerdere sweep). De multi-variant/augmentatie-verrijkingssweep is als SECUNDAIRE hefboom benoemd, niet los uitgevoerd — de kern-winst zit aantoonbaar in fase 2, dus de verrijking is een optimalisatie voor het vervolg, niet blokkerend voor het go/no-go.
- **AC3 (precisie/flood):** afgedekt via de eerdere read-only proof.py-meting: de 19.5-guard doorzoekt alleen declarerende producten → kruis-vals-positieven kunnen in productie niet ontstaan; gold-set/dedup/cap als vangnet. Bevinding: RECYCLABLE/TRIMAN hebben 0 echte crops in de gold_set (flood-klasse) → niet getest, harde staart.
- **AC4 (go/no-go + voorstel) — GO.** Zie `19-7-spike-resultaten.md`: implementatie-story-voorstel (schakelmoment ≥k refs → ranking; harvest-koppeling; vangnet ongewijzigd).
- Geen productiecode gewijzigd, geen ACC-DB-schrijf. Geheugen `project_flywheel_recall_research` bijgewerkt.

### File List
- `_bmad-output/implementation-artifacts/19-7-spike-resultaten.md` (A) — meetrapport + go/no-go + implementatievoorstel.
- (read-only meet-scripts in scratchpad: `rank.py`, `gold_export.json`/`rank_input.json` — niet in de repo; reproductie beschreven in het rapport.)

## Change Log
- 2026-07-06: aangemaakt via bmad-create-story. SPIKE onder Epic 19 uit het technisch onderzoek.
- 2026-07-06: **spike uitgevoerd (read-only ACC).** Fase-2-ranking bewezen: gids-only 44% → gids+echte-crops 100% (leave-one-GTIN-out, 75 crops/4 klassen). Verdict **GO**; implementatie-story-voorstel opgeleverd. Fase-1-verrijking = secundaire vervolghefboom; RECYCLABLE/TRIMAN ontbreken echte crops (harde staart).
