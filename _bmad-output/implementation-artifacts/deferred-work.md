# Deferred Work

## Deferred from: code review of story-19-5 (2026-07-06)

- **Normaliseer `t3777Code` in de flywheel-declaratie-guard.** In `apps/api/src/services/flywheel/bootstrap-run.ts:253` vergelijkt de guard `m.code === t3777Code` strikt. `m.code` is via `parseDeclaredMarks` altijd `trim().toUpperCase()`, maar de `t3777Code`-kant (uit `bootstrap_queue`-seed) is niet expliciet genormaliseerd. Bestaand gedrag (geen 19.5-regressie; identiek aan de oude `codes.includes`); de sampler-caller is veilig omdat `buildIndex` de code uppercaset. Rest-risico: een lowercase/ongetrimde `bootstrap_queue.t3777Code` → guard matcht niet → GTIN onterecht overgeslagen. Fix-optie: `t3777Code.trim().toUpperCase()` in de guard, of uppercase borgen bij de queue-seed. Bron: Edge Case Hunter, code review 19.5.

## Deferred from: code review of 19-14-ivfflat-index-onder-fetch (2026-07-11)

- Schema-drift: de ivfflat-index `idx_reference_embeddings_embedding` staat niet in de Prisma-migraties (alleen ad-hoc op ACC + `infrastructure/docker/postgres/init.sql` op het dev-schema `logos.`). Een schone Prisma-provisioning heeft geen ivfflat-index → seqscan (correct, maar de `lists`-tuning is niet reproduceerbaar). Opvolg: index via migratie definiëren met `lists≈√N` óf bewust op seqscan leunen bij deze schaal.
- `find_similar_logos` (`apps/ml-service/app/services/database.py:351`, tabel `logo_embeddings`) deelt exact hetzelfde `ORDER BY <=> LIMIT`-patroon zonder de probes-fix. `logo_embeddings` heeft nu géén ivfflat-index (detector niet geraakt), maar zodra die ooit wordt toegevoegd keert dezelfde onder-fetch terug — ongepatcht en ongetest.
- Performance: `probes = lists` schakelt het sublineaire ivfflat-voordeel uit (brute-force door de index). Prima bij ~215 referenties; bij duizenden scant elke classify/harvest-call de hele index. Overweeg telemetrie/bovengrens bij groei.
- Geen lege/verkeerd-gedimensioneerde-embedding-guard op de queryvector in `find_similar_references` (pre-existing; ook in `find_similar_logos`).

## Deferred from: code review of 19-12-menselijke-accept-directe-referentie (2026-07-11)

- **promoteOne mist een storage_path-idempotentie-guard** (`apps/api/src/services/flywheel/promotion.ts:173-182`): maakt een `flywheel-promotion`-ref met alleen een class-cap-check, geen storage_path/near-dup-guard. Voor 19.12 opgelost door de nominatie bij accept te laten vervallen, maar als defensieve invariant voor de promotie-transactie waardevol (voorkomt duplicaten uit élke toekomstige nominatiebron). Eigen story + test.
- **"Altijd een referentie" faalt stil bij een ml-hapering** (`artwork-pipeline.ts` accept/annotate registerReference best-effort try/catch): bij ml-service down blijft het item `registered` zonder ref en zonder retry/backfill; herstel kan alleen via reopen (dat deactiveert juist). Overweeg een retry-/backfill-pad voor mislukte registraties.
- **Gecorrigeerde her-annotatie wordt stil genegeerd**: deterministische cropkey `annot_{id}.png` + idempotente `register_crop_as_reference` (storage_path-guard) → een tweede annotatie met gecorrigeerd kader overschrijft het object maar krijgt `added:false` en behoudt de oude embedding als actieve referentie. Overweeg een reset/vervang-pad bij her-annotatie.
- **`t3777Code`-override niet gevalideerd** vóór registratie (`artwork-pipeline.ts:1061/1177`): een typefout/onbekende code wordt direct een actieve referentieklasse. Pre-existing (override werd altijd toegepast), maar de altijd-aan registratie omzeilt nu de vroegere nominatie-crosscheck. Overweeg codelijst-validatie.
- **Accept-pad mist een idempotentie-guard equivalent aan het reject-pad** (M1): een crop-met-maar-zonder-sourceFile blijft `accepted` (niet `registered`) → retry/dubbelklik dubbel-telt de gold-set-aanwas (14.2-bewaking). ml-registratie zelf is idempotent.
- **AC-dekking source='review-confirmed' + embedding**: geverifieerd op codeniveau in de ml-service (`similarity.py` register_crop_as_reference default source + embedding-insert), maar niet in een test (Node-routetests mocken de ml-grens; ml-service heeft geen register-test). Wordt post-deploy read-only bevestigd (Task 4).

