# Story 19.4: Gebalanceerde sampler en nominatie-aansluiting

Status: done

<!-- Aangemaakt via prepare-sprint (bmad-sprint-planning + create-story-vorm), 2026-07-04. Bron: epics-vliegwiel.md Epic 19 / Story 19.4. -->

## Story

Als **datamanager**
wil ik **per keurmerk N gebalanceerde etiketten door de poort voeden**
zodat **elke keurmerkklasse sterk vertegenwoordigd de referentiebibliotheek in groeit tot de cap** (FR-22).

### Afbakening (kritiek)
- **Afhankelijk van 19.1 (toegang) en 19.3 (index).** Zonder de index is er niets om uit te samplen.
- **Nooit rechtstreeks in `reference_logos`.** Geselecteerde etiketten gaan via het bestaande nominatie-/bootstrap-pad door de kwaliteitspoort (AD-1/AD-2). Geen poort-omzeiling.
- **Achter de bestaande nominatie-vlag** (default uit). Productie-draai en elke ACC-schrijf/containerherstart met expliciete toestemming per geval (Constraint 1).

## Acceptatiecriteria

*(1-op-1 uit epics-vliegwiel.md, Story 19.4)*

1. **Given** de index (19.3)
   **When** de sampler draait
   **Then** kiest hij per keurmerkcode tot N etiketten (configureerbaar via een `FLYWHEEL_`-envvar met conservatieve default), gebalanceerd, en voert de geselecteerde etiketten via het bestaande nominatie-/bootstrap-pad (passende herkomst) door de kwaliteitspoort — nooit rechtstreeks in `reference_logos`; gate, tweetraps-dedup en class-cap worden gerespecteerd (AD-1/AD-2; FR-2/6/7).

2. **Given** de class-cap (start 10)
   **When** een klasse zijn cap bereikt
   **Then** stopt de selectie voor die klasse en wordt overschot geregistreerd als overgeslagen mét reden — geen stille brandstofverliezen (NFR-5).

3. **Given** de vliegwiel-vlaggen (default uit)
   **When** de sampler in productie zou draaien
   **Then** gebeurt dat achter de bestaande nominatie-vlag en met expliciete toestemming voor elke ACC-schrijf/herstart (Constraint 1).

## Tasks / Subtasks

- [x] 1. **Sampler-logica (AC: 1)** — per keurmerkcode tot N etiketten kiezen uit de 19.3-index; gebalanceerd (diverse GTINs/producten, niet N varianten van één product); N configureerbaar via `FLYWHEEL_SAMPLE_PER_CLASS` (conservatieve default 50).
- [x] 2. **Aansluiting nominatiepad (AC: 1)** — geselecteerde GTINs via het CROP-PRODUCERENDE bootstrap-pad (`searchAndNominateClass`, herkomst `bootstrap`): zaad → ml-artwork-search → ECHTE crops → `nominateCandidate` met echt `crop_path`, zodat gate + tweetraps-dedup + class-cap gelden. NOOIT het hele etiketbestand als crop, nooit direct in `reference_logos`.
- [x] 3. **Cap-respect + overschot-telling (AC: 2)** — stop per klasse bij de cap; registreer overschot als overgeslagen mét reden (geen stille verliezen, NFR-5).
- [x] 4. **Vlag-scoping (AC: 3)** — achter de bestaande nominatie-vlag (default uit); vlag-uit/dry-run = geen writes, geen ml-search. Productie-draai + ACC-schrijf/herstart met expliciete toestemming (geen self-runner).
- [x] 5. **Tests** — sampler-balans, cap-gedrag, vlag-uit = geen writes, ÉN het crop-zoekpad (bootstrapSearch aangeroepen, nominatie alleen met echt crop_path, klasse zonder zaad overgeslagen) — het test-gat dat het defect verborg.

## Dev Notes — Developer Context
- Hergebruik het bestaande nominatie-/poort-pad: `nominateCandidate` (`apps/api/src/services/flywheel/nomination.ts`), bootstrap-run (`bootstrap-run.ts`), config (`flywheel/config.ts`, `FLYWHEEL_CLASS_CAP`, promotiedrempels). Geen nieuwe promotieroute.
- Class-cap = 10 (`getClassCap`); dedup tweetraps (`getDedupHammingMax`/`getDedupCosine`); gate = gold-set-regressie (13.5). De sampler voegt alleen een *bron van kandidaten* toe, de bestaande veiligheidskleppen blijven leidend.
- Balans: kies GTINs verspreid over partijen/producten zodat een klasse niet uit één artwork-variant bestaat.

