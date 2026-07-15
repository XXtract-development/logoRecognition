# Story 12.25: A2-vangnet — klein 5-klasse Nutri-Score-model (NutriGreen) voor monochrome/afwijkende drukken

Status: ready-for-dev

<!-- Research rang 1-vervolg (A2) na 12.22: de deterministische balk-lezer dekt
     kleurendruk (97,8% precisie) maar is per constructie blind voor monochrome
     drukken (2 bewezen gevallen in de 45-crop-set) en sterk afwijkende
     drukvarianten (merkfamilie-clusters in de 49 geen-lezingen). Friso's go
     2026-07-15 ("ad 3 pak op"). -->

## Story

Als **systeem-eigenaar**,
wil ik een klein, CPU-vriendelijk 5-klasse-model als vangnet ACHTER de
deterministische balk-lezer (alleen aangeroepen bij "geen lezing"),
zodat ook monochrome en afwijkend gedrukte Nutri-Score-logo's een letter
krijgen — zonder de precisie van de deterministische lezer aan te tasten.

## Aanpak

1. **Data**: publieke NutriGreen-dataset (~5.200 gelabelde Nutri-Score-beelden,
   CC-BY-SA, Zenodo — licentie-gebruik voor intern model checken/vastleggen) +
   eigen review-bevestigde crops als validatie; ACC-held-out (12.21b-set) als
   eindtoets.
2. **Model**: klein classificatienet (bv. MobileNetV3-small of efficientnet-lite,
   5 klassen + "geen-NS"-klasse), getraind offline; export ONNX int8; doel
   <50 ms CPU per crop.
3. **Integratie** (vervolg op 12.22-router): in `classify_crop` ná de
   deterministische lezer — alleen bij "geen lezing" én alleen wanneer een
   goedkope voorcheck (balk-aanwezigheid/warm+groen-signaal of nearest-ref-
   familie NUTRISCORE_*) Nutri-Score suggereert. Confidence-drempel zó dat de
   0-fouten-kruischeck-stand intact blijft (model-uitkomst onder drempel →
   zoals nu: geen claim).
4. **Gates**: ATDD-patroon 12.22; eindtoets op de ACC-held-out (o.a. de 2
   monochrome crops en de merkfamilie-clusters uit de 49 geen-lezingen).

## Acceptance Criteria (concept — aanscherpen bij story-start)

1. Vangnet wordt ALLEEN aangeroepen bij deterministische geen-lezing (de
   97,8%-precisie-route blijft onaangeroerd de eerste beslisser).
2. Monochrome testgevallen (A_24/A_25-klasse) krijgen een correcte letter met
   confidence ≥ drempel; onder drempel → geen claim (fail-safe behouden).
3. Geen regressie op de 142-pagina-validatie (fouten blijven ≤ huidige stand
   per gekozen ratio-vloer).
4. Licentie-notitie NutriGreen (CC-BY-SA: attributie + share-alike-implicaties
   voor het modelgewicht) vastgelegd; zo nodig alternatief (eigen data-augment).
5. Training reproduceerbaar (script + seed + data-manifest); model-artefact in
   MinIO met versie.

## Randvoorwaarden

- Training gebeurt offline (niet op de gedeelde ACC-host; lokaal of losse
  machine); alleen inferentie (ONNX, CPU) draait op ACC.
- Dataset-download (~GB's) en licentie zijn externe afhankelijkheden — eerst
  Task 1 (data + licentie) afronden vóór modelwerk.

### References
- [Source: _bmad-output/planning-artifacts/research-technical-logo-herkenning-2026-07-14.md §3.2 (A2), §3.5]
- [Source: _bmad-output/implementation-artifacts/12-21b-validatie-balkdetector-prototype.md] (geen-lezing-clusters)
- [Source: apps/ml-service/app/services/nutriscore_reader.py] + [classification.py#classify_crop] (integratiepunt)

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
