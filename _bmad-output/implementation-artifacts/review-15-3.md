# Adversarial self-review — Story 15.3 (Quarantaine-afhandeling met volledig bewijs)

reviewed_commit: (pre-commit, epic/vliegwiel-15 werkkopie)
verdict: PASS

Adversarial self-review langs de severity-niveaus critical → low. Alle bevindingen zijn gefixt vóór commit; geen open bevindingen, geen waivers.

## Critical

- **C1 — Vrijgave omzeilt de poort niet (AD-15).** Geverifieerd: `candidate-decision.ts::vrijgeven` zet uitsluitend `status='candidate'` + `promotionBatchId=null`; er is geen batch-aanmaak, geen guardrail-/regressie-aanroep, geen `mlClient`-call in het request-pad. Unit-test `flywheel-candidate-decision.test.ts` assert expliciet `computePhash`/`reloadTemplates`/`hardNegative.upsert`/`goldSetRecord.create` NIET aangeroepen bij vrijgeven. **OK.**
- **C2 — Conditional updates, nooit blind overschrijven (AD-16).** Alle status-overgangen (afkeuren/vrijgeven/undo) zijn `updateMany({ where: { status: <verwacht> } })`; 0 rows → `CandidateConflictError` (409). Getest voor afkeuren én vrijgeven. **OK.**
- **C3 — Hard-negative uitsluitend hier + 14.1, met de bestaande hash (AD-12/AD-14).** `afkeuren` gebruikt `candidate.contentHash` (kolom uit de nominatie) in de `hardNegative.upsert`; géén `/ml/phash`-aanroep. Reden = `quarantaine-afkeuring` (13.6-enum, compile-check via `HUMAN_HARD_NEGATIVE_REASONS`-test). **OK.**
- **C4 — 14.1-service hergebruiken (geen tweede aanwas-implementatie).** `afkeuren` roept `recordReviewDecision` (14.1) aan met bron `quarantaine` (in `HUMAN_GOLD_SET_SOURCES`); undo trekt in via `withdrawGoldSetRecord` (14.1). Geen duplicaatlogica. **OK.**

## High

- **H1 — 409 op batch in verwerking (AD-16).** `decideCandidate` gooit `CandidateBatchProcessingError` (→409) zodra de kandidaat `in_batch` is én de batch `pending`. Beslissen kan alleen op een afgesloten (`quarantined`) batch. Route- en service-test dekken dit. **OK.**
- **H2 — Vrijgave-undo verloor de batch-verwijzing.** Oorspronkelijk kon undo van een vrijgave de kandidaat niet herkoppelen (kolom losgekoppeld). Gefixt: `vrijgeven` bewaart `evidence.undoBatchId`; `undo` leest die en herstelt `promotionBatchId`. Getest. **OK (gefixt).**
- **H3 — Auto-advance naar de volgende ONBEOORDEELDE (EXPERIENCE bindend).** `advanceToNextUnreviewed` slaat reeds-beoordeelde kandidaten over en wrapt rond. Component-test dekt "c1 afgekeurd → selectie naar c2". **OK.**

## Medium

- **M1 — Sneltoetsen-parity met het reviewstation.** `useCandidateKeyboard` spiegelt `MobileReviewDeck.tsx:419-466`: typing-guard (INPUT/TEXTAREA/contentEditable), meta/ctrl/alt genegeerd, open modal bezit het toetsenbord (alleen Esc), `preventDefault` per toets. Typing-guard-test aanwezig. **OK.**
- **M2 — Batch afsluiten alleen bij alles beoordeeld.** `closeBatch` telt via `groupBy`; `in_batch > 0` → `BatchNotFullyReviewedError` (409). Frontend disable't de knop tot `reviewedCount === candidates.length`. Beide getest. **OK.**
- **M3 — `closedAt` zonder status-wijziging (herleidbaarheid).** `closeBatch` zet alleen `closedAt`; status blijft `quarantined`. Conditioneel op `status='quarantined' AND closedAt IS NULL`. Getest. **OK.**
- **M4 — jsdom scrollIntoView.** `CandidateList` roept `scrollIntoView` defensief aan (feature-check) — geen crash in tests, correct gedrag in de browser. **OK (gefixt).**

## Low

- **L1 — Declaratieblok-velden (`declaredCodes`, `gln`) niet in het huidige evidence-contract.** `nomination.ts::buildEvidence` schrijft (nog) geen `declaredCodes`/`gln`. Het bewijspaneel leest ze defensief en valt terug op de gematchte code met ✓ (uit `declarationOutcome='confirmed'`). Geen bug — het paneel degradeert netjes; als de nominatie later die velden toevoegt, verschijnen ze automatisch. Bewust géén nominatie-wijziging in deze story (buiten scope). **Geaccepteerd, geen actie.**
- **L2 — Geen dode code / debug-statements.** Gecontroleerd: geen `console.*`, geen TODO's, geen ongebruikte exports. `getPromotionThresholdForMethod`-import staat bovenaan. **OK.**
- **L3 — Kleursemantiek (UX-DR5).** Nergens rood op de pagina: afkeur-knop is neutraal (antd default), `afgekeurd`-badge is `neutral` (grijs), poort-blokkade is `warn` (amber). Geverifieerd in `candidateStatus.ts` + `StatusBadge`. **OK.**
- **L4 — a11y (UX-DR9).** `role=listbox`/`option` + `aria-selected` + `scrollIntoView`; `aria-live="polite"` op de beslis-feedback; zichtbare teal focus-outline op lijstitems; faalreden-alert `role="status"`. aria-selected-test aanwezig. **OK.**

## Migratie

Geen Prisma-migratie. `promotion_batches.closedAt` bestaat al in de 13.4-migratie (schema geverifieerd, regel 672). Alle overige tabellen/kolommen komen uit Epic 13. **Migratie-vrij bevestigd.**

## Tests

- API: `flywheel-candidate-decision.test.ts` (15), `flywheel-batch-detail.test.ts` (6), `flywheel-batch-detail.routes.test.ts` (14) = 35 nieuw. Volledige API-suite: 566 passed / 2 skipped / 20 todo.
- Web: `FlywheelBatchDetailPage.test.tsx` (11) nieuw; `FlywheelPage.test.tsx` bijgewerkt (drawer→navigatie). Volledige web-suite: 99 passed / 16 todo.
