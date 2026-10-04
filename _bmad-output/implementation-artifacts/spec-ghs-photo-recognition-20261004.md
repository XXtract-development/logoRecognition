---
title: 'GHS herkenning op schaduwrijke en gekromde productfoto’s'
type: 'bugfix'
created: '2026-10-04'
status: 'implemented'
baseline_commit: 'd9ebedb143f0fc348e1f027af95ddfbd1523e0ca'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="bestaande expliciete autonome gebruikersopdracht">

## Intent

**Problem:** De gewone API herkent op drie echte productfoto’s maar3/7 pictogrammen bij0.87, hoewel hetzelfde onveranderde model alle34 eerdere ontwikkelobjecten en18 nieuwe SDSobjecten herkent. Lichtval en gekromde etiketten maken de uitsnede/verwerking ongeschikt voordat de bestaande classifier beslist.

**Approach:** Voeg een begrensde herstelroute toe die alleen echt gesloten rode vierhoeken geometrisch rechtzet en hun neutrale achtergrond van het donkere symbool scheidt. Behoud de sterke bestaande detecties; beoordeel gewijzigde crops met hetzelfde bevroren model en dezelfde afwijzingsregels.

## Boundaries & Constraints

**Always:** Gesloten rodecontour, viervertices, bestaande geometrische basiscriteria; expliciet contrast/neutrale achtergrondguard; boundedpixels/contours/classifiercalls/output. Bbox blijft werkelijk gevonden contour in oorspronkelijke pixels. Modelsha8d989fa8e183fd83f1921f0fdf60167c2ac6658bfbcdfaa49421407a186dfd7d, modelweights/provenance/guards blijven exact. Vereistreview, ongekalibreerde scores, .99default en callerthreshold behouden. Sterke bestaande detecties en andere logo’s onveranderd. Traceerbare recoverypreprocessing via methodbeschrijving/versie in referentietrace; geen verborgen gewijzigd featureschema in training. Alle nieuw bekeken sources blijven AIontwikkeldata, geen onafhankelijke eindtest.

**Never:** Training, thresholdverlaging, confidenceinflatie, gebruik truthbox/modelgestuurde helebeeldcrop, handmatige symboolmaskers, bronannotaties aanpassen, modelselectie op finalholdout, DB/config/container/git/liveacties. Nieuwe code uitsluitend bestaande toegewezen productfiles; researchsource/release/status eigendom coördinator.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Schaduw | Grijze neutrale papierachtergrond met rode gesloten ruit | Lokaal contrastgestuurde segmentatie, model accepteert alleen bestaande guards | Afwijzen bij onvoldoendecontrast/neutraliteit |
| Kromming/rotation | Geldige rode vierhoek met perspectiefafwijking | Contourpunten sturen homografie naar canonieke ruit; classifier ziet correcte glyphverhouding | Afwijzen bij nietconvexe/degenerate quad |
| Binnen/buiten stroke | Twee contouren van dezelfde rode ruit | Herstel vóór dedup, één resultaat met echte bbox; sterk bestaande resultaat behouden | Conflicterende recoveryklassen niet blind kiezen |
| Vaste sterke route | Template/specialist al zeker boven0.87 | Resultaat behouden | Recovery mag niet overschrijven |
| Red artwork | Rode cirkel/tekst/frame of neutraalcontrast ontbreekt | Geen herstelvoorstel zonder alle geometrie-/achtergrond-/modelguards | Afwijzen |
| Grote rode rasters | Veel grote contouren | Pixel/contour/candidate/classifierlimieten | Begrensde kosten en≤64 GHSresultaten |
| Model kapot | Missing/corruptweights | Bestaande templatefallback blijft | Exception recovery ondervangt zonder deelmutatie |

</frozen-after-approval>

## Code Map

- `apps/ml-service/app/services/ghs_reference.py`: bestaande regions verwerpt whiteV<160, dedup vóór classificatie; detect_ghs gebruikt axisalignedcrop. Bestaande regions/referencegedrag laten staan; losse fallbackhelper en late bounded merge.
- `apps/ml-service/app/services/ghs_specialist.py`: pure frozenclassify/features; nietwijzigen om trainingsfeatures gelijk te houden.
- `apps/ml-service/tests/test_ghs_specialist.py`: runtimefixtures/APIintegratie/threshold/weights/andere logos bestaan; uitbreiden met fototransformaties en failureguards.
- `apps/ml-service/scripts/ghs-specialist.md`: contractgrenzen en preprocessingtrace documenteren.
- `photo-diagnosis/diagnosis.json`, `interventions.json`, `skull-interventions.json`: gemeten oorzaken en arrays-only herstel. Gehashte bronfotoboxen alleen ontwikkelmeting, niet shippingfixture of classifierinput.

## Tasks & Acceptance

