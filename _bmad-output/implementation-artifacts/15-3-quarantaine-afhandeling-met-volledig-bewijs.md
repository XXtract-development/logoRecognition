# Story 15.3: Quarantaine-afhandeling met volledig bewijs

Status: done

<!-- Aangemaakt via create-story workflow, 2026-07-02. Bron: epics-vliegwiel.md Epic 15. -->

## Story

As a **datamanager**,
I want **per kandidaat het volledige bewijs zien en per kandidaat afkeuren of vrijgeven**,
so that **ik een quarantainebatch in minuten afhandel zonder de poort te omzeilen (UJ-1, UJ-3)**.

### Afbakening (kritiek)

- **Vrijgave omzeilt de poort nooit (FR-18, AD-15):** het decision-endpoint muteert uitsluitend kandidaat-status; de vrijgegeven kandidaat wordt door de **eerstvolgende worker-run** in een **nieuwe batch** gebundeld die de volledige kwaliteitspoort opnieuw doorloopt. Het endpoint draait zelf nooit poortlogica — geen guardrails, geen regressietest, geen promotie in het request-pad.
- **Afkeuren = menselijke afkeuring = hard-negative (FR-9, AD-12):** dit is — samen met de reviewstation-reject wegens "geen keurmerk" (14.1) — een van de twee enige bronnen van `hard_negatives`-rijen. Zachte poort-afwijzingen (cap/duplicaat/outlier) horen hier niet; die zijn al in Epic 13 afgehandeld.
- Het reviewstation zelf blijft ongewijzigd; deze pagina hergebruikt alleen het interactiepatroon (sneltoetsen, kandidaat-voor-kandidaat-ritme).

## Acceptatiecriteria

_(1-op-1 uit epics-vliegwiel.md, Story 15.3)_

1. **Given** de batch-detailpagina (FlywheelBatchDetailPage, `/flywheel/batches/:id`, endpoint `batches/:id`)
   **When** de datamanager een gequarantaineerde batch opent
   **Then** ziet hij conform mock-quarantaine.html: faalreden, batchvoortgang, kandidatenlijst met statusbadges (master) en per kandidaat het bewijspaneel (crop naast referentie, scores, declaratieblok, poort-uitkomsten) (FR-18, UX-DR4)
   **And** werkt toetsenbordnavigatie (A/R/U/pijltjes/Esc conform reviewstation) en zijn focus-states zichtbaar (UX-DR4, UX-DR9).

2. **Given** een afkeur-beslissing
   **When** de datamanager afkeurt via `candidates/:id/decision`
   **Then** wordt de kandidaat `rejected` + hard-negative (herbruik 14.1-route voor gold-set-aanwas indien van toepassing), via conditional update (FR-18, AD-16).

3. **Given** een vrijgave-beslissing
   **When** de datamanager vrijgeeft
   **Then** gaat de kandidaat terug naar status `candidate` en wordt hij door de eerstvolgende worker-run in een níeuwe batch gebundeld die opnieuw de volledige poort doorloopt — het endpoint draait zelf nooit poortlogica (FR-18, AD-15)
   **And** geeft het endpoint HTTP 409 op kandidaten in een batch in verwerking (AD-16).

4. **Given** een batch waarvan alle kandidaten beoordeeld zijn
   **When** de datamanager de actie "Batch afsluiten" gebruikt (pas dan actief)
   **Then** toont een samenvattingsmodal het resultaat: N afgekeurd → hard-negative; M vrijgegeven → nieuwe batch die opnieuw door de poort gaat (FR-18, UX-DR4)
   **And** springt de weergave na elke individuele beslissing automatisch door naar de volgende onbeoordeelde kandidaat (auto-advance; EXPERIENCE Component Patterns bindend) (UX-DR4).

## Tasks / Subtasks

