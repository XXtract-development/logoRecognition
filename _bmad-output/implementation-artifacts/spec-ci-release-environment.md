---
title: 'Betrouwbare testomgeving vóór ACC-vrijgave'
type: bugfix
created: 2026-10-02
status: done
route: dispatch
review_loop_iteration: 0
baseline_commit: d82c0f4984e4d895b465f7c359310920a81dbe53
context:
  - '{project-root}/_bmad-output/specs/spec-ci-release-environment/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-ci-release-environment/ci-contract.md'
---
<frozen-after-approval reason="Gebruiker koos herstel testomgeving en daarna ACCvrijgave; directe opdracht prevaleert over herhaald akkoord">
## Intent
**Problem:** CI blokkeert de vrijgave door een verdwenen opslagimage; de Pythonjob verbergt testfouten. De vrijgave kan pas doorgaan wanneer de echte controles betrouwbare uitkomsten geven.
**Approach:** Richt uitsluitend tijdelijke CI-opslag en ML-testomgeving correct in en laat alle fouten de job stoppen. De hoofdtaak voert publicatie en automatische ACCvrijgave uit.
## Boundaries & Constraints
**Always:** Officiële vastgepinde MinIO en mc bronnen, bestaande S3-semantiek en drie buckets; schrijfbare tijdelijke modelpaden; begrensde gezondheid met expliciete fout; echte pytestexitcode; localhosttestdatabase en dummy credentials. Iedere nieuwe failure eerst in eigen investigationfollowup vastleggen, geen adhocproductfix. Bestaande categoriecorrectie behouden. Agent is niet alleen in repository: raak uitsluitend toegewezen CIhelpers, workflow, noodzakelijke testomgevingtests en versions.md aan; revert/stage andermans bestanden nooit.
**Never:** Geen push, PR, deploy, ACCdata/storagewijziging, containeracties, derde leverancier, privécredentials, publishedmirror, fullmodeltraining of productherkenningsaanpassing. Geen tests overslaan, verwijderen, xfail of bewust laten slagen.
## I/O & Edge-Case Matrix
| Scenario | Input | Outcome | Error handling |
|---|---|---|---|
| Storage healthy | official binaries and live endpoint | training-data, models, artwork created | actual CLI result |
| Health timeout | endpoint never healthy | step nonzero, no bucket calls | bounded retry, diagnostic log |
| Bucket failure | mc exits nonzero | step nonzero | preserve failure |
| Test failure | pytest exits13 | CI exits13 | no echo/fallback success |
| ML collection | runner unprivileged | paths writable under runner temp | no /app permission failure |
</frozen-after-approval>
## Code Map
- `.github/workflows/ci-cd.yml`: test-ml-service pytest masked; test-e2e MinIO docker unavailable. Preserve other jobs and existing source changes.
- `.github/scripts/start-ci-minio.sh`: new native runner helper interface CI_BIN_DIR and RUNNER_TEMP; optional HEALTH_ATTEMPTS and HEALTH_INTERVAL make offline timeout tests fast. Set MINIO_PID into GITHUB_ENV; cleanup always in workflow. Restrict bound endpoint localhost9000 and temporary data. Reject nonlocal use.
- `.github/tests/test_ci_release_environment.py`: unittest offline contract checks and mocked shell CLI paths.
- `apps/ml-service/app/core/config.py`: Settings defaults /app/models plus dotenv; inspect only, no product edits.
- `apps/ml-service/tests/`: suite uses numerous sys.modules stubs; no conftest exists; cwd service required for relative tests. Test-only isolation fix permitted with concrete evidence if needed.
- `apps/ml-service/requirements.txt`: includes imagehash, torch2.1.2, torchvision0.16.2; local lightweight Python3.14 venv lacks torch. Do not alter product dependency pins merely to accommodate local machine.
## Tasks & Acceptance
**Execution:**
- [x] `.github/workflows/ci-cd.yml` -- setup Go1.24.8, build official pinned source binaries with checksum database, invoke readiness/buckets helper, always cleanup own process; set MLtest temporary paths and dummy local settings; preserve pytest failure.
- [x] `.github/scripts/start-ci-minio.sh` -- readiness must fail closed and bucket command failure must propagate; no Docker or ACCactions.
- [x] `.github/tests/test_ci_release_environment.py` -- execute RED tests before code, GREEN afterward; mock health/bucket/pytest failures rather than relying only on implementation text.
- [x] `versions.md` -- Dutch end-user release assurance entry, same commit.
**Acceptance Criteria:**
- Given official immutable source refs, when CI builds, then module checksum validation remains enabled and latest images are absent from storage step.
- Given successful startup, when buckets are created, then all three names remain unchanged.
- Given health or bucket failure, when setup executes, then browser tests cannot start from a false success.
- Given failed pytest, when test step ends, then ML job fails.
- Given runner-only writable directories, when collection imports modelmanager, then no /app creation is attempted.
- Given unexpected productassertion failures, when isolated suite confirms them, then no product logic is changed and report unresolved release blocker.
## Implementation Notes
Approval captured in parent task: explicit choice to restore test environment and continue. Parent retains unknown .gitignore changes and research/investigation/release artifacts. Owned commit only, no repository-wide add.
Verified official MinIO tag RELEASE.2025-10-15T17-29-55Z resolves to commit9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a; mc tag RELEASE.2025-08-13T08-35-41Z resolves to7394ce0dd2a80935aded936b09fa12cbb3cb8096. Both go.mod read from rawgithub confirms Go1.24.8 compatibility. Source build may use goinstall@fullcommit with GOSUMDB=sum.golang.org and GOPROXY=https://proxy.golang.org; failure must stop.
No applicable docs/project-context.md found in repository listing. Runtime agent slots initially unavailable; ATDD generated directly while parent runs requested independent GHSanalysis.
## Spec Change Log
## Review Triage Log
| Lens finding | Verdict | Route | Evidence |
|---|---|---|---|
| Blindmissing: environmentappend processleak | medium | patch | RED11run1fail ownPIDsurvives; trapmovedbeforeprintf; GREEN11/11, independent1/1closure. |
| Edgecase: same appendfailure cleanup path | medium | patch | Sameconfirmeddefect groupedwithblindfinding, sameclosedpatch. |
| Verificationgap: no durable environmentappendfailure regression | medium | patch | Added active ownPIDtrace test; REDbeforepatch and GREENafterpatch confirmed independently. |
## Verification
- `python3 -m unittest discover -s .github/tests -v`: all offline checks run and pass after expected REDbaseline.
- Existing registration Python49 and API63 contracttests remain green.
- Broad MLsuite once with explicit temporary paths, localhostdummy URLs; record residual dependency and product failures without masking.
- Real official source build and disposable runner smoke if feasible; GitHubCI is ultimate Linux verification owned by parent.

