# Traceability Matrix — Story 12.15 (declaratie-gedreven Nutri-Score-oogst)

reviewed_commit: f64b8df
gate_decision: PASS (met gedocumenteerde pending-permission uitzondering op AC2's live-bewijs)

## AC → test-dekking

| AC | Omschrijving (kort) | Dekkende tests | Status |
|----|---|---|---|
| **AC1** | Gedeclareerde letter als label (niet kleur-gok), voorgelabeld naar review-wachtrij | TS: `classifyDeclaredLetter` — resolveert kale letter A-E; trim/uppercase (`build-nutriscore-declared-map.test.ts`). Python: `test_ac1_label_komt_uit_de_gedeclareerde_letter_niet_uit_matched_code` (match retourneert NUTRISCORE_A, insert is NUTRISCORE_C — bewijst het label uit de map komt, niet de vorm-match), `test_ac1_pool_match_blijft_letter_onafhankelijk_ongewijzigd` (pool-scoping ongewijzigd t.o.v. 12.12), `test_ac1_review_item_reason_marker_en_method`, `test_ac1_gate_voorfilter_blijft_ervoor`, `test_ac1_declaratie_map_ontbreekt_of_corrupt_geeft_0_kandidaten_geen_crash` | **Gedekt** — unit-niveau volledig aantoonbaar |
| **AC1 leak-guard** | Categorie-codes (GENERAL_FOODS e.d.) onder fieldType NutritionalScore worden verworpen, nooit gegokt bij >1 letter | `test_ac5a_verwerpt_categorie-codes...` (4 tests: GENERAL_FOODS/CHEESES/FATS_NUTS_SEEDS/BEVERAGES/RED_MEAT), `...leak-waarde-naast-echte-letter-resolveert-alsnog`, `...twee-distincte-echte-letters...ambigu`, `...dezelfde-letter-twee-keer-blijft-resolved` | **Gedekt** |
| **AC2** | C/D-prioriteit + drempel-doel (conditie C bij ≥3) | `test_ac2_default_scope_is_c_en_d`, `test_ac2_letters_env_kan_verbreed_worden_naar_abe`, `test_ac2_c_d_gtins_worden_eerst_verwerkt_binnen_batchbegrenzing` dekken de SCOPING/ORDERING-logica volledig op unit-niveau. Het EIND-bewijs (C en D daadwerkelijk over k=3 → conditie C (19.9) gaat aan) vereist de echte ACC-oogst-run — **PENDING-PERMISSION**, niet uitgevoerd (permission-gated bij Friso, zie story-afbakening). Conditie C zelf (19.9) is al bewezen te werken voor A/B/E (bestaande, ongewijzigde code); dit story levert alleen de nieuwe C/D-voedingsbron. | **Scoping/ordering gedekt; live k=3-bewijs pending-permission** |
| **AC3** | Geen verkeerde-locatie-registratie: onder de drempel → overgeslagen, geen fabricatie | `test_ac3_geen_enkele_regio_haalt_de_drempel_gtin_wordt_overgeslagen`, `test_ac3_meerdere_matchende_regios_alleen_de_beste_wordt_kandidaat` (best-of-region, nooit >1 candidate per GTIN per batch), `test_ac3_kalibreerbare_floor_via_env` | **Gedekt** |
| **AC4** | Idempotent + begrensd + read-only-veilig in DRY_RUN | `test_ac4_idempotentie_bestaand_review_item_wordt_overgeslagen`, `test_ac4_idempotentie_check_draait_ook_read_only_in_dry_run`, `test_ac4_idempotentie_check_is_gescoped_op_reason_niet_op_t3777_code` (regressietest voor de code-review-fix), `test_ac4_idempotentie_check_negeert_review_items_van_andere_harvesters`, `test_ac4_skipped_cap_apart_geteld_bij_cap_overschrijding`, `test_ac4_per_bucket_cap_gehandhaafd`, `test_ac4_cap_is_per_letter_niet_globaal`, `test_ac4_dry_run_muteert_niets`, `test_ac4_idempotent_batch_state_voorkomt_dubbel_verwerken_zelfde_run` | **Gedekt** |
| **AC5** | Tests dekken (a) declaratie A-E → label + leak-guard, (b) onder-drempel → overgeslagen, (c) DRY_RUN muteert niets, (d) cap per letter | Zie AC1/AC1-leak-guard/AC3/AC4 hierboven — alle vier expliciet vereiste testcategorieën aanwezig en groen | **Gedekt** (dit AC is zelf-refererend — de aanwezigheid en het slagen van de bovenstaande tests IS de dekking) |

## Testtellingen

- `apps/api/src/__tests__/scripts/build-nutriscore-declared-map.test.ts`: **19 tests**, 19 passed
- `apps/ml-service/tests/unit/test_queue_harvest_nutriscore_declared_12_15.py`: **20 tests**, 20 passed
- Regressie geverifieerd: `test_queue_harvest_nutriscore_12_12.py` (17/17), `test_queue_harvest_19_10.py` (9/9), volledige api-vitest (936/936), volledige ml-pytest via wegwerp-ghcr-container (98 passed/0 failed/7 pre-existing ongewijzigde collection-errors)

## Gate-beslissing

**PASS** voor de code-scope van deze story (AC1, AC1-leak-guard, AC3, AC4, AC5 volledig unit-test-gedekt en groen). AC2 is **PASS op scoping/ordering-niveau**, met het live k=3-eindresultaat expliciet als **pending-permission** gemarkeerd (de ACC-oogst-run die dit zou bewijzen is permission-gated bij Friso en bewust niet uitgevoerd binnen deze story, conform de opdracht). Dit is geen gate-blocker maar een expliciet gedocumenteerde grens van de autonome deliverable — de story blijft op `review` totdat de gated run heeft plaatsgevonden en AC2 live geverifieerd is.
