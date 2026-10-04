---
title: Twee visuele GHS-beoordelingen via de backend
type: feature
created: 2026-10-04
status: in-review
route: dispatch
review_loop_iteration: 2
baseline_commit: ddd7279104f813c7a81d72cf7bb3c5375c82f4c4
context: []
provider_activation: bestaande gedeelde Gemini-config gevonden; lokale echte controle gestart; live envwijziging nog niet geautoriseerd
---
<frozen-after-approval reason="geautoriseerde backendvervolgstap; normale technische keuzes door agent">
## Intent
**Problem:** afzonderlijke AI-beeldbeoordelingen bestaan uitsluitend als ontwikkelagent-runs. De gebruiker wil dezelfde beoordeling automatisch vanuit de projectbackend, zonder browser.
**Approach:** voeg een stateless, geauthenticeerde gateway en ML-route toe. Twee afzonderlijke visuele HTTP-aanroepen ontvangen dezelfde oorspronkelijke beeldbytes en vaste instructies; geen detectorvoorstellen, eerdere antwoorden of gedeelde conversatie. Vergelijk de uitkomsten en lever beide intact als AI-voorlabels.

## Boundaries & Constraints
**Always:** originele PNG/JPEG-bytes en SHA256, juiste afmetingen, twee afzonderlijke review-ID’s, geconfigureerde en werkelijk geretourneerde modelnaam, menselijke beoordeling vereist. Zelfde model is toegestaan maar expliciet gemeld; gescheiden aanroepen bewijzen geen onafhankelijke fouten. Providertransport gebruikt configureerbare OpenAI-compatibele chat-completions met base64-imageinput; baseURL, sleutel en beide model-ID’s zijn serverconfiguratie, geen defaults. Een concrete providerkeuze/credential is nodig voor echte uitvoering, niet om dit generieke contract te implementeren.
**Never:** geen nieuwe browser, runtime-BMad-agent, detectorinput, URL-download, vrije prompt, opslag, training, Prisma/MinIO/gold-setwrite, migratie of auto-accept. Geen providergeheimen, volledige beelden of ruwe foutpayloads in logs/HTTP-fouten.

## I/O & Edge-Case Matrix
| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Normaal | één PNG/JPEG base64, juiste auth, providerconfig | beide reviews, beeldhash/afmetingen, vergelijking, humanReviewRequired:true | 200 ai-reviewed |
| Eén review faalt | A geldig, B fout/timeout | beide statussen; A behouden, B expliciete fout, vergelijking incomplete | 200 partial; geen lege B als succes |
| Beide falen | providerfouten/deadline | geschoonde fout, geen fictieve annotaties | 502/504 |
| Config ontbreekt | sleutel/baseURL/model ontbreekt | geen providercall, expliciete onbeschikbaarheid | 503 |
| Ongeldig beeld | verkeerde base64/MIME/corrupt/meerdere frames | afwijzing vóór AI-call | 422 |
| Te groot | >4 MiB bytes, >24 miljoen pixels, base64-body >6 MiB | afwijzing vóór AI-call | 413 |
| Auth ontbreekt/fout | publieke key/JWT; interne key | fail closed; verkeerde meegestuurde key geen JWTfallback | 401/403/503 |
| Capaciteit | maximaal twee gelijktijdige requests per ML-worker | direct bounded admission; totale deadline maximaal90s | 429/504 |
| Output ongeldig | onbekende code, niet-eindige/buitenbeeld box, malformedJSON, weigering | reviewstatus fout; nooit normaliseren naar waarheidslabel | 502/partial |
</frozen-after-approval>

## Code Map
- `apps/api/src/api/v1/ghs-review.ts`: nieuwe `POST /ghs/review` gateway; geldige PIPELINE_SERVICE_KEY of ADMIN-JWT; schema additionalProperties:false, 6MiB-bodylimit.
- `apps/api/src/main.ts`: registreer gateway onder `/api/v1`.
- `apps/api/src/services/ml-client.ts`: gerichte methode `/ml/ghs/review`, interne header en timeout; bestaand detectorpad behouden.
- `apps/api/src/services/pipeline/queue.ts:isServiceRequest`: bestaand echt servicekeypatroon; geen structurele lr_keyauth overnemen.
- `apps/ml-service/app/api/ghs_review.py`: nieuwe route met interne sleutelcontrole vóór beeldwerk/provider.
- `apps/ml-service/app/ghs_review.py`: beeldcontrole, transport, strikte outputcontrole, vergelijking, begrensde concurrency/deadline; geen storage/databaseimport.
- `apps/ml-service/app/core/config.py`, `app/main.py`: SecretStr-providerconfig en routerregistratie.
- `app/symbol_contract.py`: bestaande negen canonieke GHS-codes hergebruiken; UNKNOWN alleen voor onzekere visuele annotatie.

