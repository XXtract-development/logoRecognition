---
title: 'Betrouwbare beeldinhoud voor automatische referentie-uitbreiding'
type: 'bugfix'
created: '2026-10-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 6a08ef0ef1e3e1fddd44d96f6324ddd2561aebd3
context: []
---

<frozen-after-approval reason="menselijke opdracht: onderzoek en corrigeer de11foutmatches en hertoets hervatten">
## Intent
Het vliegwiel kan lege drukwerkvakken als recyclingsymbool opnemen. Eén actieve referentie zonder zichtbaar symbool veroorzaakt negen foutmatches op werkelijk negatieve controlebeelden. De huidige meetroute kan daarnaast gelijke genormaliseerde beeldinhoud onder verschillende opslagpaden niet uitsluiten, doordat echte referenties geen inhoudshash meekrijgen. Deze correctie voorkomt aantoonbaar lege referentie-inhoud en herstelt de bestaande meetregel tegen zelfvergelijking. Zij claimt geen algemene logodetectie of bewezen subtypeherkenning.

## Boundaries & Constraints
Altijd: bestaande negatieve beelden en labels behouden; een gelijke embedding is geen identieke beeldinhoud; public /detect en GHS-beoordelingsbeleid behouden; bestaande caps, drempels, quarantaine en baseline-invalidatie behouden. Geen nieuwe modeltraining, geen schemawijzigingen, geen productie-mutaties/deploys door de implementatieagent. De gebruiker heeft zelfstandig onderzoek/correctie opgedragen; geen extra routinegoedkeuring voor deze lokale implementatie. Productiecuratie en eventuele containeractie zijn aparte coördinatorstappen. Je bent niet alleen: wijzig uitsluitend de implementatiecode/tests hieronder, raak het spec-, status- en nazorgwerk van de coördinator niet aan en draai andermans werk niet terug.

## I/O & Edge-Case Matrix
| Situatie | Invoer | Verwacht | Foutpad |
|---|---|---|---|
| Leeg vak | Opaak of transparant uniform vlak, eventueel uitsluitend dunne buitenrand | Referentie geweigerd vóór database/opslagmutatie | Expliciete inhoudsfout |
| Echt symbool | Geldige sparse lijnkunst, zwart-wit, kleur of transparante officiële markering met centrale inhoud | Bestaand referentiepad toegestaan | Bestaande validatie blijft |
| Negatieve query | Een leeg controlebeeld zonder symbool | Gewoon als negatieve meetquery behouden | Niet uit gold verwijderen |
| Kopie onder nieuw pad | Query en referentie hebben gelijke canonieke pixelhash | Zelfmatch uitgesloten | Geen scoreverhoging |
| Embeddingcollaps | Verschillende pixelhashes maar gelijke embeddings | Negatieve foutmatch blijft in resultaat | Niet wegfilteren |
| Onleesbare ref | Decodefout of ontbrekend bestand bij inhoud/hashcontrole | Geen stille toelating of partiële geslaagde meting | Failclosed |
</frozen-after-approval>

## Code Map
Werkmap: /Users/frisovanweelden/.codex/worktrees/production-migration-preparation/logoRecognition.
- apps/ml-service/app/services/phash.py: bestaande canonieke normalisatie en content_hash; hergebruiken, geen eigen afwijkende hash.
- apps/ml-service/app/api/flywheel.py: regression_eval bouwt reference_entries met contentHash=None; echte pixelhash uit bestanden invoegen, geen schema toevoegen en geen gelijk-embeddingfilter.
- apps/ml-service/app/services/database.py: get_active_reference_entries geeft referentie-ID/pad/vector; betekenis van actief behouden.
- apps/ml-service/app/api/artwork.py: register_reference_endpoint mist minimum beeldinhoud vóór opname.
- apps/api/src/api/v1/reference-logos.ts: upload valideert decode/resolutie maar geen inhoud; weigering vóór upload/record.
- apps/api/src/services/flywheel/promotion.ts en reviewaccept/seedpaden: opname naar ReferenceLogo mag minimuminhoud niet omzeilen. Vind/reuse bestaande Sharp/PIL-laadregels. Alle huidige echte opnamepaden nalopen; geen unrelated refactor.
- apps/api/scripts/seed-reference-logos.ts en seed-reference-logos-from-guide.js: schrijfpad actief zonder inhoudscontrole; controle voor writes toevoegen of expliciet veilige gedeelde toegang gebruiken.

## Tasks & Acceptance
- [x] Kleine conservatieve opnamecontrole implementeren voor evident uniforme centrale beeldinhoud/lege buitenrandvakken; gedeelde helper per taal en consistente parameters. Geen algemene semantische keurmerkclaim of arbitraire confidenceverlaging. Failures expliciet melden.
- [x] Alle werkelijk actieve referentie-opnamepaden gebruiken de controle vóór mutatie. Download bestaande bytes waar nodig; beoordeel dezelfde bytes die worden opgeslagen. Controle mag alleen opname controleren, nooit negatieve querybeelden verwijderen.
- [x] Werkelijke regressie-endpointroute geeft canonieke referentiehash door aan bestaande self-matchguard; bestandsfout maakt meting niet geslaagd.
- [x] Betekenisvolle bestaande/new tests voor iedere matrixrij en vóór-mutatie weigering; endpoint→DB→hash→guard integratie afdekken, mock niet de guard zelf weg.
- [x] Gerichte API/ML tests en typecheck draaien; kort rapport, geen commit/push/deploy.