- [ ] 1. Endpoint `GET /api/v1/flywheel/batches/:id` (AC: 1)
  - [ ] 1.1 Sub-service `apps/api/src/services/flywheel/batch-detail.ts`: batch (status, faalreden uit `gateResults`, gemeten delta, meest getroffen klassen) + kandidaten (status, T3777-code, cropPath, evidence-contract: scores, methode, bron-GTIN/bestand/bbox, declaratie-uitkomst) + per kandidaat de actieve referentie(s) van dezelfde T3777-code voor de vergelijkingsweergave. 404 bij onbekende id.
  - [ ] 1.2 Crop- en referentiebeelden via de bestaande beeld-serveerroute(s) — volg het patroon van het reviewstation (`artworkReviewService.ts::fetchReviewItemCropUrl/Blob`); geen nieuwe MinIO-logica in de web-app.
- [ ] 2. Endpoint `POST /api/v1/flywheel/candidates/:id/decision` (AC: 2, 3)
  - [ ] 2.1 Payload `{ decision: 'afkeuren' | 'vrijgeven' }` (+ undo, zie taak 4). **Conditional update (AD-16):** `UPDATE ... WHERE status='in_batch'`; 0 rows affected → 409/conflict, nooit overschrijven. Elke overgang logt oude+nieuwe status in evidence (AD-13), met `request.user` als beslisser.
  - [ ] 2.2 **409-regel (AD-16):** kandidaten in een batch **in verwerking** (kandidaat `in_batch` én batch-status `pending`) → HTTP 409 met duidelijke NL-foutmelding. Beslissen kan alleen op kandidaten van een afgesloten batch (status ≠ `pending`, i.c. `quarantined`).
  - [ ] 2.3 **Afkeuren:** status `in_batch → rejected` (reden `quarantaine-afkeuring`) + `hard_negatives`-INSERT met de **bestaande** `contentHash` van de kandidaat (canonieke AD-14-hash, al bij nominatie opgeslagen — géén nieuwe `/ml/phash`-aanroep, géén Node-hash) + gold-set-aanwas via de **herbruikbare 14.1-service-functie** (VALS-record met crop-verwijzing, T3777-code, bron `quarantaine`, beslisser) — geen duplicaatlogica (14.1 AC: "quarantaine-beoordelingen gebruiken dezelfde aanwas-route").
  - [ ] 2.4 **Vrijgeven:** status `in_batch → candidate` (expliciete AD-16-overgang "vrijgave"). Het endpoint bundelt níets en enqueue-t hoogstens werk; de nachtelijke `flywheel-promotion`-run pakt de kandidaat op (AD-15). `promotionBatchId` wordt losgekoppeld conform de claim-semantiek (kandidaat mag in hoogstens één niet-afgesloten batch zitten).
- [ ] 3. FlywheelBatchDetailPage — master-detail (AC: 1)
  - [ ] 3.1 `apps/web/src/pages/FlywheelBatchDetailPage.tsx`, route `/flywheel/batches/:id` (lazy, binnen de FlywheelThemeProvider-scope uit 15.1); `getSelectedKey` in AppLayout houdt het nav-item actief (15.1-taak).
  - [ ] 3.2 Kandidatenlijst links (±320px vast): miniatuur, T3777-code, statusbadge (`te beoordelen` amber / `vrijgegeven` groen / `afgekeurd` neutraal grijs — géén rood); bovenaan batchvoortgang "3 van 8 beoordeeld" + voortgangsbalk; beoordeelde kandidaten blijven zichtbaar met hun badge. Onder 1280px: lijst → detail (push-navigatie).
  - [ ] 3.3 Bewijspaneel rechts (`{components.evidence-panel}`): crop naast actieve referentie van dezelfde T3777-code (twee even grote beeldvakken, kader, caption); scoreblok (antd Descriptions: match-confidence vs. promotiedrempel); declaratieblok (GTIN, GLN, gedeclareerde codes met de gematchte code gemarkeerd); poort-uitkomsten als badge-rij (dot groen bij gehaald, amber bij de check die blokkeerde).
  - [ ] 3.4 Kopregel: faalreden van de batch als tekst + amber badge ("wacht op jouw beoordeling"-toon, nooit fout-framing).
