# Fresh build review — 2026-10-02

Three context-free read-only reviewers ran sequentially due slot limit: blind hunter, edge-case hunter, verification gap. Each received staged unified diff; only edge reviewer received story claims. All13findings retained individually; no silent deduplication.

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

Root-directed targeted fresh repair preserves working50API/46Pythoncases; no external effects. Version2 DBtarget identity guards require a separately converted approved manifest. Repairwriter is /root/build_reference_categories/repair_contract_review. Final verification and post-fix inspection completed.

## Closure evidence
B1/E3 seed lookup now precedes image check; missing-PNG/existing-row test passed. E2 conditional updateMany matches id+original code; concurrent relabel test passed. B2 applyOne private; exports boundary test passed. B3 version2 rejects invalid/mismatched target before transactions; exactroot319preview passed. B4 row outcomes identify every race/already-correct state; incomplete CLI status1 tested. B5 ambiguityEvidence preserves resolved/unresolved ids/codes/notes separately. B6 canonical read-only devmount test passed. B7/E1 nonblocking pathlock held through sameconnection transaction; deterministic competingcode/independentpath test passed. B8 future insert/embedding atomicity now established with rollback test; historical incomplete rows remain deferred. V1 durable valid-file preview and actualmain wrapper zeroPrisma tests passed. V2 existing CI fallback remains explicitly deferred.
Definitive:63durable APItests/5files;49Python; exact319rootv2 temporarypreview0DBcalls; full APItypecheck; emittedJS/JSONruntime; pinnedRuff/Black/isort3changedappfiles; diffcheck. No broad-suite/review expansion after repair. All11in-scope entries closed;2explicitpreexisting deferrals;0rejected. No unresolved in-scope finding. No livePG/container/deploymentclaim.
