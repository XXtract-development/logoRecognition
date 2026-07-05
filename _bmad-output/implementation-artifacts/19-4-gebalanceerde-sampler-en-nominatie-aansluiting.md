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

- [ ] 1. **Sampler-logica (AC: 1)** — per keurmerkcode tot N etiketten kiezen uit de 19.3-index; gebalanceerd (diverse GTINs/producten, niet N varianten van één product); N configureerbaar via `FLYWHEEL_SAMPLE_PER_CLASS` (conservatieve default).
- [ ] 2. **Aansluiting nominatiepad (AC: 1)** — geselecteerde etiketten via het bestaande nominatie-/bootstrap-mechanisme aanbieden (herkomst passend, bijv. `bootstrap`), zodat gate + tweetraps-dedup + class-cap gelden. Hergebruik `nominateCandidate` / het bootstrap-run-pad; nooit direct in `reference_logos`.
- [ ] 3. **Cap-respect + overschot-telling (AC: 2)** — stop per klasse bij de cap; registreer overschot als overgeslagen mét reden (geen stille verliezen, NFR-5).
- [ ] 4. **Vlag-scoping (AC: 3)** — achter de bestaande nominatie-vlag (default uit); productie-draai + ACC-schrijf/herstart met expliciete toestemming.
- [ ] 5. **Tests** — sampler-balans, cap-gedrag, vlag-uit = geen writes.

## Dev Notes — Developer Context
- Hergebruik het bestaande nominatie-/poort-pad: `nominateCandidate` (`apps/api/src/services/flywheel/nomination.ts`), bootstrap-run (`bootstrap-run.ts`), config (`flywheel/config.ts`, `FLYWHEEL_CLASS_CAP`, promotiedrempels). Geen nieuwe promotieroute.
- Class-cap = 10 (`getClassCap`); dedup tweetraps (`getDedupHammingMax`/`getDedupCosine`); gate = gold-set-regressie (13.5). De sampler voegt alleen een *bron van kandidaten* toe, de bestaande veiligheidskleppen blijven leidend.
- Balans: kies GTINs verspreid over partijen/producten zodat een klasse niet uit één artwork-variant bestaat.

### Project context reference
- 19.3-index; geheugen `project_prod_corpus_route`, `project_declared_values_prior`, `project_124_gate_v2`.

## Dev Agent Record

### Agent Model Used
_(in te vullen bij uitvoering)_

## Change Log
- 2026-07-04: aangemaakt via prepare-sprint (Epic 19, correct-course). Taakdetail scherpt aan na de spike (19.1) en de index (19.3).