- [ ] 4. Sneltoetsen reviewstation-conform (AC: 1)
  - [ ] 4.1 Volg exact het patroon van `MobileReviewDeck.tsx:363-410`: `window.addEventListener('keydown')`, typing-guard (INPUT/TEXTAREA/contentEditable → negeren), meta/ctrl/alt → negeren, `e.preventDefault()` per afgehandelde toets, open modal/paneel bezit het toetsenbord (Esc sluit).
  - [ ] 4.2 Toewijzing: `A` = vrijgeven (accepteren), `R` = afkeuren, `U` = laatste beslissing op de huidige kandidaat ongedaan maken, `←`/`→` = vorige/volgende kandidaat, `Esc` = modal/paneel sluiten. Compacte sneltoetsen-legenda in de detail-footer (EXPERIENCE.md Interaction Primitives).
  - [ ] 4.3 **Undo (`U`) server-side:** ongedaan maken van een zojuist genomen beslissing = spiegel van het 14.1-undo-patroon — bij afkeuring: `hard_negatives`-rij verwijderen, gold-set-record vervangen via `replacedById` (14.1-service), status via conditional update terug naar `in_batch`; bij vrijgave: `candidate → in_batch` terug, mits de kandidaat nog niet door een worker-run geclaimd is (anders 409 + toast). Implementatie als `decision: 'undo'` op hetzelfde endpoint of apart sub-pad — keuze documenteren in het Dev Agent Record.
- [ ] 5. Auto-advance + beslis-feedback (AC: 4)
  - [ ] 5.1 Na elke individuele beslissing springt de selectie automatisch naar de **volgende onbeoordeelde** kandidaat (auto-advance; EXPERIENCE Component Patterns bindend); directe badge-feedback op de beoordeelde kandidaat; feedback via `aria-live="polite"`.
  - [ ] 5.2 Faalpad: opslaan mislukt → toast "Beslissing niet opgeslagen — opnieuw proberen", kandidaat behoudt `te beoordelen`, dezelfde toets herhaalt de actie (Key Flow 1-faalpad).
- [ ] 6. Batch afsluiten (AC: 4)
  - [ ] 6.1 Footer-actie "Batch afsluiten", pas enabled zodra álle kandidaten beoordeeld zijn.
  - [ ] 6.2 Samenvattingsmodal: "N afgekeurd → hard-negative; M vrijgegeven → nieuwe promotiebatch, gaat opnieuw door de kwaliteitspoort." Bevestigen → server-side `closedAt` op de batch zetten (status blijft `quarantined` voor herleidbaarheid; `closedAt` markeert de afhandeling — implementatie-noot hieronder) → terugnavigatie naar `/flywheel` waar de quarantainetabel de batch niet meer als openstaand toont.
- [ ] 7. Toegankelijkheid (AC: 1)
  - [ ] 7.1 Pijltjestoetsen binnen de kandidatenlijst; Tab tussen lijst, bewijspaneel en actieknoppen; geselecteerde kandidaat krijgt `aria-selected` en wordt in beeld gescrold (`scrollIntoView`); zichtbare teal focus-ring op elk interactief element (UX-DR9, Accessibility Floor — bindend).
- [ ] 8. Tests (zie Testrichtlijnen)
  - [ ] 8.1 API: decision-endpoint — conditional-update-races (0 rows → conflict), 409 op `pending`-batch, afkeuren schrijft hard-negative + roept 14.1-aanwasservice aan (gemockt), vrijgeven zet `candidate` en draait géén poortcode (assert: geen ml-client-calls), undo-paden, 404 op onbekende batch.
  - [ ] 8.2 Web: component-tests — sneltoetsen incl. typing-guard, auto-advance naar volgende onbeoordeelde, "Batch afsluiten" disabled tot alles beoordeeld, samenvattingsmodal-tekst, faalpad-toast, aria-selected + scrollIntoView.
