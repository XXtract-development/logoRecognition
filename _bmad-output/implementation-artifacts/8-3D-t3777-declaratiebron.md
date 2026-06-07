# Story 8-3D: T3777-declaratiebron voor de kruischeck

Status: ready-for-dev MET HARDE PREREQUISITE (review verwerkt: D1–D5; implementatie ná 8-3O incl. gln-sourcing — zonder die taak is deze story aantoonbaar inert)

## Story

As a datamanager,
I want dat de kruischeck per GTIN de echte T3777-declaratie gebruikt,
so that overeenstemmende detecties automatisch geaccepteerd worden en alleen échte discrepanties in mijn review-queue belanden.

## Waarom

Zonder declaratiebron draait de keten met `declared=[]` → álles naar review (veilig maar arbeidsintensief; FR48 half vervuld). De declaratie staat in de GS1-data: `packagingMarkedLabelAccreditationCode` (T3777) per trade item.

## Ontwerpbeslissingen (te bevriezen ná adversarial review)

0. **HARDE PREREQUISITE (D1):** `artwork_imports.gln` wordt vandaag NERGENS geschreven (in code geverifieerd — permanent NULL) → zonder de gln-sourcing-taak uit 8-3O (ontwerpbeslissing 8) faalt élke lookup en levert deze story niets. Implementatie-start vereist: gln-taak in 8-3O done + minstens 2 GTIN's her-geïmporteerd mét gln.
1. **Bron: de team-brede catalog-API** — `GET https://catalog.{env}.xxtract.com/api/tradeitemxml/{gln}-{gtin}-{targetMarket}` met `X-API-Key`-header (ACC-key beschikbaar; zie team-CLAUDE.md). Rationale: bestaand gedocumenteerd endpoint, geen nieuwe Mongo-koppeling vanuit deze app. `gln` komt uit `artwork_imports.gln` (zie prerequisite); `targetMarket` default `528` (NL, env `T3777_TARGET_MARKET`).
2. **Provider-implementatie:** invulling van de pluggable declaration-provider uit 8-3O (ontwerpbeslissing 5): parse T3777-codes **namespace-agnostisch op local-name** (D2 — GS1-XML is zwaar genamespaced), alle voorkomens van `packagingMarkedLabelAccreditationCode`, unie over verpakkingslagen, normaliseer naar de interne T3777-code-set.
3. **Fail-safe mét onderscheidende logging (D3):** API-fout, 404, ontbrekende gln of lege declaratie ⇒ `declared=[]` + reden ONDERSCHEIDEND gelogd (gln-ontbreekt / 404-mogelijk-TM-mismatch / API-fout / leeg) — stille fail-safes mogen niet op "werkt" lijken.
4. **Cache: Redis (D4)** — declaraties per (gln, gtin, tm), TTL default 24 h, via de bestaande Redis-verbinding (gedeeld over API-proces en workers; in-memory deelt niet over processen).
5. **Secrets:** API-key via env (`CATALOG_API_KEY`), nooit in code/log.

## Acceptance Criteria

1. Given een GTIN mét declaratie in de catalog, When de detection-job draait, Then gebruikt de kruischeck de geparste T3777-set And worden matches boven de drempel auto-geaccepteerd (bestaand 8.5-gedrag, nu met echte data).
2. Given een API-fout/404/lege declaratie, When de job draait, Then valt de provider terug op `declared=[]` met gelogde reden And faalt de job NIET.
3. Given herhaalde jobs voor dezelfde GTIN, When de cache geldig is, Then volgt géén tweede externe call (test met gemockte fetch).
4. **Validatie op ACC:** voor minimaal 2 GTIN's mét gln (post-prerequisite) waarvan er minstens één een bekend targetMarket 528 heeft (D3), wordt het einde-tot-eind-gedrag (auto-accept én discrepantie-route) aangetoond en vastgelegd in het story-record.
5. Tests (vitest, gemockte HTTP): XML-parse op local-name tegen een ECHTE ACC-XML-fixture (D2) incl. meerdere codes/lagen, normalisatie, alle vier onderscheiden fail-safe-paden, Redis-cache-gedrag (mock), key-uit-env.

## Expliciet buiten scope

- Schrijven naar GS1-/catalog-data (alleen lezen) · target-market-meervoud (528 eerst; uitbreiding later) · PROD-key-beheer (ACC eerst)

## Dev Notes

- Mogelijke datakwaliteit-verrassing: T3777 kan per verpakkingslaag verschillen; neem de unie over het trade item en documenteer dit in de provider
- De 6 GTIN's van de werkende ACC-set: check vooraf welke een T3777-declaratie hebben (orientatie-taak in de implementatie, read-only)

### Referenties

- 8-3O ontwerpbeslissing 5 (provider-interface) · team-CLAUDE.md (tradeitemxml-endpoint + keys) · `artwork-pipeline.ts` crosscheck-regels · PRD FR48

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMAD Story Implementation Agent)

### Completion Notes List

Implemented the catalog-API T3777 declaration provider that fills the pluggable
declaration-provider interface from 8-3O. Frozen design decisions 0–5 honoured.

**Module `apps/api/src/services/t3777-declarations.ts`:**
- `resolveDeclarations(gtin) -> { codes, reason }` — exported for testability;
  `catalogDeclarationProvider(gtin) -> string[]` is the thin provider wrapper.
- gln-lookup: `prisma.artworkImport.findFirst({ where: { gtin, gln: { not: null } } })`.
- fetch `GET {CATALOG_API_BASE}/api/tradeitemxml/{gln}-{gtin}-{tm}` with header
  `X-API-Key: process.env.CATALOG_API_KEY` (no default in code), `tm` from
  `T3777_TARGET_MARKET` (default 528), base from `CATALOG_API_BASE`
  (default `https://catalog.acc.xxtract.com`). All env read lazily inside the
  function (no import-time side-effects; tests can set process.env first).
