# Adversariële review — Story 20.10 (reject "geen keurmerk" op kaderloos item)

- **datum:** 2026-07-26
- **reviewer:** adversarial review (BMAD), tegen `origin/acc` (lokale checkout loopt achter)
- **scope:** story-artefact `_bmad-output/implementation-artifacts/20-10-reject-geen-keurmerk-op-kaderloos-item.md`; niets geïmplementeerd
- **verdict:** `FAIL`
- **severity_count:** `high: 0, medium: 2, low: 6, info: 1`

FAIL uitsluitend op twee medium-bevindingen die het story-artefact raken (oorzaakanalyse + een niet-aftekenbaar AC). De voorgestelde fix zélf (guard → skip) is technisch correct en de afbakening klopt.

---

## Geverifieerde claims (bevestigd tegen de code)

| Claim in de story | Oordeel | Bewijs |
|---|---|---|
| 422-guard staat in de reject-handler van `artwork-pipeline.ts`, ~r.1396 | **JUIST** | `origin/acc:apps/api/src/api/v1/artwork-pipeline.ts` r.1396-1401 — exact het geciteerde codeblok |
| De guard bestaat omdat het "geen-keurmerk"-pad een crop nodig heeft voor pHash | **JUIST (deels, zie L4)** | `review-decision.ts` `recordRejectGeenKeurmerk` roept `mlClient.computePhash(ctx.cropPath)` synchroon aan vóór élke schrijf; `HardNegative.contentHash` is `@unique` en **verplicht** |
| Fail-closed 503 bij pHash-storing bestaat en gaat vóór de statusupdate | **JUIST** | r.1409-1415; `PhashUnavailableError` → 503, `artworkReviewItem.update` staat ná het try-blok |
| Idempotentie-guard `reason && item.status === 'rejected'` bestaat | **JUIST** | r.1388-1390 (zet `reason` op `undefined`, statusupdate blijft draaien → 200) |
| `onjuiste-locatie-verkeerde-code` werkt met én zonder crop | **JUIST** | dat pad raakt `item.cropPath` nergens |
| Alleen de reject-handler hoeft te wijzigen | **JUIST** | de 422-string komt exact één keer voor (r.1400); geen enkele test, e2e-test of frontend-tak assert op 422 |
| Fix moet op `cropPath IS NULL` sturen, niet op de markers | **JUIST — en sterker dan de story zelf denkt** | zie M1: de markers dekken maar een deel van de populatie |

## Onjuiste / onbewezen claims

| Claim | Oordeel |
|---|---|
| "Regressie-achtig gat, geïntroduceerd toen kaderloze items in de wachtrij werden gezet" | **ONJUIST** — kaderloze items bestaan sinds Epic 8 (zie M1). Het gat zit er sinds 14.1 (commit `355505e`, die de guard introduceerde) |
| "De aanname was dat élk reviewitem een automatisch voorgestelde uitsnede heeft. Die aanname klopte tot er kaderloze items in de wachtrij kwamen" | **ONJUIST** — die aanname klopte al bij 14.1 niet |
| Item-markers `method='human-annotation-request'`, `reason='route-a-handmatig:%'` | **ONBEWEZEN** — komen nergens voor in `origin/acc` (code, scripts, migraties, docs). Die items zijn buiten de repo om ontstaan (handmatige insert / n8n / niet-gemergede branch). Herkomst hoort in de story |
| "De frontend biedt geen alternatief: de hoofdknop stuurt `geen-keurmerk`. De reviewer loopt dus vast zonder uitweg." | **ONJUIST** — er is een tweede knop, zie L3 |
| "Er is dan niets om als tegenvoorbeeld vast te leggen" | **DEELS ONJUIST** — schema-technisch wel, zie L4 |

---

## Bevindingen

### M1 — `20-10…md` §Oorzaak/§Reproductie — de kaderloze populatie is veel breder dan route-A; het is geen route-A-regressie maar een 14.1-gat sinds dag 1 — **medium**

`apps/api/src/services/artwork-crosscheck.ts` r.173-178 maakt voor élke gedeclareerde-maar-niet-gevonden code een reviewitem **zónder** `cropPath`, `bbox`, `confidence` en `method`:

```ts
reviewItems.push({
  t3777Code: code,
  reason: `Verwacht maar niet gevonden op het artwork (gedeclareerd in T3777 voor GTIN ${gtin})`,
});
```

Omdat `confidence` ontbreekt gaan die items expliciet op `status: 'open'` (de sub-drempel-dismiss geldt alleen bij een numerieke confidence). Dit bestaat sinds Epic 8 — dus élk "verwacht maar niet gevonden"-item liep sinds 14.1 al op de 422, en juist dáár is "geen keurmerk" de semantisch júíste reviewkeuze ("de declaratie zegt dat het erop staat, maar dat is niet zo"). Route-A is hooguit een tweede, kleinere bron (en zelfs onvindbaar in de repo).

