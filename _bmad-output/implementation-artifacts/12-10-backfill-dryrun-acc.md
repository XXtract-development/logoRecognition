# Story 12.10 — DRY-RUN van de field_type/gs1_field-backfill (ACC, read-only)

Datum: 2026-07-13 · **read-only op ACC** (`SELECT` op `reference_logos`, geen writes). **0 writes / dry-run.** Peil: actieve referenties ná de 12.9-labelcorrectie (= **223** actief). DB `logo_recognition` (Cherry), ml-container base-image-tag `cb550ed`.

**Methode: fallback (faithful equivalent), niet het TS-script.** Het echte `backfill-reference-logo-field-type.ts` (branch `epic-12-12.10`) vereist een gecompileerde branch-api + Prisma-client in de api-container (fragiel). In plaats daarvan is de mapping-logica 1-op-1 gereproduceerd: de vier codelijsten + de overlap-set zijn **programmatisch en verbatim** uit `services/field-type-mapping.ts` geëxtraheerd (geen transcriptie), en de pure `classifyCode`/`planBackfill`-logica is exact nagebouwd op een read-only `SELECT ... WHERE active=true`. Uitkomsten zijn dus identiek aan wat het script zou tonen.

**Verdict: dry-run correct.** 223 actieve refs; **38** staan in de verkeerde categorie (default-bak); het plan zou **184 rijen updaten** (38 categorie-verplaatsingen + 146 gs1_field-vullingen), **0 onoplosbaar/handmatig**. NUTRISCORE_A–E worden correct via de tiebreak naar NutritionalScore gestuurd; FODMAP komt niet voor.

---

## 1. Huidige mis-tag-stand (herbevestiging)

- **223 actieve reference_logos** (was 241 op 2026-07-12; −18 door de 12.9-deactivaties, en A13 verschoven naar NutritionalScore).
- **38 refs staan in de verkeerde categorie** — hun `field_type` is de default `PackagingMarkedLabelAccreditationCode` terwijl hun code feitelijk een andere GS1-codelijst is. Dit herbevestigt de "236/241 in de default-bak"-bevinding (nu 217 onder default, waarvan 38 daar niet horen).
- Daarnaast dragen veel refs die WEL correct onder PackagingMarked vallen een lege `gs1_field` (NULL) — een aparte, niet-categorie-cleanup (zie §2).

---

## 2. Backfill-plan (per doel-field_type)

| Actie | aantal |
|-------|-------:|
| **Te updaten (totaal)** | **184** |
| ├─ categorie-verplaatsing (`field_type` verandert) | 38 |
| └─ alleen `gs1_field` vullen (blijft PackagingMarked) | 146 |
| Al correct (unchanged) | 39 |
| Ambigu maar NIET gezet (handmatig) | **0** |

### Categorie-verplaatsingen (de 38 mis-getagde refs)

| Van → Naar | refs | voorbeeldcodes |
|-----------|-----:|----------------|
| PackagingMarked → **NutritionalScore** | 18 | NUTRISCORE_A, _B, _D, _E (+ _C) |
| PackagingMarked → **DietTypeCode** | 16 | VEGAN, HALAL, FREE_FROM_GLUTEN, LACTOSE_FREE |
| PackagingMarked → **EU_consumerUsageLabelCodeList** | 4 | PREGNANCY_WARNING |
| PackagingMarked → **GHSSymbolDescriptionCode** | 0 | — (geen GHS-code in de bibliotheek) |

### gs1_field-only vullingen
- **146 refs** blijven `field_type=PackagingMarkedLabelAccreditationCode` maar krijgen `gs1_field` gezet van NULL → `packagingMarkedLabelAccreditationCode`. Dit zijn de correct-gecategoriseerde keurmerken (bio/FSC/MSC/recycling/dierenwelzijn) die alleen hun declaratieveld nog missen.

Reconciliatie: 217 onder PackagingMarked − 38 verplaatsingen = 179 blijven; daarvan 146 gs1-vulling + 33 al-compleet. Plus 6 al-correct onder NutritionalScore (5 synthetische zaden + A13). 33 + 6 = 39 unchanged. ✓

---

## 3. Ambigue codes

- **NUTRISCORE_A–E: KOMEN VOOR** (24 actieve refs: A=9, B=4, C=1, D=2, E=8). Alle 24 resolven als **`default-overlap-resolved`** — d.w.z. de code zit zowel in het T3777-default-universum als in de specifieke NutritionalScore-lijst, en de primaire tiebreak ("specifieke codelijst wint van de generieke default") stuurt ze correct naar **NutritionalScore**, niet naar de default. (18 daarvan verplaatsen daadwerkelijk; 6 staan al goed.)
- **FODMAP: KOMT NIET VOOR** in de ACC-reference_logos (0 refs). De overlap-afhandeling is voor FODMAP dus niet geactiveerd, wel correct gedefinieerd.
- **Onoplosbare ambiguïteit (code in >1 SPECIFIEKE codelijst): 0.** Geen enkele code valt onder twee specifieke codelijsten → het script markeert **niets** als "handmatige beslissing / niet gezet". De defensieve `unresolved`-tak blijft ongebruikt op de huidige data.

---

## 4. 0 writes bevestigd

- Dry-run/fallback deed uitsluitend `SELECT ... WHERE active=true` (psycopg2 `set_session(readonly=True)`).
- Geen `UPDATE reference_logos`, geen `t3777_code`/`active`/`source`/embedding aangeraakt (het script muteert sowieso alleen `field_type`/`gs1_field`).
- Gedeployde container ongemoeid (probe read-only via `docker exec`, staging in /tmp opgeruimd).

---

## Samenvatting voor de `--apply`-beslissing
Een latere `--apply` zou **184 rijen** bijwerken: **38 categorie-correcties** (18 NutritionalScore, 16 DietTypeCode, 4 EU_consumerUsageLabelCodeList, 0 GHS) + **146 gs1_field-vullingen** binnen PackagingMarked. **0 handmatige beslissingen** nodig, **0 onopgeloste ambiguïteiten**. Na toepassing is per-categorie-rapportage op `field_type` voor het eerst betrouwbaar. Idempotent (tweede run plant 0 updates).

*Methode: faithful fallback (lijsten verbatim uit `field-type-mapping.ts`); alles read-only; image-tag `cb550ed`; branch `epic-12-12.10`.*
