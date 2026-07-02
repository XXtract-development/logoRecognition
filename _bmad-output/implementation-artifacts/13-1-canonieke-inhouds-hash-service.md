# Story 13.1: Canonieke inhouds-hash-service

Status: done

<!-- Aangemaakt via create-story workflow, 2026-07-02. Bron: epics-vliegwiel.md Epic 13 / Story 13.1 + ARCHITECTURE-SPINE (AD-9, AD-14, ARCH-3, ARCH-7). -->

## Story

Als **datamanager**
wil ik **dat elke crop één en dezelfde, reproduceerbare inhouds-hash krijgt**
zodat **ontdubbeling, idempotentie en het hard-negative-geheugen nooit stil kunnen falen door twee verschillende hash-definities**.

### Afbakening (kritiek)

- Dit is het **fundament-slice** van Epic 13: uitsluitend de hash-service (ml-service) + de MLClient-methode (api). GEEN nominatie-logica (13.2), GEEN dedup-beslissingen (13.4) — die stories consumeren deze service alleen.
- **Geen database-werk**: deze story raakt geen Prisma-schema en vereist geen migratie. De hash wordt pas opgeslagen door 13.2.
- De inhouds-hash heeft **exact één implementatie**: ml-service. Er komt nooit een Node-fallback (AD-14) — ook niet "tijdelijk voor de tests".

## Acceptatiecriteria

1. **Canoniek endpoint.** Given een crop-afbeelding in MinIO, when de API via de MLClient het nieuwe ml-service-endpoint `/ml/phash` aanroept, then retourneert ml-service de **canonieke inhouds-hash** (SHA-256 over de pixel-buffer na gepinde normalisatie) én de **perceptual hash** (pHash) in één response (AD-14).
2. **Determinisme.** Dezelfde crop levert bij herhaalde aanroep byte-identiek dezelfde hashes op (AD-14).
3. **Gepinde dependency en locatie.** Given de ml-service-requirements, when de dependency wordt toegevoegd, then is `ImageHash==4.3.2` gepind en staat alle nieuwe code onder `apps/ml-service/app/` (`services/phash.py`, `api/flywheel.py` met prefix `/ml`) (ARCH-3, ARCH-7).
4. **Geen Node-implementatie.** Given de API-codebase, when gezocht wordt naar hash-berekeningen voor crops, then bestaat er geen inhouds-hash-implementatie in Node; de MLClient-methode is de enige route (AD-14).

## Tasks / Subtasks

- [ ] 1. `apps/ml-service/app/services/phash.py` (AC: 1, 2, 3)
  - [ ] 1.1 `content_hash(image) -> str`: SHA-256 over de pixel-buffer ná gepinde normalisatie — RGB-conversie, vaste resize N×N met vastgelegde interpolatie (leg N én interpolatie als module-constantes vast met docstring; Pillow==10.2.0 is al gepind in requirements.txt:26). Documenteer expliciet dat wijziging van deze constantes ALLE bestaande hashes invalideert (breekt `@@unique` en hard-negative-blokkade van 13.2+).
  - [ ] 1.2 `perceptual_hash(image) -> str`: pHash via ImageHash (hex-string), voor de Hamming-dedup van 13.4.
  - [ ] 1.3 Crop-laden uit MinIO via de bestaande storage-service (volg het laadpatroon van `similarity.py::register_crop_as_reference`, apps/ml-service/app/services/similarity.py:316 e.v.); laadfout → HTTP-fout, nooit een fallback-hash.
- [ ] 2. `apps/ml-service/app/api/flywheel.py` — nieuwe router met `POST /phash` (body: `{ "crop_path": str }` of `{ "image_b64": str }`; response: `{ "content_hash": str, "phash": str }`), registreren in `main.py` met `prefix="/ml"` conform het bestaande patroon (apps/ml-service/app/main.py:138–143) (AC: 1, 3)
- [ ] 3. `ImageHash==4.3.2` pinnen in `apps/ml-service/requirements.txt` (puur-Python; numpy==1.26.3, scipy==1.12.0, pillow==10.2.0 staan er al — regels 26/77/79) (AC: 3)
- [ ] 4. MLClient-methode `computePhash(cropPath)` in `apps/api/src/services/ml-client.ts` (volg het patroon van `registerReference`, :447–456; POST naar `/ml/phash`) — de enige route voor Node-code (AC: 1, 4)
- [ ] 5. Verifieer met een grep-sweep dat er geen inhouds-hash-implementatie in `apps/api` bestaat of ontstaat (de bestaande `sha256Hash` op `ArtworkImport` hasht bron-bestandsbytes — dat is een ándere sleutel en blijft ongemoeid; documenteer dit onderscheid in de docblock van de MLClient-methode) (AC: 4)
- [ ] 6. Tests (zie testrichtlijnen) (AC: 1, 2)
- [ ] 7. versions.md (NL) in DEZELFDE commit; Engelse commit; ghcr-workflow "Build and Push Docker Images" afwachten vóór Coolify-deploy; deploy-volgorde ml-service → api

