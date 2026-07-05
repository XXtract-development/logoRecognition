# Retrospective — Epic 19: Gerichte brandstofselectie via declaraties (2026-07-05)

Epic ontstaan via correct-course; 4 stories in één implement-sprint-run.

## Wat ging goed
- **Spike vóór bouw betaalde zich uit.** 19.1 ontkrachtte een blokkade-aanname (de prod-media-503 was een rode haring — de echte endpoints draaien op `.stage.xxtract.com`). Route A bleek config-only (2 env-vars), zonder de zwaardere DB-replicatie van Route B. Zonder de spike waren 19.3/19.4 op verkeerde aannames gebouwd.
- **De review ving een echt datadefect.** 19.2's fieldType was aanvankelijk `ConsumerUsageLabelCode`; de adversarial review wees op de canonieke `EU_consumerUsageLabelCodeList` (anders koppelen de marks nooit aan een logo). Onafhankelijke blik = waarde.
- **Dekkingsmeting stuurde het ontwerp.** De 40%-mét-keurmerk + sterke scheefheid bevestigden empirisch waarom 19.4's balancering nodig is — geen speculatie.
- **Veilige defaults.** De sampler is puur flag-gated (uit = plan-only, geen writes) en heeft bewust geen self-runner → onmogelijk om per ongeluk live te draaien.

## Wat beter kan / opvolgpunten
- **Corpus-bron is nog beperkt.** De index (19.3) draait op `artwork_imports` (~1.881 GTINs), niet de volle ~12.526-corpus. Volledige-corpus-enumeratie vereist prod-media-DB-toegang — bewust als latere uitbreiding gedocumenteerd.
- **Coolify: restart ≠ redeploy.** Een `restart` past nieuwe env NIET toe (env wordt bij container-creatie geïnjecteerd); een `deploy_by_tag_or_uuid` is nodig. Les vastgelegd in geheugen `project_acc_autodeploy`/`project_prod_corpus_route`.
- **Catalog-declaratie-dekking is partieel** (36% van de artwork-GTINs heeft geen XML); by-design fail-safe, maar beperkt de brandstof — monitoren bij een echte run.
- **Twee stores, één begrip.** Declaraties leven zowel in prod Mongo `application.tradeItems` (GDSN-form) als in de catalog-XML-bestandsstore; alleen de laatste voedt de app-crosscheck. Niet verwarren.

## Openstaand (aparte go-live, met toestemming)
1. Index-run live draaien (19.3 echte run → MinIO).
2. Sampler-run + nominatie-vlaggen aan (19.4 live) — bewuste go-live, gold-set als noodrem.
3. Route A eventueel terugdraaien of laten staan (ACC leest nu van prod).
