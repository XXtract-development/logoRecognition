# Investigate — NutriScore-categorie is niet "af" te maken via het vliegwiel: letterloze declaratie + labelintegriteit

Datum: 2026-07-12 · Confidence: **HIGH** (read-only gemeten op ACC, image `6bf5fad`, + index/code-bevestigd) · Status: root cause bevestigd, **beslissing + fix-story nodig** (geen ad-hoc fix)

## Aanleiding
Doel van Friso: de **NutriScore-categorie volledig afmaken** (alle 5 codes A–E herkenning-klaar, ≥ k=3 door mensen bevestigde echte crops). De dekkingsmeting (`keurmerk-dekking-per-categorie-2026-07-12.md`) suggereerde "bijna vol" (4/5 klaar, alleen NUTRISCORE_D op 2 crops — net onder de drempel). Een gerichte D-diagnose (`nutriscore-d-diagnose-2026-07-12.md`) weerlegt dat "even D afmaken" mogelijk is.

## Root cause (bevestigd) — twee onafhankelijke blokkades

### 1. Letterloze declaratie (structureel — de kern)
Het hele vliegwiel draait op **"gedeclareerde code → zoek artwork van declarerende GTINs → bevestig crop"** (19.3-index → 19.4-sampler / 19.8-bootstrap / 19.10-harvest). Maar NutriScore-**producten declareren het generieke `GENERAL_FOODS`, niet de letter A–E.**
- De MinIO-index `flywheel-index/keurmerk-etiket-index.json` heeft **0 `NUTRISCORE_*`-sleutels** — alleen `NutritionalScore/GENERAL_FOODS` (3 GTINs, letterloos).
- Gevolg: er is **geen gerichte artwork-bron per letter**. De harvester/bootstrap kán NUTRISCORE_D (of A/B/C/E) niet gericht voeden, want de declaratie wijst nergens naar een specifieke letter. Dit is fundamenteel anders dan Packaging/DietType/EU-usage, die de specifieke code wél declareren (daar werkt het vliegwiel zoals bedoeld).

### 2. Labelintegriteit van de bestaande NutriScore-refs (data)
- NUTRISCORE_D telt read-only **2 "echte" refs**, maar die zijn **geoogst als NUTRISCORE_B en _C** (bestandsnaam-marker) en later **onder D geregistreerd**; ze staan niet in de gold-set. Reëel risico dat D **feitelijk 0 correct-gelabelde crops** heeft.
- 4 extra als-D-geregistreerde crops zijn **gededupte bijna-duplicaten uit één B-productserie** — geen schone, onafhankelijke bron.
- D's historie is moeizaam: **12 rejected + 11 door de gate afgewezen**, **0 open** review-items (dus geen triviale "keur even goed"-route).
- Omdat crops onder de verkeerde letter geregistreerd raakten, is de **"4 van 5 klaar" voor A/B/C/E ook verdacht** — een integriteitscheck op alle vijf is verstandig voordat "categorie af" geclaimd wordt.

## Secundaire laag (bevestigd, breder)
- **`reference_logos.field_type`/`gs1_field` zijn niet onderhouden** (236/241 actieve refs in de default-bak `PackagingMarkedLabelAccreditationCode`, ook VEGAN/HALAL/PREGNANCY/Nutri-Score-crops). Het systeem kan zichzelf daardoor niet per categorie verantwoorden; per-categorie-rapportage is nu handwerk. Dit vergrootte het risico op stille mislabels (zoals B/C-onder-D). Zie de dekkingsmeting.

## Impact
- **NutriScore is via het declaratie-gedreven vliegwiel niet "af" te krijgen op letterniveau** — niet door meer harvesten, want de bron ontbreekt structureel.
- Bovendien: zelfs als een letter herkend zou worden, kan de **crosscheck (gedeclareerd vs gevonden) de letter niet valideren** (de declaratie is letterloos) — dus per-letter-NutriScore staat sowieso los van de declaratie-validatie die de andere categorieën borgt.
- De "bijna vol"-indruk was deels een artefact van mislabels; het echte aantal genuine D-crops is vermoedelijk 0.