## Deferred from: code review of 19-13-recyclable-referenties-herstellen (2026-07-12)

- **Near-dup dedup RECYCLABLE-refs**: 22 van de 26 herstelde refs komen uit één GTIN (near-duplicaten). Bewuste keuze om alle 26 te herstellen (POC-staat, precisie spot-gecheckt). Overweeg dedup tot een representatieve subset als de outlier-audit (14.3) de cluster flagt of als vals-positieven toenemen.
- **Herbruikbaar gold-set-meetscript** (top-1 + valse-match-telling voor RECYCLABLE): 19.13 mat AC3/AC4 via ad-hoc classify-probes; een gecommit, herbruikbaar meetscript + gold-set-crop-lijst ontbreekt (nuttig voor toekomstige regressiemeting).
- **`run()`-orchestratie unittest**: de dry-run/apply/counts/REINDEX-orkestratie van `restore_recyclable_refs.run()` is live op ACC gevalideerd maar niet in een unittest (vergt db_service-mock). `_load_and_embed`/`_write_ref` zijn wél gedekt.
- **Model-identiteitscheck**: het script valideert de embedding-shape maar niet dat het huidige model dezelfde ruimte is als waarmee de actieve refs zijn gemaakt (model bleek NIET-stale in de diagnose, cosine 1,0). Overweeg een expliciete guard bij toekomstige model-wissels.
- **`print` → `logger`** en een **dry-run crop-laadbaarheid-preflight** in `restore_recyclable_refs.py` (operationele netheid; laag).

- source_spec: `spec-review-reference-categories.md`
  summary: Investigate historical active references lacking embeddings before any recovery.
  evidence: Original insert and embedding writes were outside a transaction; current path transaction prevents future partials, metadata-only re-registration intentionally cannot recover old embeddings.
- source_spec: `spec-review-reference-categories.md`
  summary: Repair existing ML CI pytest failure masking in a separate investigation.
  evidence: Existing pytest command ends with || echo "No tests yet"; root explicitly deferred general CI repair, so CI-green is not acceptance evidence.

- source_spec: `spec-flywheel-reference-content-integrity.md`
  summary: Onderzoek één consistent alpha/SVG-contract voor referentieopname, hashing en modelinput vóór gecontroleerde herbouw.
  evidence: Bestaande registratie convertRGB negeert alpha; SVGupload bestaat maar daadwerkelijke542embeddedreferenties zijnPNG. Geen aangetoonde actieveSVG; toekomstcontract verificatie nodig.
- source_spec: `spec-flywheel-reference-content-integrity.md`
  summary: Behoud expliciete deactivatie bij guide-reseed of vereis een gecontroleerd reactivatiebesluit.
  evidence: Pre-existente seedGuideEntry update active=true; nonblankinhoud bewijst geen label/goedkeuring. Script is niet uitgevoerd.

- source_spec: `_bmad-output/implementation-artifacts/spec-logo-scan-robustness.md`
  summary: De `failed`-handler van de logo-scan-worker (gecrashte of vastgelopen job) schrijft alleen de Redis-staat en nooit de rij in `logo_scans`; zulke scans ontbreken in de tabel en krijgen dus ook geen `stap1`.
  evidence: `apps/api/src/services/pipeline/logo-scan-flow.ts` registerLogoScanWorker → `logoScanWorker.on('failed', …)` roept `writeIfOpen(failedState(...))` aan zonder `saveOutcome`; vooraf bestaand gedrag (Story 1.3), door de review van spec-logo-scan-robustness (Edge6) gesignaleerd.

