# Story 12.13: Rate-limit-afwijzing → 429 i.p.v. 500 + thumbnail-flood ontlasten

Status: done

<!-- BUGFIX-story. Ontdekt 2026-07-13 tijdens het 12.12-labelwerk: Friso's `PATCH /artwork/review-items/:id/accept` gaf HTTP 500. Read-only byte-identiek gereproduceerd: GEEN accept/registratie-bug, maar de globale rate-limiter die bij overschrijding een generieke 500 INTERNAL_ERROR teruggeeft i.p.v. 429, aangewakkerd door de review-UI die tientallen thumbnails tegelijk laadt. Scope-keuze Friso 2026-07-13: "429 + flood verlichten" (niet enkel 429; niet ook de UI-lazy-load). -->

## Story

Als **datamanager die de review-wachtrij gebruikt (o.a. het 12.12-Nutri-Score-labelwerk)**
wil ik **dat de API bij een overschreden snelheidslimiet een nette 429 teruggeeft in plaats van een verwarrende 500, én dat het normale reviewen (dat per pagina-open tientallen keurmerk-thumbnails bulk-laadt) niet onterecht mijn verzoeklimiet opsoupeert**
zodat **ik review-items kan accepteren/labelen zonder valse serverfouten, en een echte overbelasting nog steeds correct wordt afgeremd (429), niet als 500 wordt gemaskeerd**.

### Afbakening (kritiek)
- **Dit is een BUGFIX in de API-laag** (`apps/api`), géén ML-/vliegwiel-wijziging. Raakt `apps/api/src/main.ts` (rate-limit-registratie), `apps/api/src/middleware/errorHandler.ts` (429-afhandeling) en de hoog-fanout read-only thumbnail-route(s) in `apps/api/src/api/v1/reference-logos.ts`.
- **Scope (besluit Friso 2026-07-13): "429 + flood verlichten".** WÉL: (1) de rate-limit-afwijzing als correcte **429** teruggeven; (2) de hoog-fanout GET-thumbnail-endpoints het limiet-budget niet meer laten opeten (uitzonderen van de limiter en/of de limiet passend ophogen). NIET in deze story: de frontend de thumbnails lui/gebatcht laten laden (aparte, grotere story); en niet de aparte "errorHandler onderdrukt stacktrace"-verbetering (los diagnostisch punt).
- **Geen versoepeling van de beveiliging:** de limiter moet echte bursts (met name schrijf-endpoints / auth) blijven afremmen. Alleen aantoonbaar goedkope, read-only, hoog-fanout GET-image-routes worden uitgezonderd/verruimd — de limiet niet globaal uitschakelen.
- **Read-only reproductie bewees de oorzaak** (byte-identieke 500-body met `x-ratelimit-limit:100`, `remaining:0`, `retry-after`); dit is de *input*, de fix gaat via deze BMAD-story.