**Execution:**
- [x] `apps/ml-service/app/services/ghs_reference.py` -- bounded recoveryhelpers en late merge -- herstel geometrie/licht zonder classifiertrainingwijziging.
- [x] `apps/ml-service/tests/test_ghs_specialist.py` -- betekenisvolle perspectief/schaduw/neutraliteits/CPU/fallback/APItests -- bescherming tegen hetzelfde probleem en nieuwefalsepositives.
- [x] `apps/ml-service/scripts/ghs-specialist.md` -- recoverycontract/evidencebeperkingen -- herkenbaar model/inputverwerkingsonderscheid.

**Acceptance Criteria:**
- Given frozenmodel en zeven AIgelabelde objecten op drie echteontwikkelfoto’s, when lokale gewone route0.87 meet, then rapporteer voor/na perobjectcode+IoU.5+uncertainty, behoud eerdere34 en nieuwe18 correct; verbeter foto’s zonder foutcode/extraresultaat.
- Given perspectief/schaduwvariant officiële glyph, when detect_ghs en gewone API werkelijk draaien, then correcteclass/actualbbox/reviewmetadata en trace, geenmockedclassifier.
- Given sterke bestaandeGHS/anderebrandresultaten, when recovery aanwezig/kapot/conflict is, then bestaande resultaten en thresholdcontract blijven.
- Given zwart ADRchallenge, rode nietruit en contrastloze ruit, when detect_ghs draait, then geen nieuwGHSvoorstel; dit is integratiebewijs, geenfieldFPRclaim.
- Given fotosvoorbeelden met veranderdeverwerking, when resultaten worden beschreven, then frozenweights unchanged maar verwerkingsrevision nieuw; geenindependentfinal/goldclaims.

## Implementation Notes

De reeds gerenderde bmad-buildsnapshot wordt hergebruikt. Gebruikersmandaat en ouderopdracht autoriseren zelfstandig spec/implementatie; geen nieuwe approvalstops. Dirtytree bevat oude evidence/.gitignore, productcode schoon bijstart. Eerdere agentslotfout vraagt inlineimplementatiefallback, met onafhankelijke coördinatorreview vóór release. Root beheert release/versions, geenconflicten.

## Spec Change Log

## Review Triage Log

Zelfreview: blinde luminantiecorrectie gaf foutHEALTH_HAZARD op skull; daarom geen luminantiemultiplier als rescuekeuze maar deterministische neutrale segmentatie+homografie. Conflict tussen nieuweklassen op zelfdecontourcluster vraagt abstention, geen hoogsteprobabilitywinkel.

## Verification

- Lokale pure runtime/Python suites182 bestaandechecks plus nieuwe betekenisvolle regressies; Node bestaande15routeinjecttests behoud.
- Nieuw `photo-diagnosis/after.json` meet allefoto’s inclsamefamilyderivative/ADR; bestaande34/18 AIontwikkelmeting opnieuw, bron/annotations unchanged.
- Ruffcheck/format, diffcheck, modelSHAcheck. Geen deploymentacties in deze build; coördinatorreview en release daarna.

## Aanvullende reviewtriage en implementatie

Onafhankelijke coördinatorspecreview: clusterconflicten, exact behoud sterke uitkomsten, twee nabije losse ruiten, contrastrijke neutrale artwork/tekst, bijna-gesloten rand, globale calllimiet en failure na eerste toevoeging. Afgedekt door nieuwe tests; de grote schaduwfototest berekent originele bbox rechtstreeks uit rodebronpixels buiten de kandidaat-/schaalhelper. Inference maximaal64 gewone +128 herstelclassifiercalls; pixels4MP, contouren256, groepen64, strokes2 pergroep.

Nieuwe ontwikkelfailure E6 is vóór fix geappend aan onderzoekscase:18×19ingredientlogo gaf extra onzeker HEALTH_HAZARDvoorstel. Structurele herstelguard minimaal32 echtewerkpixels peras voorkomt extreem upsamplen; oude gewone16pxroute blijft. Eerste failuremeting `development-after-measurement.json` behouden, vervolg `development-after-resolution-guard.json` toont0 nieuweSDSextra’s. Geenconfidence-/modelwijziging.

Verificationdata: oude46AIobjecten36correct,34/34 productcontextcorrect (naast één betwist extraobject, daarom naieve "nietingredient"teller35); nieuwe23AIobjecten22locatiecorrect,21niet-onzeker,18/18productcorrect. Drie originals7/7niet-onzeker, preparedzelfde familie3/3, ADR0. Oude input23 extraonzekeroxidizer blijft exactbestaand; geenfieldFPRclaim.

Finale lokale suite197passed, specialist45passed; Black/isort/Ruffownedpass. GewichtsSHA exactongewijzigd. Codefrozen in photo-diagnosis/engineering-freeze.json; independentrootreview/release volgt.

2026-10-04T22:00:00Z: onafhankelijke read-only eindreview geen open materiële codebevinding. Alle drie producthashes/modelhash en vier eerste annotatiehashes geverifieerd; oorspronkelijke HTTPresponsen behouden. Release en actuele ACC-controle zijn eigendom root en volgen afzonderlijk.
