---
title: 'Ronde 11c: samenvoeging glutenvrij in toets/uitslag.json (CAP-20)'
type: 'feature'
created: '2026-11-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '39ca2c187b2300f14d77c9fd68a79fab77f96e0f'
context:
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** De glutenvrij-oordelen van de externe beoordelaar (export van de artefactpagina) en de AI-voorinvulling moeten in `toets/uitslag.json` komen volgens de besluiten van Friso van 12-11-2026, zonder iets anders in de uitslag te veranderen. Nu kan alleen de hoofdsessie dat met de hand.

**Approach:** Een nieuw commando `samenvoeg_glutenvrij.py` in de proefmap volgt toetsset.md §6b letterlijk (dat is het contract: regels, markering `herkomst_codes`, ouder-regel, weigeringen, reservekopie, droogloop, rapport met gate C). De acceptatietests staan al in `tests/test_ronde11c_samenvoeg_20261112.py` en zijn rood; die moeten groen worden zonder de tests te veranderen.

## Boundaries & Constraints

**Always:** alleen standaardbibliotheek plus `uitslag` (`bevestigde_codes`, `per_keurmerk`, `KEUZES`, `STATUSSEN`) en `train` (`MIN_GLUTEN_MET`, `MIN_ZONDER`); alleen `keurmerken["DIET_FREE_FROM_GLUTEN"]`, `bevestigde_codes` en `herkomst_codes` van een record mogen veranderen; elke weigering is een `ValueError` vóór enig schrijven.

**Never:** de echte `~/logo-meetset-20261018/proef-detector/toets/uitslag.json` lezen of schrijven (ook niet in tests); `uitslag.py`, `train.py`, `invul/server.py` of de tests wijzigen; etiketcodes of beeldadressen in de repository.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mens | exportrecord met glutenvrij in `bevestigde_codes()`; uitslagrecord bevestigd zonder glutenvrij | keuze gezet, glutenvrij in `bevestigde_codes`, markering artefact + bijgewerkt; `mens_toegepast` | N/A |
| AI afwezig | voorinvulling false, uitslag bevestigd zonder glutenvrij, geen mens | afwezig, glutenvrij in `bevestigde_codes`, markering ai-r10; `ai_toegepast` | N/A |
| AI aanwezig zonder mens | voorinvulling true, geen mens | niets; `ai_aanwezig_zonder_mens` | N/A |
| Ouder | uitslag heeft glutenvrij (geen markering), export ouder dan `tijd` | niets; `mens_ouder` | N/A |
| Mens vervangt AI | markering ai-r10, mens in export (ook onzeker, ook oud) | mens toegepast | N/A |
| Al gelijk | zelfde keuze en markering, of bestaand oordeel zonder menselijk exportoordeel | niets; `al_gelijk` | N/A |
| Ingetrokken | export open/onleesbaar, uitslag heeft glutenvrij | niets; `export_ingetrokken` | N/A |
| Niet bevestigd | uitslagrecord niet bevestigd | niets; `niet_bevestigd` | N/A |
| Ongeldige invoer | zie toetsset §6b "Weigeren" | niets geschreven | `ValueError` |

</frozen-after-approval>

## Code Map

- `_bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md` §6b -- het volledige contract.
- `.../spike-getrainde-detector/uitslag.py` -- `bevestigde_codes(record)` (lege set als niet bevestigd), `per_keurmerk(uitslag)["DIET_FREE_FROM_GLUTEN"]` → `{"met": set, "zonder": set}` = dezelfde telling als `train.poort_glutenvrij`; `KEUZES`, `STATUSSEN` (`bevestigd`, `onleesbaar`; ook `open` komt voor in exports en uitslagen).
- `.../spike-getrainde-detector/train.py:35` -- `MIN_GLUTEN_MET, MIN_ZONDER = 16, 35`; importeren is licht (geen rfdetr op moduleniveau).
- `.../spike-getrainde-detector/invul/server.py:34` -- voorbeeld van atomisch schrijven (`tempfile.mkstemp(dir=..., prefix=".uitslag-", suffix=".tmp")` + `os.replace`, opruimen bij fout); daar wél `sort_keys`, hier níet.
- Formaat van de echte uitslag (gemeten 12-11-2026): `json.dumps(u, indent=1)` zonder `sort_keys`, geen slotregel; bestaande records hebben de sleutels `bevestigde_codes, keurmerken, nutriscore, opmerking, status, tijd, veranderd`.
- `.../spike-getrainde-detector/tests/test_ronde11c_samenvoeg_20261112.py` -- het contract van de functie (`samenvoeg(uitslag, export, voorinvulling, droog=False)`, rapportsleutels, module-functie `_herlees(pad)` die de test vervangt, `main(argv)`), plus `tests/test_cap10_draaiplan.py` (DRAAIPLAN noemt `python samenvoeg_glutenvrij.py`; het script moet bestaan en getest zijn).

