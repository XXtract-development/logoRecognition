# Story 12.10 — Retrospective (implement-sprint, epic-agent)

Status: story `review`, Task 7 (ACC-toepassing) pending-permission

## Wat ging goed
- De story wees zelf naar `t3777-declarations.ts` als "autoritatieve bron",
  maar die geeft alleen een tag→fieldType-mapping (declaratie-XML-element),
  niet de code→codelijst-membership die de backfill écht nodig heeft (gegeven
  een losse code-string als "VEGAN" of "HALAL_CORRECT", welke codelijst hoort
  daarbij). Die membership-lijst bleek al te bestaan als productiecode:
  `apps/web/src/data/spoor-codes.ts` (Story 12.6, relabel-picker,
  `fieldTypeForCode`) — de counts (34/10/20/5) sluiten exact 1:1 aan op
  `tests/validation/codelist-veld-mapping.json`. Zonder die kruisverwijzing te
  volgen (t3777-declarations.ts's eigen comment noemt spoor-codes.ts terloops)
  was de backfill zonder een echte code-enumeratie geëindigd — of had hij een
  eigen, mogelijk afwijkende lijst moeten verzinnen.
- Een eenmalige, offline intersectie-check tussen het T3777-default-universum
  (`keurmerk-codes.ts`, 884 codes) en de vier specifieke codelijsten leverde
  precies de ambiguïteit op die de story conceptueel voorspelde (glutenvrij/
  halal-overlap) — alleen bleek de ECHTE overlap `FODMAP` + `NUTRISCORE_A..E`
  te zijn (dezelfde letterlijke code-string in twee codelijsten), niet de
  door de story genoemde voorbeelden (`CROSSED_GRAIN` vs `FREE_FROM_GLUTEN`
  zijn twee VERSCHILLENDE code-strings, elk eenduidig in hun eigen lijst — géén
  code-niveau-ambiguïteit, wel een conceptuele/semantische overlap die dit
  script terecht niet probeert op te lossen).
- Het bestaande overview-sub-service-patroon (`cohort-trend.ts`, epic-15) gaf
  een direct toepasbaar sjabloon voor de dekkingsteller (best-effort,
  sectie-lokale degradatie, pure aggregatiefunctie apart van de I/O-laag) —
  geen nieuw ontwerp, alleen consistent volgen.

## Wat brak / wat een verrassing was
- Het story-voorbeeld van ambiguïteit ("CROSSED_GRAIN in T3777 vs
  FREE_FROM_GLUTEN als DietType-claim") bleek bij nadere analyse GEEN
  code-niveau-ambiguïteit (twee verschillende strings, elk in precies één
  lijst) — de daadwerkelijke ambiguïteit (zelfde string in twee lijsten) zat
  elders (`NUTRISCORE_A..E`, `FODMAP`). Vastgehouden aan de LETTERLIJKE
  definitie ("comt voor in >1 codelijst") i.p.v. de illustratieve voorbeelden
  uit de storytekst, want die voorbeelden bleken zelf niet aan de eigen
  definitie te voldoen.
- AC1 (NutriScore→NutritionalScore moet kloppen) en AC5a
  (ambigu-testgeval → "niet gezet") leken elkaar tegen te spreken als je
  "ambigu" als één categorie behandelt. Opgelost door twee soorten
  ambiguïteit te onderscheiden: OPGELOST (default-vs-specifiek, tiebreak
  toegepast, WEL gezet — dekt AC1/NutriScore) vs ONOPGELOST (twee specifieke
  lijsten botsen, NIET gezet — dekt AC5a). Zonder dat onderscheid was één van
  de twee AC's fictief geworden.
- `packages/shared` (workspace-package) bleek een dode scaffold sinds de
  initial commit — nooit door apps/api of apps/web gebruikt. Bewust NIET
  alsnog gewired om de vier code-lijsten te delen tussen web en api (dat is
  een aparte, grotere infrastructuurwijziging); in plaats daarvan bewust een
  gemotiveerde, gedocumenteerde spiegeling geaccepteerd (comment + retro +
  review-rapport wijzen er expliciet op) i.p.v. stilzwijgende duplicatie.

## Patronen/afspraken voor vervolgstories
- Als een story een bronbestand als "autoritatief" aanwijst maar dat bestand
  alleen een DEEL van de benodigde mapping levert (hier: declaratie-tag→veld,
  niet code→veld), volg de kruisverwijzingen in de comments van dat bestand
  door — vaak wijst de code zelf al naar de ontbrekende schakel.
- Bij "ambigu"-vereisten: expliciteer ALTIJD of een tiebreak-regel een
  ambiguïteit mag OPLOSSEN (gezet + gerapporteerd) of dat elke ambiguïteit
  ONOPGELOST moet blijven (niet gezet). Zonder dat onderscheid conflicteren
  AC's die beide vormen tegelijk verwachten.
- Bij een gedeelde constante/lijst tussen twee losse packages zonder bewezen
  workspace-wiring: kies EXPLICIET tussen (a) de wiring alsnog optuigen (aparte
  scope) of (b) een gemotiveerde spiegeling met een "houd in lock-step"-comment
  — niet stilzwijgend een van beide doen.

## Openstaand (niet deze story's scope om te sluiten)
- Task 7 (AC6): live ACC-diagnose + `--apply`-backfill + deploy + na-verificatie,
  met EXPLICIETE per-geval toestemming van Friso. Niet uitgevoerd in deze run.
- Epic-12-retrospective (breder dan deze ene story) — optioneel volgens
  sprint-status, niet in scope hier.
