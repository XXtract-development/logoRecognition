# Reviewer Gate — Reality-check tegen bestaand project

**Target:** `ARCHITECTURE-SPINE.md` (architecture-logoRecognition-2026-07-02)
**Lens:** "Verify every committed decision was web-researched or reality-checked rather than asserted from training data."
**Methode:** codebase-verificatie (package.json, pnpm-lock.yaml, schema.prisma, pipeline-services, ml-service-structuur, gold-set-bestanden) + gerichte web-check voor `imagehash`.
**Datum:** 2026-07-02

---

## Verdict

De spine is aantoonbaar tegen de echte codebase geschreven — vrijwel elke structurele claim (patronen, tabellen, paden, conventies, gold-set-aantallen) klopt exact — maar de Stack-versietabel is overgenomen uit package.json-ranges in plaats van uit de geïnstalleerde lockfile-realiteit, waardoor met name de BullMQ-claim (5.1.x vs. werkelijk 5.63.0) misleidend is voor stories die op AD-6 bouwen.

---

## Bevindingen

### F-1 — Stack-tabel toont manifest-ranges, niet de geïnstalleerde versies — **MEDIUM**

De Stack-tabel (regels 145–157) noemt versies die één-op-één uit de `package.json`-ranges komen (`^`-caret), niet uit `pnpm-lock.yaml`. Werkelijk geïnstalleerd:

| Package | Spine zegt | Lockfile (werkelijk) |
| --- | --- | --- |
| BullMQ | 5.1.x | **5.63.0** |
| Fastify | 4.24.x | **4.29.1** |
| Prisma / @prisma/client | 5.9.x | **5.22.0** |
| ioredis | 5.3.x | **5.8.2** |
| TypeScript (api) | 5.3.3 | **5.7.2** (lockfile bevat één typescript-entry; ook de api resolvet naar 5.7.2) |

De web-kolom (antd 5.22.5, react 18.3.1 — exact gepind) en de Python-kolom (fastapi 0.109.0, uvicorn 0.27.0, torch 2.1.2, torchvision 0.16.2 — exact gepind in requirements.txt) kloppen wél exact, omdat die toevallig gepind zijn. De tabel is dus niet reality-checked tegen wat er draait, maar gekopieerd uit de declaraties.

**Fix:** vervang de tabel door lockfile-versies, of label de kolom expliciet als "manifest-range" met de lockfile-versie ernaast.

### F-2 — BullMQ 5.63: `repeat.pattern` is het bestaande maar inmiddels verouderde patroon — **MEDIUM** (volgt uit F-1)

AD-6 verwijst naar het bestaande repeatable-job-patroon (`apps/api/src/services/pipeline/trigger.ts` r. 327: `repeat: { pattern: RETRAINING_CRON }`). Dat patroon bestaat en werkt — geverifieerd. Maar op de werkelijk geïnstalleerde BullMQ 5.63.0 is de `repeat`-optie door BullMQ gedeprecieerd ten gunste van Job Schedulers (`queue.upsertJobScheduler`). "Volg het bestaande patroon" is verdedigbaar voor consistentie, maar de spine committeert dit zonder te weten op welke BullMQ-versie het landt (hij denkt 5.1.x). De story voor de `flywheel-promotion`-job moet dit expliciet beslissen: bestaand `repeat`-patroon volgen óf het moderne scheduler-API gebruiken.

### F-3 — `imagehash`: correct als "nieuw" gemarkeerd; web-check bevestigt onderhouden maar traag-bewegend — **LOW**

