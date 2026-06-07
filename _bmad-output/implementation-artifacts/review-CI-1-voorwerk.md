# Adversarial review — CI-1 voorwerk (2026-06-07)

Verdict vóór verwerking: GO-MITS (12 bevindingen, live geverifieerd tegen repo + Vanilla + Actions). Alle verwerkt in de story.

| # | Ernst | Kern | Verwerking |
|---|---|---|---|
| 1 | 🔴 | build-push.yml zet géén OCI-labels → AC1-verificatie onhaalbaar | metadata-action + labels expliciet in scope |
| 2 | 🟠 | Er bestaat al een wérkende classic ghcr-login op Vanilla; fine-grained PAT onbewezen voor org-packages | Bestaande login eerst verifiëren/hergebruiken; AC3 op "uitsluitend pull-rechten"; over-scoped token = rotate-kandidaat (optioneel, Friso) |
| 3 | 🟠 | Rolling :acc garandeert image==commit niet (half-gepushte paren bij handmatige pulls) | **Ontwerp-upgrade: SHA-pinning via Coolify-env** `LOGO_IMAGE_TAG` — compose `:${LOGO_IMAGE_TAG:-acc}`; Actions zet de env op de merge-SHA en triggert dán de deploy. Handmatige deploys pullen daardoor altijd de laatst gepinde SHA |
| 4 | 🟠 | "Actions = enige aanleiding" te sterk (UI/MCP blijven) | Geherformuleerd: enige geautomatiseerde; handmatig pull-t de gepinde SHA (veilig door #3) |
| 5 | 🟠 | Overige 6 workflows: geen acc-deploy-race (geverifieerd); ci-cd.yml verspilt wel acc-compute | Feit opgenomen; ci-cd-acc-trigger = onderhoudspunt buiten scope |
| 6 | 🟠 | Concurrency-group moet de héle run dekken (anders verouderde deploy-job) | Workflow-niveau concurrency + cancel-in-progress als AC-detail |
| 7 | 🟡 | Eerste pull haalt ~10 GB (ml 6,4 + app 3,7) → 3-min-budget oneerlijk op run 1 | AC2 gesplitst: eerste pull = baseline; daarná ≤3 min |
| 8 | 🟡 | Volgorde load-bearing | Expliciete 4-staps-sequencing in de story |
| 9 | 🟡 | :sha = acc-merge-SHA | Rollback-doc benoemt dit expliciet |
| 10 | ℹ️ | SOURCE_COMMIT bewijst na pull-only niets meer | Al ondervangen (digest/label); notitie behouden |
| 11 | ℹ️ | Eerste pull-only deploy herstart containers | Expliciete bevestigingsstap conform vaste afspraak |
| 12 | ℹ️ | Secret-hygiëne docker-config | Docs reproduceren nooit config.json/base64 |