## Dev Notes — Developer Context

### Bindende AD's

| AD | Essentie voor deze story |
|---|---|
| **AD-14** | "De inhouds-hash heeft exact één implementatie: ml-service `/ml/phash` (`app/services/phash.py::content_hash`), gedefinieerd als SHA-256 over de pixel-buffer na gepinde normalisatie (RGB, vaste resize N×N met vastgelegde interpolatie, vastgelegde bibliotheek + versie). De API berekent nóóit zelf een inhouds-hash. (...) er bestaat geen fallback-hash in Node." |
| **AD-9** | Alle beeld- en vectorberekeningen (imagehash/pHash, cosine, centroid) draaien in ml-service; de API roept aan en beslist op de geretourneerde scores. |
| **ARCH-3 / Constraint 2** | ml-service Docker kopieert alleen `app/` — nieuwe code uitsluitend onder `apps/ml-service/app/` (les queue-harvester-incident). |
| **ARCH-7** | `ImageHash==4.3.2` pinnen in de ml-service-requirements. |
| **AD-12 (context)** | De bestaande opslagsleutel hasht bron+bbox en is "hier ongeschikt" — de canonieke hash van deze story is de enige sleutel voor nominatie-uniciteit en hard-negatives (consumenten: 13.2, 13.4, 14.1). |

### Wat er AL bestaat (hergebruiken, niet herbouwen)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Router-registratiepatroon ml-service | `apps/ml-service/app/main.py:138–143` (`app.include_router(x.router, prefix="/ml", tags=[...])`) | `flywheel.py`-router exact zo registreren. |
| Crop-laden uit MinIO (ml-side) | `apps/ml-service/app/services/similarity.py:316` (`register_crop_as_reference`, incl. crop-load-foutafhandeling rond :360) en `apps/ml-service/app/services/storage.py` | Zelfde laadroute gebruiken; foutpatroon overnemen. |
| MLClient met axios-patroon | `apps/api/src/services/ml-client.ts:137` (`class MLClient`); voorbeeldmethode `registerReference` :447 | Nieuwe methode `computePhash` hier toevoegen — nergens anders. |
| Image-decode helpers | `apps/ml-service/app/api/artwork.py:388` (`_decode_image_bytes`), `:408` (`_decode_image`) | Herbruikbaar als het endpoint ook `image_b64` accepteert. |
| Dependencies voor ImageHash | `apps/ml-service/requirements.txt`: pillow==10.2.0 (:26), numpy==1.26.3 (:77), scipy==1.12.0 (:79) | ImageHash 4.3.2 is puur-Python op deze drie — geen nieuwe binaire deps. |
| Bestaande byte-hash (NIET hergebruiken als inhouds-hash) | `apps/api/prisma/schema.prisma` — `ArtworkImport.sha256Hash` (:452 e.o.) | Hasht bronbestand-bytes; expliciet ongeschikt als inhouds-hash (AD-12). Alleen ter afbakening noemen. |

### Wat er NIEUW is (de eigenlijke story)

1. `apps/ml-service/app/services/phash.py` — `content_hash` + `perceptual_hash`, gepinde normalisatie-constantes.
2. `apps/ml-service/app/api/flywheel.py` — router prefix `/ml`, endpoint `POST /phash`; registratieregel in `main.py`. (Deze router groeit in 13.4/13.5 met `/ml/outlier-audit` en `/ml/regression-eval` — houd hem dun: parsing + service-aanroep.)
3. `ImageHash==4.3.2` in `apps/ml-service/requirements.txt`.
4. `MLClient.computePhash()` in `apps/api/src/services/ml-client.ts`.
5. Pytest- en vitest-dekking (zie testrichtlijnen).

### Guardrails (voorkom bekende fouten)

- **Nooit een hash in Node** — ook niet als testhulpmiddel of "tijdelijke" fallback. Onbereikbare ml-service betekent voor afnemers (13.2): weigeren, fail-closed (AD-14). Elke Node-hash is een review-finding.
- **Normalisatie is een contract**: N, interpolatie en bibliotheekversie vastleggen in code-constantes én docstring. Pillow-upgrade = potentiële stille hash-breuk; daarom staat de versie gepind en hoort een determinisme-test in CI.
- **`app/` only**: `phash.py` onder `app/services/`, nooit `scripts/` (Docker kopieert alleen `app/` — queue-harvester-les).
- **Geen migratie in deze story** — er is geen schema-wijziging; introduceer er ook geen "alvast".
- **Deploy-volgorde ml → api** (operationele envelope §5): het endpoint moet bestaan vóór de MLClient-methode live gaat. Eerst ghcr-workflow laten slagen, dán Coolify (ACC draait pre-built images).
- Commits/PRs Engels; `versions.md` (NL, eindgebruikerstaal) in DEZELFDE commit.
- Geen e2e toevoegen aan de stable-subset-gate.

### Testrichtlijnen

