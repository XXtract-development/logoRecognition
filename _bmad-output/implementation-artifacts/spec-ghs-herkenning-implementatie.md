---
title: 'Gevarenpictogrammen implementeren'
type: feature
created: '2026-10-02'
status: done
route: dispatch
review_loop_iteration: 1
baseline_commit: 305733f197058d6dc0931830b9fa71be433e8c81
context:
  - /Users/frisovanweelden/Documents/projects/logoRecognition/_bmad-output/specs/spec-ghs-herkenning/codecontract.md
  - /Users/frisovanweelden/Documents/projects/logoRecognition/_bmad-output/specs/spec-ghs-herkenning/datasetcontract.md
  - /Users/frisovanweelden/Documents/projects/logoRecognition/_bmad-output/specs/spec-ghs-herkenning/testontwerp.md
  - /Users/frisovanweelden/Documents/projects/logoRecognition/_bmad-output/implementation-artifacts/investigations/ghs-codecontract-20261002.md
---
<frozen-after-approval reason="Gebruiker autoriseert alle vervolgstappen inclusief implementatie zelfstandig">

## Intent
De negen gevarenpictogrammen moeten daadwerkelijk door de bestaande herkenningsketen kunnen worden verwerkt en veilig worden beoordeeld. Bouw de contracten, onafhankelijke declaratievergelijking, een herkenningsroute op herleidbare echte referenties en een reproduceerbare kwaliteitsmeting volgens het bestaande plan. De laatste gebruikersopdracht vervangt de vroegere beperking tot planning.

## Boundaries & Constraints
Always: canonieke namen intern, GHS01–09 legacyoutput extern; categorie GHSSymbolDescriptionCode/veld gHSSymbolDescriptionCode. GHS blijft menselijke review, ook bij hoge zekerheid en overeenkomende declaratie. NO_PICTOGRAM is uitsluitend declaratief. Onafhankelijke familiesplits, checksums, bronverwijzing en bevroren versies. Bewaar bestaande overige logoherkenning.
Never: generieke drempelverlaging, synthetische trainingswaarheid, mockresultaten als echte herkenning, holdout in referenties/training/promotie, live DBmutaties of modelactivatie, handmatige containersacties. Geen Zoho.

## I/O & Edge-Case Matrix
| Scenario | Input/state | Verwacht |
|---|---|---|
| G01 | negen naam/nummerparen | één canonieke betekenis/categorie, legacynummeroutput |
| G02 | profiel met namen, nummers en dubbele bevinding | correcte selectie en ontdubbeling |
| G03 | GHS00/GHS10/NO_PICTOGRAM | geen positieve klasse of referentie |
| G04 | referentieregistratie geldig/ongeldig/dubbel | correcte metadata, idempotent; invalid vóór I/O; beide flywheelflags |
| G05 | exacte GHS XMLtag met namespaces/dubbelen | onafhankelijke declaratie; geen generieke enumfalsepositive |
| G06 | overeenkomend/ontbrekend/conflict/NO_PICTOGRAM | zichtbare reviewreden, nooit autoacceptatie/promotie |
| G07 | manifest met hash/familielek/holdout | lek afgewezen vóór gebruik; sealed data niet schrijven/promoten |
| G08 | crops negen klassen + UNKNOWN | volledige verwarringsmatrix en onzekerheid |
| G09 | label met meerdere boxes/missers/extras | één-op-één IoUmatching en alle fouten zichtbaar |
| G10 | negatieve labelgroepen | foutvoorstelaandeel per etiket met noemer |
| G11 | FLAME/FLAME_OVER_CIRCLE/exclamation | verwisselingen expliciet; andere GHS niet geen-symboolnegatief |
| G12 | klein/wazig/gebogen/reflectie/onleesbaar | kwaliteitssplits; onleesbaar abstain en geen vacuouscorrect |
| G13 | imageUrl-only | expliciet unsupported, geen leeg succes |
| G14 | bestaande niet-GHS routes | gedrag en regressietests behouden |
| G15 | verschillende datasets/model/ref/thresholdversies | frozen protocol afgedwongen, ontbrekend bewijs expliciet |
</frozen-after-approval>

## Code Map
- apps/api/src/services/reference-code-mapping.json: gedeelde Python/TS categorietoewijzing.
- apps/ml-service/app/symbol_contract.py: normalisatie/profiel/dedup; nu nummer-only en onbedoelde defaults.
- apps/ml-service/app/api/symbols.py: publieke legacyadapter; imageUrl-only doet nu geen fetch.
- apps/ml-service/app/api/artwork.py en services/classification.py: echte beeldroute, classifiergate en DBtemplates. Filter normalizeert nu niet.
- apps/api/src/services/t3777-declarations.ts: exacte XMLveldparser; GHS ontbreekt.
- apps/api/src/services/artwork-crosscheck.ts: huidige algemene autoacceptatie moet GHS afschermen.
- services/artwork-registration.ts, ml-client.ts, pipeline/detection-flow.ts en flywheel/promotion.ts: registraties en automatische promotie.
- apps/ml-service/scripts/regression_eval.py: bestaande evaluatie onvoldoende voor GHS multiboxmeting.

