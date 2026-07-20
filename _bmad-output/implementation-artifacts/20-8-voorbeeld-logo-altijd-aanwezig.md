# Story 20.8: Voorbeeld-logo altijd aanwezig in de review (gids-fallback + placeholder)

Status: review

<!-- UX/BUGFIX. Gemeld door Friso 2026-07-20: "Sommige keurmerken geven niet het voorbeeld-logo
     aan. Dit moet altijd aanwezig zijn anders weet ik niet naar welk logo ik moet zoeken."
     Root cause (DB): codes die als "declared-but-not-found" in de review verschijnen
     (SOCIETY_PLASTICS_INDUSTRY, BDIH_LOGO, ICADA, LONDON_BETH_DIN_KOSHER, ...) hebben GEEN
     actieve reference_logo -> `/reference-logos/code/:code/image` geeft 404 -> de frontend-img
     vuurt onError -> de hele voorbeeld-rij (`refSrc && ...`) verdwijnt. Alle vier codes zitten
     WEL in de GS1 Label Guide (977 codes), dus er is een officieel voorbeeldbeeld beschikbaar. -->

## Story

Als beoordelaar wil ik voor élk gedeclareerd keurmerk een voorbeeld-logo zien ("dit is wat je
zoekt"), zodat ik nooit hoef te raden naar welk logo ik op de verpakking zoek — ook voor codes
die (nog) geen door mensen bevestigde referentie hebben.

## Acceptatiecriteria

1. **AC1 — gids-fallback in het endpoint.** `/reference-logos/code/:code/image` retourneert de
   actieve reference_logo als die bestaat; anders valt het terug op een opgeslagen
   GS1-gids-VOORBEELDbeeld (`reference-examples/<code>.png`). Bestaat ook dat niet, dan 404.
2. **AC2 — herkenning onveranderd.** De gids-voorbeeldbeelden zijn UITSLUITEND voor weergave:
   geen `reference_logos`-rij, geen embedding, geen deelname aan localize/classify. De actieve
   herkennings-set blijft byte-gelijk (geen vervuiling zoals bij een echte seed).
3. **AC3 — frontend toont altijd iets.** De voorbeeld-rij wordt altijd gerenderd voor een echte
   code; als het beeld tóch 404't (code niet in de gids), toont de rij een duidelijke
   placeholder ("Geen voorbeeld beschikbaar — zoek op naam") i.p.v. stil te verdwijnen.
4. **AC4 — voorbeeld-seeding (permission-gated ACC-write).** De GS1-gids-beelden zijn eenmalig
   geëxtraheerd en geüpload naar `reference-examples/<code>.png` (voorbeeld-only bucket-prefix);
   idempotent (overschrijven = zelfde sleutel). Geen `reference_logos`-rijen, geen rebuild.
5. **AC5 — tests.** api: fallback-pad (actieve ref → ref; geen ref maar gids-voorbeeld → voorbeeld;
   niets → 404) RED→GREEN. web: de voorbeeld-rij rendert altijd; placeholder bij error. Volledige
   api- + web-suite groen; tsc 0.

## Dev Notes

- Backend: `apps/api/src/api/v1/reference-logos.ts` (`/code/:code/image`). Na de `findFirst active`
  die null geeft: `downloadTrainingObject('reference-examples/' + code + '.png')`; gevonden →
  serveer (met de 20.6-achtige revalidatie/no-cache is niet nodig; voorbeelden zijn statisch →
  gewone cache is prima). Voeg een header `X-Reference-Source: guide-example|reference` toe voor
  observability.
- Frontend: `MobileReviewDeck.tsx` — render de voorbeeld-rij altijd (voor niet-letterloze codes);
  `refError` toont de placeholder i.p.v. de rij te verbergen.
- Seeding: hergebruik `extract_gs1_label_guide.py` (produceert per code een PNG); upload naar
  `reference-examples/<code>.png` via een klein script/route. GEEN reference_logos-insert, GEEN
  embedding-rebuild (AC2). Permission-gated.
- Scope: alleen de voorbeeld-weergave. Herkenning/oogst ongemoeid.

## Change Log

- 2026-07-20: aangemaakt + root cause op de code+DB bevestigd (endpoint 404 bij ontbrekende ref →
  frontend verbergt de rij; alle gemelde codes zitten in de GS1-gids).
- 2026-07-20: geïmplementeerd (ATDD). Backend: gids-fallback in `/reference-logos/code/:code/image` + `X-Reference-Source`-header; review-F2 traversal-guard op `:code`; review-F3 sharp-normalisatie ook op de voorbeeld-tak. Frontend: voorbeeld-rij altijd getoond voor een echte code, placeholder ("Geen voorbeeld beschikbaar — zoek op naam") bij 404 i.p.v. verdwijnen; letterloze Nutri-Score terecht verborgen. Tests: api 10/10 (fallback + no-mutation + traversal-404) + rate-limit-regressie groen; web 2/2 (rij altijd aanwezig + placeholder); api-tsc 0, web-suite 184 groen, web-tsc 0. Adversariële review PASS: AC2 bevestigd (fallback is puur een download; `reference-examples/`-prefix komt NERGENS in de embedding-/localize-pool — herkenning byte-gelijk); refError-reset per item bevestigd. Voorbeeld-extractie: 904/977 gids-codes hebben een bruikbaar beeld (variant 0). BELANGRIJK: ~73 codes hebben alleen vector-art (WMF, door openpyxl gedropt) of placeholders — waaronder **SOCIETY_PLASTICS_INDUSTRY** (resin-code-familie, geen enkel officieel logo); die tonen de placeholder. Seed-bundle klaar (scratchpad guide_examples.tgz, 904 PNG's -> reference-examples/<code>.png). Upload naar ACC + deploy = permission-gated. Follow-up-optie: WMF->PNG-conversie (libwmf/ImageMagick) voor de ~73 vector-only codes.