### Project context reference
- 19.3-index; geheugen `project_prod_corpus_route`, `project_declared_values_prior`, `project_124_gate_v2`.

## Dev Agent Record

### Agent Model Used
- claude-opus-4-8 (dev-story + dev-story-FIX)

### Kritiek defect + fix (2026-07-05)
De eerste implementatie was als `done` gemarkeerd maar bevatte een kritiek defect:
de vlag-AAN-tak van `balanced-sampler.ts` bood elk geselecteerd etiket-label aan
`nominateCandidate` aan met `cropPath: sel.label` — dus het HELE etiketbestand
(previewUrl van de verpakking, bv. een PDF) als "crop". `nominateCandidate` berekent
phash+embedding RECHTSTREEKS uit die crop en LOKALISEERT NIET. Een referentie-logo
moet een uitgesneden keurmerk-regio zijn → hele-verpakking-nominatie is semantisch
fout (vervuilt `reference_candidates`) of een no-op (PDF-previewUrl onverwerkbaar).
De sampler miste de detectie-/localisatie-stap.

**Fix.** Het crop-producerende kernpad van `bootstrap-run.ts` (`processClass`) is
geëxtraheerd als exporteerbare `searchAndNominateClass(t3777Code, candidateGtins,
{ remainingBudget, deadline, origin })`: zaad resolven → HARDE declaratie-guard per
GTIN → `mlClient.bootstrapSearch` over de artwork → `nominateCandidate` met het ECHTE
`crop_path` uit de ml-search. `balanced-sampler.ts` leidt per klasse de gebalanceerde,
distincte GTINs af (`distinctGtins`) en roept dat pad aan i.p.v. het label als crop
mee te geven. Klassen zonder zaad worden overgeslagen + geteld (`classesSkippedNoSeed`),
net als in de bootstrap-run. `processClass` behoudt zijn queue-status-orkestratie via
dezelfde kern (18/18 bootstrap-tests groen — regressievrij).

**Waarom de mock het miste (test-gat, nu gedicht).** De oude test mockte
`nominateCandidate` én asserteerde `detection: { cropPath: 'a1' }` — exact het rauwe
label. Die assert bevroor het foute gedrag: de mock slikte het label als crop en de
test keurde het goed. De nieuwe suite laat `searchAndNominateClass` echt draaien
(gemockte `mlClient.bootstrapSearch` + `resolveDeclarations` + prisma) en bewijst dat
`mlClient.bootstrapSearch` WORDT aangeroepen (oud gedrag riep het nooit aan → faalt)
en dat `nominateCandidate` UITSLUITEND met een ECHT `crop_path` (`artwork-crops/...`)
wordt aangeroepen — nooit met het label of het zaad (oud gedrag gaf `cropPath: 'a1'`
→ faalt). Ook: klasse zonder zaad → geen nominatie.

Adversarial-reviewrapport: `review-19-4-fix-adversarial.md` (verdict PASS).
Gates: `tsc --noEmit` exit 0; volledige api-suite 855 passed / 2 skipped / 37 todo.

## Change Log
- 2026-07-04: aangemaakt via prepare-sprint (Epic 19, correct-course). Taakdetail scherpt aan na de spike (19.1) en de index (19.3).
- 2026-07-05: **dev-story-FIX** — kritiek defect gerepareerd. Sampler voert de gebalanceerde GTINs nu door het crop-producerende bootstrap-pad (`searchAndNominateClass`: zaad → ml-artwork-search → ECHTE crops → `nominateCandidate` met echt `crop_path`) i.p.v. het hele etiketbestand als crop. Test-gat gedicht (nieuwe test faalt op het oude gedrag). Herkomst `bootstrap`, vlag-gating (AD-8) en cap/overschot-telling (NFR-5) behouden; geen directe referentie-write, MLClient-only, geen self-runner.