- source_spec: `_bmad-output/implementation-artifacts/spec-scan-reuse-code-version.md`
  summary: De commit van de herkenningscode in de image zelf vastleggen (build-arg naar een omgevingsvariabele), zodat de hergebruiksleutel niet van de uitrolbedrading (`LOGO_IMAGE_TAG` in `.env`, `SOURCE_COMMIT`) afhangt; ook de route om hergebruik op productie veilig aan te zetten.
  evidence: Blind Hunter-review 13-10-2026; nu werkt het op ACC (VERIFIED: `LOGO_IMAGE_TAG` = image-revisie in app en ml-service), maar productie geeft geen commit-variabele door en een lege `LOGO_IMAGE_TAG` op ACC laat de sleutel op `SOURCE_COMMIT` (compose-checkout) leunen terwijl de `:acc`-image zweeft.

- source_spec: `_bmad-output/implementation-artifacts/spec-scan-reuse-code-version.md`
  summary: Een scan die vóór een uitrol in de wachtrij stond en daarna door de nieuwe code wordt uitgevoerd, wordt opgeslagen onder de sleutel van de oude code; bij terugrollen naar die oude code binnen 24 uur kan dat resultaat hergebruikt worden.
  evidence: Edge Case Hunter-review 13-10-2026: sleutel wordt bij toelating vastgezet (`submitLogoScan`), `runLogoScanJob` controleert de codeversie niet. Severiteit laag-middel, alleen bij terugrollen binnen 24 uur; bewijs zou een test zijn die toelaat onder A, uitvoert onder B en daarna onder A opnieuw aanvraagt.

- source_spec: `_bmad-output/implementation-artifacts/spec-spike-fase-b-cap3-telscript.md`
  summary: De omrekening van tegel naar etiketpixels in `fb_k1.parse` heeft geen eigen toets; `test_tel.py` dekt alleen dat `tel.py` K1-vakken niet nog eens omrekent (meetopzet §3.10 noemt "omrekening tegel → etiket" als toetsgeval).
  evidence: Blind Hunter-review 30-10-2026; `tel.lees_k1` neemt de vakken uit `fb_k1` over zoals ze zijn, en geen toets roept `fb_k1.parse` aan. Valt buiten deze spec (één nieuw bestand `tel.py`).

- source_spec: `_bmad-output/implementation-artifacts/spec-spike-fase-b-cap3-telscript.md`
  summary: De uitsluitregel van meetopzet §5.1 (>1% etiketten boven 165 s, of boven 8 GB) zit niet in de rangorde van `tel.py`; die gegevens komen uit `fb_kostentijd.py` (CAP-4) en moeten na de adjudicatie in het rapport naast de rangorde worden gelegd.
  evidence: Blind Hunter-review 30-10-2026; `tel.py` leest geen `sec_etiket`/`piek_rss_mb`. Vóór adjudicatie geldt §0 (geen §5.1); de regel telt pas bij de rangorde ná adjudicatie.

- source_spec: `_bmad-output/implementation-artifacts/spec-spike-fase-b-cap3-telscript.md`
  summary: Paren die door een "ja" in de adjudicatie nieuw in de waarheid komen, zijn niet op lekken getoetst; `tel.py` noemt ze nu in `adjudicatie.niet_lekgetoetst`, maar de echte controle (cosinus ≥ 0,98 tegen de momentopname, `fb_lek.py`) moet daarna nog draaien.
  evidence: Blind Hunter-review 30-10-2026; `lekparen.json` komt uit de originele waarheid. Bewijs: `fb_lek.py` opnieuw draaien op de toegevoegde vakken en de tabel "zonder lekparen" herberekenen.

- source_spec: `_bmad-output/implementation-artifacts/spec-logo-scan-k4aa.md`
  summary: De hergebruiksleutel (`referencePoolVersion` = aantal + jongste createdAt) ziet een vervangen referentiebestand of een wissel deactiveren/heractiveren niet; legacy en K4-aa kunnen dan een oud resultaat hergebruiken.
  evidence: `logo-scan-store.ts:50`; bestond al vóór K4-aa (review B5, 31-10-2026); oplossing = id/pad-hash van de actieve set in de sleutel.
- source_spec: `_bmad-output/implementation-artifacts/spec-logo-scan-k4aa.md`
  summary: Integratietest voor `get_siglip_references`/`upsert_siglip_embedding` tegen een echte database (TEST_DATABASE_URL), zoals `tests/unit/test_ivfflat_probes_19_14.py`, vóór migratie 0023 naar ACC gaat.
  evidence: review VG8: de SQL (LEFT JOIN op model, embedded_path) is alleen via mocks getoetst.
