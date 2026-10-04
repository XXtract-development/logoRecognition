---
title: 'Getrainde GHS-specialist in de gewone herkennings-API'
type: feature
created: 2026-10-04
status: done
route: dispatch
review_loop_iteration: 0
context: []
baseline_commit: 56db79fece955a8361ac8813fd6c4fdeff76cd57
---

<frozen-after-approval reason="Gebruiker autoriseert zelfstandig bouwen en trainen 2026-10-04">

## Intent

**Probleem:** Gevaarlijke-stoffensymbolen worden slechts gedeeltelijk herkend door vaste pixeltemplates. De gewone herkennings-API gebruikt deze specialist bovendien niet. Een generieke training zou de verkeerde beeldtaak trainen en bestaande logo's beïnvloeden.

**Aanpak:** Bouw een kleine gespecialiseerde CPU-classifier met reproduceerbare lokale training, bevroren modelbestand en begrensde abstentie. Combineer deze met zorgvuldig verbeterde rode-ruit-localisatie en behoud sterke bestaande templatehits. Integreer hetzelfde pad in gewone herkenning en bestaande symbool-/artworkroutes. Dit is implementatie plus ontwikkelbewijs; voldoende praktijkkwaliteit wordt pas vastgesteld op afzonderlijk verzamelde onafhankelijke eindbeelden.

## Boundaries & Constraints

**Altijd:** Negen canonieke GHS-klassen, bestaande metadata en menselijke-reviewstatus blijven traceerbaar. Elke bron krijgt hash, familyId, split, provenance en labelstatus. Augmentaties blijven dezelfde familie; geen afgeleide beelden in onafhankelijke eindtest. Train/validation/holdout kunnen niet dezelfde familie/hash delen. Bronbeelden met AI-labels zijn geen gold. Officiële gebundelde beelden zijn toegestane trainingsreferenties, geen praktijkbewijs. Root verzamelt extra bronnen en beheert release, versions.md, status en onderzoeksbronbestanden. Werkboom bevat andermans oude evidence en .gitignore: behoud die. Je bent niet alleen; geen edits van anderen terugdraaien.

**Nooit:** Generieke live trainer starten, database/import/modelactivatie/containerconfig wijzigen, commit/push, scores verhogen tot0,99 om het API-filter te passeren, onafhankelijke aantallen uit synthetische data presenteren, classificatieverbetering gelijkstellen aan gemeten eindkwaliteit. Geen live netwerkcalls nodig. Nieuwe echte miswerking eerst toevoegen als follow-up aan investigation vóór codefix.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Herkenbaar GHS | Werkelijk beeld of officieel integratievoorbeeld, normale detector zonder objecten | Canonieke hazardous/GHS-detectie met box, oorspronkelijke score en specialistversie | Geen storage-/DBwrites door specialist |
| Hoge API-drempel | Geldig GHS-voorstel met score onder gevraagde drempel | Voorstel blijft apart zichtbaar in review_proposals als uncertain=true en requires_review=true; detections respecteert minimum, score blijft eerlijk | Geen automatische bevestiging |
| Overige logo's | Niet-GHS-detectorresultaten | Bestaande filtering, labels, embeddings en volgorde blijven gelijk | Specialistfout bewaart legacyresultaten |
| Geen symbool | Lege ruit, rode vorm, onbekende glyph, achtergrond | Abstentie/geen positief GHS-label | Geen willekeurige nearest-class voorspelling |
| Verkeerd model | Ontbrekend/corrupt/tampered artifact | Bestaande template-/legacyroute blijft beschikbaar, fout zichtbaar in logging | Geen externe download of herschrijven |
| Besmette splits | Hergebruik familie/hash tussen train en validatie/eindtest | Training weigert vóór artifactwrite | Fout noemt bron/split, geen secrets |

</frozen-after-approval>

## Code Map

