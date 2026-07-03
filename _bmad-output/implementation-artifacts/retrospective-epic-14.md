# Retrospective — Epic 14: Meegroeiend meetinstrument & referentie-audits

**Datum:** 2026-07-03 · **Branch:** `epic/vliegwiel-14` · **HEAD:** `42081fd` (code-anchor `8408950`) · **Base:** `9ef977d` (acc met Epic 13)
**Stories:** 14.1–14.3 (3/3 done) · **Migratie:** 0016 (`outlier_findings`)

## Wat ging goed

- **De epic-brede review ving een self-waiver die breder was dan gedacht.** Story 14.1 accepteerde een medium (zeldzame dubbele VALS bij retry) met de rationale "hard-negative is idempotent". Bij herbeoordeling bleek het reject-pad géén `item.status`-guard te hebben: élke dubbelklik/retry op reject-"geen keurmerk" voedde de gold-set opnieuw → een echte scheefgroei die 14.2's samenstellingsbewaking én 13.5's regressiemeting vervuilt. Goedkoop gedicht (idempotentie-guard, spiegelt de bestaande accept-`registered`-guard) + regressietest. **Les: een self-waiver op "meetinstrument"-data verdient altijd een tweede blik op epic-niveau.**
- **On-read boven job voor 14.2.** De samenstellingsbewaking wordt berekend bij de overview-aanroep i.p.v. een aparte job — raakt AD-6 niet en houdt de queue schoon. Goede default voor read-afgeleide panelen.
- **Het gedeelde overview-endpoint bleef modulair.** 13.2/14.1/14.2/14.3 raken alle `/api/v1/flywheel/overview`; door per paneel een sub-service te houden bleef de merge-churn beheersbaar en ontstond geen incompatibele samenvoeging. De coördinatie-noot uit de planning werkte.
- **Migratie 0016 volgde het bewezen lokale-only patroon** (additief, FK naar reference_logos, down.sql, drift-DDL handmatig geweerd) — vierde veilige migratie op rij, geen ACC/prod-aanraking.

## Wat brak / lastig was

- **Diff-drift bleef terugkomen.** `migrate diff` pikte opnieuw de ongerelateerde `retraining_notifications`-default op; handmatig uit 0016 verwijderd. Dit is nu 5× voorgekomen — een terugkerende ergernis van `migrate diff` tegen deze schema-staat.
- **Dode ml-helper.** 14.3 liet aanvankelijk een `get_active_reference_classes()` in `database.py` staan die door de Prisma-route (AD-2) overbodig was — door de review verwijderd.
- **ml-service endpoint-pytests nog steeds torch-geblokkeerd** (zoals Epic 13): pure-functie-tests draaien, endpoint-tests vereisen de volledige runtime — lokaal niet uitgevoerd, in CI wel.

## Patronen / afspraken hieruit

1. **Self-waivers van medium+ die data raken die als meetinstrument dient (gold-set, baseline, regressie) → verplicht herbeoordelen in de epic-brede review.** Niet accepteren op story-niveau.
2. **Idempotentie-guards spiegelen tussen tegengestelde paden.** Het accept-pad had een `registered`-guard, het reject-pad niet — bij tegengestelde acties (accept/reject, add/remove) altijd beide symmetrisch guarden.
3. **`migrate diff`-drift is structureel** in deze repo; elke migratie-story moet de gegenereerde SQL handmatig terugsnoeien tot uitsluitend de eigen DDL. Overwegen dit als vaste story-taak te documenteren.

## Openstaand richting latere epics (geen blocker voor Epic 14)

- **AC6 van 14.1** (afstemming met reviewstation-gebruikers over de nieuwe betekenis van hun klik) is een menselijke taak, geen code — blijft open als operationeel actiepunt vóór de vlag op ACC aan gaat.
- Beoordelingsflow voor outlier-findings (Behouden/Deactiveren) komt in Story 15.2 (dashboard) — 14.3 levert alleen de markering + persistentie.