## Tasks & Acceptance

**Execution:**
- [x] `_bmad-output/planning-artifacts/spike-getrainde-detector/samenvoeg_glutenvrij.py` -- nieuw: `samenvoeg()` en `main()` volgens toetsset §6b; `_herlees(pad)` geeft de bytes van de uitslag vlak vóór het vervangen; rapport met `categorieen` (7 sleutels, samen het aantal uitslagrecords), `verwacht_ai`, `gate_c` {"voor","na"} met `met`, `zonder_mens`, `zonder_ai`, `open`, `geschreven`, `reservekopie` (pad of None); `main` drukt per categorie `<naam> <aantal>`, "gate C vóór/na" en bij `--droog` het woord "droogloop" af, geeft 0, of bij een weigering `geweigerd: <reden>` op stderr en 1 -- het commando van DRAAIPLAN stap 5.

**Acceptance Criteria:**
- Given de acceptatietests in `tests/test_ronde11c_samenvoeg_20261112.py`, when ze draaien, then zijn ze allemaal groen zonder wijziging aan de tests.
- Given `tests/test_cap10_draaiplan.py`, when hij draait, then is hij groen.
- Given een droogloop op een kopie van de echte uitslag met de echte export en voorinvulling (alleen door de orchestrator), when hij draait, then schrijft hij niets en tellen de categorieën op tot het aantal records.

## Verification

