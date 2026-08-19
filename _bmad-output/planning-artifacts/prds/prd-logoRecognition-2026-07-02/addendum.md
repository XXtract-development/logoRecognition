# Addendum — PRD Referentie-vliegwiel zonder review

Technische diepte en overwogen opties die downstream (architectuur, stories) thuishoren, niet in de PRD zelf.

## 1. Kandidaat-technieken per FR (input voor bmad-architecture)

| PRD-onderdeel | Kandidaat-techniek | Bron/precedent |
|---|---|---|
| FR-3 regressietest | Gold-set-runner als batch-job; meting = precisie@drempel over alle gold-set-crops tegen (actieve refs + batch-kandidaten in schaduwmodus); pgvector maakt "tijdelijk meenemen" goedkoop (extra embeddings in aparte set, geen mutatie van de actieve bibliotheek) | aiService eval-runner (`npm run eval`)-patroon met pipelineversie-tracking `{refs-versie}+{gate-versie}` |
| FR-7 dedup trap 1 | Perceptual hash (pHash/DCT) met Hamming-drempel — vangt bijna-exacte kopieën, goedkoop | MDPI-vergelijking pHash vs. embeddings (electronics-15-1493) |
| FR-7 dedup trap 2 | Embedding-cosine boven ~0,97 tegen zelfde-klasse-referenties — vangt crops/kleurverschuivingen die pHash mist | idem; drempel kalibreren op gold-set |
| FR-8 outlier-audit | Per klasse: afstand tot klasse-centroid in embedding-ruimte; top-percentiel markeren. Optie: FiftyOne outlier-plugin i.p.v. eigen bouw | Voxel51/Encord; had RECYCLABLE vooraf gevangen |
| FR-9 crop-identiteit | Inhouds-hash (SHA op genormaliseerde crop-pixels) + (bronbestand, bbox) als secundaire sleutel — **nieuw te bouwen**: de bestaande opslagsleutel is sha1(bron+bbox), geen inhouds-hash | codebase-verificatie 2026-07-02 |
| Promotie-referentie-naamgeving | `ReferenceLogo` heeft `@@unique([t3777Code, variantLabel])`; promotie-referenties vereisen een botsingsvrije variantLabel-conventie, bijv. `auto-{batchId}-{seq}` | prisma/schema.prisma |
| FR-12 bootstrap-matching | Zaad-embedding + multi-scale template-match binnen declarerende GTINs; strengere drempel; alleen top-k per GTIN | 12.3-POC-methodiek (real-crop-oogst) |
| FR-21 GLN-route | Opties: (a) batch-export GTIN→GLN uit prod tradeItems (governance-vraag, eenmalig, snel), (b) re-import via mediaserver met backfill (bestaand mechanisme 8-3O, traag: ~126u compute), (c) catalogus-lookup per GTIN (externe API, traag + belastend). Voorkeur onderzoeken: (a) met Redis-preload, terugval (b) | besluit-39k-toegang-2026-06-07.md; 8-3D fail-safe reasons |
| FR-22 Gerichte brandstofselectie (Epic 19 — toegevoegd 2026-07-04 via correct-course) | Gebruik de GS1-declaraties om etiketten te SELECTEREN die gegarandeerd een keurmerk bevatten, gebalanceerd per keurmerk (N/klasse tot de class-cap), i.p.v. blind het archief te verwerken. Declaratie-lezer uitbreiden naar 5/5 GDSN-keurmerkvelden. ACC-verwerkingstoegang: Route A (env `MEDIASERVER_DOMAIN`/`CATALOG_API_BASE`→prod, mits prod-media-503 opgelost) vs Route B (resterende DB-replicatie media-index+tradeItems→Cherry; bestanden al gesynct). Doel-woordenschat = ~951 codes uit 5 GS1-codelijsten (`~/Documents/Result_4.xlsx`). Betrouwbare declaratie-lezer = catalog-XML (Mongo `tradeItems` is diep-genest + ongeïndexeerd). | Result_4.xlsx; t3777-declarations.ts; besluit-39k-toegang-2026-06-07.md |
| FR-23 Werkbare beoordeelronde (Epic 20 — toegevoegd 2026-08-19 via correct-course) | De mens die beoordeelt doet dat op een telefoon. Vereist: artwork paginabreed en groot genoeg om een klein keurmerk te herkennen (contextfragment met begrensde opschaling), alle bediening tegelijk in beeld, een getekend kader dat sámen met een keurmerkkeuze ingediend wordt, en een voorbeeldlogo dat er altijd is en op HERKOMST gekozen wordt (echte crop vóór gidsplaat), niet alfabetisch. Kern van de aanpak: de opmaak wordt **gemeten in een echte browser** (Playwright, met layout) in plaats van op het oog beoordeeld — jsdom/happy-dom doen geen layout en lieten twee stories groen afgetekend worden die stuk waren. | MobileReviewDeck.tsx; tests/e2e/helpers/review-deck.ts; stories 20.3-20.6, 20.8, 20.10, 20.12-20.17 |
| FR-24 Continuïteit van de oogst (Epic 20 — toegevoegd 2026-08-19 via correct-course) | De oogst die de beoordeelwachtrij vult mag niet stilzwijgend stoppen of vervuilen. Vier bekende faalwijzen, elk met een eigen maatregel: mislabels van naast-liggende gelijkende iconen (cross-code-guard), technische snijlijn-/cutterpagina's die als artwork binnenkomen (keyline-guard), stille dood door de geheugengrens (batching met expliciete grens), en het wegvallen van de declaratiebron zelf (zichtbaar maken en herstelbaar houden — de catalogus meldt een ontbrekend bestand met een 500, niet met een 404). | queue_harvest.py; t3777-declarations.ts; stories 20.1, 20.2, 20.7, 20.9, 20.11, 20.19 |