- **Pytest (nieuw, `apps/ml-service/tests/` — pytest==7.4.4 staat al in requirements.txt:101; er bestaan nog géén pytest-bestanden in ml-service, dus deze story zet de conventie: tests buiten `app/` mogen, constraint 2 betreft runtime-code):
  - determinisme: zelfde afbeelding twee keer → identieke `content_hash` én `phash`;
  - normalisatie: dezelfde pixels in ander bestandsformaat (PNG vs. JPEG-lossless-pad niet mogelijk — gebruik PNG vs. BMP) → identieke `content_hash`;
  - onderscheidend vermogen: twee verschillende crops → verschillende `content_hash`;
  - foutpad: onbestaand `crop_path` → HTTP-fout, geen hash in de response.
- **Vitest (apps/api, `src/__tests__/services/`)**: `computePhash` roept `POST /ml/phash` met het juiste body-veld aan en propageert fouten (gemockte axios-client, patroon van bestaande ml-client-gebruikende tests zoals `artwork-detection-orchestration.test.ts`).
- E2E: niet nodig; in elk geval buiten de stable-subset-gate.

### Project Structure Notes

- Conform spine source-tree: `apps/ml-service/app/api/flywheel.py`, `apps/ml-service/app/services/phash.py`; MLClient-uitbreiding in het bestaande `apps/api/src/services/ml-client.ts` (conventie "ml-aanroepen uitsluitend via MLClient").
- Geen conflicten gedetecteerd; het pad `/ml/phash` is door de spine gefixeerd (Structural Seed, "Nieuwe ml-service-endpoints").

### References

- [Source: _bmad-output/planning-artifacts/epics-vliegwiel.md#Story 13.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-logoRecognition-2026-07-02/ARCHITECTURE-SPINE.md#AD-14, #AD-9, #Constraints, #Stack (ImageHash-regel), #Structural Seed]
- [Source: _bmad-output/planning-artifacts/prds/prd-logoRecognition-2026-07-02/prd.md#FR-9 (hernominatie-uitsluiting via inhouds-hash — de afnemer van deze service)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (implement-sprint, epic-13 worktree).

### Debug Log References

- Green-phase run: `pytest tests/unit/ tests/test_flywheel_atdd.py` → 17 passed, 13 skipped, 0 failed (Python 3.11.15, matches CI).
- Test-venv buiten de repo; alleen de phash + FastAPI-testclient-subset geïnstalleerd (pillow==10.2.0, numpy==1.26.3, scipy==1.12.0, ImageHash==4.3.2, pytest, fastapi, httpx) plus de eager-`app/services/__init__.py`-keten (asyncpg, minio, structlog, pydantic-settings). Torch NIET nodig (lazy geïmporteerd). `MODEL_PATH` env → schrijfbaar pad om de `/app`-mkdir in de eager package-init te omzeilen (pre-existing koppeling, buiten scope 13.1).

### Completion Notes List

- `content_hash` = SHA-256 over de genormaliseerde pixel-buffer (RGB, resize 256×256 LANCZOS — vastgelegd als module-constantes met invalidatie-waarschuwing). `perceptual_hash` = pHash (ImageHash, hash_size 8) als hex-string.
- Nieuw endpoint `POST /ml/phash` (router `app/api/flywheel.py`, prefix `/ml`, tags `["Flywheel"]`) accepteert `crop_path` (voorrang) of `image_b64`; response `{content_hash, phash}`. Fail-closed: storage-/decode-fout → HTTP 422/400, nooit een fallback-hash.
- `ImageHash==4.3.2` gepind in requirements.txt (naast reeds gepinde pillow/numpy/scipy).
- MLClient-methode `computePhash(cropPath)` toegevoegd als enige Node-route; docblock grenst expliciet af t.o.v. `ArtworkImport.sha256Hash` (bron-bestandsbytes, AD-12).
- AC→test-mapping en review: `_bmad-output/implementation-artifacts/review-13-1.md`.

### File List

- apps/ml-service/app/services/phash.py (nieuw)
- apps/ml-service/app/api/flywheel.py (nieuw)
- apps/ml-service/app/main.py (router-registratie)
- apps/ml-service/requirements.txt (ImageHash==4.3.2)
- apps/ml-service/.gitignore (nieuw — venv/pycache)
- apps/ml-service/tests/__init__.py, tests/unit/__init__.py (nieuw)
- apps/ml-service/tests/unit/test_phash_service.py (nieuw)
- apps/ml-service/tests/unit/test_flywheel_phash_endpoint.py (nieuw)
- apps/ml-service/tests/unit/test_no_node_content_hash.py (nieuw)
- apps/ml-service/tests/test_flywheel_atdd.py (13.1-skips gemarkeerd als vervangen)
- apps/api/src/services/ml-client.ts (computePhash)
- versions.md (NL-changelog)

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) uit epics-vliegwiel.md Story 13.1; codebase-paden en regelnummers geverifieerd op branch `acc`.