- source_spec: `_bmad-output/implementation-artifacts/spec-logo-scan-k4aa-2.md`
  summary: De ml-service-limiet op ACC staat op 12G voor de K4-aa-proeven; herzien of terugzetten naar 8G zodra de proeven klaar zijn of de route weer uit blijft.
  evidence: review F11 (31-10-2026); besluit Friso noemt geen einddatum; ACC-host 30 GB, 11 GB vrij.
- source_spec: `_bmad-output/implementation-artifacts/spec-spike-getrainde-detector-besluiten.md`
  summary: Browsertest `test_review_20261101.py::test_pagina_b_zonder_alle_keuzes_slaat_niets_op_en_blijft_staan` faalde 2× bij de bouw (beide de eerste browserrun na een codewijziging), niet gereproduceerd in 59 latere runs (ook onder parallelle belasting); oorzaak in de test, niet in de pagina.
  evidence: De fixture `pagina` wacht alleen op het antwoord van `/stand`; daarna wacht `start()` in `invul/index.html` nog op `ri.json()`/`rs.json()` vóór `toon(); koppel();` de toetsafhandeling koppelt. Bij een trage start komt `keyboard.press("b")` vóór `koppel()` en verschijnt "Kies eerst" niet. Voor de invuller is dat onschadelijk: een toets vóór het laden doet niets en verliest geen invoer. Fix (testfixture): wacht tot `data-testid="etiket-id"` tekst heeft, want `toon()` en `koppel()` lopen direct na elkaar.
  resolution: Afgesloten 01-11-2026 (`spec-spike-getrainde-detector-ronde3.md`). Oorzaak in de test bevestigd: `tests/test_ronde3_browser_20261101.py::test_p0_oude_wachtregel_is_te_vroeg_klaar_teken_niet` houdt `items.json` vast tot na `/stand` en laat zien dat de oude wachtregel dan al klaar is terwijl `b` nog niets doet. Fix: `#keuzes` staat `inert` tot het eerste `toon()` en `koppel()` (klaar-teken) en elke browserfixture en elk herladen wacht daar via `laad_klaar` op, niet meer op `/stand`. Bewijs: de test 20× los groen en groen in twee volledige runs na elkaar (538 passed, 0 failed).
- source_spec: `_bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde4.md`
  summary: `beelden.py bouwen` en `bouwen-origineel` schrijven het cumulatieve `gecombineerd/manifest.json` niet atomisch; een onderbreking tijdens het schrijven laat kapotte JSON achter en de manifestregels van alle eerdere rondes moeten dan opnieuw gebouwd worden.
  evidence: Review ronde 4, bevinding B5b (01-11-2026): `mp.write_text(json.dumps(manifest, …))` in beide takken van `beelden.main`; bestond al vóór ronde 4 (stap 2 schreef het manifest al twee keer cumulatief). Oplossing: tijdelijk bestand + `os.replace`, zoals `certificaten.json` sinds ronde 4 en `kosten.Bewaker.boek`.
- source_spec: `_bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde5.md`
  summary: Het correctiepercentage per keurmerk (hoe vaak Friso de voorinvulling veranderde, meetregels §6) wordt door geen gereedschap berekend; sinds ronde 5 moet het V-label daarin gemarkeerd zijn als gemeten tegen een afgeleide voorinvulling.
  evidence: Blind Hunter-review ronde 5 (02-11-2026), bevinding BH8: geen `correctiepercentage` in `tel_proef.py` of elders, geen test; de regel staat sinds ronde 1 in meetregels §6 (vooraf bestaand). De markering is te reconstrueren: een record zonder sleutel `EUROPEAN_V_LABEL_VEGAN` (en zonder `"ronde": 5`) in `voorinvulling.json` is afgeleid. Bewijs dat het af is: `tel_proef` telt per keurmerk `veranderd` in `uitslag.json` tegen de bevestigde etiketten, met V-label gesplitst naar afgeleid/direct.
- source_spec: `_bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde6.md`
  summary: De bronverwijzingen [D1]–[E3], [M1] en [K1] in `datasets-keurmerken-2026-11-01.md` wijzen naar `digests/datasets-2026-11-01/`, dat alleen ongecommit in de hoofdmap van de repository staat.
  evidence: Blind Hunter BH10 (review ronde 6); `ls` in de worktree: map ontbreekt; in de hoofdmap staat hij (172 KB, ongecommit, naast ±260 wijzigingen van ander werk). Meecommitten hoort bij het afronden van dat onderzoek, niet bij de proef.