- [ ] 9. versions.md (NL) in DEZELFDE commit; Engelse commitmessage.

## Dev Notes — Developer Context

### Wat er AL bestaat (hergebruiken, niet herbouwen)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Sneltoetsen-patroon reviewstation | `apps/web/src/components/review/MobileReviewDeck.tsx:363-410` — keydown-handler met typing-guard (`tgt.tagName === 'INPUT'/'TEXTAREA'/isContentEditable`), picker-owns-keyboard, A/R/L/U/pijltjes, undo = zelfde keuze nogmaals | Het bindende voorbeeld voor taak 4 — zelfde spiergeheugen (EXPERIENCE.md Interaction Primitives). L (relabel) bestaat hier niet; Esc sluit modal. |
| Crop-beelden ophalen | `apps/web/src/services/artworkReviewService.ts:53-95` (`fetchReviewItemCropUrl`, `fetchReviewItemCropBlob`) | Patroon voor beeld-URLs in het bewijspaneel. |
| Kandidaat-status-machine + conditional updates | Story 13.2/13.4 (`apps/api/src/services/flywheel/`, AD-16) | Overgangen `in_batch → rejected` en `in_batch → candidate` bestaan als service-functies; endpoint hergebruikt die, herimplementeert ze niet. |
| Gold-set-aanwas-service (herbruikbaar) | Story 14.1 (`apps/api/src/services/flywheel/gold-set*.ts`) — expliciet ontworpen zodat quarantaine-beoordelingen dezelfde route aanroepen; incl. undo-patroon (replacedById + hard_negative-delete) | Taken 2.3 en 4.3. Duplicaatlogica is een review-finding. |
| `hard_negatives` (contentHash uniek, reason, evidence) | Story 13.2-migratie, Structural Seed | INSERT bij afkeuring; `contentHash` komt van de kandidaat-rij (AD-14-hash al aanwezig — nooit zelf hashen). |
| `promotion_batches.gateResults` / faalreden / `closedAt?` | Story 13.4/13.5 | Bron voor kopregel + poort-uitkomsten-badges; `closedAt` voor "Batch afsluiten". |
| Theming-scope + route-conventie | Story 15.1 (`FlywheelThemeProvider`, lazy routes in `App.tsx:95-166`) | FlywheelBatchDetailPage valt binnen dezelfde ConfigProvider-scope. |
| Audit-identiteit | `apps/api/src/middleware/auth.ts:70,126` (`request.user`) | Beslisser in evidence en gold-set-record. |
| v1-route-registratie | `apps/api/src/main.ts:125-135` | Endpoints landen in het bestaande `api/v1/flywheel.ts` uit 15.1/15.2. |

### Wat er NIEUW is (de eigenlijke story)

1. `GET /api/v1/flywheel/batches/:id` + sub-service `batch-detail.ts`.
2. `POST /api/v1/flywheel/candidates/:id/decision` (afkeuren/vrijgeven/undo; 409-regel; conditional updates; hard-negative + 14.1-aanwas).
3. `apps/web/src/pages/FlywheelBatchDetailPage.tsx` + componenten (`CandidateList.tsx`, `EvidencePanel.tsx`, sneltoetsen-hook) in `apps/web/src/components/flywheel/`.
4. "Batch afsluiten"-flow met samenvattingsmodal + `closedAt`.

**Géén nieuwe Prisma-migratie** — alle tabellen/kolommen (incl. `closedAt`) komen uit Epic 13 (ARCH-2 niet van toepassing; controleer bij implementatie dat `closedAt` in de 13.4-migratie zit — zo niet, dan is dat een expliciet af te stemmen migratie-moment met gebruikers-toestemming, nooit stilzwijgend).

### Bindende UX-gedragsregels (DESIGN.md + EXPERIENCE.md)