**Wat moet wijzigen:** herschrijf §Oorzaak — noem `artwork-crosscheck.ts` "Verwacht maar niet gevonden" als primaire crop-loze populatie en `355505e` (Story 14.1) als moment waarop het gat ontstond; laat "regressie geïntroduceerd door kaderloze items" vervallen. Vermeld de herkomst van de `route-a-handmatig`-items of markeer ze als extern aangemaakt. Laat AC5 de crosscheck-placeholder als fixture gebruiken (`cropPath: null`, `bbox: {}`, `confidence: null`, `method: null`) — die vorm is representatiever dan het route-A-item en dekt meteen `item.method ?? null` in de evidence.

### M2 — `20-10…md` AC1 vs. Dev Notes vs. Afbakening — het "respons maakt kenbaar"-vereiste is tegenstrijdig en niet aftekenbaar — **medium**

AC1 eist normatief: "De respons maakt kenbaar dat er geen registers zijn gevoed, zodat de client dit kan tonen/loggen." Dev Notes zegt over exact hetzelfde punt: "Overweeg of de respons een veldje verdient (bv. `registersSkipped: true`) … **Niet strikt nodig voor AC1**." Beide kunnen niet waar zijn. Bovendien: geen veldnaam, geen assertie in AC5, en "zodat de client dit kan tonen" suggereert een `apps/web`-wijziging terwijl §Afbakening zegt "alleen de reject-handler".

Dit is niet cosmetisch. Na de fix retourneert de handler voor een kaderloos item `{ status: 'rejected', reason: 'geen-keurmerk' }` — identiek aan het pad dat wél een VALS-record + hard-negative wegschreef. Zonder onderscheidend veld kan geen enkele afnemer (of latere analyse) zien of de registers gevoed zijn.

