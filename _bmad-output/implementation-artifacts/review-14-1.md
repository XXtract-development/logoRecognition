# Adversarial self-review — Story 14.1 (Gold-set-aanwas uit reviewbeslissingen)

reviewed_commit: (pre-commit; branch epic/vliegwiel-14)
verdict: PASS

## Scope
- `apps/api/src/services/flywheel/gold-set.ts` — `recordReviewDecision`, `withdrawGoldSetRecord`, bron-guard.
- `apps/api/src/services/flywheel/review-decision.ts` — NIEUW: reject-"geen keurmerk" (phash + VALS + hard-negative, fail-closed), undo-orchestratie.
- `apps/api/src/api/v1/artwork-pipeline.ts` — accept/annotate ECHT-hook, reject twee-redenen, reopen undo (alles achter FLYWHEEL_NOMINATION_ENABLED).
- `apps/api/src/api/v1/flywheel.ts` — `nominationEnabled` op /flywheel/overview (vlag-exposure web).
- `apps/web/src/services/artworkReviewService.ts` — `rejectReviewItem(reason?)`, `fetchNominationEnabled`.
- `apps/web/src/components/review/MobileReviewDeck.tsx` — redenkeuze-modal bij reject (alleen vlag aan).
- Tests: SVC + RT (api), WEB (deck); setup.ts mock uitgebreid (hardNegative upsert/deleteMany/findFirst).

## Bevindingen per severity

### Critical — geen
- Fail-closed geverifieerd: `recordRejectGeenKeurmerk` berekent de phash VÓÓR enige schrijf; faalt die → `PhashUnavailableError` → route 503, géén VALS-record, géén hard-negative, géén status-update (RT-test "phash-down → 503 én GEEN statuswijziging"). Nooit een half record.
- Poort-afwijzing kan de gold-set niet voeden: `recordReviewDecision` valideert de bron hard tegen `HUMAN_GOLD_SET_SOURCES` en gooit `GoldSetSourceError` bij `cap-bereikt`/`outlier`/`crosscheck` (SVC-test). AD-12 gerespecteerd.

### High — geen
- Immutability (AD-4/FR-10) intact: geen `update` op inhoudskolommen, geen `delete` op `gold_set_records`. Undo = self-tombstone conditional update (`replaced_by_id = id`), record blijft bewaard, valt uit de actieve set. De 13.3-migratie heeft bewust geen constraint die self-reference blokkeert (schema-docblock geverifieerd).
- Legacy-gedrag byte-gelijk met vlag uit: alle nieuwe schrijfpaden zitten achter `isNominationEnabled()`. Bestaande route-tests (reject zonder reden → `data: { status: 'rejected' }`; accept → registerReference) blijven groen; extra expliciete vlag-uit-regressietests toegevoegd (accept/reject/reopen).

### Medium
- **M1 — dubbele VALS bij zeldzame retry.** Bij reject-"geen keurmerk" gebeurt de status-update ná de register-transactie. Slaagt de register maar faalt de status-update en herhaalt de client → een tweede VALS-record (de gold-set is append-only, geen unique op de reject). De hard-negative (de FR-9 *permanente* blokkade) is wél idempotent via `hardNegative.upsert` op de unieke `contentHash`. **Besluit: geaccepteerd, geen fix.** Dit spiegelt het 13.2-patroon (idempotentie leeft op de hard-negative/candidate-unieke sleutel, niet op de append-only gold-set); een dubbele VALS is voor de regressie-eval per-sample onschadelijk en zeldzaam. Genoteerd i.p.v. een kunstmatige unieke constraint die AD-4's append-only-model zou doorbreken.

### Low — geen open punten
- **L1 — undo-lookup breedte.** `withdrawReviewDecision` zoekt het jongste actieve `gold_set_records` met `cropPath` én `source in (review-accept|annotate|reject)`. Dit voorkomt dat een undo per ongeluk een niet-review-record (seed/quarantaine) tombstoned. Gedekt door de undo-SVC-test.
- **L2 — geen dode code / debug-statements.** Geen `console.log`; alle logging via `createLogger`. De `_reasonInEnum` compile-guard is `void`-geconsumeerd (geen unused-var). ESLint op de gewijzigde bestanden: 0 errors, 0 nieuwe warnings (de enige warning `err` op regel 927 is pre-existing, buiten de diff).

## Graceful degradation
- Accept/annotate ECHT-aanwas is **best-effort** (try/catch, non-fataal): een gold-set-schrijffout mag de accept nooit terugdraaien — de aanwas is een bijbestemming, de kern-accept blijft werken.
- Reject-"geen keurmerk" is **fail-closed** (bewust géén best-effort): FR-9 belooft een permanente blokkade; een stil gemiste hard-negative ondermijnt dat, dus de héle beslissing weigert bij phash-fout.
- Web `fetchNominationEnabled` is fail-safe (any error → false → legacy, geen modal).

## Tests
- api vitest: 469 passed / 2 skipped (was 449 baseline; +20). Web vitest: 58 passed.
- Alle AC's (op de menselijke afstemtaak AC6 na) hebben een dekkende test — zie `ac-trace-14-1.md`.

## Conclusie
Alle bevindingen t/m low afgehandeld (M1 expliciet geaccepteerd met rationale, geen open code-actie). Verdict: **PASS**.