Gegeven de werkelijk lege referentie, wanneer opname wordt gevraagd, dan wordt geen actief record geschreven. Gegeven alle oorspronkelijke negatieve querybeelden, wanneer regressie wordt gemeten, dan blijven die aanwezig. Gegeven gelijke hashes op verschillende paden, wanneer geëvalueerd, dan is zelfmatch uitgesloten. Gegeven verschillende hashes met gelijke embeddings, wanneer geëvalueerd, dan blijft de fout zichtbaar. Gegeven een echte sparse markering, wanneer ingelezen, dan wordt die niet enkel wegens weinig pixels geweigerd.

## Implementation Notes
Plan steunt op root/ onafhankelijke pixelcontrole van11negatieven en de geïdentificeerde lege referentie f1a85af9-c845-49a9-8ce3-90457da6e759. Negen goldnegatieven zijn visueel bevestigd. Rainforest oud/nieuw en V-label veganonderscheid blijven aparte meetgevallen; geen automatische herlabeling. Productiepreview met ongewijzigde gold wordt door coördinator gedaan vóór eventuele curatie. Approval is bestaande directe gebruikersopdracht, niet een nieuw scopebesluit.

## Spec Change Log

## Review Triage Log

| Bron | Bevinding | Verdict en evidence | Route |
|---|---|---|---|
| Blind1 | SVG hashdecode | maybe-false: upload accepteert SVG, maar echte542embeddedrefs zijn PNG; bestaande PIL-registration/rebuild kan SVG niet decoderen. Geen aangetoonde huidige SVG-ref met embedding; failclosed is vereist. Volg toekomstig formatcontract apart. | defer, onverifiedmedium |
| Blind2 | Blocking bibliotheekreads | high: nieuwe synchrone MinIO/decode-lus draait in async regressionroute,542werkelijke bestanden; dit blokkeert andere aanvragen. Geen veilige immutablekey voor hashcache. | patch: to_thread |
| Blind3 | Verkeerd reference-ID | medium: accessor levert reference_logo_id, foutmelding/test gebruikt id en toontNone. | patch |
| Blind4 | Alpha/admission versus embedding | medium: zichtbare compositie verschilt van bestaande convertRGB-embedding. Dit is aantoonbaar pre-existent in similarity; nieuwe guard verandert geen embedding/hashcontract. Wijziging normalisatie vergt gecontroleerde herbouw, niet ad-hoc. | defer |
| Blind5 | Seed reactivation | medium: bestaande updateactive=true is pre-existent en kan gedeactiveerde nonblankreferenties herstellen; guard bewijstgeenlabel. | defer |
| Blind6 | Decodememory | high: nieuwe volledige rawRGB-expansie en JS-loop accepteertSharpdefault268MP bij PNG/SVG-upload. Geïntroduceerde werklast wordt begrensd vóór expansie. | patch |
| Blind7 | Taalparity | medium: tests delen alleenblankfixture en missen kleur/transparantie/contrastgrens. | patch |
| Blind8 | Echte positieve inhoud | medium: bestaande542refaudit toont541accepteerbarepraktijkgevallen maar lokale regressietest heeftgeen positieveproductiefixture. | patch |
| Verification1 | Range8/9 | medium: >16mutatie blijft onopgemerkt met huidige hogecontrasttests. Filed evidence verified; koppeltzelfdeoorzaakBlind7. | patch |
| Edge | Geenbevinding | Geenedge/deletion/claimdefect aangetroffen. | afgerond |

Parallelle review gebruikt twee interne reviewers plus verplichte actieve watchdog binnen vier beschikbare slots. Tweede reviewer voert edge en verification als afzonderlijke lenzen uit; beide afgerond vóór triage.

## Verification
Geïsoleerde vitest voor refupload/promotie/seed/guardrails en pytest voor opname en regressie; alle externe schrijvers gemockt/lokaal, geen tests tegen productiedatabase. Geen UI-wijziging. Na implementatie onafhankelijke review en herstel van echte bevindingen.

## Eindverificatie
Onafhankelijke herreview bevestigt alle nieuwe correcties; geen nieuw concreetdefect. Coördinator:72API-tests in oorspronkelijke7bestanden plus10padguards,107Python-tests,typecheck,diffcheck geslaagd. Twee readonly audits van alle542echtePNGrefs (PIL+Sharp) geven preciesdezelfdeeneweigering; maximale referentieomvang921600pixels, binnen16Mbound. Geen productiecuratie ofuitrol. Canonieke volledigepreview373→382van654, negatieven79→88van90; geenlabelsgewijzigd. Bestaande alpha/SVG-normalisatie en guidereactivatie apartgedocumenteerd. Productiecuratieplan voorbereid; geenhervatclaim.