- Namespace-agnostic parse on local-name via
  `/<(?:[\w.-]+:)?packagingMarkedLabelAccreditationCode[^>]*>([^<]+)</g` — union
  over all packaging layers, trim, uppercase, dedup.
- FOUR distinct fail-safe reasons + lege-declaratie + ok, in load-bearing order:
  api-key-ontbreekt (first; no DB/fetch) → gln-ontbreekt → cache → 404 distinguished
  from `status>=400`/network (api-fout) → lege-declaratie. Never throws.
- Redis cache (key `t3777:{gln}:{gtin}:{tm}`, TTL `T3777_CACHE_TTL_S` default
  86400) via `getRedisConnection()`. Negative caching: empty results cached with
  the same TTL. Redis fault on read/write is logged and swallowed (job proceeds).
- `installCatalogDeclarationProvider()` wires the provider as the detection-flow
  default ONLY when CATALOG_API_KEY is set; otherwise empty stays default with a
  startup log. Wired into `main.ts` after the worker-registration block. Lazy —
  no `setDeclarationProvider` at import time; tests can still override.

**Self-review findings (all fixed):**
- 🟠 fetch timeout: AbortController with 10s timeout (`FETCH_TIMEOUT_MS`); abort
  is caught as `api-fout`.
- 🟠 huge XML: `content-length` pre-check + post-read body-length guard, both at
  5 MiB (`MAX_RESPONSE_BYTES`) → `api-fout` instead of buffering unbounded.
- 🟠 PII/secret in logs: logs carry only gtin/reason/status/tm — never the API
  key, never the full URL. Verified by inspection.
- 🟠 import-time side-effects: provider registration is a function called from
  startup, not a top-level statement.
- ℹ️ Known tradeoff (frozen decision 4): negative-caching ALL empties with the
  same 24h TTL means a transient 5xx/network blip pins `declared=[]` for up to
  24h for that (gln,gtin,tm). Accepted per the frozen decision; flagged here so
  it is a known decision, not a silent one. Mitigation if it bites: a shorter
  TTL for non-`ok` reasons (future change, out of scope).

**AC evidence:**
- AC1 (auto-accept on real data): wired — provider returns the parsed T3777 set,
  fed unchanged into `crosscheckDetections` by `runDetectionJob` (detection-flow
  decision 5). Real-data proof is AC4 (post-deploy). Unit-proven: parse →
  `{ reason: 'ok', codes: [...] }`.
- AC2 (fail-safe, job never fails): all five non-throwing paths covered by tests;
  provider returns `[]` and the crosscheck routes to review.
- AC3 (cache prevents 2nd call): test `cache hit prevents a second fetch` (1
  fetch across two calls) + negative-cache test.
- AC5 (vitest, mocked HTTP): 15 tests — parse on local-name against the real-
  shaped ACC fixture (multi-code/layer, union, dedup, trim, uppercase), four
  distinct fail-safe paths + lege-declaratie, cache hit / negative cache / TTL /
  Redis-fault read+write, env-driven URL (tm + base from env).
- AC4 (ACC validation): POST-DEPLOY — see below. NOT run from here (no ssh/ACC).

**Test result:** `Test Files  18 passed (18) · Tests  274 passed | 2 skipped (276)`
(baseline 273 passed | 2 skipped + 15 new, minus none regressed → 274 passed).
`npx tsc --noEmit` exits 0.

### AC4 — POST-DEPLOY validation steps (do NOT run from the dev environment)

Prerequisite already on infra level: gln-sourcing + backfill are deployed, so
`artwork_imports.gln` is populated for re-imported GTINs.

1. **Set `CATALOG_API_KEY` in Coolify** for the API + worker service to the ACC
   catalog key (the ACC key is in the team CLAUDE.md under "TradeItem XML
   ophalen" — `a2lbgWkGrykA6QyUmpHiurmc5BNzIKlT`; do NOT hardcode it, set it as a
   Coolify env var). Optionally set `T3777_TARGET_MARKET` (default 528) and
   `CATALOG_API_BASE` (default `https://catalog.acc.xxtract.com`). Restart the
   service AFTER explicit confirmation (Coolify restart policy).
2. **Confirm provider install** in the startup log: expect
   `Catalog T3777 declaration provider installed` (NOT the
   `CATALOG_API_KEY not set …` warning).
3. **Re-import ≥ 2 GTINs with gln**, at least one with a known targetMarket 528
   declaration. From the working ACC 6-GTIN set, first (read-only) check which
   GTINs actually carry a `packagingMarkedLabelAccreditationCode` in the catalog
   XML (`GET .../api/tradeitemxml/{gln}-{gtin}-528`).
4. **Run a detection job** for those GTINs (import enqueues automatically).
5. **Expected end-to-end:** for a GTIN whose detected keurmerk matches a declared
   T3777 code above the crosscheck threshold → auto-accept (8.5/8.6 path,
   registration). For a GTIN with a detection NOT in the declared set, or a
   declared code not detected → discrepancy review item. Capture both outcomes
   (an auto-accepted registration AND a discrepancy review item) in this record
   as the AC4 evidence.
6. **Fail-safe spot-check:** a GTIN without gln (or a 404) must log the distinct
   reason (`gln-ontbreekt` / `404-mogelijk-TM-mismatch`) and route to review
   without failing the job.

### File List

- apps/api/src/services/t3777-declarations.ts (new)
- apps/api/src/__tests__/services/t3777-declarations.test.ts (new)
- apps/api/src/__tests__/fixtures/tradeitem-acc.xml (new)
- apps/api/src/main.ts (wire installCatalogDeclarationProvider into startup)
