# Adversariële review — implementatie Story 12.9 (`correct_nutriscore_labels.py`)

verdict: PASS
reviewed_commit: 03370ce

Scope: `git diff 6bf5fad..03370ce -- apps/ml-service/scripts/correct_nutriscore_labels.py apps/ml-service/tests/unit/test_correct_nutriscore_labels.py`
(6bf5fad = epic-branch-basis, laatste `done`-story 19.10). Dit is een DATA-FIX
(geen feature): nieuw script + tests, geen productie-code-pad (model/gate/
harvest/vliegwiel) aangeraakt. Het `--apply`-pad (echte ACC-writes) is in deze
story NIET uitgevoerd (permission-gated, buiten scope) — de review beoordeelt
uitsluitend de logica en de tests.

Methode: drie parallelle adversariële lagen (Blind Hunter / Edge Case Hunter /
Acceptance Auditor, patroon `bmad-code-review`) op `6bf5fad..14f4af2` (de eerste
implementatie), gevolgd door een fix-ronde (`03370ce`) en herverificatie.

## Bevindingen (14f4af2) + fix-status (03370ce)

### F1 — [MEDIUM] `_relabel_ref` schreef blind zonder oud-code-check — GEFIXT
Oorspronkelijk controleerde `_relabel_ref` alleen of de huidige code al
`new_code` was (idempotentie); een afgeweken/onverwachte huidige code (niet
`NUTRISCORE_A`, niet `NUTRISCORE_E`) werd stilzwijgend overschreven naar E.
Fix (`03370ce`): expliciete `old_code`-parameter + guard — een onverwachte
huidige code retourneert nu `skip-unexpected-code` i.p.v. een blinde write.
Test: `test_relabel_ref_refuses_write_on_unexpected_current_code`.

### F2 — [MEDIUM] gold-set-reconciliatie gebruikte hardcoded old_code i.p.v. de
werkelijke rij-waarde — GEFIXT
Bij een succesvolle relabel werd `_reconcile_gold_set` aangeroepen met de
hardcoded `RELABEL_OLD_CODE`-constante i.p.v. de zojuist-gefetchte
`row["t3777_code"]`. Na de F1-fix zijn deze twee waarden altijd gelijk (de
write gebeurt alleen als `row["t3777_code"] == old_code`), maar de caller in
`run()` is nu defensief omgezet naar de gefetchte rij-waarde — geen impliciete
aanname meer nodig. Geverifieerd via de bestaande gold-set-tests (ongewijzigd
gedrag, nu expliciet correct).

### F3 — [LOW] `active IS NULL` impliciet als "al inactief" behandeld — GEFIXT
`if not row["active"]:` ving `False` én `None` in dezelfde tak. Kolom is
`NOT NULL DEFAULT true` in het schema (dus NULL is onverwacht), maar de check
is nu expliciet (`is not True`) en gedocumenteerd. Test:
`test_deactivate_ref_treats_null_active_as_already_inactive`.

### F4 — [LOW] geen conflict-guard op `@@unique([t3777Code, variantLabel])` —
GEFIXT
`reference_logos` heeft een unique-constraint op (code, variant_label). Vóór
F4 zou een botsende bestaande NUTRISCORE_E-rij met hetzelfde `variant_label`
als A13 tot een ongehandelde DB-exceptie leiden tijdens de (toekomstige,
gated) `--apply`-run. Nu vooraf gedetecteerd (`fetchval`-check) en teruggegeven
als `skip-conflict`. Test: `test_relabel_ref_refuses_write_on_variant_label_conflict`.

### F5 — [LOW] `run(apply=True)` gaf altijd exit-code 0 terug, ook bij totale
mislukking — GEFIXT
Als (bijvoorbeeld door een verkeerde omgeving/DB) geen van de 19 ids gevonden
wordt, meldde de oorspronkelijke `run()` toch `Klaar` + exit 0 — een
geautomatiseerde aanroeper zou dat als succes lezen. Nu: exit 1 als alle
refs `skip-missing` zijn, en exit 1 als er per-ref-fouten waren (nieuw
try/except per ref, zodat één kapotte ref de overige 18 niet blokkeert). Test:
`test_apply_returns_nonzero_when_all_ids_are_missing`.