## Tasks & Acceptance
**Execution:**
- [x] ML-route/service/config/tests: originelebytes valideren, twee afzonderlijke HTTP-calls, strictschema, capacity/deadline, partial en fail-closedconfig.
- [x] Gateway/MLclient/registratie/tests: auth vóór doorgifte, eigen bodylimit, veilig foutstatusbehoud en interne sleutel.
- [x] `.env.example`, `apps/ml-service/scripts/ghs-backend-review.md`, `versions.md`: concreteconfig/aanroeprecept en gebruikersgerichtewijziging, geen echte secrets.
- [ ] onafhankelijke reviews, lokale checks, volledigeCI, ACCmerge/autodeploy en werkelijkruntimebewijs; ontbrekendeproviderconfig afzonderlijk melden.
**Acceptance Criteria:**
- Given een geauthenticeerd origineel beeld en werkendeconfig, when de review start, then gaan exact dezelfde bytes in twee aparte calls en krijgt B geen A-antwoord of detectorinformatie.
- Given een gedeeltelijk mislukte beoordeling, when het antwoord wordt geleverd, then blijft het geslaagde antwoord intact en worden fouten en onvolledige vergelijking zichtbaar.
- Given volledige overeenstemming of nul objecten, when resultaten terugkomen, then blijven statusAI-voorlabel en humanReviewRequired:true en worden geen trainings-/referentiewrites uitgevoerd.
- Given ongeldigeauth, input of ontbrekendeconfig, when een request binnenkomt, then volgt expliciete fout zonder providercall.
- Given alle automatiseringscontroles groen, when naarACC wordt gemerged, then wordt de echte runtimeversie gecontroleerd; zonder providerconfig wordt geen echte AI-reviewclaim gedaan.

## Implementation Notes
Planning gebaseerd op twee explorerresultaten en actuele originelebeeldreviewvergelijking. Bestaande AI-Service judge/consensus hebben geen multimodale input; geen bewezen providerroute hergebruiken. User vraagt configuratieplek; transport blijft configureerbaar. Staande autonome bouw/ACCautorisatie gaat vóór herhaalde formele spec-goedkeuring. Lokale rapportwijzigingen en user.gitignore niet automatisch stagen.

### Implementation investigation: local test isolation (2026-10-04)
- Symptom: first gateway/client test run failed 20 tests with `reviewGhs does not exist` / missing `MLClient` export. Python 22 contract tests and API TypeScript build passed.
- Evidence: the Vitest error explicitly identifies `../services/ml-client` as a mock; `apps/api/src/__tests__/setup.ts` globally mocks that module. Production `MLClient.reviewGhs` is present and compiled.
- Confirmed hypothesis: shared test setup hides the real client; refuted hypothesis: production method absent. Owner: API test suite.
- Structural fix direction: unmock only the ML client in the dedicated new suite; mock HTTP transport locally. Preserve existing global mock for all other suites.

## Spec Change Log

- Reviewloop1: alle drie reviewers verzameld vóór triage. Technisch contract aangescherpt: JPEG/PNG met EXIForientation anders dan1 afwijzen vóórprovider, zodat oorspronkelijke pixelruimte eenduidig blijft; afzonderlijk begrensde image-validationjobs behouden slot tot thread werkelijk gereed is. KEEP: twee geïsoleerde originelebeeldcalls, geschoondefouten, partials, geen DB/storage/training, bestaandeexports onaangetast. Binnen staande autonome opdracht implementeert dezelfde eigenaar gerichte structurele correcties; geen destructieve sharedtree-revert of nieuwe productkeuze.

- 2026-10-04: echte Gemini-uitkomsten bevestigen juiste codes maar verkeerde pixelvakken. Provideroutput voortaan expliciet box_2d:[ymin,xmin,ymax,xmax] genormaliseerd0..1000 volgens officiële beeldconventie; raw output intact, afzonderlijke projectedAnnotations in oorspronkelijke pixels. Paginatype/leesbaarheid onderscheiden technischetekening van leesbaar etiket. Vergelijk codes, locaties en onzekerheid afzonderlijk; alle uitkomsten blijven menselijke beoordeling nodig hebben. Behoud originelebytes/hash/twee geïsoleerdecalls, geen detector/opslag/training. Investigation ghs-backend-provider-smoke-20261004.md.

- 2026-10-04: pure reviewmodule naar app/ghs_review.py verplaatst. Echte importtrace bevestigt dat app.services.__init__ indirect trainer/storage initialiseert. Behoud alle reviewcontracten, transport, limieten en bestaande servicesexports; wijzig uitsluitend nieuw importpad. Investigation ghs-backend-provider-smoke-20261004.md.

## Review Triage Log

