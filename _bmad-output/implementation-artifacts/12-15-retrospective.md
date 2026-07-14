# Retrospective — Story 12.15 (declaratie-gedreven Nutri-Score-oogst)

Datum: 2026-07-14 · reviewed_commit: cf8f12a

## Wat ging goed
- **Hergebruik werkte zoals bedoeld.** De gekozen architectuur (optie B: TS-map-bouw + Python-oogst leest de map) hergebruikte `resolveDeclaredMarks` (12.7) en de volledige 12.12-vorm-detectie ONGEWIJZIGD — het diff-oppervlak bleef klein (5 kernbestanden + tests) en géén enkele bestaande productiecode-regel werd aangeraakt.
- **Adversarial review met 3 onafhankelijke lagen ving een echte bug op** die één enkele reviewer (of de auteur zelf) waarschijnlijk had gemist: de idempotentie-check gescoped op de MUTABELE gedeclareerde letter i.p.v. op een stabiele identiteit. Dit is precies het soort correctness-gat waar de drie-lagen-aanpak voor bedoeld is.
- **Trust-but-verify op het testrapport betaalde zich uit.** Een sub-agent rapporteerde ml-pytest-cijfers uit een NIET-canonieke, gedeeltelijke lokale venv (120/1/4) die afweken van mijn eigen herhaalde, canonieke wegwerp-ghcr-container-run (98/0/7). Door zelf te herverifiëren i.p.v. het cijfer over te nemen, bleef het uiteindelijke rapport accuraat.

## Wat brak / wat schuurde
- **De worktree-branch miste een prerequisite-bouwsteen.** De opdracht ging ervan uit dat 12.12 (`queue_harvest_nutriscore.py`) al beschikbaar was, maar de worktree was vanaf de 12.13-lijn vertakt, die 12.12 nog niet had gemerged (12.12 stond op een niet-gemergede sibling-branch, en `sprint-status.yaml` in de worktree toonde een VERLOPEN "ready-for-dev" i.p.v. de werkelijke "review"-status op die branch). Zonder dat op te merken zou de story de vorm-detectie hebben moeten HERBOUWEN — precies de duplicatie die de story wilde vermijden.
- **`sprint-status.yaml` bevatte al een sync-corruptie** vóór ik begon: het 12-13-commentaar was per ongeluk op de 12-15-regel geplakt (12-13 verloor zijn eigen commentaar). Moest handmatig hersteld worden als onderdeel van fase A.

## Patronen / afspraken voor een volgende keer
- **Vóór het bouwen op een "bestaande bouwsteen": verifieer dat de bouwsteen daadwerkelijk in de worktree-branch-lijn zit** (`git log --oneline -- <pad>` + `git merge-base --is-ancestor`), niet alleen dat de story-tekst hem noemt. Een orchestrator die een epic-agent op story-niveau vertakt vanaf de "dichtstbijzijnde" eerdere story-branch loopt dit risico structureel — het zou robuuster zijn als de orchestrator bij het opzetten van de worktree expliciet controleert of alle in de story genoemde "bestaande bouwstenen"-bestanden fysiek aanwezig zijn, vóórdat de epic-agent start.
- **Idempotentie-sleutels horen op een STABIELE identiteit gebaseerd te zijn, nooit op een waarde die de eigen run kan laten veranderen** (hier: de gedeclareerde letter). Een goede vuistregel voor toekomstige harvest-scripts: scope de "heb ik dit al gedaan"-check op (bron-identiteit, eigen-reason-marker), nooit op de output-waarde die het script zelf produceert.
- **Fail-safe per-item-foutafhandeling is niet optioneel bij een loop over honderden/duizenden externe lookups** — één transiënte fout mag nooit de hele batch-output wegvegen. Dit gold hier voor de TS-kant (catalog-fetch); een vergelijkbare check is de moeite waard bij toekomstige vergelijkbare bulk-scripts.

## Openstaand (niet deze story's schuld — permission-gated)
- AC2's live-bewijs (C en D daadwerkelijk over k=3 middels conditie C) vergt de ACC-run (map-bouw + oogst) — expliciet niet uitgevoerd, wacht op Friso's toestemming.
