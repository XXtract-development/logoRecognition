# Story 12.9 — DRY-RUN van het NutriScore-labelcorrectiescript (ACC, read-only)

Datum: 2026-07-13 · **read-only op ACC** (dry-run zónder `--apply`, plus `--verify` + een onafhankelijke SELECT-voor-verificatie). **0 writes.** Branch-script: `epic-12-12.9` worktree, `apps/ml-service/scripts/correct_nutriscore_labels.py`. Gedraaid in een wegwerp-container (`docker run --rm`, netns gedeeld met de gedeployde ml-container), base-image-tag `6bf5fad`. DB `logo_recognition` (Cherry).

**Verdict: dry-run correct, begintoestand klopt volledig met het verdict.** 18 refs staan nu daadwerkelijk `active=true`, A13 staat nu op `NUTRISCORE_A`, 0 gold-set-rijen betrokken, projectie na `--apply` = **A8 / B3 / C0 / D1 / E7**. Geen enkele mutatie uitgevoerd.

> Code-bevestiging vóór draaien: `run(apply=False)` doet **geen enkele DB-call** — de plan-preview komt puur uit hardcoded constanten (regel 266-284). `--verify` doet alleen `SELECT count(*)`. Alleen `--apply` (NIET gedraaid) muteert. Idempotent per write (`FOR UPDATE` + huidige-waarde-check).

---

## 1. Preview-plan (dry-run output)

`python -m scripts.correct_nutriscore_labels` (geen `--apply`):

```
DRY-RUN — 18 refs deactiveren, 1 herlabelen (A13). Geen writes.
  zou deactiveren: A1 (c232a696-…)  A2 (f132dc5c-…)  A3 (ccb85dbf-…)
  zou deactiveren: B1 (e4f1865a-…)  B2 (07d1272f-…)  B6 (3c1bcabb-…)  B7 (758d29be-…)  B8 (77de4770-…)  B10 (b557b321-…)
  zou deactiveren: C1 (1eb5a753-…)  C2 (bd69e189-…)  C4 (ceb74937-…)  C5 (2e155ab8-…)  C6 (4003ea2d-…)
  zou deactiveren: D2 (f94cb8ab-…)
  zou deactiveren: E1 (bfe138fa-…)  E4 (05ad5bfc-…)  E10 (ce29c06f-…)
  zou herlabelen: A13 (cf18877a-…) NUTRISCORE_A -> NUTRISCORE_E (field_type=NutritionalScore, gs1_field=nutritionalScore)
Dry-run: geen writes. Draai met --apply om te muteren.
```

Scope-verdeling van de 18 deactiveer-ids per geregistreerde letter: **A:3, B:6, C:5, D:1, E:3** = 18. Plus 1× A13-relabel (A→E). De preview is puur statisch (geen DB-raadpleging).

---

## 2. Voor-verificatie op ACC (huidige toestand)

Onafhankelijke read-only SELECT tegen `reference_logos`:

- **Alle 18 deactiveer-ids: `active=true`** (18/18 gevonden, 0 missing, 0 al-inactief). Geen idempotent-skip nodig — de correctie is nog niet toegepast.
- **A13 (`cf18877a-…`): `active=true`, `t3777_code=NUTRISCORE_A`** — exact de verwachte "nog te herlabelen" begintoestand.
- **`--verify` (script, read-only) genuine actieve tellingen VÓÓR:** A=12, B=9, C=5, D=2, E=9 — 1-op-1 gelijk aan mijn onafhankelijke telling. Bevestigt de verwachte pre-correctie-stand.

Geen enkele afwijking: de begintoestand komt volledig overeen met het labelverdict.

---

## 3. Gold-set-betrokkenheid

Voor elk van de 19 betrokken crops (18 deactiveer + A13) gezocht naar een `gold_set_records`-rij op dezelfde `(t3777_code, crop_path)`:

- **0 gold-set-rijen betrokken.** Geen van de fout-gelabelde crops heeft een gold-set-bevestiging onder zijn (foute) code. Het `_reconcile_gold_set`-pad van het script zou dus **0 rijen intrekken** — de gold-set is op ACC niet vervuild door deze mislabels (consistent met de eerdere D-diagnose: D's crops staan niet in de gold-set).

---

## 4. Projectie na `--apply` (berekend, niet uitgevoerd)

Uitgaande van de `--verify`-BEFORE (A12/B9/C5/D2/E9), minus de deactivaties per geregistreerde letter (A3/B6/C5/D1/E3), plus A13 die van A naar E verschuift:

| Letter | genuine vóór | deactiveren | A13-verschuiving | **genuine ná** |
|--------|:-----------:|:-----------:|:----------------:|:--------------:|
| A | 12 | −3 | −1 (A13→E) | **8** |
| B | 9 | −6 | — | **3** |
| C | 5 | −5 | — | **0** |
| D | 2 | −1 | — | **1** |
| E | 9 | −3 | +1 (A13→E) | **7** |

**Projectie: A=8, B=3, C=0, D=1, E=7** — exact zoals het script (`verify()`-docstring) en het labelverdict voorspellen. Let op: E telt A13 pas ná de herlabel mee (de brontabel noemde "E=6", dat is de stand vóór de A13-instroom).

Nuance voor de categorie-doelen: ná correctie zakken B (3), en vooral **C naar 0** en **D naar 1** — d.w.z. de labelcorrectie maakt de NutriScore-categorie op korte termijn *slechter* dekkend (C en D vallen onder k=3), maar de resterende refs zijn dan wél correct gelabeld. Dit is een schoonmaakslag, geen dekkingsuitbreiding.

---

## 5. Bevestiging: 0 writes

- **Dry-run:** deed 0 DB-calls (statische preview) — structureel niets te muteren.
- **`--verify`:** alleen `SELECT count(*)` — 0 writes.
- **Onafhankelijke voor-verificatie:** `psycopg2` in `set_session(readonly=True)` — alleen SELECT.
- **`--apply` is NIET gedraaid.** Geen `UPDATE reference_logos`, geen `UPDATE gold_set_records`, geen container-mutatie.

Alles read-only tegen ACC; base-image-tag `6bf5fad`, branch-script `epic-12-12.9`.
