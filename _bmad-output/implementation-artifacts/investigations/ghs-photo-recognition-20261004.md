---
case: ghs-photo-recognition-20261004
status: confirmed
created: 2026-10-04T22:55:00+02:00
owner_repo: logoRecognition
affected_repos: [logoRecognition]
environment: ACC
trigger: Zelfstandig doorgaan tot gevaarlijke-stoffenpictogrammen voldoende herkenbaar zijn via de API; echte productfoto's tonen missers.
severity: high
---

# Onderzoek herkenning op echte productfoto's

## Hand-off Brief

VERIFIED: Coördinator meldt eerste ongewijzigde ACC-meting met model ghs-glyph-v1-46ddcb5bd01b: drie echte foto’s hebben4/7 voorstellen en3/7 gewone detecties. Die evidence wordt nu rechtstreeks gecontroleerd. Nieuwe onderzochte beelden zijn daarna ontwikkelbeelden, geen verzegelde eindtest.

## Case Info

VERIFIED: Alleen lokale analyse en dit onderzoeksartifact toegestaan in diagnosefase; geen productcodewijziging, training, netwerk-/database-/containeractie uitgevoerd. Eerste live meting en sourceannotaties blijven ongewijzigd behouden. Tijdstempels worden als UTC uit runtimeevidence gelezen; dit document vermeldt lokale datum Europe/Amsterdam.

## Evidence Inventory

VERIFIED: E1 broninventaris via `rg --files _bmad-output | rg 'ghs-specialist-20261004.*(runtime|quality)|photo|photo-recognition'` lokaliseert runtime-/qualityevidence en gehashte foto-/annotatiemanifesten.

## Hypothesized Paths

INFERENCE: Nog geen oorzaak vastgesteld. Kandidaten worden pas na rechtstreekse bronlezing gerangschikt en met killingtests onderzocht.

VERIFIED: Updateklok via `clock__curr_time` =2026-10-04 21:42:22 UTC (23:42:22 Europe/Amsterdam); eerdere createdtijd was overgenomen uit werkcontext en niet rechtstreeks gemeten.

VERIFIED: E2 rechtstreekse JSON-lezing `ghs-specialist-20261004-acc-runtime-evidence.json` en quality-summary bevestigt bij0.87 precies3/7 reguliere fototreffers,4/7 inclvoorstellen; preparedzelfde familie1/3 regulier,2/3 inclvoorstellen. Eerste meting onveranderd.

VERIFIED: E3 `OPENBLAS_NUM_THREADS=1 /tmp/logo-ci-repair-venv/bin/python .../photo-diagnosis/diagnose.py` verifieert alle fotohashes, reproduceert lokale detect_ghs exact de GHSfotoresponses, noteert contourregels/IoU en rawclassifier-score/marge/support in `photo-diagnosis/diagnosis.json`. Directe lokale uitvoering en eerdere echte HTTPresponses zijn onafhankelijke verificatieroutes van dezelfde missers.

VERIFIED: E4 diagnostic-only `photo-diagnosis/interventions.py` verandert uitsluitend tijdelijke beeldarrays, niet productcode/model/bronfoto’s. `interventions.json` registreert vier varianten per contour: originele crop, luminantiegenormaliseerde crop, geometrisch rechtgezette crop, beide. Geen training, parameterwijziging of liveactie.

## Confirmed Findings

VERIFIED: F1 ENVIRONMENT op KMnO4 heeft gesloten rode vierhoek, voldoende area/aspect/cardinale punten, maar whiteness0.01 (<0.50). De vaste absolute helderheidseis verwerpt de grijze schaduwzijde. Onveranderde classifier op deze crop noemt HEALTH_HAZARD0.945 door achtergrondpixels onder vaste gray150. Lokale luminantiecorrectie (90epercentiel neutrale pixels naar235) geeft ENVIRONMENT0.934 en met geometrische correctie0.981 zonder gewichts- of scorewijziging. Preparedzelfde familie bevestigt whiteness0.01 en herstel0.982 (E3/E4).

VERIFIED: F2 KMnO4oxidizer is wel kandidaat maar outercropclassifier noemt FLAME0.586; innerstrokecontour, nu vóór classificatie gededupliceerd, noemt correct FLAME_OVER_CIRCLE0.985. Luminantiecorrectie van outercrop geeft0.985. Huidige templatefallback0.754 verklaart voorstel zonder regulier resultaat (E3/E4).

