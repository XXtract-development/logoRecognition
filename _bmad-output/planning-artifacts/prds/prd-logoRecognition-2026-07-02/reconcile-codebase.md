# Input-reconciliatie: PRD "Referentie-vliegwiel zonder review" vs. systeemwerkelijkheid

Datum: 2026-07-02 · Basis: steekproefsgewijze codeverificatie (artwork-crosscheck.ts, artwork-registration.ts, detection-flow.ts, schema.prisma, queue_harvest.py, keurmerk_gate.py, artwork.py, 12.8-story, gold-set-bestanden).

Legenda: ✅ klopt · ⚠️ nuance/correctie nodig · ❌ botst of onjuist

---

## 1. Geverifieerd correct (✅)

| PRD-locatie | Bewering | Werkelijkheid |
|---|---|---|
| Addendum §4 | Crosscheck-drempels template 0,85 / embedding 0,80 / classifier 0,90 | ✅ `artwork-crosscheck.ts:27–35` (env-defaults exact zo) |
| Addendum §4 | `REVIEW_MIN_CONFIDENCE` 0,50 | ✅ `artwork-crosscheck.ts:45–47` |
| Addendum §4 | Gate-v2 P(keurmerk) ≥ 0,5 met floor 0,85 in harvest | ✅ `keurmerk_gate.py:37` (`KEURMERK_GATE_THRESHOLD` default 0.5), `queue_harvest.py:41` (`HARVEST_FLOOR` default 0.85) |
| §3 Glossary, Addendum §4 | Gold-set 91 samples (75 ECHT / 16 VALS) | ✅ `tests/validation/gold-set-oogstrun.json` meta: total 91, echt 75, vals 16, twijfel 0 |
| FR-1 consequence 2 | "Lege declaratie → geen auto-accept" bestaat als veiligheidsregel | ✅ `artwork-crosscheck.ts:109–121`: `declaredSet.size === 0` → alles naar reviewItems |
| FR-1 haakpunt | Nominatie kan naast bestaande registratie | ✅ `detection-flow.ts:253–275`: `crosscheckDetections` → `autoAccepted` → `registerCropsTx` in transactie; een nominatiestap kan hier als extra tak zonder 8.6-pad te wijzigen. NB: bestaand filter `cropPath && sourceFile` (regel 260–261) — auto-accepts zonder crop worden nu al niet geregistreerd; nominatie moet hetzelfde filter hanteren. |
| FR-5 | Promotiedrempel 0,90 (embedding) is strenger dan bestaand | ✅ Bestaand embedding 0,80 → 0,90 is strenger. Let op: classifier-drempel is al 0,90; "strenger dan bestaand" geldt per methode, voor classifier zou 0,90 gelijk zijn, niet strenger. |
| §Integration | Idempotentie-bouwsteen bestaat | ✅ `detection-flow.ts:139` `dedupDetections` + `loadExistingDetectionKeys` (review-items én trainingsdata als dedup-bron). NFR-idempotentie kan hierop aanhaken; nominaties horen in dezelfde key-set. |
| §3 / 12.8 | 43 actieve klassen, 215 actieve referenties (ACC) | ✅ Consistent met 12.8-story (zelfde meting 2026-07-02); niet onafhankelijk in de DB geverifieerd. |
| FR-21 / Addendum | 39k-archief, GLN-dekking het gat, ~126u compute | ✅ Consistent met besluit-/geheugenartefacten; geen codebewijs nodig (operationeel gegeven). |

---

## 2. Bevindingen (⚠️ / ❌)

### B1. ❌ "Nachtelijke harvest blijft de tweede stroom" van dubbel bevestigde nominaties — de harvest levert géén dubbele bevestiging
- **PRD-locatie:** §4.1 (batch-cadans "gekoppeld aan de bestaande nachtelijke harvest"), §4.7 punt (2) "de nachtelijke harvest blijft de tweede stroom", Assumptions Index §4.1.
- **Werkelijke situatie:** `queue_harvest.py` doet **geen declaratie-lookup en geen crosscheck**. De keten is: region proposer → embed → gate-v2 → nearest reference ≥ 0,85 → INSERT **open ArtworkReviewItem** (regel 176–191). Output is dus werkvoorraad voor *menselijke review*, geen dubbel bevestigde detecties. Dubbele bevestiging (visueel + declaratie) ontstaat uitsluitend in `detection-flow.ts` (import-gedreven pipeline) en straks in 12.8. Bovendien is de harvest **compleet** (1857/1857, `next_offset >= total` → status "complete", produceert niets meer tot er nieuwe GTINs in MinIO staan) — precies wat het projectgeheugen ook zegt (queue leeg).
- **Voorgestelde correctie:** §4.7 herformuleren: de harvest voedt de nominatiestroom *indirect* — via reviewbeslissingen (accept → dubbelcheck-pad → nominatie) en via FR-10 (gold-set-aanwas) — niet rechtstreeks als bron van dubbel bevestigde kandidaten. De batch-cadans-aanname (§4.1) niet aan de harvest koppelen maar aan een eigen dagelijkse vliegwiel-job; de harvest is momenteel een lege bron.