- **Auto-advance is bindend** (Component Patterns, bewijspaneel): "Beslissing (afkeuren/vrijgeven) selecteert automatisch de volgende onbeoordeelde kandidaat — kandidaat-voor-kandidaat-ritme zoals het reviewstation."
- **Sneltoetsen inactief terwijl een invoerveld focus heeft** (reviewstation-conventie); open modal bezit het toetsenbord; legenda in de detail-footer.
- **Kleursemantiek (UX-DR5):** `te beoordelen` amber, `vrijgegeven` groen, `afgekeurd` **neutraal grijs — géén rood** (afkeuren is regulier werk, geen fout); poort-uitkomst-dots groen/amber; nergens rood op deze pagina.
- **Toon:** faalreden feitelijk ("gold-set-regressietest: precisiedaling −1,8 pt"), quarantaine = "wacht op jouw beoordeling".
- **Accessibility Floor (UX-DR9):** `aria-selected` + `scrollIntoView` in de kandidatenlijst; beslis-feedback `aria-live="polite"`; zichtbare focus-states; status nooit via kleur alleen (badge = dot/icoon + tekst).
- **Verboden:** hover-only affordances, modal-stapels dieper dan één niveau, beslisacties zonder zichtbare uitkomst.
- Master-detail: lijst ±320px vast links, bewijspaneel flexibel rechts; onder 1280px lijst → detail.

### Guardrails (voorkom bekende fouten)

- **Nooit poortlogica in het request-pad (AD-15)** — vrijgave die zelf een batch aanmaakt, guardrails draait of promoveert is de kapitale fout van deze story. Uitsluitend de flywheel-worker instantieert batches.
- **Conditional updates, nooit blind overschrijven (AD-16)** — `UPDATE ... WHERE status = <verwacht>`; 0 rows = conflict melden. Voorkomt dat dashboard-decision en batch-job elkaars beslissing overschrijven (adversarial F4).
- **Hard-negative uitsluitend hier en in 14.1** (menselijke afkeuring, AD-12); de kandidaat-`contentHash` hergebruiken — geen nieuwe hash-berekening, zeker geen Node-hash (AD-14).
- **14.1-service hergebruiken** voor gold-set-aanwas én undo — geen tweede aanwas-implementatie.
- **Glossary exact** (PRD §3): "hard-negative", "kwaliteitspoort", "promotiebatch", "kandidaat-referentie".
- **Geen migraties zonder expliciete toestemming**; e2e buiten de stable-subset-gate; commits Engels + `versions.md` (NL) in DEZELFDE commit.

### Testrichtlijnen

- Web: vitest + jsdom, colocated `FlywheelBatchDetailPage.test.tsx` + componenttests, patroon `ArtworkReviewPage.test.tsx`; keyboard-events via `fireEvent.keyDown(window, …)` incl. typing-guard-case (focus in input → geen actie).
- API: vitest, `apps/api/src/__tests__/` — race-scenario's op de status-machine expliciet testen (parallelle beslissing, worker-claim tijdens undo).

### Project Structure Notes

- Pagina flat in `apps/web/src/pages/` (conventie 15.1); herbruikbare delen in `components/flywheel/`.
- API-endpoints in `apps/api/src/api/v1/flywheel.ts` (dun), logica in `apps/api/src/services/flywheel/` (Consistency Conventions, Source-tree spine).

### References

