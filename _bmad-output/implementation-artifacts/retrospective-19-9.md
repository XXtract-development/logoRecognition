# Retrospective — Epic 19, Story 19.9 (fase 2 nearest-reference-ranking)

Datum: 2026-07-12. Scope: één story (19.9) binnen epic 19, autonome implement-sprint-run met een expliciete permission-gate op Tasks 6/8.

## Wat ging goed

- **De voorwerk-beslissing (transport = crop-paden, 4 raakpunten) bleek exact kloppen tegen de code.** Het "Open ontwerpvraag — BESLIST 2026-07-12" blok in het storybestand had de raakpunten al met regelnummers geverifieerd tegen `acc@7b9e2a7`; de implementatie kon direct beginnen zonder heronderzoek. Dit is precies wat een goed voorwerk-artefact oplevert: geen dubbel opzoekwerk in de dev-fase.
- **De adversariële code-review (parallelle Blind Hunter + Edge Case Hunter + Acceptance Auditor) vond drie echte, niet-triviale bugs** die een eigen review gemist zou kunnen hebben: de `confidence`-sortering van de review-wachtrij gebruikte structureel het verkeerde signaal (zou conditie-C-matches — het hele punt van de story — onderaan de wachtrij hebben laten zakken), een onbegrensde refs-query voor lange-staart-klassen, en een tijdbox-gat. Dit bevestigt de waarde van de verplichte parallelle review-laag boven een enkele self-review.
- **De test-review vond een echte semantische dekkingslacune** (het OR-fallback-gedrag van AC1 — "gids-zaad blijft aanvulling, geen vervanging" — was nergens expliciet getest) door bewust te zoeken naar ongebruikte fixture-data (`FAR_TAG` werd gedefinieerd maar nooit gebruikt) als signaal voor een gat.
- **Bootstrap-drempel voor lightweight Python-tests:** een aparte venv met alleen numpy/pytest/pytest-asyncio (i.p.v. de volledige ghcr-ml-image) volstond voor snelle iteratie op de nieuwe/gewijzigde bestanden, en versnelde de CR/TR-fixcycli aanzienlijk.

## Wat brak / vertraagde

- **De volledige ml-pytest-suite vereist de zware ghcr-ml-image** (torch/torchvision/fastapi/PIL e.d., niet lokaal beschikbaar) — het ophalen daarvan (cross-platform `--platform linux/amd64` pull op Apple Silicon via emulatie) kostte veel wall-clock-tijd binnen deze run. Dit is een bekende, gedocumenteerde afhankelijkheid (zie `project_flywheel_resume`-geheugen) maar blijft de langzaamste stap in de Gate-G-verificatie.
- **Docker-daemon was bij aanvang niet actief** (OrbStack moest eerst gestart worden) — kostte een paar minuten heen-en-weer voordat de pull daadwerkelijk begon.
- **`node_modules` ontbreekt in een verse git-worktree** (pnpm-monorepo, niet in git getrackt) — opgelost door de bestaande `node_modules`-mappen uit de hoofd-worktree te symlinken i.p.v. een volledige herinstallatie (die aanmerkelijk trager zou zijn geweest).

## Patronen / afspraken voor vervolgstories

1. **Bij een refs-/kandidaten-query die de code-review kan raken op "onbegrensd" (N-op-N-kosten), voeg standaard een `take`-cap toe met dezelfde env-configureerbare-conventie als de rest van het bestand** — dit was een HIGH-severity bevinding die met een klein beetje extra voorwerk-aandacht vooraf voorkomen had kunnen worden.
2. **Bij een OR/aanvullende-conditie (i.p.v. vervangende conditie) in de ACs: schrijf ALTIJD een expliciete test die bewijst dat het oude pad nog steeds als fallback werkt**, niet alleen dat het nieuwe pad werkt en dat het oude pad ONGEWIJZIGD blijft onder de oude condities. Dit is een apart, licht te vergeten scenario.
3. **Voor worktree-based implement-sprint-runs in dit pnpm-monorepo: symlink `node_modules` (root + per-package) vanuit de hoofdrepo** i.p.v. een volledige herinstallatie — bespaart aanzienlijke tijd zonder risico zolang `pnpm-lock.yaml` niet wijzigt binnen de story.
4. **Permission-gates (Task 6/8 hier) horen expliciet in zowel het storybestand (Tasks-checklist + Change Log) als `sprint-status.yaml` te landen** vóór de story op `review` gezet wordt — zodat de orchestrator/gebruiker in één oogopslag ziet wat wél en niet autonoom is afgerond.

## Openstaand na deze run

- Task 6 (eval-reproductie, AC5) en Task 8 (live-ACC-verificatie) — beide vereisen expliciete per-geval toestemming van Friso (ACC-schrijf/deploy/eval-run). Story blijft op `review` tot die toestemming gegeven is en die stappen uitgevoerd zijn.
- Watch-item uit de NFR-assessment (axios-timeout vs. time-box-mismatch, pre-existing) — geen blocker, relevant voor de kalibratieronde.