VERIFIED: F3 methanolFLAME komt door alle candidatefilters, rawclassifier0.643/support0.592 faalt frozen minimum0.70/0.60. Geometrisch rechtzetten van innerstrokecontour geeft FLAME0.991/support0.915. Geen thresholdverlaging nodig; huidige dedup verwijdert die contour voordat classifier haar ziet (E3/E4).

VERIFIED: F4 methanolSKULLoutercontour heeft IoU0.90 maar diamondDistance>0.22 en whiteness0.34; innerstrokecontour IoU0.64 heeft geldige geometrie maar whiteness0.15. Huidige axisalignedglyphclassUNKNOWN0.575/support0.529. Rechtzettenoutercrop verhoogt correctSKULLtot0.547/support0.647, nog onvoldoende. Blind helderheidnormaliseren maakt dit onterecht HEALTH_HAZARD0.926; dus geen ongecontroleerde fallbackacceptatie toepassen (E3/E4).

## Hypothesized Paths — killing tests en uitkomst

VERIFIED: H1 API/runtimeprobleem REJECTED: lokale pure route reproduceert HTTPexact; missers ontstaan vóór serializer/infrastructuur (E2/E3).

VERIFIED: H2 alleen threshold0.99 oorzaak REJECTED: dezelfdeFLAME/SKULL/ENVobjecten ontbreken ook in proposals bij0.87; rawguard/candidate-afwijzing aangetoond (E2/E3).

VERIFIED: H3 vaste wit/darkdrempels+axisalignedcrop+vroeg stroke-dedup CONFIRMED voorENV/oxidizer/FLAME: gecontroleerde luminantie-/geometrie-interventies herstellen correct met bestaande frozenweights en stricterawguards (E3/E4).

INFERENCE: H4 dunne/gekromde SKULLglyph is resterende preproces-/domeinmismatch; geen bewijs dat training noodzakelijk is. Killingtest: contourgestuurde rectificatie plus expliciete neutrale-achtergrond/symboolsegmentatie moeten frozen classifier juistecode boven bestaande guards geven; anders naderonderzoek/traininginput bespreken met coördinator.

## Recommended Actions

INFERENCE: P1 code change via BMAD: begrensde, contourgestuurde fotocorrectie voor alleen eerder afgewezen/zwakke GHSgevallen; behoud sterke bestaande resultaten, gesloten rode geometrie, neutraliteits-/contrastchecks, frozenweights/guards, origineel bbox en thresholdcontract. Geen helebeeldcrop of scoreverhoging; preprocessingtraceapart vastleggen.

INFERENCE: P2 read-only research: SKULLcontrast/rectificatie afzonderlijk diagnosticeren vóór concrete recoveryregel; onterecht HEALTH_HAZARD moet regressie expliciet blokkeren.

VERIFIED: Out of scope: geen claims gold/finalholdout/20families, geen additionele onafhankelijke negatievebenchmark, geen bron-/annotatiemanifestwijziging, geen ACC/DB/config/container/Gitactie. Eerste bevrorenmeting blijft intact.

VERIFIED: E5 diagnostic-only `photo-diagnosis/skull_interventions.py` verwerpt hypothese "training noodzakelijk voor deze SKULL": neutrale-achtergrond-Otsusegmentatie plus geometrische rectificatie van gesloten innerstrokecontour geeft bestaande classifier SKULL_AND_CROSSBONES0.926/marge0.903/support0.871. Zelfde deterministischebewerking geeft FLAME0.997/support0.945 op naastgelegen innerstroke. Rawguards blijven onveranderd. Geen maskermorfologie, handgetekende polygonen of truthboxes gebruikt voor transformatie; contouren komen uit echte rodepixels, overlapmetannotatie dient uitsluitend diagnostiek (skull-interventions.json).

VERIFIED: H4 preprocessingmismatch CONFIRMED voor deze twee afbeeldingen: color-neutral segmentation voorkomt donkerrode rand als blackglyph, contourrectificatie herstelt aspect/rotation. Dit bewijst herstelbaarheid op ontwikkelbeelden, geen onafhankelijke generalisatie.

