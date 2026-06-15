# Keurmerk-queue periodieke harvest — runbook (cron-gedreven)

Doel: de review-queue periodiek bijvullen met schone gate-v2-kandidaten, batchgewijs richting alle
~1857 GTINs. Draait 's nachts + CPU-getemperd (deelt de Vanilla-host met de live-API; een ongetemperde
harvest deed de frontend-health-check timeouten — 2026-06-15).

## Stappen (voer elke cron-firing uit)

1. **Containers resolven** (namen wijzigen bij redeploy):
   `ssh vanilla "docker ps --format '{{.Names}}' | grep -E 'ml-service-qsookwow8koko0kwg00g0cwk|app-qsookwow8koko0kwg00g0cwk'"`
   → `ML=ml-service-…`, `APP=app-…`.

2. **State lezen** uit MinIO `keurmerk-harvest/state.json` (`{next_offset, batch, total_gtins}`), via
   `docker exec $ML python -c` (storage_service.get_training_image). Als `next_offset >= total_gtins`:
   harvest is compleet — rapporteer "alle GTINs gedekt", update niets, klaar.

3. **Scripts stagen** (image bevat ze niet):
   - Genereer de gated assembler lokaal: lees `apps/ml-service/scripts/assemble_acceptance_candidates.py`,
     voeg ná `emb = np.asarray(await model_manager.generate_embedding(_to_pil(c)), np.float32)` toe:
     `from app.services.keurmerk_gate import keurmerk_probability, GATE_THRESHOLD` / `_kp = keurmerk_probability(emb)` /
     `if _kp is not None and _kp < GATE_THRESHOLD: continue`. Schrijf naar /tmp/assemble_gated.py.
   - `scp /tmp/assemble_gated.py apps/ml-service/scripts/spike_region_proposer.py vanilla:/tmp/` →
     `docker cp` beide naar `$ML:/tmp/`.

4. **Sources bouwen** voor `GTINs[next_offset : next_offset+batch]` (gesorteerd, 1 pagina/GTIN, voorkeur
   converted-0 dan _001) → `$ML:/tmp/sources_batch.json`. Topn = actieve referentiecodes (DB:
   `SELECT DISTINCT t3777_code FROM reference_logos WHERE active=true`) → `$ML:/tmp/topn.json`.

5. **Harvest draaien (getemperd)**, detached:
   `docker exec -d -e PYTHONPATH=/app -e TORCH_HOME=/tmp/torch -e TRANSFORMERS_CACHE=/tmp/hf -e OMP_NUM_THREADS=3 -e MKL_NUM_THREADS=3 $ML sh -c 'python -u /tmp/assemble_gated.py --sources /tmp/sources_batch.json --topn /tmp/topn.json --floor 0.85 --outdir /tmp/ra_batch --max <batch> > /tmp/ra_batch.log 2>&1'`
   Wacht tot `/tmp/ra_batch/candidates.json` bestaat (poll, ~batch×2s).

6. **Per-code cap 25** (op confidence desc) + **RECYCLABLE-flood-check** (cap/dismiss als > cap).

7. **Append-populate** (NIET de bestaande open kandidaten wissen — batches zijn disjuncte GTIN-sets):
   gebruik een variant van `apps/api/scripts/populate-review-queue-12-6.js` met de `deleteMany` overgeslagen.
   Restructure naar `{candidates.json, crops/}`, tar → docker cp naar `$APP:/tmp/rq_batch` → run in `$APP`.

8. **State updaten**: `next_offset += batch`, schrijf terug naar MinIO.

9. **Rapporteren**: 1 regel — toegevoegd N, per_code top, nieuwe queue-totaal, resterende GTINs.

## Defaults
- Cadans: nachtelijk (~03:23 lokaal), CPU-getemperd (OMP/MKL=3).
- Batch 700 GTINs, floor 0,85, gate-v2, per-code cap 25, append-mode.
- Stop wanneer next_offset ≥ total_gtins. Nieuwe GTINs later → reset offset of verhoog total.

## Verwante context
- gate-v2: `12-4-gate-v2-resultaten.md`. Detector-spike (negatief, data-bottleneck): `12-4-detector-spike-resultaten.md`.
- Deploy via ghcr (wacht op CI-image vóór Coolify-deploy): memory `project_acc_deploy_ghcr`.
