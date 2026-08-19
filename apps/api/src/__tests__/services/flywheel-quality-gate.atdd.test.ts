/**
 * ATDD red-phase scaffold — Story 13.5: Kwaliteitspoort — regressietest, promotie en quarantaine
 *
 * Alle tests zijn it.todo (red phase). Beoogde module:
 * apps/api/src/services/flywheel/quality-gate.ts (poort-orkestratie; de meting zelf is
 * ml-service /ml/regression-eval — zie tests/test_flywheel_atdd.py voor het contract-deel).
 */
import { describe, it } from 'vitest';

describe('Story 13.5 — Kwaliteitspoort: regressietest, promotie en quarantaine (RED)', () => {
  it.todo(
    'AC1: de poort roept /ml/regression-eval aan met actieve set UNION schaduwset (uitsluitend in_batch-kandidaten van deze batch) en de actieve gold-set als payload; de meting muteert de actieve referentieset niet en past de self-match-guard (leave-one-out op inhouds-hash) toe'
  );

  it.todo(
    'AC2: allereerste batch triggert vooraf een eenmalige nulmeting (pre-vliegwiel-precisie over de actieve set, zonder schaduwset) die als initiele baseline wordt vastgelegd (SM-1-anker)'
  );

  it.todo(
    'AC3: bij een als verouderd gemarkeerde baseline start de eerstvolgende poortrun met een verse nulmeting op de actuele actieve set voordat batches gemeten worden'
  );

  it.todo(
    'AC4: versie-guard — kandidaten met embedding-modelversie != actieve modelversie worden niet gemeten: conditional update terug naar candidate met her-embed-taak; modelactivatie invalideert openstaande candidate_embeddings'
  );

  it.todo(
    'AC5: meting binnen tolerantie (sample-gebaseerd: quarantaine bij >=2 netto verslechterde samples zolang gold-set <200; daarna 1pp) promoveert per kandidaat atomair: INSERT ReferenceLogo (active=true, source=flywheel-promotion, variantLabel auto-{batchShortId}-{seq}) + embedding-kopie naar ReferenceEmbedding zonder herberekening + status promoted; nieuwe baseline vastgelegd en alle metingen historisch opvraagbaar'
  );

  it.todo(
    'AC6: meting boven tolerantie zet de batch op quarantined met gemeten delta en meest getroffen klassen, niets wordt actief, en er ontstaat een notificatie via het RetrainingNotification-patroon'
  );

  it.todo(
    'AC7: fail-closed — niet-uitvoerbare meting (gold-set onbereikbaar, ml-service down) quarantaineert de batch met reden systeem-fout'
  );
});
