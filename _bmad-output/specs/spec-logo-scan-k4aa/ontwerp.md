---
hoort_bij: SPEC.md
datum: 2026-10-31
versie: 2 (na bmad-review, 28 bevindingen doorgevoerd)
---

# Ontwerp K4-aa

Referentie-implementatie (géén productiecode): `_bmad-output/planning-artifacts/spike-architectuurkeuze-logoherkenning/fase-b/` — `fb_k1.py` (K1a), `fb_common.py` (`vensters`, `jpeg_b64`), `fb_embed.py` + `fb_stap2.py` (SigLIP 2, uitsnede), `tel.py` (`lees_k4`, `samenvoegen`).

## API (`apps/api/src/services/pipeline/logo-scan-flow.ts`)

- `scanRoute()` leest `LOGO_SCAN_ROUTE` (`k4aa` → `k4aa`, al het andere → `legacy`; één waarschuwing bij een onbekende waarde). Eén keer bij de aanvraag; opgeslagen in `LogoScanState.route`. Werker, `failedState`, time-out-pad en `modelVersion` gebruiken alleen die opgeslagen waarde (state zonder `route` = `legacy`).
- Modelversie: `effectiveModelVersion(route)` = `LOGO_MODEL_VERSION` (legacy) of `LOGO_MODEL_VERSION + '/k4aa'`; hergebruiksleutel = `${effectief}@${commit}`.
- `k4aa`-werkerpad: normaliseren zoals nu (sharp → PNG) → actieve referentiecodes + `beperkSoorten` zoals legacy (zelfde `zoekruimte`) → `mlClient.scanK4aa({image_b64, strict_runtime: true, remaining_budget_ms: min(rest, 165000)})` → detecties met code buiten de toegestane soorten vallen weg → `validBox` op elke detectie (ongeldig = `result_invalid`) → `buildLogoResults`. Een ml-fout gaat via `foutklasse` naar `stap1.fout`.
- `stap1` (alleen in de rij, nooit in het GET-antwoord): `route: 'k4aa'`, `voorstellen` (K1a-meldingen na parsen), `vakjes` (na poort en samenvoegen), `aanroepen`, `tokensIn`, `tokensUit`, `kostenUsd`, `aanbieders`, `referenties`, `weggevallen`.
- GS1-blok (`gs1-block.ts`): `SCORE_KINDS.k4aa = 'uncalibrated-embedding-gate'`; drempel voor `k4aa` lokaal in gs1-block = 0 (`getThresholdForMethod` ongewijzigd, dus verify-flow/kruischeck kennen `k4aa` niet); elk `k4aa`-item krijgt reden `route_k4aa_niet_gevalideerd` → nooit `automatisch`; `uncertain`/`requires_review` → reden `twijfelachtig` zoals nu.

## ml-service: `POST /ml/artwork/scan-k4aa`

Strict runtime (bestaande `strict_runtime_endpoint`, max. 2 taken per werker, budget ≤ 165 000 ms).