- source_spec: `_bmad-output/implementation-artifacts/spec-haiku-standaard-20261103.md`
  summary: Een herstart met de default Haiku op een bestaande voorinvulling.json met Sonnet-resultaten mengt twee modellen in één bestand; de bestaande klare etiketten blijven staan. Friso moet kiezen: een nieuw bestand voor Haiku, een herstart met `--model anthropic/claude-sonnet-5.5`, of het bestand wissen. Een guard die dit tegenhoudt is niet gebouwd, omdat het bestaande ontwerp gemengde bestanden toestaat (tests r4/r5/r9).
  evidence: De live voorinvulling.json bevat Sonnet-resultaten (301 etiketten, memlog 03-11). Review edge-case-hunter 03-11: een guard breekt drie bestaande tests die "oude entries blijven staan" vastleggen. Dit is een besluit over de werkwijze, geen code-fout.
- source_spec: `_bmad-output/implementation-artifacts/spec-haiku-standaard-20261103.md`
  summary: De grens van $73 voor de voorinvulling is gebaseerd op Sonnet. Met Haiku is de verwachte uitgave ±$3. Friso moet beslissen of de grens blijft of wordt herzien; de build heeft hem niet veranderd.
  evidence: randvoorwaarden.md §3 (regel voorinvulling toets, $73 hard, besluit 02-11-2026). Blind Hunter-review 03-11, bevinding over de grens zonder nieuw besluit.
- source_spec: `_bmad-output/implementation-artifacts/spec-haiku-standaard-20261103.md`
  summary: Haiku herkent RECYCLABLE minder goed: aanwezige RECYCLABLE gemist op twee etiketten van één leverancier; V-label aangegeven op één etiket terwijl Friso die afwezig bevestigde. Friso moet beslissen of dit een blokkade is voor het gebruik van Haiku.
  evidence: memlog 03-11 (225 van 228 gelijk, drie afwijkingen); toetsset.md §5 in de proefmap. Het gaat om de bevestigingen van Sonnet, niet onafhankelijk (memlog).
- source_spec: `_bmad-output/implementation-artifacts/spec-haiku-standaard-20261103.md`
  summary: De startprojectie van de voorinvulling (toets.py PER_AANROEP 0,06 en raming_r9) is op Sonnet gemeten en houdt geen rekening met het model. Met Haiku is ze ruim te hoog. Conservatief, geen gevaar voor overschrijding van de grens.
  evidence: Edge-case-hunter en Verification gap-review 03-11. Een modelafhankelijke projectie vraagt een ontwerpkeuze (tokenraming per model), dus geen snelle fix. De documenten zeggen nu dat de projectie op Sonnet blijft (DRAAIPLAN stap 3).
- source_spec: `_bmad-output/implementation-artifacts/spec-haiku-standaard-20261103.md`
  summary: Opgelost (besluit Friso 03-11-2026): de entry over gemengde voorinvulling-bestanden is afgehandeld met één bestand per model (`bestandsnaam()` in `toets.py`); het Sonnet-bestand blijft ongewijzigd en er is geen overschrijving van andere modellen in de code.
  evidence: test_uitvoernamen_per_model_sonnet_houdt_oude_namen_haiku_krijgt_eigen_bestand in tests/test_haiku_standaard_20261103.py; DRAAIPLAN stap 3 en ronde 9 (uitvoer per model).
- source_spec: `_bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde11.md`
  summary: 17 browsertests van de lokale invulpagina (ronde 5, 7 en 9) verwachten 13 keurmerkrijen; sinds 1498c81 (04-11-2026, glutenvrij-rij live) zijn het er 14.
  evidence: volle suite 12-11-2026 (`uv run pytest -q -m "not zwaar"` in de proefmap) = 17 failed, 1017 passed; `invul/index.html`, `invul/server.py`, `uitslag.py` en die testbestanden zijn in ronde 11 niet gewijzigd; los herhaald faalt `test_r9b_vier_nieuwe_rijen_na_v_label_en_voor_nutriscore` deterministisch (count 13, actual 14). Ronde 10 heeft die tests niet bijgewerkt.
