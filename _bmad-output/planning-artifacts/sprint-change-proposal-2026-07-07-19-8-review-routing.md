# Sprint Change Proposal — Story 19.8 review-routering (2026-07-07)

Auteur: Dev (correct-course) · Aanleiding: code-review-blokker op Story 19.8 · Modus: batch

## 1. Issue-samenvatting

Story 19.8 (fase-1 twee-traps-bootstrap) wilde de crops die het vliegwiel in een lege keurmerkklasse vindt naar de **menselijke review-wachtrij** sturen door ze te nomineren met herkomst `origin: 'review'` (die de 0,90-auto-promotie-drempel omzeilt). De implementatie (Tasks 1–5) is af, tsc 0, api-suite 879 groen.

**De code-review (3 adversariële lagen + zelf-verificatie tegen live-code) weerlegde de kern-aanname:**

- `nominateCandidate` schrijft de crop in **`reference_candidates`** (`nomination.ts:226`), niet in `artworkReviewItem`.
- De menselijke review-wachtrij (`GET /artwork/review-queue`, `artwork-pipeline.ts:731`) leest **`artworkReviewItem` waar `status:'open'`**; die rijen worden UITSLUITEND door de live-crosscheck aangemaakt (`artwork-crosscheck.ts:164`). Het bootstrap-pad maakt er geen.
- Sub-0,90 kandidaten worden door de drempel-fase van de promotielus telkens VRIJGEGEVEN (`guardrails.ts:164`, geen origin-check) vóór ze een batch-quarantaine (het enige andere menselijke paneel) bereiken.
- **Doorslaggevend:** herkomst `review` is een **UITKOMST** van menselijke review, geen ingang. De accept-handler (`/artwork/review-items/:id/accept`, `artwork-pipeline.ts:1087,1119`) schrijft ná menselijke bevestiging een gold-set ECHT-record (`source:'review-accept'`) **én** nomineert de crop met `origin:'review'`. Story 19.8 gebruikte het mechanisme dus achterstevoren.

**Gevolg van de huidige implementatie:** de bootstrap-crops belanden als wees-`candidate` in `reference_candidates`, bereiken geen mens, promoveren nooit, en de `gevuld`-poort (`classHasConfirmedEchtCrop`, telt review-accept-records) gaat nooit open → het straaltje wordt nog steeds niet ontstopt; de dure ml-search draait elke aggregatie-cyclus opnieuw. Een deploy had er "werkend" uitgezien maar 0 crops bij een mens gebracht (vergelijkbaar met de 19.4-no-op).

## 2. Impactanalyse

- **Epic-impact:** Epic 19 (gerichte brandstofselectie). Het twee-traps-CONCEPT blijft geldig; alleen het fase-1-routeringsmechanisme is fout.
- **Story-impact:**
  - **19.8** — herzien (aanpak + ACs). Behoud: de AC5-status-orkestratie-fix. Vervang: de herkomst-routering-als-mechanisme.
  - **19.9** (fase-2 ranking) — ONGEWIJZIGD in doel; wint zelfs: de bevestigde ECHT-crops (review-accept gold-records) zijn exact de brandstof die 19.9's nearest-reference-ranking gebruikt.
- **Artefact-conflicten:** geen PRD/architectuur-wijziging nodig — de correctie hergebruikt bestaande infra (review-queue-UI, accept/reject-handlers, gold-set, de legitieme origin-`review`-nominatie). De story-afbakening "geen nieuwe review-infra" was gebaseerd op de weerlegde aanname en wordt bijgesteld naar "hergebruik de bestaande review-queue".
- **Technische impact:** het crop-producerende kernpad (`searchAndNominateClass`, beide callers = lege-klasse) schakelt van "nomineren" naar "een OPEN `artworkReviewItem` aanmaken" (met hard-negative/dedup-guard). Geen nieuwe UI, geen nieuwe accept/reject-logica.

## 3. Aanbevolen aanpak — Directe aanpassing (re-scope 19.8)

Het lege-klasse-bootstrap-/sampler-pad maakt per gevonden crop een **`artworkReviewItem(status:'open')`** aan (dezelfde vorm als de crosscheck: gtin, t3777Code, bbox, confidence=seed_cosine, method, cropPath, sourceFile, reason-tag bv. `bootstrap-lege-klasse`), i.p.v. `nominateCandidate(origin:'review')`. De crop verschijnt dan in de bestaande `/artwork/review-queue`; de mens keurt ECHT/VALS; bij accept doet de bestaande handler de rest (gold-set ECHT + origin-`review`-nominatie → echte referentie). De `gevuld`-poort gaat dan wél open.

- **Effort:** modest (hergebruik; ~½–1 dag dev-story). **Risico:** laag (geen nieuwe infra; bestaande accept/reject-paden bewezen). **Timeline:** past binnen de sprint; deblokkeert 19.9.
- **Waarom deze i.p.v. rollback/MVP-review:** het concept klopt; alleen het mechanisme moet om. Geen scope-reductie nodig.

