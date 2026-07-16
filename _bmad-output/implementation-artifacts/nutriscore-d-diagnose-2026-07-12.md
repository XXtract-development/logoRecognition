# NUTRISCORE_D-diagnose — kleinste route naar "NutriScore-categorie af"

Datum: 2026-07-12 · **read-only op ACC** (alleen `SELECT` + één MinIO-read). Geen mutaties. Gedeployde ml-container, image-tag `6bf5fad`, DB `logo_recognition` (Cherry). Query op `t3777_code` (NIET op `field_type`). `REAL_CROP_SOURCES = ('review-confirmed','realref-live-poc','flywheel-promotion')`. k=3.

**Conclusie vooraf:** NutriScore is 4/5 klaar; **NUTRISCORE_D hangt op 2 echte refs — en die 2 zijn twijfelachtig** (het zijn crops die als NUTRISCORE_**B** en _**C** geoogst zijn). Er staan **0 open review-items** voor D, en D is **niet gericht harvestbaar** (producten declareren geen NUTRISCORE_D, alleen het generieke `GENERAL_FOODS`). De kleinste route is daarom **geen simpele wachtrij-bevestiging** maar een **label-integriteitscheck** van D's bestaande crops; een schone gerichte harvest is geblokkeerd.

---

## 1. Refs per NutriScore-code (A–E)

| Code | actieve refs totaal | echt | zaad | ≥3 echt? |
|------|--------------------:|-----:|-----:|:--------:|
| NUTRISCORE_A | 13 | 12 | 1 | ✅ |
| NUTRISCORE_B | 10 | 9 | 1 | ✅ |
| NUTRISCORE_C | 6 | 5 | 1 | ✅ |
| **NUTRISCORE_D** | **3** | **2** | **1** | ❌ (2, net onder k) |
| NUTRISCORE_E | 10 | 9 | 1 | ✅ |

A/B/C/E bevestigd ≥3 echt. **D's exacte echt-telling = 2.**

### ⚠️ Datakwaliteit-vlag op D's 2 "echte" refs
De 2 actieve echte D-refs zijn (bron `review-confirmed`):
- `artwork-crops/04001724050155/12_6_NUTRISCORE_**B**__199_2220_3731.png`
- `artwork-crops/08710466313621/12_6_NUTRISCORE_**C**__710_1156_2933.png`

Beide bestandsnamen dragen de marker `NUTRISCORE_B` resp. `NUTRISCORE_C` — d.w.z. ze zijn tijdens de oogst als B en C gevonden en later onder D geregistreerd. Geen van D's refs draagt een `NUTRISCORE_D`-marker. Ze staan ook niet in de gold-set (crosscheck leeg). Dit is een reëel risico dat D feitelijk **0 correct-gelabelde echte crops** heeft.

---

## 2. Review-wachtrij voor D (en A–E)

| Code | open | registered | rejected | gated_nonkeurmerk |
|------|-----:|-----------:|---------:|------------------:|
| NUTRISCORE_A | 0 | 30 | 0 | 0 |
| NUTRISCORE_B | 0 | 16 | 2 | 0 |
| NUTRISCORE_C | 0 | 15 | 12 | 16 |
| **NUTRISCORE_D** | **0** | 6 | 12 | 11 |
| NUTRISCORE_E | 0 | 16 | 1 | 1 |

- **D heeft 0 OPEN items** → optie "Friso bevestigt een wachtende crop" is **niet beschikbaar**.
- D's historie is moeizaam: **12 rejected + 11 gate-afgewezen** — er zijn veel D-kandidaten geprobeerd en afgekeurd. D-crops zijn schaars/lastig.
- **6 registered maar slechts 2 actieve refs:** 4 als-D-geregistreerde crops zijn NIET actief. Het zijn near-duplicaten uit één B-productserie (GTINs `04001724050124/050650/050681/050711`, allemaal marker `12_6_NUTRISCORE_B`, vrijwel identieke bbox) — door de phash/embedding-dedup uit de actieve set gehaald. Ze promoveren zou (a) de dedup omzeilen én (b) waarschijnlijk B-crops als D bestempelen. **Geen schone route.**

---

## 3. Harvestbaar universe voor D

- **MinIO-index `flywheel-index/keurmerk-etiket-index.json`:** GEEN enkele `NUTRISCORE_*`-per-code-sleutel. Wél één generieke sleutel: **`NutritionalScore/GENERAL_FOODS` — 3 GTINs, 3 labels.**
- **`declared-not-found` mismatch-events voor NUTRISCORE_A–E:** 0.

**Stale-punt bevestigd:** NutriScore-producten declareren het **generieke `GENERAL_FOODS`**, NIET de specifieke letter. Er is dus **geen per-code-declaratiebron** om gericht NUTRISCORE_D-artwork te vinden. De enige declaratie-signalen zijn 3 GENERAL_FOODS-GTINs (letterloos). Een harvest daartegen zou een Nutri-Score-regio kunnen vinden, maar niet gericht op D, en de letter moet alsnog door een mens worden vastgesteld.

---

## 4. Gids/zaad-status voor D

D heeft een zaad: `reference-logos/NUTRISCORE_D/gs1-guide.png` (source `synthetic-nutriscore-bootstrap`). Een bootstrap/harvest kán dus zoeken — het knelpunt is niet het zaad maar de ontbrekende per-code declaratie-artwork.

---

## Conclusie — kleinste route naar "NUTRISCORE_D ≥3 echt"

| Route | Beschikbaar? | Waarom |
|-------|:---:|--------|
| (a) Friso bevestigt wachtende open crops | ❌ | 0 open review-items voor D |
| (b) Gerichte harvest-run (er is artwork) | ⚠️ geblokkeerd voor per-code | Geen NUTRISCORE_D-declaratie; alleen generiek `GENERAL_FOODS` (3 GTINs, letterloos) |
| (c) Promotie/reactivatie bestaande bevestigde crops | ⚠️ onschoon | 4 registered-als-D crops zijn gededupte B-serie-near-dups, waarschijnlijk fout-gelabeld |

**Aanbevolen kleinste route (met de laagste inzet, maar géén triviale bevestiging):**
1. **Eerst een label-integriteitscheck** (mens) van D's 2 actieve refs + de 4 registered near-dups: zijn dit écht Nutri-Score-D-crops of B/C? Dit is de goedkoopste stap en bepaalt of D feitelijk 2, 0, of (na correctie elders) minder heeft. Uitkomst kan zijn dat B/C juist EXTRA crops krijgen en D leeg blijkt.
2. **Als er geen genuïne D-crops zijn:** D is alleen te vullen door **echte Nutri-Score-D-productartwork** te vinden. Omdat producten geen letter declareren, moet dat via een brede oogst tegen NutritionalScore-artwork (of een gerichte bronronde op bekende D-producten) + menselijke letter-bevestiging. Nutri-Score D is op de markt relatief zeldzaam, wat de historische 12 rejects verklaart.

**Kernpunt voor Friso:** "NutriScore-categorie af" hangt volledig op D, en D is de moeilijkste van de vijf: geen open crops, geen per-code-declaratie om op te harvesten, en de 2 bestaande "echte" refs zijn qua herkomst B/C. Dit is geen kwestie van "even 1 crop goedkeuren" — het vergt eerst een label-integriteitscheck, en waarschijnlijk een gerichte D-bronronde.

*Alle metingen read-only; peil 2026-07-12; image-tag `6bf5fad`.*
