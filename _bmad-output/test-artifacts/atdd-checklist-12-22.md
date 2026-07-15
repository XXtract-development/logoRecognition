# ATDD-checklist — Story 12.22 (Nutri-Score-familie-head)

Stack: backend (ml-service, pytest). Gegenereerd 2026-07-15 (red-phase éérst).

## Red-phase (VOOR implementatie)

- Testbestand: `apps/ml-service/tests/unit/test_nutriscore_reader_12_22.py`
- Fixtures: synthetisch getekende Nutri-Score-balken (cv2), beide op ACC gemeten
  drukvarianten (spike 12.21b-hues), uitvergroot vakje met witte ring; géén
  binaire fixtures in git.
- Isolatie: router-tests via het geïsoleerde-module-load-patroon van
  `test_classify_gate_19_11.py` (gestubde model_manager/database/keurmerk_gate);
  de ÉCHTE reader draait mee zodra die bestaat.
- **RED aangetoond: 18/18 failed** (`pytest -q`, 2026-07-15) — reden per test:
  "RED-phase: app/services/nutriscore_reader.py bestaat nog niet (AC1)".

## Dekking per acceptatiecriterium

| AC | Test(s) | Status red-run |
|---|---|---|
| AC5a letter × variant × rotatie | `test_ac5a_leest_de_juiste_letter[10×]`, `test_ac5a_orientatie_robuust[2×]` | FAILED ✓ |
| AC5b geen uitvergroot vakje → geen lezing | `test_ac5b_...` | FAILED ✓ |
| AC5c monochroom → geen lezing | `test_ac5c_...` | FAILED ✓ |
| AC5e ratio-vloer-env kantelpunt | `test_ac5e_...` | FAILED ✓ |
| AC5d router: NS-crop → head; niet-NS → legacy | `test_ac5d_...` (2×) | FAILED ✓ |
| AC5f reader-exception → fail-open legacy | `test_ac5f_...` | FAILED ✓ |

AC1/AC2/AC3 worden door dezelfde tests afgedekt (module-bestaan, env-vloer,
router-gedrag); AC4 (geen regressie) via de bestaande volledige ml-pytest-suite
in de green-fase-gates.

## Green-fase criteria

1. Alle 18 tests groen zonder de tests te wijzigen (uitgezonderd bewezen
   fixture-bugs — documenteren indien nodig).
2. Volledige bestaande ml-pytest-suite groen (throwaway-container, zoals 12.15).
3. Bestaande classify-gedragstests (19.11) byte-identiek groen.