- source_spec: `_bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde11b.md`
  summary: Samenvoeging van de artefactantwoorden in de proefmap (ronde 11b): herkomstveld `ai-r10` in `uitslag.json`, vertaling van artefactrecords naar het schema van toetsset §6, en een telling in rapport en `poort_glutenvrij` die AI-oordelen apart noemt, zijn niet gebouwd.
  evidence: Blind Hunter ronde 11b; `uitslag.json`-schema (toetsset §6) kent geen herkomst, `poort_glutenvrij` (train.py) telt alleen `bevestigde_codes`; DRAAIPLAN stap 5 legt het nu als hoofdsessiewerk vast; gate C hangt af van de open productvraag in SPEC.
- source_spec: `_bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md` (CAP-3, ronde 11d)
  summary: `invul-ux/DESIGN.md` en `invul-ux/EXPERIENCE.md` beschrijven de lokale invulpagina nog met 13 rijen; sinds ronde 10 zijn het er 14 (glutenvrij optioneel), en het paneel heeft in 1440×800 geen speling meer (730/730 px).
  evidence: toetsset §6 "Glutenvrij op de pagina" legt het ronde-10-contract vast en wint bij strijd over het aantal rijen; de UX-documenten zijn eigendom van bmad-ux en zijn in ronde 10 niet bijgewerkt (spec-review ronde 11d, bevinding 8).
- source_spec: `_bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde11d.md`
  summary: De lokale invulpagina toont voor glutenvrij hetzelfde doel "zonder 50" als voor elk keurmerk (`DOEL_ZONDER = 50`), terwijl gate C voor glutenvrij 35 bevestigde zonder vraagt.
  evidence: `invul/index.html` (één `DOEL_ZONDER`), meetregels §4 en `train.MIN_ZONDER = 35`; welke doelwaarde de glutenvrij-rij moet tonen is een productkeuze; bestond al vóór ronde 11d (Blind Hunter ronde 11d).
- source_spec: `_bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde11d.md`
  summary: `invul/index.html` en `invul/index-ronde10.html` zijn byte-gelijk; de ronde-10-paginatests lezen de kopie, de browsertests het echte bestand, en de docstring van `tests/test_ronde10_pagina_20261104.py` zegt nog dat `index.html` ongewijzigd blijft.
  evidence: `cmp` op 12-11-2026 gelijk; sinds 1498c81 is de kopie overbodig; een latere wijziging aan één van beide splitst wat getest wordt (Blind Hunter ronde 11d).
- source_spec: `_bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde11d.md`
  summary: De indelingstest van de lokale pagina (`test_r9b_alle_rijen_op_een_scherm_zonder_paginascroll`) heeft geen speling meer: het paneel meet 730/730 px in 1440×800; elke extra regel tekst of een andere letterweergave maakt alle 8 varianten rood.
  evidence: meting 12-11-2026 (spec ronde 11d); uitweg vraagt een keuze (rijen kleiner, of het paneel intern laten scrollen) door de eigenaar van het ontwerp (bmad-ux).
- source_spec: `_bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md` (CAP-3, ronde 11e)
  summary: Opgelost in ronde 11e: het eerdere punt "de lokale invulpagina toont voor glutenvrij doel zonder 50 tegen gate C 35" (bron ronde 11d) is besloten door Friso 12-11-2026 ("35, gelijk aan de eis"); de artefactpagina houdt 50.
  evidence: SPEC CAP-3 sub-bullet "Ronde 11e", toetsset §6; meetdoel ≥ 50 zonder in meetregels §4 blijft.
- source_spec: `_bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde11e.md`
  summary: `invul-ux/DESIGN.md` en `invul-ux/EXPERIENCE.md` noemen voor elk keurmerk het doel "zonder 50"; sinds ronde 11e toont de glutenvrij-rij "zonder 35".
  evidence: Blind Hunter ronde 11e; toetsset §6 heeft voorrang bij strijd over getoonde doelen; de UX-documenten zijn eigendom van bmad-ux (samen met het eerdere punt over 13 rijen).
- source_spec: `_bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde11f.md`
  summary: De steekproef van het blind nakijken telt fouten per kant zonder onderscheid naar herkomst; voor glutenvrij zou `nagekeken_ai`/`fouten_ai` per kant laten zien hoe vaak de AI-voorinvulling zelf fout zat.
  evidence: Blind Hunter ronde 11f; `tel_proef.na_nakijken` telt `nagekeken`/`fouten` per (keurmerk, kant); intern houden, niet in de nakijklijst (blind blijft blind); nieuwe meting, buiten het besluit van 12-11-2026.
