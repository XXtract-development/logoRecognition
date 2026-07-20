# Story 20.5: Correctie terugtonen + expliciet keurmerk op de bevestigknop

Status: review

<!-- BUGFIX (frontend). Gemeld door Friso 2026-07-17: na een getekende correctie toont
     revisit de oude auto-crop, en kader-tekenen zonder code-keuze registreert stil onder
     de voorspelde code.
     Diagnose (geverifieerd op de code):
     (A) DISPLAY-STALENESS: na annotate slaat de server de correctie wel op (nieuwe cropPath
         annot_<id>.png + nieuwe bbox + status accepted), maar de deck toont bij terugkeer de
         ORIGINELE queue-data: markedSrc is een STABIELE URL (browser-cache) en de crop-blob
         zit in cache.current[id] (nooit ge-invalideerd na annotate).
     (B) STILLE CODE-AANNAME: annotate-endpoint code = override || item.t3777Code; zonder
         keurmerk-keuze landt de correcte crop onder het VOORSPELDE (mogelijk foute) keurmerk. -->

## Story

Als beoordelaar wil ik na het accepteren van een zelf-getekende crop bij terugkeer mijn
correctie terugzien, én bij het bevestigen van een kader zien onder welk keurmerk het wordt
opgeslagen, zodat een correctie nooit stilzwijgend onder een verkeerde code belandt.

## Acceptatiecriteria

1. AC1 — correctie terugtonen: na een succesvolle annotate toont revisit de OPGESLAGEN crop
   en het gemarkeerde kader; crop-blob-cache geïnvalideerd + /marked-URL krijgt een
   versie-parameter (cache-bust).
2. AC2 — expliciet keurmerk: een getekend kader zonder klaargezette code toont op de knop
   "Bevestig kader als {code}" (voorspelde/effectieve code); met klaargezette code = die code (20.4).
3. AC3 — letterloze Nutri-Score: de placeholder 'NUTRISCORE' toont "Bevestig kader — kies de
   letter" i.p.v. "als NUTRISCORE".
4. AC4 — bestaand gedrag ongewijzigd: gewone accept/afwijzen en de 20.4-stage-flow byte-gelijk;
   versie-parameter alleen na een annotate.
5. AC5 — tests: RED->GREEN op cache-bust + marked-versie + knop-labels (incl. letterloos) +
   regressies; web-suite groen; tsc 0.

## Dev Notes

- Nieuwe editedVersion: Record<id, number>; bump na succesvolle annotate in applyAnnotation en
  relabel (rel-tak); bij bump: revoke + delete cache.current[id]/artworkCache.current[id],
  setMarkedError(false).
- markedSrc + (editedVersion[id] ? '?v=' + editedVersion[id] : '').
- Knop-label: hasDraftBox && !stagedCode -> letterloos -> "kies de letter"; anders "als {shownCode}".
- Geen backend-wijziging (annotate slaat correct op; /marked negeert de query-string).

## Change Log

- 2026-07-17: aangemaakt + diagnose op de code bevestigd.
- 2026-07-17: geïmplementeerd (ATDD 4 RED->GREEN + 1 regressie groen vooraf): editedVersion-state + bumpEdited (revoke/wis crop-cache + versie-ophoging) na elke succesvolle annotate; markedSrc krijgt ?v=<versie> (cache-bust van het /marked-pack, dat Cache-Control private max-age=300 stuurt); bevestigknop toont de effectieve code ("Bevestig kader als {code}") of "kies de letter" bij de letterloze placeholder. 12.17-labelassertie bijgewerkt (spec-update, geen regressie: annotate blijft byte-gelijk). Adversariële review PASS (server-contract mee-getraceerd: annotate persisteert bbox/cropPath/code, /marked rendert eruit -> cache-bust noodzakelijk en correct; alle 48 tests groen). 1 verbetering doorgevoerd uit review-6: een kader bevestigen op een letterloze Nutri-Score opent nu de picker i.p.v. stil onder 'NUTRISCORE' te registreren (+test). Rest INFO/LOW pre-existing (markedError-fallback inert; stale-cache-race benign; overzicht-thumbnail toont tekst i.p.v. oude foute crop = verbetering). Gates: web-vitest 182 passed/0 failed, tsc 0. Deploy permission-gated.
