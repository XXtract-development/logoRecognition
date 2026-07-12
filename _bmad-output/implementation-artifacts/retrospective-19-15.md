# Retrospective — Story 19.15 (resolveSeedPath prefereert het gids-zaad)

## Wat ging goed
- De story was ongewoon scherp voorgesneden door de orchestrator: de root-cause (`resolveSeedPath` geen source-filter), de exacte fix-vorm (complement van `REAL_CROP_SOURCES`), en de scope-grenzen (conditie C, ml-service, gate/guard/routering) waren al vastgelegd. Dat maakte Task 1 (diagnose) een verificatie i.p.v. een zoektocht en hield de implementatie binnen één functie.
- Onafhankelijke parallelle adversarial review (Blind Hunter + Edge Case Hunter, elk zonder gedeelde context) vond ZELFSTANDIG hetzelfde HIGH-defect (NULL-source-uitsluiting door SQL drie-waardige logica bij `notIn`). Convergentie van twee onafhankelijke reviewlagen op exact dezelfde root-cause is een sterk signaal dat het een reëel, geen ingebeeld, defect was — en dat de twee-lagen-aanpak hier zijn geld waard was.
- Rood/groen bewezen op twee niveaus: (1) de vier hoofd-AC-tests faalden aantoonbaar tegen de oude implementatie vóór de fix; (2) de NULL-source-regressietest faalde aantoonbaar tegen de eerste (niet-NULL-safe) versie van de fix zelf. Dat sluit uit dat de tests "toevallig" groen zijn.

## Wat beter kon
- De eigen eerste implementatie (kaal `source: { notIn: REAL_CROP_SOURCES } }`) miste de NULL-semantiek van SQL/Prisma `notIn` — een bekende valkuil (drie-waardige logica) die bij het eerste ontwerp had kunnen worden voorkomen door standaard te controleren of een gefilterde kolom nullable is (`reference_logos.source: String?`) vóórdat een `notIn`/`in`-filter geschreven wordt. Vuistregel voor vervolgstories: bij elk nieuw Prisma `in`/`notIn`-filter op een nullable kolom, expliciet nagaan of NULL in de bedoelde populatie hoort, en zo ja een `OR: [{ field: null }, ...]` toevoegen.
- De testsuite van dit project mockt Prisma volledig; er is geen DB-integratietest-harnas. Dat betekent dat de daadwerkelijke SQL-drie-waardige-logica nooit door de suite zelf bewezen wordt — alleen de queryvorm wordt geborgd (aanwezigheid van de OR-clausule). Dit is een structurele blinde vlek van het testregime, niet specifiek voor deze story; het risico is hier expliciet gedocumenteerd i.p.v. genegeerd, maar een toekomstige investering in een dunne Postgres-integratietest-laag (al is het maar voor filter-correctheid op nullable kolommen) zou dit soort defecten vroeger vangen dan een codelezing.

## Afspraken/patronen voor vervolgstories
1. Bij elk nieuw of gewijzigd Prisma `where`-filter op een kolom: check het schema (`String?` etc.) voordat `in`/`notIn` gebruikt wordt — NULL-waarden vallen buiten beide zonder een expliciete `OR field: null`-clausule.
2. Twee onafhankelijke adversarial-reviewlagen (zonder gedeelde context) blijven de moeite waard, ook op kleine, scherp-gescopeerde fixes — de kosten (twee subagent-runs) wegen op tegen een productiebug die pas bij een subset van klassen zichtbaar wordt.
3. Permission-gated taken (hier: AC5/Task 7, ACC-eval) horen expliciet als "buiten scope" in zowel het storybestand als `sprint-status.yaml` te staan, met status `review` (niet `done`) zolang ze openstaan — voorkomt dat een epic zich "klaar" voordoet terwijl er nog een menselijke stap wacht.

## Story-status na deze run
- `19-15-zaadkeuze-semantiek-resolveseedpath`: `review` (Tasks 1-6 / AC1-4 compleet, AC5/Task 7 pending-permission).
- Commits: `f9706fb` (implementatie + tests + docs), `f258f86` (review-rapport pinnen op epic-HEAD).
