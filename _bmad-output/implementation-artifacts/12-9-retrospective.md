# Story 12.9 — Retrospective (implement-sprint, epic-agent)

Status: story `review`, Task 7 (ACC-toepassing) pending-permission

## Wat ging goed
- Het menselijk verdict (`nutriscore-labelverdict-friso-2026-07-12.md`) gaf een
  volledig ondubbelzinnige, per-id scope — geen enkele selectievraag hoefde
  tijdens de implementatie beantwoord te worden. Alle 19 ids + de exacte
  `field_type`/`gs1_field`-waarden voor A13 waren rechtstreeks uit bestaande
  bronbestanden af te leiden (verdict-bestand + `t3777-declarations.ts`).
- Het bestaande patroon (`restore_recyclable_refs.py`, Story 19.13) gaf een
  bewezen, veilig sjabloon (dry-run default, per-ref `FOR UPDATE`-transactie,
  idempotentie-check vóór elke write) — geen nieuw ontwerp nodig, alleen
  toepassen op deactiveren/herlabelen i.p.v. reactiveren/embedden.
- De drielaagse adversariële review (Blind Hunter, Edge Case Hunter, Acceptance
  Auditor parallel) vond twee echte MEDIUM-bugs die een enkele reviewer
  waarschijnlijk had gemist: de relabel-write valideerde de huidige code niet
  vóór het overschrijven, en de gold-set-reconciliatie gebruikte de hardcoded
  oude-code-constante i.p.v. de werkelijk gefetchte rijwaarde. Beide zijn data-
  integriteitsrisico's die pas bij een gedreven/afwijkende live DB-staat
  zichtbaar zouden zijn geworden — precies het soort bug dat in een
  eenmalige, gated data-fix het duurst is om achteraf te ontdekken.

## Wat brak / wat een verrassing was
- Het verdict-bestand's per-letter-brontabel ("E genuine over: 6") en AC4's
  koptekst ("E=6") bleken bij nadere reconstructie een ANDER cijfer te
  impliceren dan het werkelijke eindresultaat na de A13-relabel (7) — de tabel
  telt A13 nog onder A, niet onder de uiteindelijke E. AC4's eigen
  parenthetische toelichting noemt dat 7-cijfer al wel expliciet, dus dit is
  eerder een dubbelzinnig geformuleerde AC-kop dan een echte fout — maar het
  had zonder een expliciete herafleiding tot een verkeerde verwachting bij de
  gated na-verificatie (Task 7) kunnen leiden. Gedocumenteerd in de
  `verify()`-docstring i.p.v. stilzwijgend het "6" gevolgd.
- Het testpatroon dat de story aanraadde ("importlib-stub") bleek bij nadere
  inspectie van `test_restore_recyclable_refs_19_13.py` zelf helemaal geen
  importlib-stub te gebruiken — gewoon een directe import + fake-object-tests.
  Gevolgd naar wat het bronbestand ZELF doet, niet naar de (onnauwkeurige)
  naamgeving in de storytekst. Voorkwam onnodige stub-complexiteit.
- Het dry-run-pad kreeg in de code review de vraag waarom het (anders dan
  19.13's dry-run) géén DB bevraagt. Bewuste ontwerpkeuze gebleven —
  gedocumenteerd i.p.v. veranderd — omdat een DB-vrije dry-run structureel
  nooit kan muteren, en de aparte `--verify`-modus al de live vóór-/ná-check
  dekt.

## Patronen/afspraken voor vervolgstories
- Bij een data-fix-script dat een bestaand ("van A naar B")-veld herlabelt:
  valideer ALTIJD de vóór-write-waarde tegen de verwachte oude waarde
  (`old_code`/vergelijkbaar), niet alleen tegen de nieuwe waarde
  (idempotentie-check alleen is onvoldoende — dat vangt geen gedreven staat).
- Bij elke write die een tweede tabel (hier: gold-set) consistent moet houden:
  gebruik de net-gefetchte rijwaarde, nooit een los-geïmporteerde/hardcoded
  constante die "toch hetzelfde zou moeten zijn" — een aanname die bij drift
  precies verkeerd uitpakt.
- Bij een unique-constraint op de doeltabel (hier `@@unique([t3777Code,
  variantLabel])`): controleer VOORAF op conflict i.p.v. een ongehandelde
  DB-exceptie te laten optreden tijdens de (vaak eenmalige, gated) apply-run.
- Een `run()`/CLI-entrypoint die exit-code 0 teruggeeft "wat er ook gebeurt" is
  een stille faalmodus voor geautomatiseerde aanroepers — onderscheid expliciet
  "legitieme volledige no-op" (al gecorrigeerd) van "structureel niets gelukt"
  (verkeerde omgeving/DB) en faal hard op het laatste.

## Openstaand (niet deze story's scope om te sluiten)
- Task 7 (AC1/AC2/AC4): live `--apply` op ACC + `--verify` vóór/ná, met
  EXPLICIETE per-geval toestemming van Friso. Niet uitgevoerd in deze run.
- Task 1/Task 5 als levende ACC-metingen (i.p.v. scriptlogica) volgen uit
  hetzelfde gated moment als Task 7.
- Epic-12-retrospective (breder dan deze ene story) — optioneel volgens
  sprint-status, niet in scope hier.