**Wat moet wijzigen:** kies één van beide en maak het hard:
- (voorkeur) AC1 aanscherpen tot: respons `200 { status: 'rejected', reason: 'geen-keurmerk', registersSkipped: true }`; bij een crop-item blijft `registersSkipped` **afwezig** (additief, breekt `rejectReviewItem`'s typing in `apps/web/src/services/artworkReviewService.ts` r.238-241 niet, dus géén frontend-wijziging nodig — noem dat expliciet in §Afbakening); voeg een AC5-assertie op dat veld toe; **of**
- de zin uit AC1 schrappen en het veld volledig als out-of-scope in Dev Notes laten staan.

### L3 — `20-10…md` §"Waarom 422 hier inhoudelijk onjuist is" — er is wél een UI-uitwijk — **low**

`apps/web/src/components/review/MobileReviewDeck.tsx` r.849-880: reject opent met de vliegwiel-vlag aan een modal (`reject-reason-modal`) met **twee** knoppen: `reject-reason-geen-keurmerk` én `reject-reason-onjuiste-locatie` (`commitReject('onjuiste-locatie-verkeerde-code')`). Die tweede levert op een kaderloos item gewoon 200 op. De reviewer loopt dus niet volledig vast; hij heeft een semantisch verkeerde maar werkende uitweg — die bovendien exact hetzelfde eindresultaat geeft als de gevraagde fix (rejected, geen registers). Dat verlaagt de urgentie niet tot nul (de reviewer moet liegen over de reden, en met de vlag úít is er helemaal geen modal), maar de claim "geen alternatief / vast zonder uitweg" is aantoonbaar onjuist.

**Wat moet wijzigen:** één zin herschrijven — "de enige inhoudelijk juiste knop faalt; de reviewer kan alleen doorwerken door een verkeerde reden te kiezen".

### L4 — `20-10…md` §"Waarom 422 hier inhoudelijk onjuist is" — "niets om vast te leggen" is een productkeuze, geen technische onmogelijkheid — **low**

In `schema.prisma` zijn **zowel** `GoldSetRecord.cropPath` (r.720) als `HardNegative.cropPath` (r.640) `String?` — nullable. Technisch bloklkeert alleen `HardNegative.contentHash` (verplicht + `@unique`, alleen via pHash op een crop). Een crop-loos VALS-gold-set-record zou dus wél kunnen — het is een bewuste keuze om dat níét te doen (een gold-set-record zonder beeld is waardeloos voor de 13.5-regressiemeting en vervuilt de 14.2-samenstellingsbewaking).

**Wat moet wijzigen:** die redenering expliciet als *decision* opschrijven, zodat een latere lezer niet denkt dat het schema het verbood.

### L5 — `20-10…md` AC2 — de regressielijst mist twee bestaande gedragingen — **low**

AC2 noemt 503-fail-closed en de idempotentie-guard, maar niet: (a) de vlag-uit-tak (`isNominationEnabled()` false → `reason` blijft `undefined` → nooit registers, ook niet met een body-reason; r.1372-1377), en (b) `isReviewRejectReason` → **400** bij een onbekende reden (r.1374-1375), plus 404 bij een onbekend item. Alle drie zijn al gedekt door bestaande tests in `apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts` (`vlag UIT: reject met reden → legacy`, `onbekende reject-reden → 400`), dus het risico is klein — maar de lijst hoort compleet.

**Wat moet wijzigen:** AC2 aanvullen met "vlag-uit-legacy en 400-op-onbekende-reden blijven ongewijzigd".

### L6 — `20-10…md` AC5 — de gevraagde assertie past niet op het testpatroon van de suite — **low**

De doellocatie is `apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts`, describe `Story 14.1 — reviewbeslissing → gold-set/hard-negative` (r.959-1158, 11 tests). Die suite mockt **prisma + `mlClient`**, niet de module `services/flywheel/review-decision`. AC5's letterlijke eis ("aantoont dat `recordRejectGeenKeurmerk` **niet** is aangeroepen") duwt de dev richting een `vi.mock` van die module, wat door hoisting de 11 zustertests sloopt (die asserten juist op de échte `goldSetRecord.create`/`hardNegative.upsert`-aanroepen).

**Wat moet wijzigen:** AC5 herformuleren naar de observeerbare proxies die de suite al gebruikt: `mlClient.computePhash` NIET aangeroepen, `goldSetRecord.create` NIET aangeroepen, `hardNegative.upsert` NIET aangeroepen, `artworkReviewItem.update` wél met `{ status: 'rejected' }`. De fixture kan een variant van het bestaande `item`-object zijn met `cropPath: null`.

### L7 — `20-10…md` AC4 — de log-eis is niet aftekenbaar met de huidige suite — **low**

Er wordt in deze testsuite nergens op logger-output geassert. AC4 is daarmee niet automatisch verifieerbaar.

**Wat moet wijzigen:** AC4 markeren als handmatig/observationeel (verificatie via ACC-logs bij taak 4), óf een logger-spy voorschrijven. Kies expliciet — nu blijft het zweven.

### L8 — `20-10…md` §Afbakening — na de fix blijft een echt gat open dat de story niet benoemt — **low**

`artwork-crosscheck.ts` r.187-208 gebruikt `skipDuplicates: false`. Een crop-loze afwijzing laat (bewust) geen enkel persistent signaal achter — geen hard-negative, geen gold-set-record, alleen `status='rejected'` op dat ene item. Bij een volgende crosscheck-run op dezelfde GTIN wordt hetzelfde "verwacht maar niet gevonden"-item opnieuw aangemaakt en krijgt de reviewer dezelfde vraag opnieuw. Dat is een pre-existent probleem en terecht buiten scope, maar de story moet het benoemen zodat niemand denkt dat 20.10 het "geen keurmerk op kaderloos"-dossier sluit. (De inhoudelijk waardevolle uitkomst — "declaratie klopt niet" — wordt evenmin ergens vastgelegd; kandidaat voor een vervolgstory.)

### INFO — geen enkele bestaande test assert de 422

Geverifieerd: `Geen crop voor dit reviewitem — "geen keurmerk" niet mogelijk` komt alleen op r.1400 voor; geen unit-, integratie- of e2e-test en geen frontend-tak hangt eraan. Het verwijderen van de guard breekt niets. De ongerelateerde 404 met een gelijkende tekst op r.880 (`/crop`-endpoint) moet blijven staan — niet per ongeluk meenemen.

---

## Antwoord op de gestelde onderzoeksvragen

1. **Oorzaakanalyse:** locatie en mechanisme kloppen; de *aanleiding* niet (M1).
2. **Is AC1 veilig?** Ja. `cropPath IS NULL` betekent "heeft nooit een crop gehad" — de kolom wordt bij creatie gezet of niet, en wordt nergens later op `null` gezet. Een item dat wél een crop hééft maar waarvan het object in de opslag ontbreekt, houdt `cropPath` gevuld en loopt dus in `computePhash` → bestaande fail-closed 503. Er ontstaat dus **geen** stille gaten-route voor een "crop kwijt"-item; onderscheid tussen "bewust kaderloos" en "crop ontbreekt onverwacht" is niet nodig. Wel aanbevolen: zet deze redenering als één zin in Dev Notes, zodat de dev niet alsnog een detectie-op-anomalie gaat bouwen. Het resterende, bredere gat is L8.
3. **AC2-regressierisico:** zie L5 (vlag-uit + 400 ontbreken); 503 en idempotentie staan er wél in en zijn correct beschreven.
4. **Frontend:** premisse te stellig — zie L3.
5. **Testbaarheid:** suite bestaat en is de juiste plek; AC1/AC2/AC3 zijn aftekenbaar, AC5 moet herschreven (L6), AC4 is niet automatisch verifieerbaar (L7), AC1's responsclausule is niet aftekenbaar (M2).
6. **Scope:** niets overbodigs in de story. Ontbrekend: de crosscheck-populatie (M1) en de expliciete niet-gedekte vervolgvraag (L8). Taak 4 (ACC-verificatie) is terecht opgenomen.

## Wat er minimaal moet gebeuren vóór dev

1. §Oorzaak herschrijven volgens **M1** (crosscheck-populatie + 14.1/`355505e` als ontstaansmoment + herkomst route-A-items).
2. **M2** oplossen: `registersSkipped` normatief maken in AC1 + AC5, of de clausule schrappen.
3. Kosmetisch maar goedkoop: L3, L4, L5, L6, L7, L8 verwerken (elk één tot twee zinnen).

Daarna kan de story direct naar dev; de implementatie zelf is een guard vervangen door een `else`-tak met logregel.
