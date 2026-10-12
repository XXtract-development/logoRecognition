---
title: Ontwerp stap-1-lokalisatie (heel etiket + tegels)
spec: SPEC-stap1-localization-recall
basis: origin/acc f40a2a0
---

# Ontwerp

## Stap 1: heel etiket + tegels (CAP-1, CAP-3)

- `apps/ml-service/app/services/artwork_proposals.py::visual_proposals(image, codes, remaining_seconds)` geeft voortaan `(vakjes, stats)` terug, met `stats = {"calls": int, "tokens_in": int|None, "tokens_out": int|None, "skipped": int}`. `tokens_*` is de som van provider-`usage.prompt_tokens`/`completion_tokens`; ontbreekt `usage` bij één aanroep, dan `None`.
- Aanroepen: één op het hele etiket (huidige prompt, huidige voorbewerking `proposal_image`) plus tegelaanroepen, **parallel in een `asyncio.TaskGroup`** (de eerste fout annuleert de rest). Reserve = min(30 s, 25% van `remaining_seconds()` bij de start). De hele visuele fase krijgt hoogstens `remaining_seconds() − reserve`, zodat er budget overblijft voor verfijning.
- Tegelaantal = `max_calls − 1`. Is dat < 2, dan geen tegels (max_calls 1 en 2 geven alleen de hele-etiket-aanroep). Anders: zijde 1600 px (originele pixels); zolang `ceil(W/zijde) × ceil(H/zijde) > max_calls − 1`, zijde × 1,1. Tegel = cel van `W/kolommen × H/rijen`, aan elke kant 7,5% van de celmaat erbij (15% overlap), geknipt op de beeldrand. Eén cel die het hele beeld beslaat → geen tegelaanroep.
- Tegelprompt = huidige prompt + "This image is one section of a larger label; include marks cut off at the section edge." Coördinaten teruggerekend naar het hele etiket.
- Samenvoegen: in volgorde heel etiket, dan tegels (rij voor rij, links naar rechts); een vakje met IoU ≥ 0,7 met een eerder gehouden vakje vervalt. `raw` telt na ontdubbelen.
- Plafond: env `VISUAL_PROPOSAL_MAX_CALLS`, geheel getal 1..6, **standaard 1** (besluit productowner 12-10-2026: tegels standaard uit); ongeldig of buiten bereik → standaard 1 met waarschuwing in het log.
- Fout: faalt één aanroep (HTTP inclusief 429, tijd, ongeldig antwoord), dan faalt de lokalisatie zoals nu (503 met foutklasse). Geen herhaalpoging.

## Unie, verfijning en capaciteit

- `apps/ml-service/app/api/artwork.py`, visuele tak van `/ml/artwork/localize`:
  1. voorstellen (al ontdubbeld) begrenzen op 64 (overschot telt als `dropped`);
  2. verfijning per voorstel zolang ≥ reserve (zelfde formule, bepaald bij de start van de visuele tak) lokalisatiebudget rest; de rest blijft onverfijnd (`unrefined`);
  3. unie in vaste volgorde GHS-detecties, voorstellen (heel etiket vóór tegels), verfijnde vakjes; exacte duplicaten eruit; afkappen op 64 (overschot telt bij `dropped`).
  Geen `ValueError("Proposal union exceeds capacity")` meer; de foutklasse `proposal_capacity` in `_visual_error_class` vervalt.
- `LocalizeResponse.proposals` krijgt erbij: `calls`, `tokens_in`, `tokens_out`, `skipped`, `dropped`, `unrefined`.

## API (stap1-registratie, CAP-3)

- `apps/api/src/services/ml-client.ts`: type van `proposals` uitgebreid (alle nieuwe velden optioneel).
- `apps/api/src/services/pipeline/logo-scan-flow.ts`: `Stap1` krijgt `aanroepen`, `tokensIn`, `tokensUit`, `overgeslagen`, `weggevallen` (getal of `null` als de ml-image ze niet meldt). Alleen gevuld na een geslaagde lokalisatie; bij een mislukte lokalisatie afwezig.

## Parser (CAP-6)

- `parse_proposals(envelope, width, height, stats=None)`: een vakje met `ymin >= ymax` of `xmin >= xmax` vóór knippen, of dat na knippen of projectie leeg is, wordt overgeslagen en — als `stats` is meegegeven — geteld in `stats["skipped"]`. De return blijft de lijst vakjes. Overige controles (JSON, sleutels, aantal ≤ 64, eindige getallen, `finish_reason`, enkelvoudige keuze) blijven harde fouten.

## Nutri-Score-vangnet (CAP-5)

- `apps/ml-service/app/services/classification.py`, A2-vangnet ná de embedding-route: als `ns_threshold` gezet is (strikte runtime: 0,99), claimt het vangnet alleen een letter als `a2_conf >= ns_threshold`; daaronder volgt het bestaande pad "poort open maar geen claim" (de onzekere embedding-uitkomst blijft het antwoord). Zonder `ns_threshold` (niet-strikt) ongewijzigd (`min_conf()`).
- De bevestigingsroute (lezer + A2 zelfde letter, ≥ lat) blijft ongewijzigd.

## Bestaande tests die bewust veranderen

- `tests/test_artwork_proposals.py`: transport-tests die `visual_proposals` aanroepen krijgen de tuple-return; de test op "Invalid proposal order" (`[1, 2, 0, 4]`) wordt "overgeslagen en geteld".
- `tests/test_logo_scan_robustness_atdd.py` en `tests/test_artwork_strict_runtime.py`: mocks van `visual_proposals` geven `(vakjes, stats)`; de capaciteitstests (65 vakjes → 503 `proposal_capacity`) worden 200 met `dropped`.
- `apps/api/src/__tests__/routes/logo-scans-stap1.atdd.test.ts`: stap1 bevat de nieuwe velden.

## Meting na de bouw (poort vóór PR)

- Uitvoerder: deze story. In de ml-service-container op ACC, eigen proces, met de gewijzigde modules als overlay (importlib, de draaiende dienst blijft ongewijzigd): stap 1 en `classify_crop` in-proces met de nieuwe code (alleen lezen), zelfde 40 etiketten, twee runs, controle (huidige code) in dezelfde sessie. Resultaatbestanden lokaal in de scratchpad; daarna alles op host en in container verwijderen en met `ls` controleren.
