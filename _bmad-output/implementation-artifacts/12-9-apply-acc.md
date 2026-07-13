# Story 12.9 — `--apply` van de NutriScore-labelcorrectie op ACC (uitgevoerd)

Datum: 2026-07-13 · **Goedgekeurde ACC-write** (Friso gaf expliciete toestemming), daarna strikt read-only na-verificatie. Branch-script `epic-12-12.9` `apps/ml-service/scripts/correct_nutriscore_labels.py`, gedraaid met `--apply` in een wegwerp-container (`docker run --rm`, netns gedeeld met de gedeployde ml-container), base-image-tag `6bf5fad`. DB `logo_recognition` (Cherry).

**Verdict: GESLAAGD.** 18 refs gedeactiveerd + 1 herlabel (A13 → NUTRISCORE_E). Na-tellingen (onafhankelijke SELECT): **A=8, B=3, C=0, D=1, E=7**. A13 staat nu op NUTRISCORE_E (active). Idempotentie herbevestigd (tweede `--apply` = 0 mutaties). Geen gold-set-mutatie, geen deploy, geen container-restart.

---

## 1. `--apply`-uitkomst (script-output)

```
Klaar — gedeactiveerd: 18, al-inactief: 0, niet-gevonden: 0, onverwachte-code: 0,
        conflict: 0, herlabeld: 1, fouten: 0, gold-set ingetrokken: 0.
```

- **18 gedeactiveerd** (`active=false`): A1,A2,A3 · B1,B2,B6,B7,B8,B10 · C1,C2,C4,C5,C6 · D2 · E1,E4,E10.
- **1 herlabeld:** A13 (`cf18877a-…`) `t3777_code` NUTRISCORE_A → NUTRISCORE_E, met `field_type=NutritionalScore`, `gs1_field=nutritionalScore`.
- **0 fouten, 0 conflicts, 0 gold-set-intrekkingen** (er waren 0 betrokken gold-set-rijen — bevestigd in de dry-run).

### Uitgevoerde writes (exhaustief)
| Write | Aantal |
|-------|-------:|
| `UPDATE reference_logos SET active=false` | 18 |
| `UPDATE reference_logos SET t3777_code/field_type/gs1_field` (A13) | 1 |
| `UPDATE gold_set_records` (reconcile) | 0 |
| **Totaal** | **19** |

Geen andere codes, tabellen of objecten geraakt.

---

## 2. Na-verificatie (onafhankelijke read-only SELECT, na de write)

- **18 deactiveer-ids nu `active=false`: 18/18.** (Onafhankelijk bevestigd; de idempotentie-herrun rapporteerde "al-inactief: 19" = 18 + A13.)
- **A13 (`cf18877a-…`): `active=true`, `t3777_code=NUTRISCORE_E`, `field_type=NutritionalScore`, `gs1_field=nutritionalScore`.** ✓
- **OK-crops ongemoeid:** A4,A5,A6,A7 (nog `NUTRISCORE_A`), B3,B4 (`NUTRISCORE_B`), D1 (`NUTRISCORE_D`), E2 (`NUTRISCORE_E`) — allemaal nog `active=true`, code onveranderd. ✓
- **Synthetische zaden ongemoeid:** A8,B5,C3,D3,E3 — allemaal nog `active=true`, code onveranderd. ✓
- **Genuine actieve tellingen per letter (excl. zaden):**

| Letter | vóór | ná | verwacht |
|--------|-----:|---:|---------:|
| A | 12 | **8** | 8 |
| B | 9 | **3** | 3 |
| C | 5 | **0** | 0 |
| D | 2 | **1** | 1 |
| E | 9 | **7** | 7 |

Exact **A8 / B3 / C0 / D1 / E7** — 1-op-1 met de projectie. Bevestigd langs twee onafhankelijke wegen (mijn SELECT-probe én het script's `--verify`).

---

## 3. Idempotentie-herbevestiging

Tweede `--apply`-run:
```
Klaar — gedeactiveerd: 0, al-inactief: 19, niet-gevonden: 0, onverwachte-code: 0,
        conflict: 0, herlabeld: 0, fouten: 0, gold-set ingetrokken: 0.
```
**0 mutaties** — alle 19 ids al in doeltoestand (18 al-inactief + A13 al-E → skip). De `FOR UPDATE`-idempotentie werkt: een tweede toepassing is een veilige no-op.

---

## 4. Impact / duiding

De NutriScore-set is nu **schoner maar smaller**: alle resterende genuine refs zijn correct gelabeld, maar **C zakt naar 0** en **D naar 1** (beide onder de k=3-conditie-C-drempel), en B naar 3 (net op de drempel). A (8) en E (7) blijven ruim herkenning-klaar. Dit is een labelintegriteit-schoonmaak, geen dekkingsuitbreiding — C en D moeten opnieuw met correct-gelabelde crops gevuld worden om herkenning-klaar te worden.

*Writes uitgevoerd onder expliciete toestemming; daarna alle verificatie read-only. Base-image-tag `6bf5fad`, branch-script `epic-12-12.9`.*