## 2. Hergebruikte aiService-patronen (detail)

- **candidate → verified statusmodel** (dqs_golden_set): status-lifecycle met idempotentieregel "verified wordt nooit overschreven door mining". Vertaling: kandidaat-referenties krijgen status `candidate`; promotie zet `verified`; handmatig gecureerde referenties zijn per definitie `verified` en onaantastbaar voor het vliegwiel.
- **Evidence-contract** (field-wide-production-baseline-regression architectuur): per record manifest {runId, pipeline-versies} + vergelijkingsuitkomst + categorisatie. Vertaling: evidence-contract per kandidaat én per batch; JSON in DB + leesbare projectie in dashboard.
- **Oorzaak-classificatie** (6-klassen dqs_findings): niet in PRD-scope als apart feature, maar de afwijzingsredenen (cap-bereikt, duplicaat, outlier, regressie, handmatig-afgekeurd) vormen impliciet zo'n classificatie; aggregatie ervan in het dashboard geeft dezelfde stuurinfo als aiService's wekelijkse oorzaak-rapport.
- **Gouden-set-mining-heuristiek**: aiService mint kandidaten uit stabiele, gevalideerde producten (max-correctieratio, min-veldengevuld). Vertaling in FR-10: alleen expliciete menselijke beslissingen worden gold-set-kandidaat (strenger dan mining — hier is de menselijke beslissing zelf al de validatie).

## 3. Overwogen en verworpen alternatieven

- **Direct promoveren bij dubbele bevestiging (zonder batch/poort):** verworpen — confirmation-bias-literatuur en RECYCLABLE-incident tonen dat één besmette referentie het systeem kan laten omvallen; de batch is de eenheid die rollback en meting betaalbaar maakt.
- **Menselijke steekproef per batch i.p.v. gold-set-regressietest:** verworpen als poort (schaalt niet, en "zonder review" is het doel); steekproef blijft mogelijk als vrijwillige audit via het dashboard.
- **Getrainde detector als lokalisatie-fix binnen dit PRD:** verworpen — 12.4-spike toonde databottleneck (22 artworks); het vliegwiel vergroot juist die data, dus detector heroverwegen ná maanden vliegwiel-draaien.
- **Gids-logo's als permanente referenties voor lege klassen:** verworpen — 12.3-meting (top-1 37% guide vs. 81% real; RECYCLABLE 0%→100%) en synth-to-real-literatuur; zaad-rol is het maximum.
- **Automatische drempel-adaptatie (curriculum-thresholding) in v1:** verworpen voor MVP — literatuur ondersteunt het, maar bestuurbaarheid en vertrouwen eerst; handmatig regime met logging is de veilige start.

