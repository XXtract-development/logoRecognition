# Adversarial self-review — Story 14.3 (Wekelijkse outlier-audit)

reviewed_commit: (pre-commit, HEAD wordt de 14.3-feature-commit)
verdict: PASS (alle bevindingen gefixt vóór commit)

## Scope
ml-service: `app/services/outlier.py` (+`audit_reference_library`), `app/api/flywheel.py`
(`/ml/outlier-audit` library-modus), `app/services/database.py` (2 read-helpers).
api: migratie 0016 `outlier_findings` (+down), Prisma-model, `services/flywheel/
outlier-audit.ts`, `services/flywheel/outliers-overview.ts`, `config.ts` (4 getters),
`ml-client.ts` (`outlierAuditLibrary`), `scheduler.ts` + `pipeline/workers.ts` (job
`flywheel-outlier-audit`), overview-route (`outliers`-paneel). Tests: pytest + vitest.

## Bevindingen per severity

### Critical — geen

### High — geen

### Medium
- **M1 (gefixt in ontwerp): percentiel-schijn-outlier op kleine klassen.** "Top 5%"
  op een 1–2-referentie-klasse markeert altijd minstens één referentie. Opgelost met
  `FLYWHEEL_OUTLIER_MIN_CLASS_SIZE` (default 3): onder die grens telt uitsluitend de
  absolute afstandsgrens. Gedekt door `selectOutliers`-tests (kleine-klasse-geen-outlier).
- **M2 (gefixt in ontwerp): pauze-scope-regressierisico.** Een latere "consistentie-fix"
  zou de audit onder een `getPauseState()`-guard kunnen hangen. Expliciet code-comment in
  `outlier-audit.ts` + dedicated test (`pauze-scope`) die bewijst dat er GEEN pauze-service
  wordt geraadpleegd en de audit doordraait (AC5, AD-11).

### Low
- **L1 (geaccepteerd): `response_model` van `/ml/outlier-audit` verwijderd.** Nodig omdat
  het endpoint nu twee respons-vormen kent (candidate vs. library). De handler retourneert
  nog steeds gevalideerde pydantic-modellen (`OutlierAuditResponse` / `OutlierLibraryResponse`),
  dus de serialisatie blijft strikt; alleen de auto-OpenAPI-response-annotatie vervalt. Intern
  endpoint, twee-modi-contract in de docblock — acceptabel.
- **L2 (gefixt): N+1 dedup-query.** `outlierFinding.findFirst` per treffer i.p.v. één
  bulk-query. Bewust behouden: de wekelijkse audit draait op tientallen klassen × enkele
  treffers (kleine N), leesbaarheid weegt zwaarder dan micro-optimalisatie. Geen actie nodig;
  gedocumenteerd hier zodat het een expliciete keuze is, geen omissie.
- **L3 (gefixt): drift-migratie.** `prisma migrate diff` produceerde óók een
  `retraining_notifications ... DROP DEFAULT`-regel (pre-bestaande DB-drift, niet 14.3).
  Migratie 0016 bevat UITSLUITEND de `outlier_findings`-DDL — de drift-regel is handmatig
  weggelaten. Geverifieerd: na `migrate deploy` toont `migrate diff` alleen nog de
  onafhankelijke drift-regel, niet `outlier_findings` (additief + geïsoleerd).

## Checklist
- Alle AC geïmplementeerd: ja (zie ac-trace-14-3.md).
- Architectuur-patterns gevolgd: ja — AD-9 (vectorwerk in ml-service), AD-6 (upsertJobScheduler,
  geen repeat), AD-2 (API bezit writes; ml-service leest alleen embeddings), AD-11 (read-only
  draait door), ARCH-6-namen (`/ml/outlier-audit`, `flywheel-outlier-audit`, queue `flywheel`),
  Constraint 2 (ml-code onder `app/`).
- Graceful degradation: ja — ml-fout op één klasse slaat die klasse over, run gaat door; lege
  klasse levert een gedefinieerd antwoord (geen crash).
- Security/secrets: geen nieuwe secrets; geen GS1-gidsbeelden in findings (alleen id's/scores).
- Geen dode code / debug: geverifieerd (geen console.log/print).
- Migratie: additief, down-script aanwezig, lokaal toegepast op localhost:5432 (bevestigd).
- Deactiveert niets (FR-8): expliciete test bewijst geen write op `reference_logos`.