## Aanbevolen richting (voor de beslissing/fix-story — meet-gedreven, vangnet blijft)
Dit vraagt eerst een **product/scope-beslissing** (Friso), dan pas bouw:

1. **Labelintegriteit herstellen (los van de scope-keuze, sowieso nuttig):** een menselijke integriteitscheck op de refs van NUTRISCORE_A–E (dragen de crops echt die letter?), mislabels corrigeren/deactiveren, near-dup-vervuiling opruimen. Levert het echte startpunt per letter.
2. **Scope-beslissing over letterloze categorieën:**
   - (a) **NutriScore per-letter NIET via het declaratie-vliegwiel** — het past structureel niet. Alternatief: een **dedicated bron** (Nutri-Score is een vaste 5-kleuren-vorm → synthetische augmentatie/een aparte classifier is mogelijk kansrijker dan declaratie-gedreven harvest), óf een **gerichte handmatige D/E-bronronde** (zeldzaam markt-artwork + mens labelt de letter).
   - (b) **Of accepteer categorie-niveau-herkenning** ("er is een Nutri-Score") i.p.v. per-letter, consistent met wat de declaratie (letterloos) toch al biedt.
3. **Datakwaliteit borgen (raakt alle categorieën):** het registratie-/labelpad zo dat de geoogste-code (bestandsnaam-marker) en de geregistreerde `t3777_code` niet uiteen kunnen lopen, en `field_type`/`gs1_field` correct gevuld worden — voorwaarde voor betrouwbare per-categorie-rapportage én om mislabels als B/C-onder-D te voorkomen.

## Read-only bewijs
- `nutriscore-d-diagnose-2026-07-12.md` (D: 2 refs = B/C-marker; 0 open review-items; index 0 `NUTRISCORE_*`-sleutels, alleen `NutritionalScore/GENERAL_FOODS` 3 GTINs; 12 rejected + 11 gate-rejected).
- `keurmerk-dekking-per-categorie-2026-07-12.md` (field_type onbetrouwbaar; per-categorie hand-mapping).
- Index: `flywheel-index/keurmerk-etiket-index.json` (MinIO). Code: `build-keurmerk-index.ts` (fieldType/code-sleutels), `queue_harvest.py`/`bootstrap_search.py` (declaratie-gedreven bron).
- Geheugen: [[project_keurmerk_dekking_strategie]], [[project_flywheel_resume]].

## Beslissing (Friso, 2026-07-12)
- **Labelintegriteit-check GEDAAN** (visuele galerij + verdict `nutriscore-labelverdict-friso-2026-07-12.md`): 19 correcties → Story **12.9** (`12-9-nutriscore-labelcorrectie.md`, ready-for-dev). Ná correctie: A/B/E herkenning-klaar (8/3/6 genuine), C leeg (0), D op 1.
- **Scope-keuze: DEDICATED AANPAK (optie 2a), los van het declaratie-vliegwiel.** NutriScore is een vaste vorm met vaste kleuren → bouw een aparte bron: **synthetische augmentatie van de 5 vormen en/of een dedicated classifier**, i.p.v. declaratie-gedreven harvest (dat kan de letterloze categorie niet voeden). Categorie-niveau (2b) en handmatige bronronde afgewezen.
- **Vervolg:** eerst een **spike** om de dedicated aanpak te valideren (synthetische augmentatie vs dedicated classifier/template-match) vóór een volledige build — mirror van de 19.7/12.2/12.4-spike-aanpak. Daarna een build-story/epic op basis van de spike-uitkomst.
- **Aparte follow-up blijft:** de structurele datakwaliteit (registratie-marker ≠ code; `field_type`/`gs1_field` projectbreed onbetrouwbaar) — raakt alle categorieën, niet alleen NutriScore.