## Oorzaak (bewezen, als context voor de dev)
- `main.ts:77-86` registreert `@fastify/rate-limit` **globaal** (`max = RATE_LIMIT_MAX||100`, `timeWindow = RATE_LIMIT_WINDOW||60000` = 60s, per-IP). De `errorResponseBuilder` retourneert een body-object **zonder `statusCode`**.
- `middleware/errorHandler.ts:39` zet `statusCode = error.statusCode || 500`. De rate-limit-afwijzing bereikt de globale error-handler **zonder** `statusCode === 429` → valt in de default **500** met `code:'INTERNAL_ERROR'`, `message:'An unexpected error occurred'`. De correcte 429-tak (`errorHandler.ts:64`) vuurt daardoor nooit; de rate-limit-plugin zet wél nog de `x-ratelimit-*`/`retry-after`-response-headers via zijn hook → 500 mét die headers (precies Friso's symptoom).
- **Aanjager:** de review-UI bulk-laadt bij het openen van de wachtrij ~40+ `GET /reference-logos/code/:code/image`-thumbnails tegelijk (`reference-logos.ts:290`) → het per-IP-budget van 100/60s is snel op → de daaropvolgende accept-`PATCH` wordt afgewezen (nu als 500). Deterministisch reproduceerbaar (18:49, 19:02, 19:07).

## Acceptatiecriteria

1. **429 i.p.v. 500 bij limiet-overschrijding**
   **Given** de rate-limiter is overschreden (meer dan `max` verzoeken binnen `timeWindow` vanaf één client)
   **When** een volgend verzoek binnenkomt
   **Then** antwoordt de API met **HTTP 429** en body `code: 'RATE_LIMIT_EXCEEDED'` + een duidelijke "te veel verzoeken"-melding, met de `retry-after`/`x-ratelimit-*`-headers — NIET met 500/`INTERNAL_ERROR`. De 429-tak in de error-handler (of een equivalente route) vuurt aantoonbaar.

2. **Thumbnail-bulklaad eet het budget niet meer op**
   **Given** het normaal openen van de review-wachtrij, dat tientallen `GET /reference-logos/code/:code/image`-thumbnails (en de eventuele sibling-image-GET's die de review-UI in bulk laadt) afvuurt
   **When** de datamanager daarna een `PATCH .../accept` (of een andere normale actie) doet
   **Then** wordt die actie NIET meer als 429/500 afgewezen door de limiter bij normaal gebruik — doordat die hoog-fanout, read-only image-GET's van de teller zijn uitgezonderd (bijv. per-route `config.rateLimit: false`) en/of de limiet passend is opgehoogd. Meetbaar: een realistische review-sessie (pagina openen → item accepteren) loopt niet meer tegen de limiet.

3. **Echte overbelasting blijft afgeremd (geen beveiligingsregressie)**
   **Given** een echte burst op schrijf-/auth-/niet-uitgezonderde endpoints
   **When** die de limiet overschrijdt
   **Then** wordt die nog steeds afgeremd met 429. De limiter is NIET globaal uitgeschakeld; alleen de aangewezen goedkope read-only image-routes zijn uitgezonderd/verruimd. Overige error-afhandeling (400/401/403/404/413/415) blijft ongewijzigd.

4. **Tests (regressiebestendig)**
   **Given** de wijziging
   **When** de tests draaien
   **Then** dekken ze: (a) overschrijding → 429 + `RATE_LIMIT_EXCEEDED` (niet 500); (b) een uitgezonderde thumbnail-route telt niet mee / wordt niet gelimiteerd bij bulk-fanout; (c) een niet-uitgezonderd endpoint wordt nog wél gelimiteerd (429); (d) de bestaande error-handler-mappings (400/404/etc.) blijven intact.

## Tasks / Subtasks
- [ ] 1. **429 borgen (AC: 1, 3)** — zorg dat de rate-limit-afwijzing als 429 uitkomt. Onderzoek het mechanisme in `@fastify/rate-limit` (waarom `error.statusCode` geen 429 is bij de globale error-handler): kies de robuuste route — óf de rate-limit-error herkennen in `errorHandler.ts` (bijv. op `error.code`/`FST_ERR_RATE_LIMIT` of via de plugin-eigen 429-afhandeling zónder de globale handler) en `statusCode=429` forceren, óf de plugin zo configureren dat hij zijn eigen 429-response levert (en de custom `errorResponseBuilder` de juiste statusCode meegeeft). Behoud de `x-ratelimit-*`/`retry-after`-headers.
- [ ] 2. **Thumbnail-flood ontlasten (AC: 2, 3)** — zonder de globale limiter uit te schakelen: zonder de hoog-fanout read-only image-GET's uit van de teller (per-route `config: { rateLimit: false }` op `GET /reference-logos/code/:code/image` en de eventuele sibling-image-GET's die de review-UI in bulk laadt — inventariseer welke dat zijn) en/of hoog de default-limiet passend op. Motiveer de keuze (uitzonderen vs verruimen) in de story-notes; leun naar uitzonderen van de specifieke goedkope image-routes zodat de mutatie-/auth-bescherming intact blijft.
- [ ] 3. **Tests (AC: 4)** — voeg api-vitest-tests toe voor AC1/AC2/AC3 (overschrijding→429; uitgezonderde route ongelimiteerd; niet-uitgezonderd endpoint wél 429; error-mappings intact). Volg het bestaande api-testpatroon (`apps/api/src/__tests__/...`).
- [ ] 4. **Verificatie + rapport (AC: 1-4)** — `tsc --noEmit` 0 + volledige api-vitest groen (zelf draaien). Kort notitieblok in de story Dev-notes met de gekozen aanpak (429-route + uitzonderen vs verruimen). GEEN deploy in deze story (die is permission-gated bij Friso).

## Dev Notes — Developer Context
### Bestanden (bestaand — wijzig gericht)
- `apps/api/src/main.ts:77-86` — `@fastify/rate-limit`-registratie (globaal). Hier komen de per-route-uitzondering/allowList/limietkeuzes en/of de correcte 429-config.
- `apps/api/src/middleware/errorHandler.ts:20-104` — globale `setErrorHandler`. Regel 39 `statusCode = error.statusCode || 500`; regel 64 heeft al een `if (statusCode === 429)`-tak die nu niet vuurt omdat de rate-limit-error geen 429-statusCode draagt. Logt al `stack` (regel 35) — de "stack ontbreekt"-observatie is een los diagnostisch punt, NIET in scope.
- `apps/api/src/api/v1/reference-logos.ts:283-290` — `GET /reference-logos/code/:code/image` (de hoog-fanout thumbnail-route). Inventariseer of de review-UI nog andere image-GET's in bulk laadt (bijv. review-item-crop-images) en neem die mee in de uitzondering waar terecht.
- Accept-route ter referentie (NIET wijzigen, was niet stuk): `apps/api/src/api/v1/artwork-pipeline.ts:1034` (`PATCH .../accept`).

### Wat behouden moet blijven / niet doen
- Limiter NIET globaal uitschakelen. Auth-rate-limit (`services/auth.ts:185`) en de schrijf-endpoint-bescherming blijven intact.
- Geen wijziging aan het accept/registratiepad (dat werkt correct). Geen ML-/vliegwiel-code.
- Geen ACC-config-write/deploy in deze story (permission-gated).

### Waarom deze aanpak
De 500 is dubbel fout: verkeerde statuscode (429 hoort) én onterecht getriggerd door legitiem bulk-thumbnail-verkeer. Enkel 429 teruggeven (de minimale fix) lost de verwarrende foutcode op maar laat het labelwerk stroef (je blijft de limiet raken); daarom koos Friso "429 + flood verlichten": de image-GET's uitzonderen neemt de wérkelijke oorzaak weg terwijl de beveiliging op de gevoelige endpoints blijft.

### References
- Geheugen: `project_flywheel_resume` (blok "ACTIEVE BUG — accept-500 = rate-limit-misfire").
- Read-only diagnose-bewijs: byte-identieke reproductie (GET ge-hamerd → 42× 500 met identieke `INTERNAL_ERROR`-body + `x-ratelimit-*`-headers na ~100 req/60s).

### Project Structure Notes
- Enkel `apps/api`. Bouwen in een schone worktree; commit code + tests + story→`review` + sprint-status samen (één werk-commit), conform protocol.

## Dev Agent Record
### Agent Model Used
Claude Sonnet 5 (implement-sprint epic-agent, epic-12 story 12.13)

### Debug Log References
- Root cause confirmed against installed `@fastify/rate-limit@9.1.0` source: the plugin does
  `throw params.errorResponseBuilder(req, respCtx)` (`index.js:261`) where `respCtx.statusCode`
  is `429` (or `403` if banned) — its own `defaultErrorResponse` mirrors this via
  `err.statusCode = context.statusCode`. The app's previous custom `errorResponseBuilder`
  (main.ts) returned a plain body object without `statusCode`, so `errorHandler.ts:39`
  (`error.statusCode || 500`) fell through to 500, and the existing 429-branch
  (`errorHandler.ts:64`) never fired.
- BMAD adversarial code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor, run in
  parallel) on the first implementation surfaced a HIGH finding: the initial fix used
  `config: { rateLimit: false }` on the thumbnail route, which fully removes the only
  throttling this unauthenticated, DB+MinIO+sharp-backed route had — an unbounded
  resource-exhaustion regression, not "geen versoepeling van de beveiliging" (AC3). Fixed by
  switching to a bounded per-route override (`{ max: 300, timeWindow: 60000 }`, 3x the global
  budget) instead of a full bypass; verified the review-UI's actual worst-case bulk fanout is
  80 requests/open (`MobileReviewDeck.tsx` `pickList` is `.slice(0, 80)`, not unbounded).
  Review also flagged the `context.ban ? 403 : 429` branch as unreachable dead code (`ban` is
  never configured on this plugin registration, confirmed default `-1`/disabled in the plugin
  source) and that returning a plain object (not a real `Error`) lost `error.message`/
  `error.stack` fidelity in the errorHandler's log line; fixed by throwing a real `Error` with
  `statusCode = 429` (unconditionally, since ban is unreachable here).
