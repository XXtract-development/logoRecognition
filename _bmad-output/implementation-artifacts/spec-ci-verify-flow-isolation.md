---
title: 'Verificatiecontroles met vaste offline gegevens'
type: bugfix
created: 2026-10-02
status: done
route: dispatch
review_loop_iteration: 0
baseline_commit: e0b113aac02fb6a9fa732621cab279cc08d7dbe8
context:
  - '{project-root}/_bmad-output/specs/spec-ci-verify-flow-isolation/SPEC.md'
---
<frozen-after-approval reason="Rootautoriseerde gerichte testisolatie na bevestigdonderzoek; usercontinue blijft gelden">
## Intent
**Problem:** Zes bestaande verificatietests blokkeren API-CI doordat één van twee catalogusafhankelijkheden niet wordt vervangen en echte fetch probeert. **Approach:** Herstel uitsluitend hun vaste offline testomgeving en borg dat geen catalogusaanvraag ontsnapt.
## Boundaries & Constraints
Always: behoud alle19bestaande betekenisgevallen; explicietnulfetch pertest ookalsservicefouten opvangt; freshdefault marks+declarations afhankelijkheden; gecontroleerdeNS/fail-open overrides behouden; globale/env/spiesherstel pertest ookbijfailure. Agentnietalleen: rootonderzoek/release/GHSfiles/gitignore nietwijzigen/stagen/reverten. Never: productcode/globalsetup/timeouts/skip/xfail/drop/model/credentials/externalwrites/ACCrequests/push/deploy/containeracties wijzigen. Root remoteowner.
## I/O & Edge-Case Matrix
| Scenario | Input | Expected outcome | Failurehandling |
|---|---|---|---|
| ExistingT3777cases | mocked declarations, defaultempty marks | originalverdicts/log/hooks intact;0fetch | missingmock caughtby explicitassert |
| NSoverride | markedD/A percase | existingNSsemantics unchanged | override cannotleaknexttest |
| Marks fail-open | rejected resolver | existingempty/T3777semantics | still0fetch |
| Globaldeny | anyattemptedfetch | testcasefails zero-call assertion | finallyrestoresglobal/env/spies |
</frozen-after-approval>
## Code Map
- `apps/api/src/__tests__/services/verify-flow.test.ts`:19tests, first6networkcases mock resolveDeclarations only, laterNSgroups mockboth. vi.clearAllMocks retainsimplementations, groupbeforeEachenv mutation persists; localpertestrestore/defaultneeded.
- `apps/api/src/services/pipeline/verify-flow.ts:421`: PromiseAll awaitsresolveDeclarations+resolveDeclaredMarks. Inspectonly, no productedit.
- `apps/api/src/services/t3777-declarations.ts`: marks actualfetch fallbackcatalog.acc10sectimeout+retries. Unitfixturedefaultempty marks required. No runtimeenvchanges.
- `apps/api/src/__tests__/setup.ts`: globalPrisma/Redis/ML mocksexisting, no globalsetupchange.
## Tasks & Acceptance
- [x] `verify-flow.test.ts`: firstadd activefetchtripwire+zeroassert restorefinally and runRED; thenfile-scopedfreshdefaultmarks fixture, preserve overrides and all19existingtests.
- [x] `versions.md`: Dutch releaseassurancecatalogdelay no longerblocksunitchecks, samecommit.
- [x] Owncase/spec/ATDD/review/trace: actualconfirmedcause+RED/GREEN+closure; do notstageforeignrootfiles.
Acceptance: GivenfirstT3777cases, whenexecuting, thenoriginal19semantics intact and0fetch; GivenNS/failopenoverrides, whennextteststarts, thendefaultfresh and0fetch; Givenmissingmock, thenexplicitnetworkassertionfails evenifproduct catches; Given failure, thenalltestglobals/env/spiesrestored.
## Implementation Notes
ActualGitHubrun37040818989API1185pass6timeout; ML325pass14skip+11contractOK. Independentdiagnosticcopy with localglobalfetchdenyexact6attempts matchCIfailingnames,19pass181ms; no externalcallperformed, diagnosticfiledeleted. Confirmedmissingfixture, notproductregression. No intentgaps/irreversibles; generatedbuildworkflowreadbeforefollowup, samefixedsnapshot applies. Freshagentspawnlimit alreadyproven; parentexplicitdirectfallback+reusedindependentreviewer authorized. Approval notaskedagain.
## Review Triage Log
- Blindspots, edge cases and verification gaps: no material findings. Independent normal and shuffled executions preserve all19 cases. AC2 call-through and finally cleanup verified.
## Spec Change Log
## Verification
- Targetverifyflowfileoriginal19semantics andeverycase0fetch. MeaningfulRED beforefixturemockfix.
- Fileorder/NSoverride isolation via freshdefaultpertest+restorefinally; preservefailopenexceptions.
- Existingcategory63API andCIcontract11 alreadyverifiedsamebaseline, sourceunchanged. OneboundedAPIcoverage broadcheck onlyafterfixifneeded; no retriesunlessnewfailureevidence.
- ActualGitHubCI+livehostavailability ownedroot; no runtimeclaims.

Independent specsweepPASS: preserveAC2realGLNmissingreason with freshcall-throughresolveDeclarations spy; individualexistingcases override. Defaultmarks emptylege-declaratie only. AfterEachrestore thenfreshfixtures at nextbeforeEach, afterEachtryzeroassert finallyglobal/env/spiesrestore. ActiveRED19run6fail13pass captured beforedefaultmarkschange.

Final targeted GREEN: 19/19 passed103ms, zero-fetch assertion active in every case. The initial global restore was removed after a documented Redis constructor mock failure; previous-test cleanup remains in unconditional afterEach finally. Only the test fixture and Dutch version note changed. Independent three-lens review CLOSED: no material findings; independent normal19/19 and shuffled seed42 19/19 passed.