## Tasks & Acceptance
**Execution:**
- [x] Gedeelde negenklassennormalisatie, profielselectie, registratie en compatibele output implementeren.
- [x] GHSdeclaraties toevoegen en iedere GHSbevinding naar menselijke beoordeling met passende reden sturen; automatische registratie/promotie beschermen.
- [x] Echte GHSreferentieherkenning aansluiten op beide beeldroutes. Gebruik officiële, controleerbare starttemplates zodra beschikbaar (root verzamelt assets), met eigen versie en strikt GHSgerichte verwerking. Een referentieclassifier mag bestaande modellen ongewijzigd aanvullen; methodenaam moet waarheidsgetrouw en contractcompatibel zijn. Geen mock/lege placeholder als werkende herkenning.
- [x] Lokale manifestvalidatie, familiesplits, held-out guards en bevroren evaluatie-CLI implementeren; runtime beschermingsgrenzen expliciet integreren waar manifestbeelden geïmporteerd kunnen worden. Houd pilotdata buiten live writes.
- [x] Crop/hele-etiketmeting, één-op-één boxes, verwarringsmatrix, onzekerheid/kwaliteit en perklasse voldoende/onvoldoendebewijsrapport implementeren.
- [x] Betekenisvolle tests voor G01–G15 schrijven en draaien; bestaande regressies en build verifiëren. Traceer elke rij naar werkelijk uitgevoerde tests.

**Acceptance Criteria:**
- Given echte herleidbare referenties, when een leesbaar GHSbeeld wordt aangeboden via beide ondersteunde beeldroutes, then ontstaat een correct gecodeerde GHSbevinding zonder automatische bevestiging.
- Given een onafhankelijk manifest en frozen run, when evaluatie draait, then worden tellers/noemers/versies, fouten en perklasse bewijsgrenzen gerapporteerd zonder trainingsclaim uit referentieaantallen.
- Given onvoldoende echte holdoutdata, when gereedheid wordt berekend, then blijft de klasse onvoldoende bewijs; codevoltooiing wordt apart van veldkwaliteit vermeld.
- Given bestaande logo's, when regressietests draaien, then blijven de bestaande contracten correct.

## Implementation Notes
Deze worker bezit alle productcode, tests en lokale evaluatiecode voor GHS. Je bent niet alleen in de repository: behoud edits van anderen en pas je aan. Root bezit assetsverzameling, statusartifact, versions.md en release. Raak .gitignore en bestaande onderzoeksbestanden niet aan. Geen commit/push door worker. Geen zichtbare Codextaken. Implementeer zelfstandig tot alle uitvoerbare taken klaar; praktische keuzes zijn geautoriseerd. Bronbestanden worden door root geleverd onder apps/ml-service/app/assets/ghs; overleg via interne berichten bij behoefte. Gebruik subagents alleen sequentieel indien nodig.

## Spec Change Log

2026-10-04 — B4: artworkclassificatie retourneert optionele reference_version en requires_review voor GHS, zodat de werkelijk gebruikte templateversie niet verloren gaat. Bestaande consumers blijven compatible; geen database-schemawijziging. KEEP-instructies hierboven gelden. Autonoom herstel binnen bestaande intent, geen nieuwe gebruikersbeslissing.

## Review Triage Log

| Bevinding | Oordeel | Evidence | Route |
|---|---|---|---|
| B1 | medium | NO_PICTOGRAM wordt in artwork-crosscheck.ts declared-but-not-found behandeld; guard ontbreekt. | patch |
| B2 | high | symbols.py vangt detectorfout af zodra enige GHS bestaat; profiel kan vervolgens GHS wegfilteren en lege successresponse geven. | patch |
| B3 | high | classify_ghs staat vóór legacy-foutafhandeling; assetsfout blokkeert gewone cropclassificatie. | patch |
| B4 | medium | ClassifyResult en constructor laten reference_version/requires_review weg ondanks aanwezige outcome. Traceerbaarheid vereist optionele backward-compatible velden. | bad_spec |
| B5 | medium | Metadata controleert aanwezigheid maar niet annotator != secondReviewer. | patch |
| B6 | high | Manifest accepteert ongeldige bbox/dimensies; bestandscontrole vergelijkt geen decoded dimensions. | patch |
| B7 | high | Perceptuele vergelijking alleen volledige pagina; cropHash alleen exacte bytes. Gerescalede templatecrop kan onafhankelijkheid vervalsen. | patch |
| B8 | high | Runtime pilotguard gebruikt uitsluitend exacte SHA/pad; hercodering of resize omzeilt geregistreerde herkomstbescherming. | patch |
| B9 | high | Frozen sourceHashes ontbreken symbol_contract.py en gedeelde mapping; dirty labelwijziging behoudt config. | patch |
| B10 | medium | Onzekere correcte klasse komt op matrixdiagonaal en criticalConfusions despite geen correcte match. | patch |
| E1 | medium | Zelfde bevestigde NO_PICTOGRAM-outcome als B1; genoemde parserlocatie wijst feitelijk op consumerloop. | patch |
| E2 | high | Zelfde bevestigde unguarded GHS dependency-outcome als B3. | patch |
| E3 | high | Zelfde bevestigde verborgen detectoruitval als B2, extra profieluitsluitingspad gecontroleerd. | patch |
| E4 | high | Zelfde bevestigde cropperceptuele lekkage als B7. | patch |
| E5 | high | Zelfde bevestigde onvolledige bbox-validatie als B6. | patch |
| E6 | high | ReadableFamilies wordt toegevoegd op target alleen, zelfs als sample unreadable; minimum20 kan onterecht gehaald worden. | patch |
| E7 | high | Zelfde bevestigde frozen dependency omission als B9. | patch |
| E8 | high | Exposureledger hangt aan protocolfilename; nieuw protocol op identiek manifest omzeilt once-only. | patch |
| V1 | medium | Preverified provider/cachetest ontbreekt: alleen directe parser GHS getest; consumercanonicalisatie kan regressie ongemerkt krijgen. | patch |
| V2 | high | Preverified sufficient-evidence/pilotthresholdtakken niet bereikt door tests; omgekeerde negatievegrens blijft groen. | patch |
| V3 | medium | Preverified matchingreassignment ongetest; greedy mutatie behoudt tests maar verliest tweede geldige match. | patch |

