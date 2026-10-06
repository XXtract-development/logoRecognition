---
title: 'Verhaal 1.4 Omzettabel en soortbeleid'
type: 'feature'
created: '2026-10-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1f6df684abd9a56c9cdfd4a5383f7d1bcc0c74b0'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Per soort (keurmerk, dieet, Nutri-Score, GHS, gebruikslabel) staat nergens vast welk GS1-veld en welke waarde erbij hoort, en met welke opnamestand (automatisch, voorstel, uit) het resultaat de afnemer bereikt.

**Approach:** Eén versiebeheerd bestand `gs1-mapping.json` (gegenereerd door een script uit de bestaande bronnen) plus een getypte loader in `gs1-mapping.ts` met `effectiveStand` (terugval naar voorstel bij andere model-/referentieversie, GHS in code op maximaal voorstel) en `policyVersion` (hash).

## Boundaries & Constraints

**Always:** waarden zijn GS1-codelijstwaarden, niet interne codes; bij de start nooit `automatisch`; omzetting deterministisch; `uit` heeft een reden; `automatisch` of een afwijking van de startstand heeft een rapportverwijzing.

**Never:** GS1-blokbouwer en schema `logoResults.v1.json` (1.5), CI-vergelijking met de GS1-codelijst (1.6), categoriefilter in de scan (1.7); geen database, geen netwerk.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output | Error Handling |
|----------|--------------|-----------------|----------------|
| Gelijke versies | stand automatisch, validFor = context | automatisch | N/A |
| Andere of ontbrekende versie | validFor ≠ of null | voorstel, beperktDoor 'versie' | N/A |
| uit | elke versie | uit | N/A |
| GHS-klasse | stand automatisch in bestand | voorstel (code-plafond) | N/A |
| Alias | MARINE_STEWARDSHIP_COUNCIL / GHS02 | regel van _LABEL / FLAME | N/A |
| Onbekende soort | niet in tabel | null | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/services/reference-code-mapping.json` + `field-type-mapping.ts` -- soortbron (69 codes), `normalizeReferenceCode`, `resolveFieldType`, `isGhsCode`
- `apps/api/src/services/t3777-aliases.ts` -- `aliasT3777Code` (MSC)
- `apps/web/src/data/keurmerk-codes.ts` -- 888 T3777-codes (bron van het script)
- `apps/api/scripts/gs1-mapping-sources/` -- 61 actieve codes (logodekking) en de 52 codes buiten GS1 3.1.37.1

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/scripts/generate-gs1-mapping.js` -- genereert `gs1-mapping.json` deterministisch uit de bronnen
- [x] `apps/api/src/services/gs1-mapping.json` -- gegenereerd bestand
- [x] `apps/api/src/services/gs1-mapping.ts` -- loader, `findGs1Entry`, `effectiveStand`, `resolveSoort`, `policyVersion`
- [x] `apps/api/README.md` -- regel over script en bronnen

**Acceptance Criteria:**
- Zie `epics.md` Verhaal 1.4; getest in `apps/api/src/__tests__/services/gs1-mapping.test.ts`.

## Implementation Notes

- Gebouwd in de hoofdsessie van de subagent (geen aparte implementatie-subagent); reviews draaiden wel in verse subagents.
- `categorieen` is overal leeg (= overal zinvol); verhaal 1.7 vult dit.
- GHS-klassen starten op `voorstel` (specialist is live); plafond staat in code. Aanname, zie rapport.
- Twee actieve codes (ECC_HALAL, HALAL_QUALITY_CONTROL) staan ook buiten GS1 en gaan op `uit`.
- SOCIETY_PLASTICS_INDUSTRY (actieve referentie, niet in de lokale keurmerklijst) is als T3777-soort opgenomen.
- Standwijzigingen lopen via `stand-overrides.json`, zodat het JSON altijd gelijk is aan de scriptuitvoer.

## Spec Change Log

## Review Triage Log

- patch (doorgevoerd): laatste regel keurmerk-codes.ts gemist door regex (ZERO_WASTE_BUSINESS_COUNCIL_CERTIFIED), nu regex + telling.
- patch: AC6 test vergeleek twee keer hetzelfde object; nu script-uitvoer == ingecheckt JSON.
- patch: AC4 leeg getest en startstand omzeilbaar; nu `validateMapping` met negatieve tests en overrides-bestand.
- patch: GHS-startstand niet getest; RAINFOREST_ALLIANCE_PEOPLE_NATURE onbereikbaar door alias; beperktDoor bij voorstel; slechte invoer; uitsluiting niet te onderscheiden; categorie-conflict stil; bronnen zonder controle; enum-typfout.
- false/low, niet doorgevoerd: hash is sleutelvolgorde-afhankelijk (gedocumenteerd, script deterministisch); `Object.freeze`; sha256 van de bron-Excel niet geverifieerd; gedeelde parse-helper.

## Verification

**Commands:**
- `pnpm --filter @logo-recognition/api exec vitest run src/__tests__/services/gs1-mapping.test.ts` -- expected: groen