1. **Config:** basis-URL uit `GHS_REVIEW_BASE_URL` moet exact `https://openrouter.ai/api/v1` zijn (na `rstrip('/')`), sleutel `GHS_REVIEW_API_KEY` niet leeg; anders 503 `(provider_unavailable)`. Model is een constante: `google/gemini-3.8-flash` (niet uit `GHS_REVIEW_MODEL_*`).
2. **Decoderen, twee keer uit dezelfde bytes:** vensters uit `cv2.imdecode(…, IMREAD_COLOR)` (zoals `fb_common.lees_beeld`); uitsneden uit PIL met transparant op wit (zoals `fb_embed.rgb`). PIL-modi buiten RGB/RGBA/LA/P/L worden via `convert('RGBA')` behandeld.
3. **Vensters:** `[(0,0,w,h)] + tile_windows(w, h, 6)`; per venster `jpeg_b64` zoals `fb_common` (≤1500 px lange zijde, `cv2.resize` INTER_AREA met `round()`-maten, `cv2.imencode` JPEG q85).
4. **Aanroep per venster, alle tegelijk** (semafoor 6 per proces): body zoals `fb_k1.aanroep` plus `provider: {zdr: true, data_collection: "deny"}`: systeem = INSTRUCTIE (+ DEEL voor tegels), gebruiker = [referentieblad PNG, venster JPEG] met `detail: high`, `temperature 0`, `max_tokens 4096`, `response_format` json_schema strict `logos`, `usage {include: true}`, `reasoning {effort: minimal}`.
   - Time-out per poging: min(90 s, rest − 20 s). Geen nieuwe poging als er < 15 s over is. Wachten 2·n s (begrensd door het budget).
   - Herhalen (max. 2) bij: 429, ≥ 500, time-out/transportfout, `finish_reason` ∉ {stop, STOP}, inhoud zonder leesbare `{"logos": …}` (ook `null`). Gelijk aan de spike.
   - Niet herhalen, scan faalt: 404 → `no_zdr_provider`; 401/403 → `provider_auth`; 402 → `provider_payment`; overige 4xx → `provider_rejected`; 200 zonder `choices` → `provider_malformed`. Na opgebruikte herhalingen: `provider_retry_exhausted`.
   - De eerste definitieve fout annuleert de andere vensteraanroepen; ml antwoordt 503 met detail `K4-aa recognition unavailable (<klasse>)`.
   - Kosten/tokens worden over álle pogingen opgeteld; ontbreekt `usage` ergens, dan `null`. Aanbieder per geslaagde aanroep (`provider` uit het antwoord) in `stats.providers`.
   - Logs: alleen klasse en aantallen; nooit sleutel, beeld, prompt of antwoordtekst.
5. **Parsen** zoals `fb_k1.parse` (box_2d [ymin,xmin,ymax,xmax] 0..1000, begrensd, omgerekend naar etiketpixels, float). Code ∉ top 15 (incl. `ander`) of zonder geldig vak valt weg. Volgorde-sleutel = (venster-index, plek in het antwoord).
6. **Afkappen:** hoogstens 64 meldingen in volgorde; de rest telt als `stats.dropped`.
7. **SigLIP-poort** (zoals `fb_stap2` + `tel.lees_k4`): geldig als `min(x1,W) − max(x0,0) ≥ 1` en idem verticaal; uitsnede `im.crop((max(0,round(x0)), max(0,round(y0)), min(W,round(x1)), min(H,round(y1))))`; ongeldig vak = lege top (valt weg). Embedding in batches van 8 onder `torch.inference_mode()`, L2-genormaliseerd. Cosinus tegen alle actieve referenties; top-3 verschillende soorten (codes genormaliseerd met `symbol_contract.normalize_code`); code blijft als hij erbij zit. `confidence` = hoogste cosinus van die soort, afgekapt op [0, 1]. Budgetcontrole tussen batches.
8. **Samenvoegen** (zoals `tel.samenvoegen` met score 0): zelfde code, IoU ≥ 0,5 op de float-vakken, ketens; het lid met de laagste volgorde-sleutel blijft.
9. **Antwoord:** `detections[{bbox{x: floor(x0), y: floor(y0), width, height}` (x1/y1 = ceil, begrensd op het beeld, minimaal 1 px), `t3777_code, confidence, method: "k4aa", uncertain, requires_review}]` met `uncertain = requires_review = code ∉ BRUIKBAAR`; `stats{calls, tokens_in, tokens_out, cost_usd, providers, k1_meldingen, na_poort, dropped, referenties, inline_embedded}`.

BRUIKBAAR = WEIDEMELK, MARINE_STEWARDSHIP_COUNCIL_LABEL, RAINFOREST_ALLIANCE_PEOPLE_NATURE, FOREST_STEWARDSHIP_COUNCIL_MIX, BETER_LEVEN_1_STER, VEGAN_SOCIETY_VEGAN_LOGO, EUROPEAN_V_LABEL_VEGAN.

## Referentieblad en instructie

- `apps/ml-service/app/assets/k4aa/referentieblad.png`: het spikeblad, byte-gelijk (sha256 `d39f1905cdaaf4f4998c76c29ae0324707975ca9961f9214b1f6c45c74ab9ad3`, VERIFIED lokaal opnieuw gemaakt); 13 gidslogo's (`gs1-packaging-label-guide`) + Nutri-Score A/B/C (`synthetic-nutriscore-bootstrap`); geen klantmateriaal. Toets hasht het vastgelegde bestand.
- INSTRUCTIE, OMSCHRIJVING, DEEL en SCHEMA letterlijk uit `fb_k1.py`; toets: sha256(INSTRUCTIE + "||" + DEEL) = `6d06a8081cf93c7e163891b33a5ca3393afb75f9a04e7b19ace2792e385b5539`, sha256(json.dumps(SCHEMA, sort_keys=True)) = `a44b588b8a940b0b9588580f9033b659e79289d6c72b90433276a9374b19166a`.