Alle 21 bevindingen afzonderlijk geverifieerd of als preverified testgap beoordeeld vóór groepering. Groepen delen uitsluitend de beschreven rootcause; geen bevinding stil weggelaten. Geen defer. B4 vergt een kleine specificatieverduidelijking; gebruikersopdracht tot autonome implementatie en BMAD-flexibiliteitsregel maken herstel zonder destructieve volledige terugdraaiing passend. KEEP: negen officiële referenties, GHS01–09 extern, verplichte menselijke review, vier ontwikkeltreffers en bestaande niet-GHS regressies.

## Verification
API gerichte vitestcontract/declaratie/crosscheck/registratie/flywheeltests plus packagebuild/typechecks. Python contract/registratie/classificatie/evaluatietests (bestaande omgeving /tmp/logo-ci-repair-venv indien beschikbaar). Geen tests op live DB. Leg opdrachten en volledige pass/failresultaten vast in implementatienotities; onderzoek nieuwe fouten eerst in bestaande investigationcase vóór fixes.


## Implementatieverificatie 2026-10-03

Productcode/tests gereed voor onafhankelijke review; nog geen releaseactie door worker. Laatste lokaleverificatie 2026-10-03T21:49:52Z: Python150geslaagd, API166geslaagd, APIbuild0, ruffcheckapp/0, blackcheckapp/0(42bestanden), isortcheckapp/0, gitdiffcheck0. Exacte opdrachten, G01–G15traceermatrix en beperkingen: [testbewijs](ghs-test-evidence-20261002.md).

Officiële9templates werken via echte imageprocessing op symboladapter en artworklocalize/classify. Externelegacyenum blijft classifier/embedding; GHSbevinding gebruikt perdetectietemplateversieccohs-ghs-v1. AlleGHSbevindingen blijven menselijke review, menselijkeacceptatie blijft200accepted zondertraining/reference/promotie/goldset. GeenDBwrites,training,activatie,deploy,commit,pushofZohoactie door worker.

Geometrieontwikkelprobe op8echtelokalepagina's:4exclamationvoorstellenbehouden,2onterechtehealthhazardextrasstructureelgeblokkeerd; onvoldoende onafhankelijkkwaliteitsbewijs vooralle9klassen. Volledig bevroren onafhankelijke finalpilot ontbreekt; dataset/evalcode toont daarom onvoldoende bewijs en ontbrekende baseline/challengervergelijking expliciet. Reviewstatus/taakcheckboxes blijven verantwoordelijkheid van root na onafhankelijke diffbeoordeling.

Rootmatrixaudit: alle G01–G15gedragsrijen getraceerd naar testbewijs en gelezenimplementationdiff; eigenherhaling Python150/API166 exit0. Onafhankelijkeveldtestsubset en100negatievefamilies blijven explicietonvoldoendebewijs, geengetraindclaim. Review volgt.


## Review afgesloten — 2026-10-04T00:17:42.901321+02:00

Alle21bevindingen opgelost in14rootcause/testgroepen. Blindhunter bevestigt10/10opgelost; edgehunter8/8opgelost en zelfstandig71Python/18APIpass; verificationreviewer3/3gapsgesloten met mutationgevoelige assertions. Geen nieuwe bevestigde regressie en niets uitgesteld. Provenanceherstel ligt op MLresponsgrens; geen nieuwe DBversiekolom. Root190Python/169API/build/lint/opmaak/diff groen. Push/PR/CI/ACCverificatie volgt buiten lokale bouwfase onder bestaande gebruikersautorisatie.
