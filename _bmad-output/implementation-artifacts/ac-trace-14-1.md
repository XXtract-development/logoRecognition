# AC→test-trace — Story 14.1 (Gold-set-aanwas uit reviewbeslissingen)

Elk acceptatiecriterium met de dekkende geautomatiseerde test(s). Alle tests draaien
tegen de gemockte prisma/ml-client (geen echte DB). Bestanden:

- SVC = `apps/api/src/__tests__/services/flywheel-review-decision.test.ts`
- RT  = `apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts` (describe "Story 14.1")
- WEB = `apps/web/src/components/review/MobileReviewDeck.test.tsx`

| AC | Kern | Dekkende test(s) |
|----|------|------------------|
| **AC1** | Accept/annotate → exact één ECHT `gold_set_records`-record met crop, T3777-code, bron, beslisser; reviewstation-flow verder ongewijzigd; redenkeuze alleen bij vlag aan | SVC "recordReviewDecision maakt exact één gold-set-record"; SVC "recordAcceptDecision legt ECHT vast"; RT "vlag AAN: accept → één ECHT gold-set-record"; RT "vlag UIT: accept schrijft GEEN gold-set-record (byte-gelijk legacy)"; WEB "vlag UIT: reject byte-gelijk legacy" |
| **AC2** | Twee-redenen-reject: "geen keurmerk" → VALS + hard-negative (phash via /ml/phash, fail-closed); "onjuiste locatie/verkeerde code" → géén registers | SVC "reject 'geen keurmerk' → VALS + hard-negative in één transactie"; SVC "de hard-negative-reden is exact de gedeelde 13.6-enum-waarde"; SVC "FAIL-CLOSED: phash-fout → geen enkele schrijf"; RT "vlag AAN: reject 'geen-keurmerk' → VALS + hard-negative"; RT "vlag AAN: reject 'onjuiste-locatie...' → GEEN registers"; RT "vlag AAN: phash-down → 503 én GEEN statuswijziging"; RT "vlag AAN: onbekende reden → 400"; WEB "geen-keurmerk stuurt reason mee"; WEB "onjuiste-locatie stuurt reden mee" |
| **AC3** | Undo → gold-set-record vervangen via `replacedById` (self-tombstone) + hard-negative-rij verwijderd | SVC "withdrawGoldSetRecord doet een self-tombstone conditional update"; SVC "withdrawReviewDecision trekt gold-record in ÉN verwijdert hard-negative op cropPath"; SVC "withdrawReviewDecision is idempotent"; RT "vlag AAN: reopen → self-tombstone + hard-negative-delete"; RT "vlag UIT: reopen raakt gold-set/hard-negatives NIET (byte-gelijk legacy)" |
| **AC4** | Correctie via nieuw record dat het oude vervangt (`replacedById`), beide bewaard | Bestaande 13.3-dekking `apps/api/src/__tests__/services/flywheel-gold-set.test.ts` ("replaceGoldSetRecord happy path / dubbele vervanging → fout / transactionaliteit"). Deze story hergebruikt `replaceGoldSetRecord` ongewijzigd; de relabel-flow (reopen→accept) leunt hierop en is gedekt door de reopen- + accept-routetests. |
| **AC5** | Herbruikbare service-functie (zodat 15.3 quarantaine dezelfde route aanroept); GEEN poort-afwijzing in de gold-set | SVC "recordReviewDecision WEIGERT een niet-menselijke bron (AD-12)"; SVC "isHumanGoldSetSource laat alleen de vier menselijke bronnen door" (incl. `quarantaine` voor 15.3). `recordReviewDecision`/`withdrawGoldSetRecord` zijn de gedeelde functies. |
| **AC6** | Story-taak: afstemming met reviewstation-gebruikers (menselijke taak) | Geen code/test — genoteerd in de story Dev Agent Record (Completion Notes) als openstaande menselijke taak. |

**Poort-afwijzing-guard (spine AD-12, expliciete anti-loophole):** SVC "recordReviewDecision
WEIGERT een niet-menselijke bron" bewijst dat `cap-bereikt`/`outlier`/`crosscheck` een
`GoldSetSourceError` opleveren en géén insert doen.

Alle AC's op AC6 na hebben ten minste één dekkende geautomatiseerde test. AC6 is een
menselijke afstemtaak zonder codepad.