VERIFIED: E6 `photo-diagnosis/measure.py` voor/naregressiemeting behoudt34 eerdereproductobjecten en18 nieuweSDSproductobjecten; originals7/7 en derivative3/3correct/niet-onzeker. Nieuweextra onzekereHEALTH_HAZARD0.844/support0.614 op agar-benzoyl-peroxide18×19pixelingredientlogo. Eerste post-fixevidence blijft bewaard `development-after-measurement.json`; extra is geenproductmatch en niet boven0.87 maar wel nieuwreviewvoorstel, daarom vervolgonderzoek vóór structurele guardwijziging.

VERIFIED: F5 recoveryrectificeert18×19pixels naar128×128: weinig echteinputpixels leveren interpolatieartefacten, frozenclassscore dichtbijminimum, eerdere gewone route gaf dit voorstel niet. Eigenaarg hs_reference recovery. Negatieve regressie bevestigd door extraobjectvergelijking in nieuwe23annotaties en rechtstreeks extraresponseJSON.

INFERENCE: P3 bounded BMADcodechange: herstelbranch vereist minimaal32 echtewerkpixels per contouras, zodat inputglyph niet uit slechtsenkele pixels gereconstrueerd wordt. Oude16pixeltemplate/learnedroute blijft onveranderd. Dezeherstelgrens is ruim onder100+pixelechtefotoobjecten en moet als low-resolutionabstention getest worden; geenconfidencewijziging/modelaanpassing.

## Uitvoering — lokaal, afzonderlijke BMad-build

VERIFIED: Implementatie volgens `spec-ghs-photo-recognition-20261004.md`, footprintghs_reference.py/test_ghs_specialist.py/ghs-specialist.md. Herstel neutral-quad-v1 gebruikt rodequadvertices, automatische neutraleOtsusegmentatie, relatieve heldereannulus en contrastguard. Min32werkpixels voorherstel; bestaande16pxroute unchanged. Geen nieuwe featureweights/policytraining. Sterke bestaande resultaten worden niet opnieuw verwerkt; conflicterende strokes worden afgewezen, late merge transactioneel.

VERIFIED: E7 `measure.py development-after-resolution-guard.json` houdt alle34oudeproduct en18nieuweSDSproductobjecten correct;7/7originalfotoobjecten en3/3samefamilyderivativecorrect/niet-onzeker. Rawtelling nieuweSDS23expected22correct21niet-onzeker0extras; oude46expected36correct36niet-onzeker1bestaanduncertainextra. BetwistFinishobject blijftapart, naieve notingredientteller35 omvat34product+1dispute. OrigineelphotoHTTPbewijs ongewijzigd; development.json werd per ongeluk met lokaleafter overschreven en direct via bevroren Gitrevisiondca90c2eec4bf64f568350afc3e006d603cf3755 gereconstrueerd; actuele after is apart after.json, geenlivebewijsoverschreven. Diagnose/evidence scripts weigeren nu bestaandeoutputpaden.

VERIFIED: E8 eerste volledigePythonrun189passed; aanvullende reviewnegatieven/budget/twoadjacent/transactiontests44specialistpassed. Groot recoverycoordtest volgt met exacte origineleposities. Alletests lokaal, geenlivewrites.

VERIFIED: E9 pinnedBlackcheck vraagt uitsluitend opmaak test_ghs_specialist.py naRuffformat; geen runtime/testfailure, eigenaar lokale tests. Structurele richting: CIformatterBlack toepassen op owned testfile en Black/isort/Ruffcheck opnieuw; inferencecodeBlackcheckreedsgoed.

VERIFIED: E10 definitieve lokale197Pythonchecks passed, specialist45inclgroteoriginalbbox passed; ownedBlack/isort/Ruff/diffcheckpass. engineering-freeze.json bewaart hashcode/model. Alleen tijdelijkediagnosescripts /tmp/photo-otsu.py,/tmp/skull-diagnostics.py,/tmp/photo-synthetic.py verwijderd; onderzoeksartifacten en diffbewij sbehouden. GeenGit/live/DB/containerwijzigingen door dezeagent. Onafhankelijke coördinatorreview/release nogpending.