- Gates run by the dev agent itself (not self-reported): `tsc --noEmit` → 0 errors. Full
  `apps/api` vitest suite → 912 passed / 2 skipped / 37 todo / 0 failed (baseline before this
  story: 907 passed; +5 new tests in `rate-limit.routes.test.ts`).

### Completion Notes List
- **429 borgen (AC1, AC3):** fixed in `main.ts`'s `rateLimit` registration — the
  `errorResponseBuilder` now throws a real `Error` with `statusCode = 429` set explicitly
  (mirroring the plugin's own default builder), so the existing `errorHandler.ts:64` 429-branch
  fires and returns `code: 'RATE_LIMIT_EXCEEDED'` instead of falling through to 500
  `INTERNAL_ERROR`. `errorHandler.ts` itself was NOT touched (its 429-branch already existed
  and was correct — the bug was purely in what the plugin was allowed to throw).
- **Thumbnail-flood ontlasten (AC2, AC3) — uitzonderen vs verruimen, gemotiveerd:** chose a
  **bounded per-route override**, not a full exclusion. `GET /reference-logos/code/:code/image`
  now carries `config: { rateLimit: { max: 300, timeWindow: 60000 } }` — 3x the global
  100/60s budget, comfortably covering the review-UI code-picker's actual worst case (80
  rendered thumbnails per picker-open, confirmed via `MobileReviewDeck.tsx`'s `pickList`
  render cap) several times per minute, while still capping sustained abuse. A full
  `config: { rateLimit: false }` bypass was rejected after adversarial review: this route has
  no auth gate (`optionalAuth` never rejects unauthenticated callers) and each hit does a
  Prisma lookup + MinIO download + synchronous `sharp` resize — fully unmetered would trade
  one bug (false-positive 429/500) for another (unauthenticated resource-exhaustion vector).
  Sibling-route inventory: `apps/web/src/services/flywheelService.ts:387`
  (`fetchReferenceCodeImageBlob`) calls the SAME route (already covered); the other
  `<img>` sources in `MobileReviewDeck.tsx` (`cropUrl`, `markedUrl`, `srcUrl`) are
  single-item/lazily-fetched or presigned MinIO URLs that never traverse this API's rate
  limiter, so no additional sibling routes needed the same override.