- `apps/ml-service/app/services/ghs_reference.py`: huidige ruitselectie en templates; THRESHOLD0,87/FLOOR0,65. Vier skull/twee bomb correct gelokaliseerd maar score0,268–0,568; ENV verwarring FLAME. Behoud sterke templates en bestaande officiële tests.
- `apps/ml-service/app/ml/detector.py`: gewone detectie; voeg GHS pas na legacy embeddings/matching toe, zodat GHS nooit wordt overschreven door algemeen logozoeken. Category/value moeten aansluiten op bestaande reference mapping.
- `apps/ml-service/app/api/detection.py`, `apps/api/src/api/v1/recognition.ts`, `apps/api/src/services/ml-client.ts`: responsevelden/schema/Typescriptmapping moeten reviewstatus en specialistversie behouden.
- `apps/ml-service/app/api/symbols.py`: GHS wordt nu apart gecombineerd met legacy. Voorkom dubbele detecties nadat legacy zelf GHS uitvoert; preserve mocked oude contracttests en profielselectie.
- `apps/ml-service/app/symbol_contract.py`: GHS-canonieke namen, oude GHS01–09 symbooloutput en methode/classifiernormalisatie.
- `apps/ml-service/app/assets/ghs/manifest.json`: gehashte officiële referenties, provenance; behoud onveranderd.
- `apps/ml-service/tests/test_ghs_images.py`: smoke alle negen klassen, frame/negatieven, aliasprofielen, foutfallbacks; behouden.
- `_bmad-output/planning-artifacts/research/ghs-training-20261004/baseline/`: huidige 24beelden,46AI-kandidaten, baseline.json en investigation.md. Ontwikkelmeting, geen eindtest.
- `_bmad-output/planning-artifacts/research/ghs-sources-20261004/annotations/`: exact images/inputs/summary/raw; labels en rechten onzeker, alleen diagnostisch gebruiken.

## Tasks & Acceptance

**Execution:**
- [x] `apps/ml-service/app/services/ghs_specialist.py` — zelfstandig begrensd CPU-inference met HOG/glyphnormalisatie en learned artifact, liefst JSON/numpy/OpenCV zonder zware runtimeafhankelijkheden.
- [x] `apps/ml-service/scripts/train_ghs_specialist.py`, `apps/ml-service/app/assets/ghs/specialist/` — werkende offline training met deterministische augmentatie, UNKNOWN-negatieven, splits/provenance/hashes, bevroren artifact en rapport; aanvankelijk officiële referenties gebruiken.
- [x] `apps/ml-service/app/services/ghs_reference.py` — learned fallback en alleen bewijsgericht verbeterde localisatie; geen generieke drempelverlaging.
- [x] `apps/ml-service/app/ml/detector.py`, `apps/ml-service/app/api/{detection,symbols}.py`, API response/types — canonieke gewone API-output, eerlijk onderdrempelvoorstel en traceerbare review/modelmetadata.
- [x] `apps/ml-service/tests/test_ghs_specialist.py` en passende API-tests — matrixgevallen plus modelintegriteit, reproduceerbaarheid, negen klassen, default0,99 en legacyregressies.
- [x] Eigen implementatiebewijs — herhaal24beeldmeting en rapporteer34product/46all-kandidaten vóór/na; noteer geen gold/holdout.

**Acceptance Criteria:**
- Given officiële integratiebeelden, when normale detectie draait met onderliggende lege detector, then alle negen klassen komen eenmaal terug met hazardcategorie en reviewstatus.
- Given bestaande logos plus GHS, when threshold of embeddings wordt gevraagd, then oorspronkelijke logogedrag blijft gelijk en specialist wordt niet door similarity-matching hernoemd.
- Given bevroren modelartifact en trainingsmanifest, when dezelfde training opnieuw draait, then labelmap/features/weights en provenance reproduceerbaar zijn, ongeacht JSONvolgorde.
- Given ongeldige familie/hash/split of gemodificeerd artifact, when training/inference draait, then betreffende onveilige actie wordt geweigerd of gecontroleerd teruggevallen.
- Given huidige developmentdata, when implementatie wordt gemeten, then baseline/delta en onzekerheden staan afzonderlijk zichtbaar; onafhankelijke kwaliteit wordt niet geclaimd.

