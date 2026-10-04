---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: step-05-gate-decision
lastSaved: 2026-10-04
---
# Dekking automatische GHS-backendbeoordeling

Bron: spec-ghs-backend-review.md, vijf acceptatiecriteria, drie onafhankelijke codereviews, investigation van daadwerkelijke Gemini-calls. Er bestaan gateway/client- en ML-contracttests; herstel en uitbreiding lopen. Geen browser nodig voor deze feature.

Prioriteiten: authenticatie, beeld/geheimafscherming, geen automatische trainingswrites en behoud geslaagde sibling zijn P0. Twee originelebeeldcalls, coördinatenomzetting, vergelijking, schema/deadline/capaciteit en echte routewerking zijn P1. ACC runtimebewijs blijft afzonderlijk nodig; configactie vereist akkoord. Geen waiver of definitieve gevarensymboolkwaliteitclaim.

Risico's vóór herstel: providercoördinaten P3xI2=6; siblingverlies P3xI3=9; begrensde validatie P2xI2=4; live activering ontbreekt P3xI2=6. Eigenaar productherstel: ghs_backend_implementation; eigenaar echte provider/runtimecontrole en vrijgave: root.

## Testinventaris

Gateway/client APItests: apps/api/src/__tests__/routes/ghs-review.test.ts (authservicekey/ADMIN/foutekeygeenfallback, invalidtypes/bodylimiet, upstreamstatus/timeout, echte transportretour). ML API/serviceunit: apps/ml-service/tests/test_ghs_backend_review.py (originelebytes/tweecalls, ASGIsuccess/partial, inputauth/schema/frame/pixels, providererrors/config, body/decode-deadline/capaciteit, vergelijking, EXIF en subprocessimport). Lokale echte geïntegreerdeproviderprobe:10oorspronkelijkebeelden via ASGIroute met2GeminiHTTPcalls, labelsconsistent maar eerste pixelvakkenfout; vernieuwdecoördinatenhercontrole pending.

coverage_heuristics: beide endpoints direct getest; positiefpad gatewayreturn enMLASGI doorreviewgaps toegevoegd; negativeauth zowelpubliek alsintern. Errorpaden413/422/429/502/503/504, malformed/deepJSON, provider-null enpartial opgenomen. Geen UI/E2Ebrowser nodig; echte ACCendpointintegration nognietuitgevoerd. Geenlabelkwaliteit/goldwaarheidsclaim.

## Acceptatiecriteria ↔ controles

| AC | Prioriteit | Niveau / testbewijs | Dekking huidige toestand |
|---|---|---|---|
| 1 Twee geïsoleerde calls met dezelfde oorspronkelijke bytes | P1 | test_identical_original_bytes_two_isolated_calls; test_asgi_success_and_partial_use_real_service; echte lokale Gemini-routecalls | PARTIAL: nieuwe contractchecks nog heruitvoeren |
| 2 Geslaagde sibling behouden, fouten/vergelijking zichtbaar | P0 | test_partial_preserves_good_output; test_malformed_envelopes_keep_successful_sibling; ASGIpartial; gateway echteclientreturn | PARTIAL: nieuwe checks nog heruitvoeren |
| 3 Altijd AI-voorlabel/humanrequired, geen trainings/referentiewrites | P0 | test_disagreement_and_empty_remain_prelabels; ASGIhumanrequired; test_real_import_has_no_training_database_or_storage_side_effects; codeimportreview | PARTIAL: nieuwe checks nog heruitvoeren |
| 4 Onjuiste auth/input/config geen providercall | P0 | gatewayservice/JWT/denied; test_auth_schema_and_chunked_body_no_provider; configuration/frames/pixels/EXIF; deepJSON | PARTIAL: nieuwe checks nog heruitvoeren |
| 5 CI en daadwerkelijk draaiende ACC-versie/route geverifieerd | P1 | vrijgaveCI, OCIcommitmatch, openbarehealth, interne/publicauth/configprobe, echteAI-call na config | PARTIAL: PR/CI/ACCactivering nog pending |

Unit/routechecks dekken verschillende grenzen bewust: publieke gateway bewaakt sleutel/rol/input/retour; ML bewaakt beeld/provider/capaciteit. De echteproviderprobe toetst het protocol en feitelijke locatie; mocks alleen kunnen dat niet bewijzen. Allecriteria hebben concrete geplande checks; geenwaiver. Configactivering is een operationele goedkeuringsafhankelijkheid, geen ongeautoriseerd geforceerde test.

## Definitieve lokale mapping en gap-analyse

AC1/2/3/4 FULL door actuele tests; AC3aangescherpt met echte positive/emptyASGIrequests in subprocess dat filesystemwrites, socketverbindingen enservice/trainingimports verbiedt. Root152Python45API/build/opmaak/20echteAIcalls geslaagd. AC5 PARTIAL: noggeenPR-CI/ACCconfig/uitrolbewijs; P1runtimeafronding is open. Nul criteria zonder mapping, beide endpoints directtests, deniedauth enerrorpaden gedekt. Vieroorzaken uit heraudit2 opgelost; geenwaiver.

Uitvoermodus: internedeelagentcontroleerde gapclassification, heuristieken enstatistieken read-only; rootvoegde afhankelijk aanbevelingen/JSON samen, rekening houdendmet4slots waarvanwatchdog enwriterinactievefase. Aanbeveling: commit/push/PRenCIafronden; daarna concrete vierenvvariabelengoedkeuring, accmerge/autodeploy, feitelijkruntimecheck enechtebeeldcall. Eindoplevering blijftafhankelijk vanAC5.

Dekking:4/5FULL=80%; P0 3/3=100%, P1 1/2=50%. Geen ontbrekendeendpoint/authnegative/errorchecks. Fase1matrix geschrevennaar /tmp/tea-trace-ghs-backend-review-20261004.json.

## Eindopleveringsbesluit: FAIL — runtimeafronding ontbreekt

Deterministische regels: P0=100% voldaan; overall80% voldaan; P1=50% onderminimum80% doorAC5nogPARTIAL. Daarom geen volledigeopleveringclaim. Lokaleproductcontroles enechteproviderproef slagen; PRvoorbereiden/CItesten kan doorgaan. Liveactivering wacht explicietenvakkoord, waarnaACCuitrol enruntimebewijs AC5 moetenafronden. Geenwaiver, geentrainingsclaim. Dit is een onvoltooideoperationelefase, geen geconstateerde producttestfailure.