**Commands:**
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run pytest tests/test_ronde11c_samenvoeg_20261112.py tests/test_cap10_draaiplan.py -q` -- expected: alles groen.

## Implementation Notes

- **Route-poort (step-02), 12-11-2026:** intent gaps 0 (regels, markering, ouder-regel, weigeringen en rapport liggen vast in toetsset §6b na de spec-review; de twee punten die de reviewer productkeuze noemde volgen uit "mens gaat voor" en "CAP-20 raakt alleen glutenvrij"). Irreversibles 0 in deze build (het commando schrijft de echte uitslag, maar draait hier alleen op tijdelijke bestanden en als droogloop op een kopie). Footprint niet klein: nieuwe module van ±150 regels die het centrale meetbestand herschrijft. Route: dispatch.
- Checkpoint 1: goedkeuring volgt uit de opdracht van de orchestrator (12-11-2026, volledige keten); spec ±1500 tokens.
- ATDD vooraf: `uv run pytest tests/test_ronde11c_samenvoeg_20261112.py tests/test_cap10_draaiplan.py -q` = 26 failed, 3 passed.

- Implementatie door een verse subagent (alleen de spec als bron). Hij meldde terecht een fout in mijn eigen acceptatietest: (16, 34) gaf met het ene menselijke oordeel 35 "zonder", dus een open poort; de grensgevallen zijn rechtgezet naar (16, 34) open en (16, 33) dicht. Daarna 29 passed.
- Na review: tests uitgebreid (orchestrator), code-patches door dezelfde subagent; `uv run pytest tests/test_ronde11c_samenvoeg_20261112.py tests/test_cap10_draaiplan.py -q` = 45 passed.
- Droogloop (acceptatiecriterium 3) op een kopie van de echte uitslag in de scratchpad, met `beoordelingen-sasha-20261112.json` en de voorinvulling van ronde 10: ai_toegepast 317, ai_aanwezig_zonder_mens 35, totaal 352, ai_onwaar 317 (alle 317 ai_toegepast), gate C vóór met 0 / zonder 0 (dicht), na met 0 / zonder 317 (mens 0, AI 317), dicht. Kopie en echte uitslag byte-gelijk gebleven (sha256 van de echte uitslag vóór en na gelijk).

## Spec Change Log

## Review Triage Log

Drie lagen (Blind Hunter, Edge Case Hunter, Verification Gap), zelfde modelniveau, parallel; 27 bevindingen, per bevinding gecontroleerd in code en data (echte uitslag 12-11-2026: 0 records zonder status, 0 met een glutenvrij-sleutel, geen niet-ASCII-tekens).

- BH1 / EC8 / VG2 — controle verwacht_ai = toegepast kan nooit afwijken (zelfde voorwaarde) — medium — patch: `ai_onwaar` uit de voorinvulling met verdeling per categorie, `ai_gemarkeerd` en gate C "na" uit het herlezen bestand.
- BH2 — geen test dat alleen glutenvrij uit de export komt (fixtures gelijk) — medium — patch (test: export met andere keuzes en Nutri-Score).
- BH3 / VG4 — opruimen tijdelijk bestand en rechten ongetest; racetest bewijst opruimen niet — low — patch (tests: mislukte `os.replace`, rechten, geen reservekopie bij weigering).
- BH4 / VG3 — weigeringen zonder test (export zonder beoordelingen, onbekende exportstatus, uitslag geen object, niet-ISO-tijd, onleesbare uitslagtijd, onbekende markering, bestaande reservekopie) — medium — patch (tests).
- BH5 — ensure_ascii van het echte formaat ongetest — low — patch (test met "é", beide formaten).
- BH6 / EC3 — AI afwezig toegepast terwijl de export het etiket onleesbaar/open noemt — low — verworpen voor code: in de echte export zijn alle 352 bevestigd en de 317 niet-getoonde worden op de pagina niet aangeraakt; de fix voegt een tak toe. DRAAIPLAN verduidelijkt dat "onleesbaar of open" over de uitslagstatus gaat.
- BH7 — rapport noemt geen etiket-id's — low — verworpen: aantallen volstaan voor de stopcontrole; id's zouden etiketcodes in logs en rapporten brengen; nazoeken kan met de droogloop en de bestanden buiten de repo.
- BH8 / EC5 — `mens_ouder` telt ook ouder met dezelfde keuze — low — verworpen: zo gedefinieerd in toetsset §6b ("al gelijk" = zelfde keuze én markering); informatief, geen gevolg voor de uitslag.
- BH9 — risico van latere opslag via de lokale pagina alleen in proza — low — patch (DRAAIPLAN stap 5: blijvende instructie).
- BH10 / EC4 / EC9 — vreemde vorm geeft traceback in plaats van weigering — medium — patch: omzetten naar ValueError; test `keurmerken_geen_object`.
- BH11 — uitslag twee keer gelezen — low — patch: één keer lezen.
- BH12 — documentresten: toetsset §6 verwijst naar §6a en noemt gate C half; verhouding tot `uitslag-herkomst-20261112.json` onbeschreven; telling in `tel_proef` zonder eigenaar — low — patch (toetsset); de `tel_proef`-telling staat al in deferred-work.md (ronde 11b).
- BH13 — "proefmap" dubbelzinnig in het commando — low — patch (DRAAIPLAN, toetsset: map in de repository).
- BH14 — groene run en trace niet vastgelegd — low — patch bij afronding.
- EC1 — uitslagrecord zonder status weigert de hele samenvoeging — medium — patch: geldt als niet bevestigd (de server bewaart een eerste tussenstand zonder status, `invul/server.py:99`).
- EC2 — onbevestigde tussenstand glutenvrij "aanwezig" wordt door AI afwezig vervangen — low — verworpen: 0 records met een glutenvrij-sleutel in de echte uitslag, de lokale pagina is niet meer in gebruik en staat uit; de fix voegt een bewaker toe voor een toestand die niet aangetoond is.
- EC6 / EC10 — herlezen gebeurt vóór reservekopie en tijdelijk bestand, niet vlak vóór het vervangen — low — patch: tweede controle vlak vóór `os.replace`; test.
- EC7 — symbolische koppeling wordt een gewoon bestand — low — patch: pad oplossen; test.
- VG1 — ouder dan artefactmarkering en onbekende markering ongetest — medium — patch (test).

Uitgesteld: geen nieuwe (de `tel_proef`-telling stond al in deferred-work.md). Verworpen: 4. Doorgevoerd: de rest (code via de implementatie-subagent, tests en documenten door de orchestrator van de keten).
