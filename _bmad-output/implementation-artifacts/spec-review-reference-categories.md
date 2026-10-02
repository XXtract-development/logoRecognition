---
title: 'Juiste categorie bij bevestigde reviewreferenties'
type: bugfix
created: '2026-10-02'
status: done
route: dispatch
review_loop_iteration: 0
baseline_commit: 05c62a70c6707c6c7abce8a7c8dcddd3b02629e8
context: ['{project-root}/_bmad-output/specs/spec-review-reference-categories/SPEC.md', '{project-root}/_bmad-output/specs/spec-review-reference-categories/contract.md']
---
<frozen-after-approval reason="human-approved local repair scope">
## Intent
**Problem:** Bevestigde referentiebeelden krijgen ten onrechte de keurmerkcategorie en missen het bijbehorende declaratieveld.
**Approach:** Eén categoriecontract geldt voor registratie vanuit review en directe schrijfpaden. Herregistratie van hetzelfde beeld herstelt uitsluitend categoriegegevens.
## Boundaries & Constraints
**Always:** Behoud code, actiefstatus, bron, label, embeddings en bestaande deduplicatie. Onbekende niet-lege canonieke codes houden de geldige standaardcategorie. TypeScript en Python gebruiken dezelfde mappingbron. Valideer expliciete velden vóór beeld-/databasewerk. Neem seed/live scripts en veilig exact backfillmanifest mee.
**Never:** Geen ACC-/productiewrites, deployment, herstart, push, merge, migrations of model-/drempelaanpassingen. Behoud vreemde .gitignore en onderzoeksbestanden. Stage alleen eigen paden; geen git add -A/.. Je bent niet alleen in de codebase; revert geen werk van anderen. Deze agent bezit code/tests; opdrachtgever bezit spec/review/trace/versions/commit.
## I/O & Edge-Case Matrix
| Scenario | Input/state | Expected | Error |
|---|---|---|---|
| Categorieën | Nutri A-E, dieet, usage, GHS, generiek | Juiste twee velden | Geen |
| Ongeldig | Leeg/non-string code of inconsistent expliciet paar | Geen writes/beeld/embedding | Validatiefout |
| Zelfde pad | Eén of meer rijen met dezelfde code, verkeerde metadata | Alleen metadatawijziging, geen nieuwe embedding | Geen |
| Conflicterend pad | Eén rij met andere code, ook in gemengde matches | Geen wijziging | Conflictresultaat |
| Nieuw beeld | Geen bestaande rij, bijna-duplicaat | Bestaande guard blijft gelden | Skip |
| Backfill race | Code/active/metadata veranderd sinds manifest | Geen update | skipped-race |
| Manifest | Exact vooraf geleverd plan | Geen scopegroei, alleen toegestane rijen | Ongeldig plan geweigerd |
</frozen-after-approval>
## Code Map
- `apps/api/src/services/field-type-mapping.ts`: centrale TS-resolver, hergebruik interface, verplaats statische data naar gedeelde JSON die beide runtimes daadwerkelijk bundelen/lezen.
- `apps/api/src/services/ml-client.ts` registerReference: review accept en annotation roepen deze aan; voeg hier de canonieke velden toe.
- `apps/ml-service/app/api/artwork.py`: RegisterReferenceRequest en endpoint; validatie van code/veldpaar, status 422 voor invalide contract.
- `apps/ml-service/app/services/similarity.py`: register_crop_as_reference; INSERT mist fields, huidige idempotency query ziet alleen active rijen.
- `apps/ml-service/scripts/realref_live.py` _add_ref en `apps/api/scripts/seed-reference-logos.ts`: dedicated inserts missen velden.
- `apps/api/src/scripts/backfill-reference-logo-field-type.ts`: bestaande read-only planner; applyOne guard mist code/active; maak toepassen exact goedgekeurd manifest mogelijk zonder plan opnieuw vergroten.
- Dockerfile/TS-buildconfig: controleer shared mapping beschikbaar in beide runtimeimages én gebundelde JS; geen deployment uitvoeren.
## Tasks & Acceptance
**Execution:**
- [x] Lees en voer `.agents/skills/bmad-testarch-atdd/SKILL.md` en create-workflow werkelijk uit. Backend scope, bestaande Vitest en Python offline mocks. Eerst betekenisvolle failing tests vóór implementatie. Leg RED-output vast in eigen checklist. Geen databaseverbindingen, containers of productie-envgebruik. Lokale dependencies beschikbaar onderzoeken; bij ontbreken lokale tijdelijke testenv toegestaan.
- [x] Voeg centrale contractmapping toe en implementeer API→ML-validatie.
- [x] Herstel nieuwe- en bestaande-registratie categorieën, inclusief seed/live scripts; behoud guards.
- [x] Log bewezen backfill stale-code/active failure als follow-up in eigen investigation companion vóór reparatie; voeg exactmanifest- en concurrencytests toe vóór codewijziging.
- [x] Run relevante API/Python tests, typecheck en haalbare volledige lokale suites; documenteer baselinefailures apart, geen ad-hoc fixes. Bij nieuwe failure eerst eigen investigationfollow-up evidence/hypothese/fixrichting.
**Acceptance Criteria:**
- Given canonical codes in each supported category, when references register, then both matching fields persist.
- Given invalid metadata, when endpoint/service receives it, then no registration work occurs.
- Given same-path same-code references, when registered again, then only metadata changes without another embedding.
- Given new near-duplicate crops, when registered, then existing skip behavior remains.
- Given approved backfill manifest, when preconditions changed, then those rows skip and no unapproved rows update.
## Implementation Notes
Build derived this story from reviewed SPEC and source investigation. No open intent gaps; external writes explicitly forbidden. Parent approved routine local repair and tests; no further checkpoints required.
## Spec Change Log
2026-10-02: Fresh spec edge reviewer: reject non-string codes and mixed-code duplicate paths; accepted in contract.
## Review Triage Log

