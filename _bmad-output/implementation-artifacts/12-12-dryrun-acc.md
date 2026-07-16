# Story 12.12 — DRY_RUN van de Nutri-Score-vorm-oogst (ACC, read-only)

Datum: 2026-07-13 · **read-only / DRY_RUN** — geen crop-upload, geen `artwork_review_items`-insert, geen state-write. Branch-script `epic-12-12.12` `apps/ml-service/app/services/queue_harvest_nutriscore.py`, gedraaid in een wegwerp-container (`docker run --rm`, netns gedeeld met de gedeployde ml-container voor MinIO/DB) met de **branch-`app` read-only gemount** (het script gebruikt de nieuwe `db_service.find_similar_references_by_codes`). Base-image-tag `81c1012`.

**Verdict: geslaagd.** Het script draait end-to-end tegen ACC, vindt Nutri-Score-vorm-regio's, kent een provisionele kleur/letter-gok toe, de cap begrenst netjes, en **0 writes** (DRY_RUN).

> Code-bevestiging vooraf: alle writes (crop-`put_training_image` + `INSERT INTO artwork_review_items` + state-write) zitten achter `if not DRY_RUN:`. `NUTRISCORE_HARVEST_DRY_RUN=1` slaat dat volledige blok over.

---

## Opzet (begrensd)

- `NUTRISCORE_HARVEST_DRY_RUN=1`, `NUTRISCORE_HARVEST_BATCH=60`, `NUTRISCORE_HARVEST_MAX_SECONDS=180`.
- Defaults: `FLOOR=0.60` (ruime letter-onafhankelijke cosine-drempel tegen de Nutri-Score-pool), `PER_CODE_CAP=15` (flood-guard per provisionele-kleur-bucket).
- Pipeline per pagina: `propose_regions` → embed → keurmerk-gate (`kp ≥ 0,5`, voorfilter) → `find_similar_references_by_codes(NUTRISCORE_A..E, threshold=0,60)` (letter-onafhankelijke vorm-match) → HSV-kleur-gok → per-bucket-cap.
- Verse start (offset 0): de state-key `keurmerk-harvest/nutriscore-state.json` bestaat nog niet (NoSuchKey → fallback offset 0, geen write).

---

## Resultaat

```
{"dry_run": true, "candidates": 40, "inserted": 0,
 "from_offset": 0, "to_offset": 60, "total_gtins": 1857, "remaining": 1797,
 "per_code": {"NUTRISCORE": 15, "NUTRISCORE_A": 1, "NUTRISCORE_B": 3,
              "NUTRISCORE_C": 13, "NUTRISCORE_D": 3, "NUTRISCORE_E": 5},
 "seconds": 104.2}
```

### 1. Draait end-to-end + treffers
60 GTINs verwerkt in 104s; **40 Nutri-Score-vorm-treffers** (na gate-voorfilter + vorm-match ≥0,60). Het script vindt dus daadwerkelijk regio's — de vorm-oogst werkt live tegen ACC.

### 2. Provisionele kleur/letter-verdeling (40 treffers)

| Provisionele code | treffers |
|-------------------|---------:|
| NUTRISCORE (onbekend, laag-verzadigd) | 15 |
| NUTRISCORE_C (geel) | 13 |
| NUTRISCORE_E (rood) | 5 |
| NUTRISCORE_B (lichtgroen) | 3 |
| NUTRISCORE_D (oranje) | 3 |
| NUTRISCORE_A (donkergroen) | 1 |

**C/D-achtig (geel+oranje): 13 + 3 = 16** in deze kleine batch — plus de 15 onbekende die een mens nog per letter labelt. C/D-materiaal is dus ook in een venster van 60 GTINs duidelijk aanwezig (spiegelt de corpus-vindbaarheid-diagnose).

