# Story 12.4: Getrainde class-agnostische region-detector (12.2-optie A) — strakke localisatie

Status: ready, **maar start ná de 12.3-stap-0-go/no-go** (besluit 12.2: optie C = klassiek→getraind;
dit is de "A"-helft). Orthogonaal aan 12.3 voor de *meting* (recall is embedding-onafhankelijk), maar
de *waarde* materialiseert pas via de embedding — dus niet vóór stap-0 staffen, anders risico op
weggegooid werk als de aanpak pivot. Voedt samen met 12.3 de endpoint (12.5).

## Story

Als ML-eigenaar,
wil ik de klassieke CV-proposer (12.2-optie B) vervangen/aanvullen door een **getrainde generieke
"keurmerk-regio"-detector** (één klasse: *waar* staat een mark, niet wélke), zodat de **localisatie-
recall** stijgt van de gemeten 45 % @ IoU≥0,5 naar productiekwaliteit — want de end-to-end-herkenning
is `recall × classify`, dus zonder strakke localisatie blijft de endpoint begrensd, hoe goed de
embedding (12.3) ook wordt.

## Probleem (gemeten in 12.2)

De klassieke proposer haalt **45 % recall @ IoU≥0,5** (69 % "surfaced"): kleine, geclusterde marks
worden door MSER/contour + NMS in grovere buurregio's geabsorbeerd (zie `diagzoom_*.png`). Voldoende
om het principe + bootstrap-data te bewijzen, onvoldoende voor de endpoint: `0,45 × classify` plafonneert
de end-to-end-herkenning ongeacht de embedding-kwaliteit.

## Doel / niet-doel

- **Doel:** een getrainde detector (YOLO/RT-DETR, één klasse "keurmerk-regio") die per beeld
  class-agnostisch kandidaat-bboxen levert met **hoge recall bij beheersbare precisie**; kost blijft
  ≈constant in #keurmerk-klassen (12.2-AC1 mag niet regresseren).
- **Niet-doel:** classificeren *wélk* keurmerk (dat is trap 2 / 12.3); de referentiebibliotheek wijzigen;
  per-keurmerk-detectoren (juist class-agnostisch houden — dat is de hele kostenwinst).

## Aanpak

- **Trainingslabels — bewust risico:** proposer-B-boxen (45 % recall, juist de *losse* boxen) en
  zwakke supervisie zijn geen strakke ground-truth. Een strakke detector trainen op losse labels werkt
  niet vanzelf. → Leun voor de *strakke* positieven op **8.7-synthese** (bbox exact bekend) + de
  schone, menselijk-bevestigde bboxen uit **12.6**; gebruik proposer-B/zwakke supervisie alleen als
  *hoog-recall-laag-precisie* aanvulling. Annotatie-inspanning voor extra strakke boxen valt onder 12.6.
- **8.7-synthese:** officieel logo op realistische achtergronden met bekende bbox → goedkope positieven,
  ook voor zeldzame keurmerken.
- **Train** een one-class region-detector; **evalueer recall @ IoU≥0,5** tegen de 12.6-bboxen met de
  12.2-harnas (proposer-recall-metriek bestaat al).

## Acceptatiecriteria

1. **Recall-sprong:** detector-recall @ IoU≥0,5 **≥ 80 %** (van de 45 %-proposer-baseline), bij een
   precisie die de downstream embed+open-set-kost beheersbaar houdt (regio's/beeld in dezelfde orde als
   proposer-B, niet 10×). **Meet tegen de schone 12.6-bboxen, NIET de oude gold-set** — we maten dat de
   oude gold-bboxen te strak/verschoven zijn (`classify|covered` 20,6 % > perfecte-crop 17,3 %); recall
   @ IoU≥0,5 tegen foute boxen is betekenisloos.
2. **Kosten-ontkoppeling intact:** per-beeld-detectielatency blijft ≈constant in #klassen (12.2-AC1
   niet regresseren); gemeten met `ac1`/`ac1dist`.
3. **A/B náást de proposer-B en template-match:** geen van de 4 beschermde tests
   (`tests/test_artwork_processing.py` 142–206) gewijzigd; cutover per beeld/globaal mogelijk.

## Afhankelijkheden

- Hergebruikt: 8.7-synthese (done), gold-set-loop + 8.6-herkomst (done), Epic 9-trainings-infra (done),
  de 12.2-meetharnas. **Voorwaarde:** 12.6 (schone bboxen voor eval + strakke positieven). Parallel met
  12.3 mogelijk ná stap-0. Voedt 12.5 (endpoint).