## Implementation Notes

Spec en verdergaan zijn vooraf geautoriseerd door gebruiker; checkpoint en dirtytree-formaliteit leveren geen nieuwe vraag op. Geen intentgaten. Footprint circa8productfiles plus tests/scripts/model. Geen onomkeerbare/livewrites in deze deelrun. Diepe verkenning en baseline uitgevoerd door deze agent; verdere dispatch gebruikt alleen deze spec.

2026-10-04: voorgeschreven implementatiesubagent geprobeerd; platform meldt `agent thread limit reached`. Daarom expliciete workflowfallback: rechtstreeks vanuit spec implementeren. Geen extra zichtbare taken aangemaakt.

2026-10-04: engineeringafgerond;182 Pythoncontract-/regressietests en15 Node route-injecttests geslaagd, APIbuild/ruff/diffchecks geslaagd. Geen commit/push: coördinator voert release uit. Model `ghs-glyph-v1-46ddcb5bd01b`, SHA256 `8d989fa8e183fd83f1921f0fdf60167c2ac6658bfbcdfaa49421407a186dfd7d`, volledige hertraining byte-identiek. Ontwikkelbewijs34productvakmatches is geen eindtest; extra onzeker klein ingrediëntvoorstel blijft zichtbaar. Onafhankelijke edge-case review door coördinator en verification-gap door bestaande reviewer afgerond; blind contextvrije reviewerlaunch niet beschikbaar wegens platformthreadlimiet. Gebruikersmandaat zelfstandige uitvoering vervangt externe review-HALT, beperking expliciet behouden. Alle gerapporteerde findings opgelost en meaningful tests toegevoegd.

## Spec Change Log

2026-10-04 coördinatorbesluit binnen geautoriseerde zelfstandige API-implementatie: onderdrempel-GHS hoort in nieuw `review_proposals`, niet bestaande `detections`. Bewaart bestaande minimumconfidencecontract; alle niet-GHS-uitkomsten blijven ongewijzigd.

## Review Triage Log

2026-10-04 coördinator onafhankelijke edge-case review: high — GHS-duplicate canonieke klasse+IoU≥0,5 in gewone detectie/symboolnormalisatie toevoegen, overige logo's behouden; medium — pixelwerk/candidatecount/proposals begrenzen; medium — NaN/Inf/drempel/modelpolicy expliciet valideren. Alle drie geaccepteerd, implementatie en meaningful regressietests volgen.

2026-10-04 tweede coördinatorreview: high — categoriecheck vóór legacy-dedup; sterkere bestaande GHS mag niet onder API-drempel verdwijnen; specialisttoevoeging transactioneel zodat mid-loop failure legacy onveranderd bewaart. Geaccepteerd en aparte regressietests toegevoegd. Zelf-review medium — eindtestprotocol miste nieuwe modelgewichten/features; protocol uitgebreid met specialistbron/model/manifesthashes. Geen praktijkbewijs uit contracttests afgeleid.

## Design Notes

Een compact geleerd glyphmodel voorkomt afhankelijkheid van GPU en een verkeerde objectdetectortraining. UNKNOWN en afstand/margemeting moeten voor onzekere glyphs kunnen afzien van een positief label. Modelscore blijft een ontwikkelscore, geen gekalibreerde kans. Officiële synthetische training blijft expliciet van echte veldvalidatie gescheiden.

## Verification

- `/tmp/logo-ci-repair-venv/bin/python -m pytest` op nieuwe tests plus GHScontract/beelden/evaluatie en detectorregressies; vanuit tmp met absolute PYTHONPATH om foutieve lokale CORSdotenv te vermijden.
- Pythonruff/format en API gerichte tests/typecheck voor veranderde output.
- Reproduceer lokale ontwikkeling met bestaande baselineinputmanifest; root doet release en latere onafhankelijke API-eindtest.