| ID | Verdict | Route | Evidence / disposition |
|---|---|---|---|
| B1 | medium | patch | Existing seed lookup follows PNG check; metadata-only repair cannot run without PNG. Move lookup first. |
| B2 | medium | patch | Exported applyOne bypasses validated manifest; restore private boundary. |
| B3 | high | bad_spec | Version1 lacks target identity. Root directed fresh targeted structural repair retaining known-good implementation; version2 target binding added to nonfrozen dispatch. |
| B4 | medium | patch | Only counts hide skipped row identity and source-condition failure; add per-ID outcomes. |
| B5 | medium | patch | Writable items omit unresolved entries from artifact; preserve separate read-only ambiguity evidence. |
| B6 | medium | patch | Compose mounts API src but ML JSON remains baked; mount same source read-only. |
| B7 | high | patch | FOR UPDATE cannot lock absent path; demonstrated concurrent firstinsert state needs nonblocking path advisory lock. |
| B8 | medium | defer | Baseline logo+embedding insertion was not atomic. Shared transaction needed for current path serialization prevents future partials; historical partial-row recovery remains excluded by metadata-only contract. |
| E1 | high | patch | Independent duplicate of B7; retained separately and repaired through path lock. |
| E2 | high | patch | Seed writes by id after code lookup; conditional code+id update required. |
| E3 | medium | patch | Independent duplicate of B1; preserved claim finding, lookup moved before PNG check. |
| V1 | high | patch | Valid manifest CLIpreview currently untested durably; removal of return could write. Add offline validfile zeroDBcall assertion. |
| V2 | medium | defer | CI pytest || echo existed before this repair and root explicitly excludes general CI project changes; document no trustworthy CI-green claim. |
## Verification
Commands must remain offline/mocked: API Vitest targeted and suite; TypeScript type-check; Python pytest registration contract. Supply exact commands and counts to parent. Do not commit or alter versions: parent owns those.

## Review repair dispatch — 2026-10-02
All three fresh build reviewers completed. Root requests one fresh repairwriter, targeted structural safety repairs preserving good implementation; no wholesale revert or broad unrelated CI repair. Keep category mapping, API contract, guard thresholds, inactive/mixed-path repair, all50/46 GREEN cases and no external effects.
Ownership: fresh repairwriter owns code/tests/own investigationfollowup/checklist updates. Parent owns this story, spec/review/trace/versions/commit; other agents own root investigations/manifest. You are not alone: never revert or stage others' work, never commit.
Before new code, append confirmed findings/hypotheses/evidence/fixdirection to existing own investigation companion and add failing tests. Then implement:
1. Seed existing lookup before PNGcheck; conditional updateMany where id and original code so concurrent relabel cannot receive stale category. Cover missing PNG and changed-code outcomes; no upload/new rows.
2. Make applyOne private (keep baseline VM probe only for RED history or replace with validated applyManifest tests).
3. Manifest version2: {version:2,environment:string,target:{database:string,serverAddress:string,serverPort:number},items: unchanged exact items}. Validate full target and all items before any DB work. Manifest preview --manifest without --apply performs zero databasecalls. Apply read-only SELECT current_database() AS database,inet_server_addr()::text AS "serverAddress",inet_server_port() AS "serverPort" and compare every target field before any write. Target mismatch fails closed. Separate root creates v2manifest; do not modify root v1/source files. Existing ACC identity is database=logo_recognition/serverAddress=10.0.0.6/32/serverPort=5432, used only for offline test/demo; no external connection. Generation --manifest-output requires explicit --environment label and includes read-only measured target identity; default dryrun remains no writes.
4. Return row-level outcomes for applyManifest, including id/status/reason for missing row, code, active or metadata race. CLI emits full results with written/skipped totals and explicit incomplete status. Retry remains metadata-idempotent. Preserve writable scope exactly.
5. Preserve ambiguity evidence in read-only plan/output (resolved overlaps vs unresolved with ids/codes/notes), separate from exact writable items.
6. Compose development mount same canonical JSON into /app/reference-code-mapping.json read-only, preserving root buildcontext.
7. Same-path firstinsert race: hold non-blocking transaction-scoped PostgreSQL advisory pathlock during lookup and new insert. A conflicting in-flight samepath registration returns no-write registration-in-progress; different paths independent. Samepath query+repair and newlogo+embedding writes use same transaction/connection. Lock query is pg_try_advisory_xact_lock(hashtextextended($1,0)); existing low-latency guards and source idempotency remain. Deterministic concurrent samepath/differentcode test and embeddingfailure rollback test (offline transactional mocks) required.
8. Durable valid-file manifest preview test asserting zero all Prisma calls; wrong target test asserting zero updates/transactions.
CI existing pytest fallback is pre-existing and deferred; DO NOT change its gate in this repair. Broader suite20Pythonbaseline failures and APItimeouts are documented limitations. No additional broad-suite retries. Run only changed/relevant targeted suites and full API typecheck after last TSedit. Supply exact commands and counts; runtimechecks remain required if runtime files change.

## Final verification and closure
63 durable APItests,49Pythoncontracttests, exact319v2preview zeroPrisma, full APItypecheck after lastedit, compiledJSONruntime and pinned3filePythonformatchecks pass. All11in-scope reviewfindings closed;2pre-existing issues explicitly deferred. Review repairwriter completed; no active child/process. Scoped tracePASS; broader readinessCONCERNS; no external actions.