Independent spec-review2026-10-02: curl request max-time, PID persisted before readiness, offline remote rejection/deadprocess/cleanup assertions adopted before implementation. Runtime cached-image safety extension subsequently approved by parent for same release objective; no data/model behavior change.

## Approved narrow release-safety extension (parent ownership transfer2026-10-02)
- `docker-compose.acc.yml` -- replace only MinIOimage with verifiedcached minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e and add pull_policy:never. Existingcommand/env/volume/datapaths MUSTremainbyteidentical; no upgrade/provision/download/containeractions. Rootverifieddigestcacheexistingimage69b2 and Coolifystopsbeforecomposeup. Dockerprimarydocumentation cache-only never policy verified. Parent mustconfirminstalledCoolifyparser preservation proof remains beforemerge. Coldhostwithoutcache fails safely and requires explicitprovisioning.
- Acceptance: Given cachedexistingdigest on currentdeployhost, when composing ACCrelease, then storageusesimmutableexactexistingimage and neverpulls; Given nocache, then releasefailsinstead of downloading/upgrading storage. Offline test assertsexactpin+never and retainedcommand/env/volume.
- Investigationfollowup and independent scope-review precede edit; root retains push/merge/remotedeploy.

## Verification evidence (2026-10-02)
- CIcontracts originalRED6/6, specificationguardsRED8/8; ACCcachepinRED1/9; reviewtrapleakRED1/11. FinalGREEN11/11 activechecks, noplaceholders/skip/xfail.
- Representative pinnedPython3.11 completeMLsuite325passed14existingSkipped, nofailures; registeredcategorycontract49passed fresh targetedrun.
- OfficialMinIO/mc commitbuilds both exit0 using Go1.25.6 macOSarm64 with checksumdatabase; actualnativerunnerstorage healthy,3bucketcreateandreadbackexit0, ownPID81322killed. CI usesGo1.24.8/Linux; actualGitHub remains rootpostpublishgate.
- APIregression53/4files currentpass; fieldmapping10/1file checkedseparately toretain63/5files coverage, no productsource changed.
- Shellsyntax, YAMLparseworkflow/compose, diffwhitespacecheckpass. Unrelatedgitignore/research/release artifacts preserved.
Reviewimplementation owner unavailable due provenagentthreadlimit; directfallback documented. Three lenses executed by reusedindependentreviewer with rootapproval; authornotreviewer. Rootwatchdog activeownedroot.

Independentreviewclosure confirmed: all3lenses completed; onlymaterialcleanupfinding closed. Three fresh reviewerthreads/freshimplementation impossible due hardagentlimit; rootexplicitapproved directimplementation and reusedindependentreview. BlindreviewN5floor produced onlyoneverifiedmaterialfinding; no inventednoise, parentacceptedclosure. ScopedtracePASS; releaseGitHubCI/liveverification pendingownedroot. No push/PR/deploy/ACCdatawrites/containeractions by thisagent.