## 4. Gedetailleerde wijzigingsvoorstellen (Story 19.8)

### Aanpak-afbakening (vervangt de oude "herkomst-routering")
De fix is **niet** een herkomst-wissel maar een **doel-wissel**: lege-klasse-crops worden als OPEN review-items in de bestaande `/artwork/review-queue` geplaatst. Herkomst `review` blijft wat het is — de UITKOMST van een menselijke accept (ongewijzigd).

### Herziene Acceptatiecriteria
1. **Given** een gevonden bootstrap-crop in een lege klasse (confidence tussen zoekdrempel 0,60 en 0,90) **When** het lege-klasse-pad draait **Then** wordt de crop als **OPEN `artworkReviewItem`** (reason-getagd) in `/artwork/review-queue` geplaatst — niet direct genomineerd en niet geskipt — zodat een mens hem ECHT/VALS beoordeelt (waar het vóór 0 bereikte).
2. **Given** dezelfde crop **When** het pad draait **Then** blijven de kleppen gelden: declaratie-guard (upstream, 19.5), **hard-negative-blokkade** (crops waarvan de inhouds-hash ∈ `hard_negatives` worden NIET opnieuw voorgelegd) en **dedup** (crops die al een open/geaccepteerd review-item, bestaande kandidaat of actieve referentie zijn, worden overgeslagen). Een eerder door een mens afgekeurde crop verschijnt niet opnieuw.
3. **Given** een mens keurt een voorgelegde crop **When** accept/reject **Then** doet de BESTAANDE handler het werk ongewijzigd: accept → gold-set ECHT (`review-accept`) + origin-`review`-nominatie → echte referentie; reject → hard-negative. Geen nieuwe accept/reject-infra.
4. **Given** de wijziging **When** de testsuite draait **Then** dekt een test: (a) crop → OPEN review-item (niet `nominateCandidate`); (b) hard-negative/duplicaat → overgeslagen; (c) caller-pad (`processClass` + sampler) maken review-items; (d) statusorkestratie. `tsc --noEmit` 0; api-suite groen.
5. **Given** een lege klasse **When** de bootstrap-run z'n status bepaalt **Then** wordt de klasse `gevuld` alléén bij ≥1 bevestigde **echte brandstof** — ≥1 mens-bevestigde ECHT-crop (gold-set `review-accept`/`review-annotate`) **OF** ≥1 actieve `flywheel-promotion`-referentie — anders `leeg`/`wacht-op-review` (bootstrapbaar). (Behoudt + verbreedt de bestaande AC5-fix; adresseert code-review Edge Case #2 / Auditor AC3.)

### Te behouden uit de huidige implementatie
- De AC5-status-orkestratie in `processClass` + helper `classHasConfirmedEchtCrop` — **verbreden** zodat óók ≥1 actieve `flywheel-promotion`-referentie als "gevuld" telt (niet alleen mens-ECHT).
- De `wacht-op-review`-emptyReason (nuttig voor transparantie/live-verificatie).

### Te herzien/terugdraaien
- De default-flip `origin: 'bootstrap' → 'review'` in `searchAndNominateClass` + het weghalen van de caller-overrides: **terugdraaien** als primair mechanisme. Het crop-producerende kernpad schakelt van `nominateCandidate` naar review-item-creatie voor de lege-klasse-callers.
- Bijbehorende tests (origin-assertions) → herschrijven naar review-item-assertions.

### Secundaire code-review-punten (meenemen in de dev-story)
- Evidence-semantiek (Blind Hunter #4): n.v.t. zodra het pad geen `origin:'review'` meer forceert op ongevette crops — de origin-`review`-nominatie ontstaat pas ná menselijke accept (correct).
- `emptyReason` voor afgekapte/getimede runs (Blind Hunter #6): overweeg een `afgekapt`-reden i.p.v. `geen-vondsten` bij `truncated/timed_out`.
- Niet-tautologische tests (Blind Hunter #5): test dat een crop daadwerkelijk als OPEN review-item verschijnt (niet enkel een gemockte count).

## 5. Implementatie-handoff

- **Scope-classificatie:** **Moderate** — re-scoped story, hergebruik bestaande infra, geen PRD/architectuur-replan.
- **Route:** na goedkeuring → **dev-story op de herziene 19.8** (RED-tests herschrijven → groen → api-suite + tsc 0 → code-review). Daarna, met expliciet akkoord per geval: commit+push acc (auto-deploy) + live-verificatie (crops verschijnen in `/artwork/review-queue` waar het vóór 0 was).
- **Succescriterium:** een sampler-/bootstrap-run levert ≥1 OPEN review-item in `/artwork/review-queue` voor een lege klasse; een menselijke accept produceert een gold-set ECHT-record + referentie; de klasse gaat pas dán `gevuld`.