- **Tests (AC4):** `apps/api/src/__tests__/api/rate-limit.routes.test.ts` (new, 5 tests),
  registering the REAL `referenceLogosRoutes` module (not a stand-in) alongside the real
  `errorHandler`: (1) 429+`RATE_LIMIT_EXCEEDED` (not 500) once a non-excluded route is over
  budget; (2) the thumbnail route survives a realistic 80-request bulk fanout without 429;
  (3) the thumbnail route's own higher budget still trips 429 past 300 requests (proves it's
  bounded, not fully unmetered); (4) the bounded override doesn't leak budget to/from
  non-excluded routes; (5) existing error-handler status mappings
  (400/401/403/404/413/415/429) remain intact.
- **NIET gedaan (bewust, conform scope):** `errorHandler.ts` ongewijzigd; accept-route
  (`artwork-pipeline.ts`) ongewijzigd (`git diff` leeg voor dat bestand); geen ML-/
  vliegwiel-code geraakt; geen ACC-deploy (permission-gated bij Friso — niet uitgevoerd).

### File List
- `apps/api/src/main.ts` — rate-limit `errorResponseBuilder` now throws a real `Error` with
  `statusCode = 429` (was: plain object without `statusCode`, causing 500 masking).
- `apps/api/src/api/v1/reference-logos.ts` — `GET /reference-logos/code/:code/image` gets a
  bounded per-route rate-limit override (`max: 300, timeWindow: 60000`) instead of the global
  100/60s budget.
- `apps/api/src/__tests__/api/rate-limit.routes.test.ts` (new) — AC1-4 regression coverage.

## Change Log
- 2026-07-13: aangemaakt. BUGFIX ontdekt tijdens 12.12-labelwerk: rate-limit-afwijzing komt als 500 `INTERNAL_ERROR` uit i.p.v. 429, aangewakkerd door de review-UI-thumbnail-flood die het per-IP-budget (100/60s) opsoupeert. Scope Friso: 429 + flood verlichten (image-GET's uitzonderen/limiet verruimen), zonder de limiter globaal te versoepelen.
- 2026-07-13: geïmplementeerd + status → review. `main.ts` errorResponseBuilder gooit nu een echte `Error` met `statusCode=429` (in plaats van een plain object zonder statusCode) zodat de bestaande 429-tak in `errorHandler.ts` vuurt. `GET /reference-logos/code/:code/image` krijgt een BEGRENSDE per-route-override (`max:300/60s`, 3x het globale budget) i.p.v. volledige uitzondering — adversarial review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) vond dat `rateLimit:false` de enige bescherming van een niet-geauthenticeerde, DB+MinIO+sharp-route volledig wegnam (onbegrensd misbruik-risico), en dat de `ban`-tak dode code was (ban nooit geconfigureerd) die ook de foutlog-fidelity (message/stack) brak — beide gefixt. Tests: `rate-limit.routes.test.ts` (5 nieuw, AC1-4). Gates: tsc 0, volledige api-vitest 912 passed/2 skipped/0 failed (baseline 907 + 5 nieuw). Story blijft op `review` (geen deploy, permission-gated bij Friso).
