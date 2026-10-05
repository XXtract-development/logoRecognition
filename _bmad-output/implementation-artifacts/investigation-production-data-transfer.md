---
status: confirmed
owner: Codex/root
date: 2026-10-05
---
# Onderzoek: overdrachtscontroles na review

De huidige uitgevoerde proef is bewezen compleet: 34tabellen, alle1069objecten, gevalideerde relaties, uitsluiting gebruikers/queues en opgeruimde lokalecontainer. Reviews tonen dat herhaalde runs bij afwijkende input niet overal failclosed zijn. Component: deployment/transfer scripts. Fixrichting: explicietpublicscope/exactledgernames/privéoutput/localDockeridentity, hardassertions voor uitsluiting/FKs/cleanup, altijdactuelefailedproof, rowschecksum+passedrehearsalbinding en exactobjectmanifestset; addCIinvocation. Geen bron- of productieactie wordt door de correctie uitgevoerd.

| Finding | Verdict | Evidence / resolution |
|---|---|---|
| E1 | medium | pg_dump heeft geenpublicschemafilter; eventueleanderecustomschemas gaanmee. Patchpublicscope. |
| E2 | medium | Alleenledgerlen/perrow; duplicateskunnenmissingname maskeren. Patchexactuniquenames. |
| E3 | medium | Alleenhuidigecheckout uitgesloten vooroutput. PatchanyGitancestor. |
| E4 | high | Dockerendpoint nietactueelgecheckt; remotecontext kangebruiktworden. Patchlocaldaemonproof. |
| E5 | high | Exclusion/FKboolsgeenassert. Patchhardstop+fixture. |
| E6 | high | Cleanupfalsekanpassedblijven. Patchfailureproof+nonzero. |
| E7 | medium | Readiness/cleanupgeen timeout. Patchboundedcalls. |
| E8 | high | Proofalleennasuccespersist; oudepasskanblijvenbijfailure. Patchfinallyfailedproof. |
| E9 | high | Objectsconsument rowsnietgebondenaangroeneproef/checksum. Patchbinding. |
| V1 | medium | PreverifiedCIontbrekend voor9transferchecks. PatchCIstep. |
| V2 | high | Zelfdebewezenboolassertgap alsE5; afzonderlijkvastgelegd. Patchhardstop. |
| V3 | high | Objectmanifestcontroleertalleenpresententries. Patchexactuniqueexpectedset. |

## Follow-up: isolated rehearsal failed after safety hardening

A fresh run on the proven local OrbStack Unix socket failed with RuntimeError before row verification. Its failed proof was persisted and container cleanup succeeded. The previously verified package remains intact. Open hypotheses: Docker startup/network isolation incompatibility, PostgreSQL readiness, archive restore failure. Investigation uses only a new local isolated fixture; no source or production mutation.

Confirmed root cause: the PostgreSQL image briefly starts a temporary initialization server. `pg_isready` returns success while PID 1 is still `bash` and the `release` database does not exist. A fresh isolated probe observed `FATAL: database "release" does not exist` at that point; two seconds later PID 1 was `postgres`. Network isolation and the immutable image are functional; the early readiness signal is the race. Owner: local transfer-rehearsal helper. Fix: readiness must confirm the entrypoint has completed (PID 1 is postgres) and the release database is connectable, within the same bounded deadline. All diagnostic containers and volumes were removed.

Follow-up after the startup fix: restore and all table fingerprints now pass, excluded tables are empty, and foreign keys are validated. The remaining failure occurs after these checks in the second local backup/restore stage. Current failure remains recorded and cleanup succeeded. Open hypothesis: schema-only pg_dump selection changes how the public schema is emitted. Next diagnostic records the failing local command and its stderr in the private package, never in public evidence.

Confirmed second root cause: `pg_dump --schema=public` emits `CREATE SCHEMA public` and excludes extension declarations. Restoring into a freshly created database fails because its public schema already exists. A local archive table-of-contents probe confirmed a public schema entry and no extension entries. Fix: on owned empty rehearsal databases, initialize the four known required extensions; restore using the archive's complete table-of-contents with only the redundant public schema creation entry omitted. Do not remove public or ignore other errors. The exporter remains explicitly public-only.