- [Source: _bmad-output/planning-artifacts/epics-vliegwiel.md#Story-15.3] — AC's; bronnen FR-18, AD-15, AD-16, UX-DR4, UX-DR9.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-logoRecognition-2026-07-02/EXPERIENCE.md#Component-Patterns] — bewijspaneel/auto-advance, kandidatenlijst, batch afsluiten; #Interaction-Primitives (A/R/U/pijltjes/Esc, typing-guard, legenda); #Accessibility-Floor; #Key-Flows Flow 1 (incl. faalpad).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-logoRecognition-2026-07-02/DESIGN.md#Components] — evidence-panel, status-badge (kleuren per kandidaatstatus), batch-table.
- Visuele referentie: `_bmad-output/planning-artifacts/ux-designs/ux-logoRecognition-2026-07-02/mockups/mock-quarantaine.html`.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-logoRecognition-2026-07-02/ARCHITECTURE-SPINE.md#AD-12, #AD-14, #AD-15, #AD-16] — afwijzingsredenen-splitsing, canonieke hash, worker-only batching + 409-regel, status-machine.
- Story-afhankelijkheden: 13.2 (status-machine, contentHash), 13.4 (batches, worker), 14.1 (aanwas-service + undo-patroon), 15.1 (casco), 15.2 (quarantainetabel als ingang).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (implement-sprint, epic/vliegwiel-15).

### Completion Notes

- **Undo-implementatie (taak 4.3 keuze):** `decision: 'undo'` op hetzelfde endpoint `POST candidates/:id/decision` (geen apart sub-pad). De service spiegelt het 14.1-undo-patroon: afkeuring-undo verwijdert de hard-negative + trekt het gold-set-record in via self-tombstone (`withdrawGoldSetRecord`) + status terug naar `in_batch`; vrijgave-undo herstelt `candidate → in_batch` en herkoppelt de oorspronkelijke batch via de bewaarde `evidence.undoBatchId` (mits de worker de kandidaat nog niet claimde, anders 409).
- **Batch afsluiten:** `closedAt` gezet op de batch; status blijft `quarantined` (herleidbaarheid) — de openstaande-quarantainetabel filtert al op `closedAt IS NULL` (15.2), dus de batch verdwijnt vanzelf.
- **Geen migratie:** `promotion_batches.closedAt` zit al in de 13.4-migratie (schema regel 672 geverifieerd).
- **Declaratieblok-velden** (`declaredCodes`/`gln`) zitten nog niet in het nominatie-evidence-contract; het bewijspaneel leest ze defensief en valt terug op de gematchte code met ✓ (zie review-15-3.md L1).
- **Beeld-serveerroute** toegevoegd: `GET candidates/:id/crop` (patroon reviewstation-crop); referentiebeeld hergebruikt de bestaande `reference-logos/code/:code/image`.

### File List

**Nieuw (API):** `apps/api/src/services/flywheel/batch-detail.ts`, `apps/api/src/services/flywheel/candidate-decision.ts`, `apps/api/src/services/flywheel/batch-close.ts` · tests `apps/api/src/__tests__/services/flywheel-candidate-decision.test.ts`, `apps/api/src/__tests__/services/flywheel-batch-detail.test.ts`, `apps/api/src/__tests__/api/flywheel-batch-detail.routes.test.ts`.
**Nieuw (web):** `apps/web/src/pages/FlywheelBatchDetailPage.tsx`, `apps/web/src/components/flywheel/CandidateList.tsx`, `apps/web/src/components/flywheel/EvidencePanel.tsx`, `apps/web/src/components/flywheel/useCandidateKeyboard.ts`, `apps/web/src/components/flywheel/candidateStatus.ts` · test `apps/web/src/pages/FlywheelBatchDetailPage.test.tsx` (ex-atdd).
**Gewijzigd:** `apps/api/src/api/v1/flywheel.ts` (3 routes + crop-stream), `apps/web/src/services/flywheelService.ts` (batch-detail/decision/close/crop-blob), `apps/web/src/App.tsx` (route `/flywheel/batches/:id`), `apps/web/src/pages/FlywheelPage.tsx` (onOpenBatch → navigatie), `apps/web/src/pages/FlywheelPage.test.tsx` (drawer→navigatie), `versions.md`.
**Artefacten:** `review-15-3.md`, `ac-trace-15-3.md`.

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) uit epics-vliegwiel.md Epic 15, sneltoetsen-patroon geverifieerd op MobileReviewDeck.tsx:363-410.
- 2026-07-03: Geïmplementeerd (implement-sprint). API-decision-endpoint + batch-detail + batch-close, master-detail-pagina met sneltoetsen/auto-advance, onOpenBatch-koppeling. 35 API- + 11 web-tests. Migratie-vrij. Status → done.