### B2. ❌ FR-20 botst met het ontwerpcontract van Story 12.8 ("schaduwmodus is hard")
- **PRD-locatie:** §4.7 / FR-20 (kruischeck-verdicts voeden de nominatiestroom).
- **Werkelijke situatie:** 12.8 AC8 en de guardrails stellen expliciet: "**Geen neveneffecten.** De run maakt geen review-items aan en registreert geen trainingsdata … Schaduwmodus is hard". FR-20 introduceert per definitie een neveneffect (nominatie-records). 12.8 is ready-for-dev, dus nog aanpasbaar, maar de PRD presenteert 12.8 als "bestaand, ongewijzigd benut" (§Integration noemt het correct als afhankelijkheid, maar §4.7 zegt "het kruischeck-endpoint levert … die voeden voortaan de nominatiestroom" zonder de contractwijziging te benoemen).
- **Voorgestelde correctie:** in FR-20 expliciet opnemen dat dit een gecontroleerde versoepeling van het 12.8-"geen neveneffecten"-contract is: nominatie achter een config-flag (default uit tot vliegwiel actief), verdict-respons ongewijzigd (die consequence staat er al). Beter: 12.8-story vóór dev bijwerken zodat de dev het haakpunt (verdict → nominatie-event) alvast schoon neerzet.

### B3. ❌ Statusmodel `candidate`/`verified` en herkomst bestaan niet op ReferenceLogo — schema-uitbreiding (migratie) is onvermijdelijk en de PRD benoemt dat niet
- **PRD-locatie:** §3 Glossary (kandidaat-referentie status `candidate`, promotie → `verified`), FR-2, FR-6 consequence ("handmatig gecureerde referenties tellen niet mee"), addendum §2 (candidate→verified statusmodel).
- **Werkelijke situatie:** `schema.prisma:243–267` — `ReferenceLogo` heeft alleen `active Boolean`, `source String?` (vrije tekst), geen status-, provenance- of herkomstveld. Ook promotiebatches, evidence-contracten, hard-negatives en gold-set-records hebben geen bestaande tabellen. Tegelijk geldt de teamregel (en 12.8 AC7 herhaalt hem): **geen nieuwe Prisma-modellen/migraties zonder expliciete toestemming per geval**.
- **Voorgestelde correctie:** in §Integration/§Cross-Cutting een expliciete zin: het vliegwiel vereist schema-uitbreiding (referentie-status + herkomst, batch-, evidence-, hard-negative- en gold-set-tabellen); migratie-toestemming is een randvoorwaarde vóór de eerste story. Dit voorkomt dat een dev het 12.8-patroon ("geen migraties") doortrekt naar het vliegwiel en gaat improviseren in bestaande tabellen.

### B4. ⚠️ Unique-constraint `@@unique([t3777Code, variantLabel])` + storagePath-contract raken promotie-referenties direct
- **PRD-locatie:** nergens genoemd (gap, categorie d).
- **Werkelijke situatie:** `schema.prisma:264` — elke referentie moet een uniek `variantLabel` per code hebben. Promotie kan tot 10 referenties per klasse toevoegen (FR-6); zonder naamgevingsconventie (bijv. `promo-{gtin}-{hash}`) knalt de tweede promotie op de constraint. Daarnaast documenteert het schema (regel 240–242): "de storagePath-structuur per code/variant is het contract" voor Epic 8 template-matching en 8.7-synthese — promotie-crops leven nu onder `artwork-crops/{gtin}/…` in MinIO, een ander pad-schema. Als template-matching referenties via de pad-structuur laadt, zien promotie-referenties er anders uit dan gecureerde.
- **Voorgestelde correctie:** in FR-2/addendum een variantLabel-conventie voor promotie-referenties vastleggen én de architectuurvraag agenderen of promotie-crops gekopieerd worden naar de referentie-padstructuur dan wel of de consumenten pad-agnostisch (via DB-record) laden.

### B5. ⚠️ "Gold-set-bestanden (tests/validation) — bestaand, ongewijzigd benut" botst met FR-10 (de set groeit en muteert)
- **PRD-locatie:** §Integration ("Bestaand, ongewijzigd benut: … gold-set-bestanden (tests/validation)") vs. FR-10/FR-11 en FR-3.
- **Werkelijke situatie:** de gold-set is een **statisch JSON-bestand in de repo** (`tests/validation/gold-set-oogstrun.json`), geen runtime-datastore. FR-10 (automatische aanwas per reviewbeslissing, onveranderlijke records met vervangingshistorie) en FR-3 (regressiemeting per batch, historisch opvraagbaar) vereisen de gold-set als beheerd, muteerbaar systeem-datastore (DB of MinIO), niet als repo-bestand.
- **Voorgestelde correctie:** gold-set uit de "ongewijzigd benut"-lijst halen en verplaatsen naar "Raakt": migratie van repo-bestand naar beheerde opslag is onderdeel van de scope (raakt ook B3).