| Finding | Verdict | Evidence | Route |
|---|---|---|---|
| B1 | medium | Gateway handler maakt globale429 tot400; main.ts registreert de limiter vóór de route. | patch |
| B2 | medium | AJVcoercion staat singletonarrays toe; eigen preValidation mist strikte veldtypen. | patch |
| B3 | high | choices[0].get en message.get opnull veroorzaken AttributeError; task.result gooit siblingresultaat weg. | patch |
| B4 | medium | json.loads kan RecursionError geven; input/provider handlers missen deze parserfailure. | patch |
| B5 | medium | json.dumps1 vs1.0 maakt onterecht verschil bij gelijk numeriek vak. | patch |
| B6 | medium | PIL leest EXIF zonder orientationpolicy; provider kan ander displayframe aannemen. Kies expliciet afwijzen nonidentityorientation, originelebytes behouden. | bad_spec |
| B7 | medium | to_thread cancellation stopt decode niet maar admission released; meer dan2decodejobs mogelijk. Aparte begrensde validationcapaciteit vereist. | bad_spec |
| E1 | high | Zelfde null-envelopeclaim alsB3; get opNone kan aantoonbaar falen. | patch |
| E2 | medium | urlsplit op unmatchedIPv6 bracket gooitValueError buitenconfigReviewError. | patch |
| E3 | high | Zelfde gedeeltelijkresultaatverlies alsB3; exceptiontask.result blokkeert response. | patch |
| V1 | medium | Preverifiedtransporttest controleert request maar nietresponse; {}mutatie onopgemerkt. | patch |
| V2 | medium | Preverifiedcomparison tests vergelijken alleen countverschil/identieksingleton; codes/bbox/confidence/uncertainty/reordering nietgedekt. | patch |
| V3 | medium | PreverifiedASGI tests geen success/partial; servicetests omzeilen route. Echte lokaleprovidercontrole vangt dit aan maarCI mist het. | patch |

## Verification
- Gerichte Python-route/service-tests met HTTP-mocks: auth, pixels/bytes/MIME, twee geïsoleerde calls, outputvalidation, disagreement/partial, timeout/capaciteit, geen opslag.
- API-route/client-tests met Fastifyinject: servicekey/JWTadmin, foutstatusbehoud en oversizebody.
- `pnpm --filter @logo-recognition/api build`; Pythonruff/black/isort; gitdiffcheck; volledigevrijgaveCI.
- Live ACC auth/configfailclosedprobes zonder providercalls; echte AI-imagecall pas met concrete providerconfig. Dat is noodzakelijk eindbewijs en blijft pending zolangconfig ontbreekt.

Schrijfeigenaarschap: implementatieworker bezit alle inCodeMap/Tasksgenoemde productcode, tests, envvoorbeeld, instructiedoc en versions.md plus eigenappend ImplementationNotes. Root bezit overige evidence/specstatus/release; geen anderecodewriter actief. Je bent niet alleen in de repository: behoud bestaande gebruikerswijzigingen (.gitignore), oude AIreviewbundels en onderzoeksverslagen; revert/stage die niet. Geencommit/push doorworker.

### Reviewloop2

| Finding | Verdict | Evidence | Route |
|---|---|---|---|
| B2-1 | medium | Exact dezelfde coincident FLAME-vakken met false/true worden arbitrair gekruist, onzekerheidsdiagnose onterecht verschillend. Reviewer repro bevestigd. | patch |
| E2-1 | high | Geldige1e-200zijden vermenigvuldigen tot0; uniondeling veroorzaakt ZeroDivisionError en vernietigt beide successoutputs. | patch |
| E2-2 | medium | Zelfde matchingdefect B2-1; locatiesmatch heeft meerdere equivalentepairings. | patch |
| E2-3 | medium | parsed.port nietgeraakt; :invalid passedconfig en HTTPXInvalidURL nietHTTPError geeft500. | patch |
| E2-4 | high | Zelfde underflow E2-1; contracthumanrequired/AIoutputs ontbreekt doorcrash. | patch |
| V2-1 | medium | Preverifiedthresholdgap:1.0mutatie slaagt bestaandeidentiek/disjointtests. | patch |
| V2-2 | medium | Preverifiedflaglocationgap:matchedflagsvergelijkingverwijderen slaagt aggregatecount/singletonchecks. | patch |

Alle eerdere13bevindingen door onafhankelijke heraudit gesloten. Nieuwe zevenbevindingen gebundeld in vieroorzaken; geen uitstel. KEEP: rawoutputs, projectedAnnotations, pageAssessment, capaciteit/auth/deadline, geenwrites. Nieuwe echteprompt/modelvergelijking loopt apart; betrouwbarelocatie nog niet aangetoond.

### Definitieve lokale verificatie

Alle20reviewbevindingen hersteld en met gerichte regressiechecks afgedekt; geen uitstel. Root onafhankelijk:152Pythonchecks(65nieuwebackendtests plus87bestaandeGHSchecks),45APIchecks(27nieuweplus18bestaandeGHS), APIbuild, Pythonruff/black/isort engitdiffcheck geslaagd. Echte route met bestaandeGemini3.8flash+3.1propreview:10beelden×2calls,20/20success,4positieveGHS07-paginasbeidemodellen,6pagina’sgeenGHS waarvan2technischapartgemeld;20beeldhashes/afmetingen enIDisolatie geverifieerd. Positievakoverlap0.698–0.961 met eerdereAIinschattingen; geen goldwaarheid/onafhankelijkefamiliedekking of alle9getraindclaim. Runtime/providerconfig/CIvrijgave blijven pending.