### F6 — [LOW] module-level `assert len(DEACTIVATE_IDS) == 18` — GEFIXT
Onder Python `-O` wordt een `assert` stilzwijgend gestript. Vervangen door een
expliciete `if ...: raise ValueError(...)`.

### F7 — [LOW] `--apply` + `--verify` samen liet `--apply` stilzwijgend vallen —
GEFIXT
`main()` checkte `--verify` vóór `--apply` zonder de combinatie te weigeren.
Nu expliciet mutually-exclusive via `parser.error(...)`.

### F8 — [LOW] `_reconcile_gold_set` behandelde een lege string anders dan
`None` — GEFIXT
`if storage_path is None` miste een lege string (`""`), die dan als een
letterlijke `crop_path = ''`-match zou zijn geprobeerd. Nu `if not
storage_path or not t3777_code`. Test:
`test_reconcile_gold_set_noop_when_storage_path_empty_string`.

### F9 — [LOW, documentatie] AC4's "E=6"-cijfer is dubbelzinnig t.o.v. de
verwachte eindstand — NIET in de story gewijzigd (buiten scope voor een
subagent om Friso's ACs te herschrijven), WEL verduidelijkt in de code
Het verdict-bestand telt "E genuine over: 6" in de per-letter-tabel — dat is
de E-telling VÓÓR de A13-instroom (A13 stond in die tabelrij nog onder A). Ná
de relabel is de daadwerkelijke actieve E-telling 9 (vóór) − 3 (E1,E4,E10) + 1
(A13→E) = **7**, exact zoals AC4's eigen parenthetische toelichting al zegt.
`verify()`'s docstring documenteert dit nu expliciet zodat de latere gated
verificatie niet in verwarring raakt over welk cijfer het juiste eindresultaat
is (7, niet de brontabel-6). Aanbeveling: bij het uitvoeren van Task 7 het
werkelijke cijfer (7) als verwachting hanteren, in lijn met AC4's eigen
toelichting.

### Bevestigd correct (geen bevinding)
- Alle 18 `DEACTIVATE_IDS` + `RELABEL_ID` matchen letterlijk (byte-voor-byte
  UUID-vergelijking) met `nutriscore-labelverdict-friso-2026-07-12.md`.
- `field_type`/`gs1_field` voor A13 (`NutritionalScore`/`nutritionalScore`)
  matchen de canonieke mapping in `apps/api/src/services/t3777-declarations.ts:350`.
- De gold-set self-tombstone-SQL matcht `withdrawGoldSetRecord`
  (`apps/api/src/services/flywheel/gold-set.ts:180-191`) exact.
- Geen SQL-injectie: alle queries zijn parametrized (`$1`/`$2`/...), geen
  string-interpolatie in SQL.
- Geen productie-code-pad (model/gate/harvest/vliegwiel) aangeraakt — enige
  diff-bestanden zijn het nieuwe script + de nieuwe test.
- ok-crops (A4-A7, B3, B4, D1, E2) + synthetische zaden (A8/B5/C3/D3/E3) zitten
  aantoonbaar NIET in de actieset (`test_ok_and_seed_ids_are_not_in_the_action_set`).
- DRY-RUN doet structureel geen enkele DB-call (geen import, geen fetchrow).

## Acceptatie-audit per AC
- AC1/AC2 (deactivate/relabel-writes): logica correct en getest; DB-toestand
  PENDING de gated `--apply`-run (buiten scope deze story).
- AC3 (ok/zaad ongemoeid): getest, PASS.
- AC4 (na-verificatie tellingen): `verify()`-logica aanwezig en getest via
  handmatige verificatie van de query; live cijfers PENDING de gated run.
- AC5 (dry-run geen writes + idempotent): getest, PASS (4 tests).
- AC6 (testdekking selectie-/actielogica): getest, PASS (4 tests + write-helper
  tests).

## Fix-log
- `03370ce` — fix(12.9): code review findings (F1-F8, script + tests).

Geen open bevindingen. Verdict: **PASS** op `03370ce`.
