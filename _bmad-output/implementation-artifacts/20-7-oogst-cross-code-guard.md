# Story 20.7: Cross-code-guard tegen mislabels van naast-liggende, gelijkende iconen in de declaratie-oogst

Status: review

<!-- BUGFIX/HARDENING (ml-service). Aanleiding: Friso vond 2026-07-20 dat het voorbeeld-logo
     van MINIMUM_DRINKING_AGE_18_WARNING het AUTO-icoon (niet-rijden) toonde. Root cause
     (empirisch, ref 225123da op GTIN 03147692359997, gedeactiveerd): de generieke
     declaratie-oogst (20.2, queue_harvest_declared.py) zoekt de beste artwork-regio met de
     similarity-pool STRIKT gescoped op de EIGEN referenties van de gedeclareerde code
     (find_similar_references_by_codes, vloer 0,60) en plakt het declaratie-label erop
     ("het label komt uit de DECLARATIE, nooit uit de match"). De drie alcohol-waarschuwingen
     (auto / zwangerschap / 18+) zijn ronde rode schuine-streep-pictogrammen die NAAST elkaar
     op de fles staan en in de (grove) embedding ~0,6 op elkaar lijken. Een auto-regio scoort
     dus ≥0,60 tegen 18+-refs (false positive boven de vloer) en wordt onder 18+ geregistreerd,
     terwijl diezelfde regio duidelijk BETER op de auto-refs lijkt. -->

## Story

Als beheerder van het keurmerk-vliegwiel
wil ik dat de automatische declaratie-oogst een regio NIET onder de gedeclareerde code voorlegt wanneer een andere (naast-liggende, gelijkende) code diezelfde regio duidelijk beter matcht,
zodat een buur-icoon nooit meer onder de verkeerde code als referentie-kandidaat belandt.

## Acceptatiecriteria

1. **AC1 — cross-code-verwerping.** Nadat de beste regio voor de gedeclareerde code is gekozen (scoped floor-match), wordt de regio-embedding ONgescopet vergeleken met álle actieve referenties (`find_similar_references`). Matcht een ANDERE code die regio met een marge ≥ `DECLARED_HARVEST_CROSS_CODE_MARGIN` (default 0,03) beter dan de gedeclareerde code, dan wordt de kandidaat verworpen (geteld als `skipped_cross_code`), niet voorgelegd.
2. **AC2 — legitieme kandidaten blijven.** Wanneer de gedeclareerde code zélf de beste (of gelijkwaardige, binnen de marge) ongescopete match is, blijft de kandidaat behouden — byte-gelijk aan het huidige gedrag.
3. **AC3 — geen valse verwerping zonder sterkere rivaal.** Ligt er geen rivaal-code boven de marge (o.a. wanneer geen andere code een referentie heeft), dan blijft de kandidaat behouden. NB (review-M2): dit is géén onvoorwaardelijke "cold-start-garantie" — een verwarbare, zwak-gezaaide code kan door een rijker-gevulde, visueel-verwante buur worden geblokkeerd. Dat is de BEWUSTE veilige kant (verwerpen > vervuilen; de mislabel ontstond juist tijdens de cold-start van 18+). Ontsnappingsklep: `DECLARED_HARVEST_CROSS_CODE_MARGIN` verruimen, of de code via route-A (handmatige echte crops) zaaien i.p.v. auto-oogst.
4. **AC4 — pure, testbare beslissing.** De ja/nee-logica zit in een pure helper `_cross_code_rejected(declared_code, declared_sim, open_matches, margin)` die exhaustief unit-getest is; de oogst-lus roept die helper aan met de ONgescopete top-k.
5. **AC5 — telemetrie.** `skipped_cross_code` staat in het batch-resultaat/log naast `skipped_below_floor`/`skipped_cap`, zodat een run zichtbaar maakt hoeveel buur-iconen zijn tegengehouden.
6. **AC6 — tests.** RED→GREEN op de helper (rivaal wint → verworpen; gedeclareerde code is top → behouden; rivaal onder de marge → behouden; lege matches → behouden; grensgeval marge). ml-pytest van de gewijzigde module + relevante suite groen; geen regressie op de bestaande 20.2/12.15-oogst-tests.

## Dev Notes

- Bestand: `apps/ml-service/app/services/queue_harvest_declared.py`. `best` wordt uitgebreid met de embedding (`best = (sim, crop, bbox, emb)`); direct ná de `best`-selectie en vóór de cap/dedup de guard invoegen via de pure helper.
- Ongescopete lookup: `await db_service.find_similar_references(embedding=emb, limit=3, threshold=0.0)` — retourneert `t3777_code` + `similarity` over álle actieve refs (bestaand, ivfflat-probes-fix 19.14).
- Env `DECLARED_HARVEST_CROSS_CODE_MARGIN` (default 0.03); alleen een rivaal die de gedeclareerde code met ≥ marge verslaat verwerpt (kleine marge voorkomt afwijzen bij echte gelijkspel/zelfde-familie).
- Scope: alleen de generieke `queue_harvest_declared.py` (20.2). De Nutri-Score-variant is letter-gericht en niet co-locatie-gevoelig op dezelfde manier; buiten scope.
- Geen ACC-run in deze story (code+tests → review); een volgende oogst-ronde profiteert automatisch. De reeds vervuilde 18+-ref is al operationeel gedeactiveerd (buiten deze story).

## Change Log

- 2026-07-20: aangemaakt + root cause op de code bevestigd (scoped floor-match + declaratie-label; find_similar_references beschikbaar voor de ongescopete cross-code-check).

- 2026-07-20: geïmplementeerd (ATDD 7 RED→GREEN + 2 review-tests = 18 passed; beide oogst-suites 20.2+12.15 samen 36 passed, geen regressie). Pure helper `_cross_code_rejected` + guard na best-selectie (`best` draagt nu de winnende embedding) + env `DECLARED_HARVEST_CROSS_CODE_MARGIN` (0.03) + teller `skipped_cross_code`. Adversariële review PASS met 2 MEDIUM verwerkt: **M1** (test-getrouwheid) — de fake is embedding-gevoelig gemaakt (elke regio een eigen embedding; de fake mapt embedding→regio) + multi-regio-test waar de beste NIET de laatste is; een MUTATIETEST bevestigt dat de test omvalt zodra productie de laatste i.p.v. de beste embedding doorgeeft. **M2** (cold-start-afweging) — AC3 eerlijk geherformuleerd; guard blijft bewust altijd-aan (ref-telling-poort zou het bug-gat heropenen) met env-marge + route-A als ontsnappingsklep (+test). LOW/INFO (sparse vroege-return mist de sleutel — consistent met bestaande skipped_*; guard-query vóór cap/dedup — kleine inefficiëntie) genoteerd, geen wijziging. Deploy = permission-gated; profiteert de eerstvolgende oogst-ronde.