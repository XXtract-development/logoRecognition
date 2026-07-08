# Uitrol-aanpak — keurmerk-vakken vullen & herkenning aanzetten (per categorie)

Datum: 2026-07-07 · Auteur: Dev (analyse) · Status: voorstel ter goedkeuring

## Doel
Per keurmerk-categorie de vakken (keurmerkklassen) vullen met door mensen bevestigde ECHTE crops, en per afgerond vak via een herkennings-test bewijzen dat het keurmerk nu correct herkend wordt. Uitrolvolgorde: **categorie 4 → 3 → 2 → 1**; voor categorie 1 alleen de **top-20 meest-gedeclareerde codes**.

## Kern-inzicht (geverifieerd tegen live-code — bepaalt de hele volgorde)
- De **live-herkenning** (`apps/ml-service/app/services/classification.py` → `db_service.find_similar_references`) doet AL een **bibliotheek-brede nearest-reference-match** (pgvector-cosine over álle actieve referenties, drempel `CLASSIFY_THRESHOLD_EMBEDDING` 0,75) en geeft de code van de best-matchende referentie terug.
- **Gevolg:** zodra een bevestigde crop via 19.8 een actieve `registered` referentie wordt, verbetert de herkenning van dat keurmerk AUTOMATISCH — zonder 19.9. Een uitgesneden echt keurmerk matcht een andere echte crop op hoge cosine (≥0,75); tegen alleen het schone gids-logo bleef het op 0,60–0,74 steken (dát was de 44%).
- **Dus:** de uitrol (vullen → bevestigen → herkennen) kan draaien met wat NU live is (19.8 + de bestaande classify). **19.9 is een VERSNELLER van de crop-ontdekking (`bootstrap_search.py`), geen harde voorwaarde voor herkenning.** 19.9 loopt parallel en helpt vooral vakken sneller vullen (betere kandidaten vinden), maar blokkeert de uitrol niet.

## De 5 categorieën (GS1-declaratievelden) + startsituatie op ACC
| # | Categorie (GS1-veld) | Universe | Gezaaide vakken op ACC (nu) |
|---|---|---|---|
| 4 | **nutritionalScore** (Nutri-Score A–E e.d.) | ~7 codes | **5 vakken** gezaaid |
| 3 | **EU_consumerUsageLabelCode** (NIX18, zwangerschapswaarschuwing, AISE-wasvoorschriften) | ~20 codes | **0** gezaaid |
| 2 | **dietTypeCode** (vegan, halal, kosher, glutenvrij) | ~34 codes | **0** gezaaid |
| 1 | **PackagingMarkedLabelAccreditationCode** (bio, Fairtrade, Rainforest, FSC, recycling-logo's) | ~890 codes | **43 vakken** gezaaid (238 refs) — alleen **top-20** in scope |

Uitrolvolgorde 4→3→2→1 = van klein/deels-klaar naar groot: nutritionalScore is klein én al gezaaid (snelste eerste succes); PackagingMarked is enorm → begrensd tot de top-20 op declaratie-frequentie.

## Per-categorie loop (herhaal per vak)
Voor elke categorie, voor elke code (vak) die training nodig heeft:

1. **Selecteer de te trainen vakken.** Codes die (a) door prod-producten gedeclareerd worden (er is artwork om in te zoeken) én (b) nog < k (3) bevestigde echte crops hebben. Meet via prod-declaraties (catalog-XML / Mongo `application.tradeItems`) × huidige referentie-telling.
2. **Zorg voor een gids-zaad per vak.** De sampler/bootstrap heeft per code een gids-logo nodig om crops te vinden. **Categorie 3 en 2 hebben 0 gezaaide vakken → eerst guide-logo's seeden uit de GS1 Label Guide** (bestaand mechanisme `seed-reference-logos-from-guide.js`, Story 12.1-patroon). Categorie 4 is al gezaaid; categorie 1 (top-20) grotendeels.
3. **Genereer kandidaten.** Draai de gebalanceerde sampler / bootstrap voor die codes (19.8-pad) → crops belanden als OPEN review-items in `/artwork/review-queue` (reason `bootstrap-lege-klasse`).
4. **Beoordeel ~4 per vak** (Friso, via `/artwork-review`, filter "Alle items"). Goedgekeurd → gold-set ECHT + `registered` referentie. Vak telt als "gevuld" bij ≥1 bevestigde crop; richt op ≥3 voor robuustheid.
5. **Herkennings-test per vak (de tussendoor-API-call).** Classificeer een HELD-OUT product dat het keurmerk declareert (niet een van de bevestigde crops) via de herkennings-API → verwacht dat de response nu díe keurmerkcode teruggeeft (waar het vóór "onbekend"/fout was). Dit is de acceptatie per vak. (Endpoint: het `/artwork`-classificatiepad; exacte route bij implementatie pinnen.)
6. **Vak afgerond** → volgende vak; categorie afgerond → volgende categorie (3, dan 2, dan 1-top-20).

## Werkitems die deze uitrol nodig heeft (BMAD-stories)
- **Guide-seeding categorie 3 (consumerUsage) en 2 (dietType)** — guide-logo's uit de GS1 Label Guide seeden zodat de sampler kandidaten kan vinden (nu 0 gezaaid). Kleine story per categorie of één gecombineerde. **Blokkeert stap 3 voor die categorieën.**
- **19.9 (fase-2 nearest-reference-ranking)** — al `ready-for-dev`. Parallel bouwen; versnelt stap 3 (meer/betere kandidaten), geen gate.
- **Herkennings-test-helper (stap 5)** — een reproduceerbare per-vak-acceptatietest (held-out declarerend product → classify → verwacht de code). Klein; mogelijk een script/ATDD i.p.v. losse story.
- (Optioneel) **top-20-meting categorie 1** — de 20 meest-gedeclareerde PackagingMarked-codes uit prod-data bepalen (declaratie-frequentie).

## Randvoorwaarden & openstaande beslissingen
- **k (drempel "genoeg crops"):** herkenning verbetert al vanaf 1 bevestigde crop (classify is nearest-reference); ≥3 geeft robuustheid tegen één afwijkende crop. Voorstel: mik op 3–4 per vak, maar test herkenning al vanaf 1.
- **Zaad-dekkingsgat:** zonder gids-zaad geen kandidaten (de 17/32-overslag in de 19.8-run). Seeding (stap 2) is dus de eerste echte hindernis voor categorie 3 en 2.
- **Prod-artwork-dekking:** een code kan gedeclareerd zijn zonder dat er artwork van dat product beschikbaar is → geen crops. Meet dit in stap 1.
- **Elke ACC-schrijf/deploy/sampler-run/seed-run met expliciete toestemming per geval.**

## Voorgestelde eerste concrete stap
Categorie 4 (nutritionalScore, 5 vakken, al gezaaid) als **pilot van de hele lus**: sampler draaien voor die 5 codes → jij keurt ~4/vak → herkennings-test per vak. Zo bewijzen we de volledige keten (vullen → bevestigen → herkennen → testen) end-to-end op de makkelijkste categorie, vóór we categorie 3/2 (die eerst seeding vergen) en categorie 1 (top-20) aanpakken.
