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

### Completion Notes List

### File List
