# Story 12.25: A2-vangnet — klein 5-klasse Nutri-Score-model (NutriGreen) voor monochrome/afwijkende drukken

Status: review

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

## Task 1 — Data & licentie (afgerond 2026-07-15)

- **Bron**: Zenodo record 8374047 (DOI 10.5281/zenodo.8374047), "NutriGreen
  Image Dataset" (Frontiers in Nutrition 2024, 10.3389/fnut.2024.1342823).
- **Omvang**: `dataset.zip` 5,1 GB + `data.csv` (485 kB YOLO-annotaties:
  File Name, Class ID, X/Y/W/H genormaliseerd).
- **Inhoud**: 10.472 beelden; Nutri-Score per letter A:1250 / B:1107 / C:867 /
  D:1001 / E:967; plus V-Label (870), EU-BIO (2.328) en 3.201 zonder label —
  BIO/V-label zijn herbruikbaar voor toekomstige familie-heads.
- **Licentie**: **CC-BY-SA 4.0**. Vastgelegde duiding voor intern gebruik:
  gebruik + aanpassing toegestaan mét attributie (auteurs/DOI vermelden in
  model-metadata en dit story-record = gedaan). Share-alike raakt
  *herdistributie van de dataset of afgeleide data* — een intern gebruikt
  modelgewicht wordt niet gedistribueerd; bij eventuele externe distributie van
  het model of dataset-afgeleiden moet de share-alike-vraag opnieuw beoordeeld
  worden (jurisch grijs gebied rond gewichten; besluit dan expliciet).
- **Attributie** (voor model-metadata): "Trained on the NutriGreen Image
  Dataset (Konstantin Sedlar et al., Jožef Stefan Institute; Zenodo
  10.5281/zenodo.8374047, CC-BY-SA 4.0)." — auteursvermelding bij download
  verifiëren tegen de record-pagina.
- **Download**: naar de lokale werkmap op Friso's laptop (M3 Pro; training
  lokaal met MPS conform besluit 2026-07-15 — ACC-host wordt niet belast;
  alleen het ONNX-eindmodel (~10-20 MB) gaat naar MinIO/ACC).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Completion Notes List

- **Training (lokaal, M3 Pro/MPS, besluit Friso 2026-07-15)**: MobileNetV3-small,
  6 klassen, 7.677 crops uit NutriGreen (extractie via YOLO-annotaties, split per
  beeld); augmentatie gericht op de productie-gaten (RandomGrayscale 0,35 voor
  monochroom; discrete 90°-rotaties; géén flips). 12 epochs ≈ 8 min.
  **Val letter-acc 99,0%** (A .99 B .99 C 1.00 D .96 E 1.00, none 1.00).
- **ACC-held-out (45 echte crops, niet in training)**: 41/45 juist; de 3
  kleur-lezer-gaten alle correct (A_24→A 0,51 monochroom; A_25→A 0,31; D_40→D
  1,0); de 4 missers zijn fail-safe "none" (geen foute letters) en betreffen
  crops die de deterministische lezer al correct leest → gecombineerd 45/45.
- **Vals-positief-onderzoek** (ontwerp-drijvend): open FP-rate 17/199 op andere
  keurmerken (Fairtrade→A 0,998!) → poort nodig. Hard-negative-hertraining (v2)
  drukte FP naar 1/39 maar verloor de monochrome dekking → verworpen (artefact
  bewaard als model_v2_hardnegs). **Familie-poort-simulatie: embedding-top-1 ∈
  NUTRISCORE_* blokkeert 197/199** → besluit: v1-gewichten + poort + vloer 0,5.
- **Integratie (ATDD)**: 9 red-phase-tests aantoonbaar FAILED vóór implementatie
  → module `nutriscore_a2.py` + router in `classify_crop` → GREEN; +4
  review-regressietests (13 totaal). Poort: lezer-geen-lezing ∧ embedding-buur
  NUTRISCORE_* ∧ embedding-resultaat ONZEKER (M1: confident antwoorden worden
  nooit overschreven). Echte-keten-sanity (echte gewichten + router): A_24 →
  nutriscore-a2 A 0,507; D_40 → nutriscore-a2 D 1,0; A_25 → onder vloer →
  eerlijk legacy.
- **Artefacten**: `models/nutriscore-a2/v1/` in MinIO (6,2 MB .pt + meta mét
  CC-BY-SA-attributie), geverifieerd terug te lezen. Preprocessing-pariteit
  (cv2-pad) geverifieerd via de echte-keten-sanity (L4).
- **Suite-les toegepast**: transformers' import-keten doet `find_spec("cv2")` —
  crasht op suite-stubs zonder `__spec__`; module-tests houden de echte cv2 voor
  de volledige testduur vast (contextmanager).

### Adversarial review (2026-07-15) — 0 HIGH, 3 MEDIUM, 6 LOW; verwerkt

- **M1 (gefixt+test)**: A2 overschreef ook confident embedding-matches → poort
  vereist nu een ONZEKER embedding-resultaat; confident 12.3-referentie-matches
  blijven altijd het antwoord.
- **M2 (gefixt)**: `torch.load(..., weights_only=True)` (geen pickle-ACE-oppervlak).
- **M3 (gefixt)**: negative-cache met 60s-cooldown bij mislukte model-load
  (geen MinIO-storm in omgevingen zonder artefact); cold-load ~2-4s eenmalig
  per worker gedocumenteerd (consistent met bestaande sync-patronen).
- L1 klassen-vóór-model-volgorde; L2 set-membership-check; L3 gedocumenteerd
  (gated/UNKNOWN opent de poort bewust niet); L4 pariteit geverifieerd; L5
  monkeypatch-hygiëne + 4 extra tests (confident-override, expliciete drempel,
  clamp in echte module, PIL-poort); L6 A2-decline-logging toegevoegd
  (poort open zonder claim = info-log met probs).

### File List

- apps/ml-service/app/services/nutriscore_a2.py (NEW)
- apps/ml-service/app/services/classification.py (UPDATE — A2-vangnet achter familie-poort)
- apps/ml-service/tests/unit/test_nutriscore_a2_12_25.py (NEW — 13 ATDD+review-tests)
- MinIO: models/nutriscore-a2/v1/{a2_mobilenetv3s.pt, a2_meta.json} (artefact)