`imagehash` staat inderdaad niet in `apps/ml-service/requirements.txt` (geverifieerd) — de spine-claim "nieuw — pinnen in de betreffende story" klopt. Web-check: [JohannesBuchner/imagehash](https://github.com/JohannesBuchner/imagehash), laatste versie **4.3.2** ([PyPI](https://pypi.org/project/ImageHash/), [conda-forge](https://anaconda.org/conda-forge/imagehash) update feb 2025). Het pakket is onderhouden maar heeft een laag release-tempo; het is puur-Python bovenop numpy/scipy/Pillow — allemaal al aanwezig in requirements.txt, dus geen dependency-risico. Pin in de story op `ImageHash==4.3.2`. Geen blokkade.

### F-4 — Positieve verificaties: de "ADOPTED" en `[ASSUMPTION]`-claims kloppen tegen de code — **INFO**

Alles hieronder is in de codebase bevestigd; dit is het bewijs dat de spine wél reality-checked is op structuur:

- **AD-6 (BullMQ-orkestratie):** `createPipelineQueues` bestaat (`apps/api/src/services/pipeline/queue.ts` r. 98), queues heten exact `training` en `artwork-detection` (r. 103/108), retraining-check als repeatable job met `repeat.pattern` + cron-env (`trigger.ts` r. 276/327). ✓
- **AD-2/AD-9 (Prisma + pgvector):** `Unsupported("vector(512)")` op `ReferenceEmbedding`, `LogoEmbedding` e.a.; pgvector-extensie in de schema-header. `ReferenceLogo` heeft exact `@@unique([t3777Code, variantLabel])` (schema.prisma r. 264) — de variantLabel-conventie van AD-3 is dus botsingsvrij mits uniek. ✓
- **AD-11:** er bestaat inderdaad géén `system_settings`/`SystemSetting` in `apps/api/prisma/schema.prisma` — de assumptie "nieuw te seeden" is correct geratificeerd. ✓
- **AD-13:** `ModelActivationLog` bestaat met exact het beschreven patroon (entiteit-FK, `userId`, `activatedAt`, `@@index([activatedAt(sort: Desc)])`, `@@map("model_activation_logs")`). ✓
- **Conventies:** `ArtworkReviewItem.status` is `String @default("open") @db.VarChar(20)` (geen enum) ✓; `ArtworkImport.pages` is `Json @default("{}")` ✓; `@db.Uuid` + `gen_random_uuid()` + `Timestamptz` + `createdAt(sort: Desc)` overal aanwezig ✓.
- **AD-7:** `artwork_imports.gln` bestaat al als kolom (`gln String? @db.VarChar(50)`) — het backfill-doelwit is echt. ✓
- **ml-service-structuur:** `apps/ml-service/app/` met `api/` + `services/`, routers geregistreerd in `main.py` met `prefix="/ml"` (r. 138–143) — exact het patroon dat de spine voorschrijft voor `flywheel.py`. ✓
- **Bestanden:** `apps/api/src/services/ml-client.ts` en `apps/api/src/services/artwork-crosscheck.ts` bestaan; `apps/api/src/api/v1/` is het bestaande route-patroon; `apps/web/src/pages/` is flat (FlywheelPage.tsx past). ✓
- **AD-4 (gold-set-aantallen):** `tests/validation/gold-set-oogstrun.json` bevat exact **91 records** en `tests/validation/declared-marks-goldset.json` exact **74 GTINs** — de seed-aantallen in de spine zijn feitelijk. ✓
- **Frontend:** antd exact `5.22.5`, react `18.3.1`, i18next aanwezig (24.x) — AD-10 "adopted" klopt. ✓

### F-5 — Niet web-geverifieerde maar laag-risico claims — **LOW**

- **antd 5 "adopted":** de spine adopteert de bestaande, exact gepinde 5.22.5 — geen web-check nodig omdat er niets nieuws gekozen wordt; wel is antd inmiddels doorontwikkeld (v5.2x+ / v6-traject), maar dat raakt de spine niet zolang de pin blijft staan.
- **FastAPI 0.109.0 / torch 2.1.2:** oud maar bewust gepind (transformers-pin r. requirements.txt documenteert waarom torch niet omhoog kan). De spine introduceert hier niets nieuws; conform.

---

## Conclusie voor de gate

**PASS met voorwaarde.** De architecturale beslissingen (AD-1 t/m AD-13) zijn allemaal tegen de echte code geverifieerd en houden stand. De enige echte reality-check-misser is de Stack-versietabel (F-1) en het daaruit volgende BullMQ-deprecatie-blindspot (F-2). Corrigeer de tabel naar lockfile-versies en neem de `repeat` vs. Job Scheduler-keuze expliciet op in de story voor de flywheel-queue; daarna is de spine volledig gedekt.

**Bronnen (web-check imagehash):**
- https://github.com/JohannesBuchner/imagehash
- https://pypi.org/project/ImageHash/
- https://anaconda.org/conda-forge/imagehash