### 3. Cap / flood-guard werkt
`PER_CODE_CAP=15`. De **NUTRISCORE-onbekend-bucket raakt exact 15** — d.w.z. de cap heeft daar bijkomende treffers afgekapt (de laag-verzadigde regio's zijn het talrijkst). Geen enkele bucket overschrijdt 15. De flood-guard voorkomt aantoonbaar dat één (kleur-)groep de wachtrij overspoelt.

### 4. 0 writes bevestigd
- `dry_run: true`, `inserted: 0` → het volledige write-blok overgeslagen.
- Geen crop naar MinIO `artwork-crops/`, geen `INSERT INTO artwork_review_items`, geen state-write. De NoSuchKey op `nutriscore-state.json` bevestigt dat de state-key niet bestaat en NIET is aangemaakt.
- Gedeployde container ongemoeid (wegwerp-container `--rm`, branch-app read-only gemount, alleen `env` gelezen). Staging opgeruimd.

---

## Conclusie
Het échte 12.12-script werkt end-to-end tegen ACC in DRY_RUN: het vindt Nutri-Score-vorm-regio's (40 in 60 GTINs), kent plausibele provisionele kleur-labels toe (16 C/D-achtig + 15 onbekend), de cap begrenst per bucket, en er is geen enkele mutatie. Klaar voor een latere, apart goed te keuren echte run (`--apply`/zonder DRY_RUN) die de crops naar de review-wachtrij zet waar een mens de letter bevestigt.

*Read-only DRY_RUN, geen writes/registratie. Image-tag `81c1012`, branch `epic-12-12.12`.*

---

## ECHTE KLEINE RUN (writes AAN — expliciete toestemming Friso)

Datum: 2026-07-13 · **goedgekeurde ACC-write** · zelfde begrenzing als de DRY_RUN (batch 60, cap 15, floor 0,60), maar `NUTRISCORE_HARVEST_DRY_RUN` NIET gezet → write-blok draait. Wegwerp-container, branch-app gemount, GEEN deploy. Base-image-tag `81c1012`.

**Uitkomst:** `dry_run: false, candidates: 40, inserted: 40, from_offset 0 → to_offset 60, seconds 101.4`.

### 1. Aangemaakte review-items (na-verificatie, onafhankelijke read-only SELECT)
**40 items aangemaakt, alle 40 status `open`**, `method='embedding-shape'`, `reason='12.12 nutriscore-vorm-oogst (letter-onafhankelijk)'`. Provisionele kleur/letter-verdeling:

| Provisionele code | items (open) |
|-------------------|-------------:|
| NUTRISCORE (onbekend) | 15 |
| NUTRISCORE_C (geel) | 13 |
| NUTRISCORE_E (rood) | 5 |
| NUTRISCORE_B (lichtgroen) | 3 |
| NUTRISCORE_D (oranje) | 3 |
| NUTRISCORE_A (donkergroen) | 1 |

**C/D-achtig: 13 + 3 = 16** (plus 15 onbekend die de mens per letter labelt). Voorbeeld-crops: `artwork-crops/00000023265134/12_12_NUTRISCORE_C__…png` (conf 0,991), `…_NUTRISCORE_E__…` (0,74), `…_NUTRISCORE__…` (0,78).

### 2. Zichtbaar in de review-wachtrij
De items staan als OPEN `artwork_review_items` — dezelfde flow als de 19.8/19.10-bootstrap-items. **Friso vindt ze in de review-UI (`/artwork/review-queue`)**, filterbaar op reden `12.12 nutriscore-vorm-oogst (letter-onafhankelijk)`. Hij bevestigt/corrigeert de exacte letter via de relabel-picker (Story 12.7) — de provisionele kleur-gok is enkel een startpunt.

### 3. Cap gerespecteerd
De NUTRISCORE-onbekend-bucket staat op exact 15 (= `PER_CODE_CAP`); geen enkele bucket > 15. Flood-guard werkte ook in de echte run.

### 4. State geschreven (idempotentie-anker)
`keurmerk-harvest/nutriscore-state.json` is nu aangemaakt: `{"next_offset": 60, "total_gtins": 1857}`. Een volgende run hervat vanaf offset 60 (verwerkt niet dezelfde GTINs opnieuw).

### 5. Omgeving
Gedeployde ml-container + reguliere nachtrun ongemoeid (write draaide in een `--rm` wegwerp-container met branch-app read-only gemount). Staging op vanilla + in de container opgeruimd.

**Samenvatting echte run:** 40 open review-items in de wachtrij (16 C/D-achtig + 15 onbekend), cap gerespecteerd, state-anker gezet, klaar voor menselijke letter-bevestiging door Friso.