## SigLIP 2

- Checkpoint `google/siglip2-base-patch16-384`, revisie `f775b65a79762255128c981547af89addcfe0f88`; `SiglipVisionModel` + `SiglipImageProcessor` (transformers 4.38.2). VERIFIED: cosinus 1,000000 tegen de spike-embeddings (10 referenties), 0,31 s/beeld op 1 thread (M3 Pro).
- Dockerfile (builder): download + `save_pretrained` van beeldtoren én processor naar `/opt/siglip2-vision`; runtime kopieert die map; `HF_HUB_OFFLINE=1`; `K4AA_SIGLIP_PATH` (standaard `/opt/siglip2-vision`) moet een bestaande map zijn, anders 503 `(siglip_model_unavailable)`.
- Laden: lui, één keer per werker, achter een `threading.Lock`; modelnaam in de database = `google/siglip2-base-patch16-384@f775b65a`.

## Referentie-embeddings

- Migratie `apps/api/prisma/migrations/0023_add_reference_embeddings_siglip2/migration.sql` (+ `down.sql`) en Prisma-model `ReferenceEmbeddingSiglip2`; NIET toegepast op ACC/productie:
  `reference_embeddings_siglip2(reference_logo_id uuid → reference_logos.id ON DELETE CASCADE, model varchar(120), storage_path varchar(500), embedding vector(768) not null, created_at timestamptz default now(), PRIMARY KEY (reference_logo_id, model))`.
- `POST /ml/artwork/k4aa/reference-embeddings/sync` (body `{limit: 1..1000, standaard 1000}`): `pg_try_advisory_lock` (bezet → 409); actieve referenties zonder rij voor dit model of met ander `storage_path` → bestand uit MinIO, transparant op wit, embedding in batches via `to_thread`, upsert (`ON CONFLICT (reference_logo_id, model) DO UPDATE`); stopt na 120 s; mislukte bestanden overgeslagen en geteld; nooit DELETE; unlock in `finally`. Antwoord `{toegevoegd, bijgewerkt, ontbrekend_rest, mislukt}`. Interne endpoint zonder eigen authenticatie, net als `rebuild-reference-embeddings`. Draaien: hoofdsessie, na het toepassen van de migratie.
- Scan: haalt (id, code, storage_path) van actieve referenties + embeddings van dit model; geheugencache per werker met sleutel = hash van de gesorteerde (id, code, storage_path, heeft-embedding)-lijst. Ontbreken ≤ 8 → die in het geheugen embedden (niets schrijven); > 8 → 503 `(siglip_references_incomplete)`; tabel ontbreekt → 503 `(siglip_references_missing)`. Zo stemt altijd de volledige actieve set mee. De bestaande `referencePoolVersion` in de hergebruiksleutel (aantal + jongste aanmaakmoment) ziet een vervangen bestand of een wissel deactiveren/heractiveren niet; dat geldt al voor legacy en staat in `deferred-work.md`.
- Rekentijd sync: 0,31 s/beeld lokaal → 540 referenties ±3 min lokaal; in de container (1 thread per werker) INFERENCE 2–3× zo lang, dus meerdere `sync`-aanroepen.

## Lokale toets (CAP-8) en geheugen

- Script `apps/ml-service/scripts/k4aa_vergelijk.py` (geen productiecode; sleutel alleen uit de omgeving; uitvoer buiten de repo onder `~/logo-meetset-20261018/ontwikkelmeting-20261028/k4aa-bouw/`). Etiketten: eerste 20 van `voorlopige-selectie.json`. (a) poort op spike-vakken met momentopname-embeddings; (b) volledige route met dezelfde embeddings, vergelijking zoals SPEC CAP-8.
- Geheugen: één proces dat B0 laadt zoals de ml-service, RSS vóór SigLIP, na laden, na één scan met 64 uitsneden; norm in SPEC.
