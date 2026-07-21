# Story 20.9: Keyline-guard — technische snijlijn-/cutter-pagina's uit de oogst weren

Status: review

<!-- BUGFIX/HARDENING (ml-service). Aanleiding: Friso stuitte 2026-07-21 in de AISE-route-A op
     een onbruikbaar item (AISE_12 / GTIN 08710552323961): het opgeslagen artwork was de
     CUTTER/KEYLINE-referentiepagina ("SSL Cutter Reference"), niet de bedrukte laag — lege
     panelen (TEST PANEL / GLUEING AREA), geen pictogram. Empirische diagnose: er is maar één
     gerenderde pagina (`..._converted-0.png`) en die is de technische sheet; de print met het
     logo zit op een andere pagina/laag die niet gerenderd/bewaard is. De oogst- én
     route-A-scripts pakken bovendien altijd hard "converted-0".
     Meting over de 6 AISE-bronpagina's: keyline-pagina's hebben een extreem lage
     PNG-byte-per-pixel (0,0095 / 0,0181) t.o.v. echte print (0,10-0,29) — een schone scheider.
     2 van 6 bronpagina's (4 items) waren keyline en zijn operationeel verwijderd. -->

## Story

Als beheerder van het keurmerk-vliegwiel wil ik dat de declaratie-oogst een artwork-pagina die een
technische snijlijn-/cutter-sheet is (nauwelijks bedrukte inhoud) overslaat i.p.v. er kandidaten van
te maken, zodat onbruikbare keyline-pagina's nooit meer in de beoordelings-wachtrij belanden.

## Acceptatiecriteria

1. **AC1 — keyline-pagina overgeslagen.** Een pagina met een detail-maat onder de drempel levert GEEN
   kandidaten op; de hele pagina wordt overgeslagen en geteld als `skipped_keyline`.
2. **AC2 — echte print blijft.** Een pagina met detail boven de drempel wordt ongewijzigd verwerkt.
3. **AC3 — pure, testbare beslissing.** `_is_keyline(detail, threshold)` (exhaustief unit-getest);
   de detail-maat `_page_detail_bpp(img)` = gecomprimeerde-PNG-bytes-per-pixel (keyline ~0,01-0,02,
   print ~0,10-0,29).
4. **AC4 — drempel uit te schakelen.** Env `DECLARED_HARVEST_KEYLINE_MAX_BPP` (default 0,03); `<= 0`
   schakelt de guard volledig uit (ontsnappingsklep).
5. **AC5 — telemetrie.** `skipped_keyline` staat in het batch-resultaat/log naast de andere
   skip-tellers.
6. **AC6 — tests.** RED→GREEN op de helper (onder/boven/grensgeval/uit) + integratie (keyline-pagina
   overgeslagen, print-pagina verwerkt); geen regressie op 20.2/12.15.

## Dev Notes

- Bestand: `apps/ml-service/app/services/queue_harvest_declared.py`. Guard op PAGINA-niveau, direct
  na het decoderen van de pagina (page_cache-vulling), vóór de regio-lus; beslissing per src.
- `_page_detail_bpp(img)` = `len(cv2.imencode('.png', img)[1]) / (h*w)`. In de testharness is `cv2`
  gestubd; de integratietests sturen de drempel via env om skip/behoud aantoonbaar te maken.
- Env `DECLARED_HARVEST_KEYLINE_MAX_BPP` (default 0.03); `<= 0` = guard uit.
- Scope: alleen `queue_harvest_declared.py` (20.2). De diepere kwestie — de JUISTE bedrukte pagina
  renderen i.p.v. alleen converted-0 — is een aparte inlaad-follow-up (buiten scope).

## Change Log

- 2026-07-21: aangemaakt + root cause empirisch bevestigd (converted-0 = keyline sheet; bpp-scheider
  keyline 0,0095/0,0181 vs print 0,10-0,29 over de 6 AISE-bronpagina's; 4 keyline-items verwijderd).

## Adversariële review (verwerkt) + bekend risico

Verdict PASS (0 HIGH). Cache-tuple 2→3 bevestigd consistent (beide lees/schrijf-plekken; multi-code-GTIN op een keyline-pagina wordt via het cache-hit-pad óók overgeslagen, geen unpack-crash — extra probe-test bevestigd). Plaatsing/telling consistent met de andere skip-tellers (per-paar, wederzijds exclusief). `_page_detail_bpp` faalt veilig (h*w==0 / imencode-fout → 0.0 → skip; degeneratieve pagina levert toch geen crops).

**BEKEND RISICO (review-MEDIUM, bewust geaccepteerd):** de bpp is een HELE-PAGINA-gemiddelde. Een klein logo op een grotendeels witte pagina heeft een laag paginagemiddelde en kan onder de drempel vallen → de HELE pagina (incl. het echte logo) wordt overgeslagen. Dit is recall-verlies (kandidaat komt niet in de review-queue), GEEN precisie-/dataschade. In de gemeten data is de kloof ruim (keyline 0,0095/0,0181 vs print 0,10-0,29), maar een synthetisch klein-logo-op-witruimte-geval landde op ~0,0146 (< 0,03) → zou wegvallen. Mitigatie: env-uitschakelbaar/tunebaar (`DECLARED_HARVEST_KEYLINE_MAX_BPP`), en:

**VALIDATIE-POORT (verplicht vóór elke BREDE oogst-run):** eerst een DRY-RUN draaien en `skipped_keyline` inspecteren + een handvol overgeslagen pagina's steekproefsgewijs bekijken. Zijn dat echte prints i.p.v. keylines → drempel verlagen (bv. 0,02) of de guard uitzetten voor die run. Follow-up-optie (niet nu): lokale tegel-max-detail i.p.v. paginagemiddelde, zodat één bedrukte regio de pagina behoudt (vergt real-cv2-tests; de huidige stub kan tegel-logica niet aantonen).

Gates: beide oogst-suites (20.2 + 12.15) samen **45 passed**, geen regressie; AST OK. Deploy = permission-gated; raakt alleen toekomstige oogst-runs, niet de live-app.