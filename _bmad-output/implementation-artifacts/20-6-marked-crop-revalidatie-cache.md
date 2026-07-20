# Story 20.6: Per-item beeld-endpoints revalideren i.p.v. 5-min blind cachen

Status: review

<!-- BUGFIX (backend). Gemeld door Friso 2026-07-20 (desktop): na een getekende correctie
     toont revisit weer de oude auto-crop/-box. ROOT CAUSE (empirisch bevestigd via DB):
     de correctie is server-side correct opgeslagen (item d3749bb9 gtin 03147692359997:
     method=human-annotation, status=registered, bbox {59,374,45,40}, cropPath annot_...).
     Er is dus GEEN auto-box meer in de DB — wat de gebruiker ziet is een VEROUDERDE
     browser-cache: /marked (en /crop, /source, /artwork) sturen
     `Cache-Control: private, max-age=300`, terwijl die endpoints MUTABELE item-staat
     renderen (bbox/cropPath wijzigen bij annotate). De client-`?v=`-bust van 20.5 dekt
     alleen same-session-correcties op de nieuwe JS; cross-session / oude-JS / het 5-min-
     venster bleven stale. De juiste, volledige fix zit op de server-header. -->

## Story

Als beoordelaar wil ik dat een gecorrigeerd kader/uitsnede altijd meteen correct wordt
getoond bij terugkeer, ongeacht sessie of cache, zodat ik nooit de oude automatische
uitsnede terugzie terwijl mijn correctie al is opgeslagen.

## Acceptatiecriteria

1. AC1 — revalidatie i.p.v. blind cachen: `/marked`, `/crop`, `/source` en `/artwork` sturen
   `Cache-Control: private, no-cache` + een zwakke ETag afgeleid van `item.updatedAt`
   (verandert bij elke annotate/accept), i.p.v. `max-age=300`.
2. AC2 — goedkope 304: een verzoek met `If-None-Match` gelijk aan de huidige ETag krijgt
   `304 Not Modified` zonder de (dure) download + render.
3. AC3 — verse render na wijziging: nadat een item is bijgewerkt (nieuwe updatedAt) wijkt de
   ETag af, dus een revalidatie levert 200 met het nieuwe beeld.
4. AC4 — geen functionele regressie: de body/mime van een 200-respons blijft ongewijzigd;
   de client-`?v=`-bust van 20.5 blijft werken (harmloos naast de server-revalidatie).
5. AC5 — tests: RED->GREEN op de header/ETag/304-logica; volledige api-suite groen; tsc 0.

## Dev Notes

- Kleine module-helper `sendRevalidatingImageHeaders(request, reply, item)`: zet Cache-Control
  no-cache + ETag `W/"{id}-{updatedAt.ms}"`; bij matchende If-None-Match `reply.status(304).send()`
  en `return true` (caller stopt vóór de download).
- Guard direct ná de item-existentiecheck en vóór `downloadTrainingObject` in elk endpoint;
  de bestaande `max-age=300`-regel vervalt (helper zet de header).
- Geen client-wijziging nodig; 20.5's editedVersion/`?v=` blijft staan als extra vangnet.

## Change Log

- 2026-07-20: aangemaakt + root cause via DB bevestigd (correctie opgeslagen; stale is puur cache-header).
- 2026-07-20: geïmplementeerd (ATDD 4 RED->GREEN). Helper sendRevalidatingImageHeaders toegepast op /marked, /crop, /source, /artwork; max-age=300 verwijderd op alle vier. Dragende aanname zelf geverifieerd: schema.prisma ArtworkReviewItem heeft `updatedAt DateTime @updatedAt`, dus Prisma bumpt updatedAt bij de /annotate-update -> ETag wijzigt -> browser haalt vers het nieuwe beeld op (bevestigd door de DB-rij van de melding: updated_at = correctietijd 14:48:41). 4 tests: no-cache+ETag op /crop en /marken, 304 op matchende If-None-Match (zonder download), verse 200 bij afwijkende (nieuwe-updatedAt) ETag. Gates: artwork-pipeline.routes 51 passed, volledige api-suite 955 passed/0 failed, tsc 0. Client-`?v=` van 20.5 blijft als extra vangnet. Deploy permission-gated. (Adversariële review gestart maar door de gebruiker onderbroken; de HIGH-risico-aanname — updatedAt-bump — is handmatig geverifieerd.)
