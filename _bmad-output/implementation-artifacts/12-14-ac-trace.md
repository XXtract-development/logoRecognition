# Story 12.14 — AC → test trace

Reviewed commit: (see `12-14: review` commit in sprint-status.yaml / git log — regenerated after a code-review fix)

| AC | Beschrijving | Test(s) | Bestand |
|----|--------------|---------|---------|
| AC1 | Kader + gekozen code samen bewaard via `annotateReviewItem(id, rel, code)`, niet `acceptReviewItem` | `AC1/AC2 — kader dan code: combineert via annotateReviewItem(id, rel, code), niet acceptReviewItem` | `apps/web/src/components/review/MobileReviewDeck.test.tsx` |
| AC2 | Beide volgordes (kader→code, code→kader) leveren identiek resultaat | `AC1/AC2 — kader dan code: ...` + `AC1/AC2 — code dan kader: zelfde eindresultaat, andere volgorde` | idem |
| AC3 | Losse paden (alleen-code → `acceptReviewItem`; alleen-kader → `annotateReviewItem` zonder code) ongewijzigd | `AC3 — alleen code (geen kader getekend): blijft acceptReviewItem(id, code)` + `AC3 — alleen kader (geen code gekozen): blijft annotateReviewItem(id, rel) zonder code` | idem |
| AC3 (desktop-kaart) | Geverifieerd of `ArtworkReviewItemCard.tsx` een combineer-fix nodig heeft | Geen test nodig — geen combineerbaar pad aanwezig (alleen Accept(id)/Reject(id)/Annotate(id, rel) zonder code-override, geverifieerd tegen de prop-signature); vastgelegd als code-comment bij `handleAnnotate` | `apps/web/src/components/review/ArtworkReviewItemCard.tsx` |
| AC4 | Passende UI-succesmelding bij de gecombineerde actie | Assertie op `Keurmerk gemarkeerd op je kader en gekoppeld aan {{code}}` in de "kader dan code"-test; bestaande `review.annotated`/`review.relabeled` teksten ongewijzigd (impliciet gedekt door AC3-tests die de niet-gecombineerde paden uitoefenen) | `apps/web/src/components/review/MobileReviewDeck.test.tsx` |
| AC5 | Tests (a)-(d) zoals gespecificeerd | Alle 4 nieuwe tests in de `Story 12.14` describe-blok (AC1/AC2 ×2, AC3 ×2) | idem |

**Regressie-dekking (toegevoegd na adversarial code review, niet in de oorspronkelijke AC-lijst maar wel binnen de scope "kader + code combineren correct en veilig"):**

Blind Hunter + Edge Case Hunter (twee onafhankelijke adversarial reviewers) vonden onafhankelijk van elkaar dezelfde HIGH-severity bug: `pendingRel`/`assignedCode` (de per-item pending-state die kader en code combineert) werden NIET opgeruimd wanneer een beslissing via de gewone Accept/Afwijs-knoppen (of de vlaggevoede reject-redenmodal) van label wisselde — waardoor een latere relabel/kader-actie op hetzelfde item stilzwijgend een verlaten kader of code kon hergebruiken. Gefixt in `commitReject` en `applyDecision` (beide takken); 3 regressietests toegevoegd:

| Regressietest | Dekt |
|----|------|
| `regressie — kader tekenen, dan afwijzen, dan relabelen: geen stale kader meer gecombineerd` | `applyDecision`-switch ruimt `pendingRel` op |
| `regressie — relabelen, dan afwijzen, dan kader tekenen: geen stale code meer gecombineerd` | `applyDecision`-switch ruimt `assignedCode` op |
| `regressie — kader tekenen, dan afwijzen via de redenkeuze-modal (vlag aan), dan relabelen: geen stale kader` | `commitReject` (flywheel-modal-pad) ruimt `pendingRel` op |

**Dekking: 5/5 functionele AC's + 3/3 regressiebevindingen uit de adversarial review gedekt door tests.**

Regressie: volledige web-vitest suite 132/132 groen (21 testbestanden groen + 1 skipped van 22; 16 pre-existing `todo`-markers ongemoeid), `tsc --noEmit` 0 errors (na de laatste wijziging).

## Gate decision

**PASS** — alle functionele AC's (1-5) zijn geïmplementeerd en getest; de scope-grens (backend ongemoeid, alleen `apps/web`) is gerespecteerd; de tijdens code review gevonden HIGH-bug is gefixt en met 3 gerichte regressietests geborgd; volledige suite en tsc zijn groen op de huidige HEAD (inclusief de fix).