### B6. ⚠️ Addendum: "bestaand MinIO-pad gebruikt al content-hash" — het is een locatie-hash, geen inhouds-hash
- **PRD-locatie:** addendum §1, rij FR-9 crop-identiteit; PRD FR-9 `[ASSUMPTION: identiteit via inhouds-hash van de crop]`.
- **Werkelijke situatie:** `apps/ml-service/app/api/artwork.py:642–652` — cropkey = `artwork-crops/{gtin}/{sha1(source+bbox)[:12]}.png`: een hash over **bronbestand+bbox** (idempotente locatie), niet over de croppixels. De harvest gebruikt zelfs `{code}__{index}_{x}_{y}` (`queue_harvest.py:158,174`) — helemaal geen hash. De enige sha256 in de API-pipeline is de run-trigger-idempotency-key (`pipeline/trigger.ts:59`).
- **Voorgestelde correctie:** addendum-formulering aanpassen: het bestaande pad levert precies de (bronbestand, bbox)-secundaire sleutel die de rij noemt; de pixel-inhouds-hash voor FR-9 is nieuw te bouwen. Klein maar voorkomt dat een dev denkt dat hij er al is.

### B7. ⚠️ FR-6 "analoog aan de harvest-cap-systematiek" — andere semantiek
- **PRD-locatie:** FR-5/FR-6 assumption "cap 10 per klasse bij start, analoog aan de harvest-cap-systematiek".
- **Werkelijke situatie:** `HARVEST_PER_CODE_CAP` (default **25**) begrenst kandidaten **per code per run** (`queue_harvest.py:43,149`), niet cumulatief. De PRD-cap is een **cumulatieve** grens op actieve promotie-referenties per klasse — een ander mechanisme dat nieuw gebouwd wordt.
- **Voorgestelde correctie:** "analoog" afzwakken tot "geïnspireerd op"; expliciet maken dat de vliegwiel-cap cumulatief is en dus een tel-query over de bibliotheek vergt, geen per-run-teller.

### B8. ⚠️ Declaratie-goudstandaard: "66 GTINs" vs. 74 records in het bestand
- **PRD-locatie:** addendum §4 ("declaratie-goudstandaard 66 GTINs").
- **Werkelijke situatie:** `tests/validation/declared-marks-goldset.json` bevat **74 records / 74 unieke GTINs**, alle met codes gevuld.
- **Voorgestelde correctie:** getal actualiseren naar 74, of de bron van "66" specificeren (bijv. subset met overlap met de crop-gold-set).

### B9. ⚠️ FR-3 tolerantie "conform het aiService-regressiecriterium" — niet verifieerbaar in deze repo
- **PRD-locatie:** FR-3 assumption, Assumptions Index.
- **Werkelijke situatie:** aiService is een andere repo; het 1-procentpunt-criterium is hier niet controleerbaar. Geen tegenbewijs, maar de assumption leunt op een externe bron.
- **Voorgestelde correctie:** bij architectuur de aiService-referentie (bestand/regel) opnemen of de tolerantie zelfstandig onderbouwen op de eigen gold-set-statistiek (bij 91 samples is 1 sample al ~1,1 procentpunt — de tolerantie is bij de huidige setgrootte de facto "0 of 1 sample verschil"; dit versterkt de urgentie van FR-10 en OQ-1).

### B10. ⚠️ FR-8 outlier-audit "bestrijkt óók handmatig gecureerde referenties" — RECYCLABLE-referenties zijn nu gedeactiveerd
- **PRD-locatie:** FR-8 consequence 2.
- **Werkelijke situatie:** de harvest sluit gedeactiveerde codes expliciet uit (`queue_harvest.py:108`: "excludes deactivated (e.g. RECYCLABLE)"). Het incident is dus operationeel al deels afgehandeld via `active=false`. Geen conflict, maar de audit moet definiëren of hij alleen `active=true` bestrijkt (logisch) — de PRD-formulering "alle actieve referenties per klasse" (FR-8 body) en de consequence zijn daarmee consistent; alleen de motivering ("het RECYCLABLE-incident betrof een handmatig geplaatste referentie") mag vermelden dat die referentie inmiddels inactief is.
- **Voorgestelde correctie:** geen inhoudelijke wijziging nodig; voetnoot volstaat.

---

## 3. Conclusie

De cijfermatige basis van PRD + addendum (drempels, gold-set-omvang, gate/floor, veiligheidsregel lege declaratie, nominatie-haakpunt in detection-flow) klopt met de code. De structurele correcties zitten op vier punten: (B1) de harvest is geen bron van dubbele bevestiging én staat droog; (B2) FR-20 wijzigt het 12.8-contract en moet dat benoemen; (B3/B4/B5) het datamodel dat het vliegwiel veronderstelt (status, herkomst, batches, groeiende gold-set, variantLabel-uniciteit) bestaat nog nergens en vereist migratie-toestemming; (B6–B8) drie kleinere feitelijke onnauwkeurigheden in het addendum.
