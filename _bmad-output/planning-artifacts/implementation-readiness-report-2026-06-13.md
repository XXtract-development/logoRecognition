---
stepsCompleted: ["focused-assessment"]
scope: "Localisatie-detector als structurele oplossing — alignment met Story 12.4, Epic 12, ARCH-beslisdocument"
date: 2026-06-13
assessor: "Winston (architect) / PM-readiness"
---

# Implementation Readiness — Localisatie-detector (gericht)

Gerichte readiness-check op de scope: de getrainde keurmerk-localisator als structurele oplossing
(`12-ARCH-localisatie-detector-beslisdocument.md`), uitgelijnd met Story 12.4, Epic 12 en de PRD.
Geen volledige project-herijking — alleen dit beslis-/bouwpad.

## Document-inventaris

| Type | Bestand | Status |
|---|---|---|
| PRD | `planning-artifacts/prd.md` | aanwezig (Epic 8/9-tijdperk) |
| Architectuur | `planning-artifacts/architecture.md` + `implementation-artifacts/12-ARCH-…beslisdocument.md` | aanwezig |
| Epics | `planning-artifacts/epics.md` | aanwezig — **dekt alleen t/m Epic 9** |
| Story 12.4 | `implementation-artifacts/12-4-getrainde-region-detector-optie-a.md` | aanwezig — **gedateerd** |
| Stories 12.1–12.7 + ARCH | losse bestanden in `implementation-artifacts/` | aanwezig, **niet in epics.md** |
| UX | — | afwezig (backend/ML — niet kritiek) |

Geen duplicaten/sharding.

## Bevindingen (gaps & misalignments)

### 🔴 G1 — Epic 12 is niet geformaliseerd (traceability-breuk)
`epics.md` en de PRD eindigen bij Epic 9. Heel Epic 12 (brede keurmerk-dekking) — inclusief de
localisator, de detector en deze ARCH-beslissing — bestaat alleen als losse story-bestanden. Er is
**geen PRD-requirement of epic-AC** waaraan de localisatie-detector traceert. Gevolg: het bouwpad is
niet verankerd; scope/acceptatie zijn impliciet.

### 🔴 G2 — Story 12.4 is achterhaald door de nieuwe diagnose
12.4 staat als "ready, **start ná 12.3-stap-0**" en is geframed als *vervolg* op de embedding (12.3).
De steekproef van 13-06 bewijst het tegenovergestelde: **localisatie is het bindende knelpunt, niet de
embedding.** 12.4 mist daardoor: (a) de herprioritering (12.4 wordt de hoofdlijn, niet gated achter
12.3), (b) **Optie B (open-vocab)** als alternatief, (c) de **binaire keurmerk-gate** als tussenstap,
(d) de **A-vs-B-spike** als beslis-poort. 12.4 moet herschreven worden conform het ARCH-doc.

### �amber G3 — De A-vs-B-spike is geen formele story
Het spike-plan staat in het ARCH-doc maar is geen aparte, uitvoerbare spike-story met AC's en een
go/no-go. Zonder dat dreigt direct-bouwen (de fout die 12.3 vermeed). → maak `12-4-spike` formeel.

### �amber G4 — Datastrategie-les niet teruggekoppeld
De **RECYCLABLE-near-dup-les** (real-crop-refs werken alleen met *diverse* crops; 26 crops uit 3 GTINs
veroorzaakten over-matching) is gevalideerd maar staat niet in 12.4/12.6. De detector-trainingsdata
(8.7-synthese + review-lus) erft hetzelfde risico (synthese-overfit, near-dup-bias). → 12.6/12.4-
datasecties bijwerken met een **diversiteits-eis** (meerdere GTINs/designs per klasse).

### 🟢 G5 — Wat wél consistent is
- De twee-traps-vorm (localize → embed → pgvector → open-set) is consistent over 12.2 → ARCH.
- Optie A in het ARCH-doc = de richting van 12.4 (geen breuk).
- De kosten-ontkoppeling (12.2-AC1) en de A/B-migratie (beschermde tests ongemoeid) zijn behouden.
- De review→referentie-lus (live, commit 3114e90) is een geldige data-motor voor de detector-labels.

## Aanbevolen artefact-acties (voorwaarde voor implementatie)

1. **12.4 herschrijven** → "Getrainde keurmerk-localisator (herprioriteerd)": localisatie = hoofd-
   bottleneck; Optie A vs B; binaire gate-tussenstap; verwijst naar de spike voor de keuze.
2. **`12-4-spike` formaliseren** (A vs B): de AC1–AC4 uit het ARCH-doc als uitvoerbare spike-story met
   een go/no-go-deliverable, gemeten op echte regio's (incl. de queue-FP's = niet-keurmerk-set).
3. **12.6 / datastrategie**: diversiteits-eis toevoegen (meerdere GTINs/designs per klasse; near-dup-
   guard) — de RECYCLABLE-les.
4. **Epic 12 minimaal verankeren**: een Epic-12-kop + de localisatie-AC ("review-queue: niet-keurmerk-
   FP < X%") in epics.md/PRD, zodat het bouwpad traceerbaar is. (Light-touch — geen volledige PRD-
   herziening nodig voor dit ML-spoor.)
5. **Interim (parallel, niet-blokkerend)**: de binaire keurmerk-gate als eerste leverbare — ruimt de
   queue nu op en levert de hard-negative-trainingsset voor de detector.

## Readiness-oordeel

**NIET ready voor directe 12.4-build — wel ready voor de spike + de gate-interim.**
De architectuur-richting is solide en consistent; de blokkers zijn **traceability** (G1) en een
**verouderde 12.4** (G2) plus het ontbreken van een **formele beslis-spike** (G3). Geadviseerde
volgorde: (1) 12.4 + spike-story herschrijven, (2) spike draaien (A vs B op echte data), (3) parallel
de gate-interim bouwen voor directe queue-verlichting, (4) pas dán de gekozen detector bouwen.