## 4. Sizing- en volumegegevens (bronnen: codebase-analyse 2026-07-02)

- Universe: 894 T3777-codes; ACC actief: 43 klassen, 215 referenties (177 real-crop). Dekking ~88% van top-30 declaratiefrequenties.
- GTIN-universe ACC: ~1857 (harvest compleet); historisch archief: ~39k producten / ~84k bestanden / 163 GB (gesynchroniseerd, GLN-dekking het gat).
- Verwachte aanvoer: n8n 100–200 producten/dag (~2–6 gedeclareerde codes/product); auto-accepts historisch ~500–1000/week tijdens actieve importperiodes; reviewbeslissingen ~50–200/week.
  - Let op: het ACC-universum (1857 GTINs) is volledig verwerkt en de harvest produceert geen nominaties. Tot 12.8 live is en/of het 39k-archief ontsloten is, blijft de nominatie-aanvoer dus beperkt tot nieuwe/hernieuwde imports.
- Verwerkingskosten: lokalisatie ~28s/beeld (lineair in referentie-aantal — relevant voor cap-beleid en de region-proposer-vervolgvraag); embedding ~2–3s/crop; crosscheck <100ms.
- Gold-set: 91 samples (75 ECHT / 16 VALS) + declaratie-goudstandaard 74 GTINs. De gold-set is nu een statisch repository-bestand (tests/validation); FR-10 vereist migratie naar beheerde opslag.
- Bestaande drempels: crosscheck template 0,85 / embedding 0,80 / classifier 0,90; gate-v2 P(keurmerk)≥0,5 met floor 0,85 in harvest; REVIEW_MIN_CONFIDENCE 0,50. Harvest-cap: 25 per code **per run** (niet cumulatief — de PRD-promotiecap is wél cumulatief en dus een ander mechanisme).

## 5. Geagendeerde vervolgkansen (buiten PRD)

- **Synthetische context-expansie voor lege bootstrap-runs:** wanneer een bootstrap-run (FR-12) nul echte crops oplevert, is het gedocumenteerde overbruggingspatroon: het schone logo synthetisch op realistische verpakkingsachtergronden plaatsen met vervormingen, als tijdelijk trainings-/matchmateriaal tot echte crops gevonden zijn (Su et al., "Data Expansion by Synthesising Context", 1612.09322; bestaand 8.7-synthese-mechanisme als aanknopingspunt). Bewust géén v1: eerst meten hoe vaak bootstrap leeg uitvalt.
- **DINOv2-spike:** embedding-backbone-vergelijking (effb0 vs. DINOv2) op de gold-set; goedkoop, potentieel elke vliegwiel-cyclus productiever. Geen logo-specifieke publieke benchmark gevonden — eigen meting nodig.
- **Zero-shot region proposer** (Grounding DINO-lijn): doorbreekt de lineaire lokalisatiekosten; ander risicoprofiel dan de gefaalde 12.4-detector (geen trainingsdata nodig).
- **Leverancier-terugkoppeling als product:** FR-16-rapport extern ontsluiten (portaal/notificatie) zodra intern bewezen; raakt ECGT-compliance-dienstverlening.
- **39k-bulk-run:** operationele verwerking van het historische archief zodra GLN-dekking (FR-21) er is; capaciteitsplanning (126u compute-schatting) apart.

## 6. Onderzoeksverankering

Volledige bronverantwoording in `_bmad-output/planning-artifacts/research/domain-referentie-vliegwiel-zonder-review-research-2026-07-02.md`. Kernverwijzingen: Tesla Data Engine (shadow mode/triggers/escalatie), Trax/Vispera (zelfonderhoudende referentiedatabases), weak supervision (Snorkel/WRENCH/ULF), confirmation bias + remedies (Debiased Self-Training 2202.07136, CW-BASS, JointMatch), synth-to-real (1612.09322), dedup (MDPI 15-1493), outlier-detectie (Voxel51/Encord), ECGT-richtlijn (27-09-2026), AI Act-classificatie (laag risico).
