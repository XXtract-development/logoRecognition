# Story 20.10: "Geen keurmerk" afwijzen moet ook werken op een kaderloos reviewitem

Status: review

<!-- Live gevonden door Friso op ACC, 2026-07-26: HTTP 422 bij afwijzen van een
kaderloos reviewitem. NB (correctie na review): dit is een BESTAANDE bug sinds Story
14.1, GEEN nieuw gat — kaderloze items bestaan al sinds Epic 8. Zie "Omvang". -->

## Story

Als **reviewer**
wil ik **een reviewitem zónder voorgestelde uitsnede kunnen afwijzen met "geen keurmerk"**
zodat **ik een artwork waarop het keurmerk niet blijkt te staan gewoon kan wegzetten, in plaats van vast te lopen op een foutmelding**.

### Reproductie (live op ACC)

```
PATCH /api/v1/artwork/review-items/ed7add58-a897-4e65-abb6-f2d15f754804/reject
body: {"reason":"geen-keurmerk"}
→ HTTP 422  {"error":"Geen crop voor dit reviewitem — \"geen keurmerk\" niet mogelijk"}
```
Item: GTIN `08710198477479`, code `SEPARATE_COLLECTION`, `cropPath = NULL`, `method = human-annotation-request`, `reason = route-a-handmatig:SEPARATE_COLLECTION`.

### Oorzaak

`artwork-pipeline.ts` (reject-handler, ~r.1396): bij `reason === 'geen-keurmerk'` staat een harde guard

```ts
if (!item.cropPath) {
  return reply.status(422).send({ error: 'Geen crop voor dit reviewitem — "geen keurmerk" niet mogelijk' });
}
```

De guard bestaat omdat het "geen-keurmerk"-pad een VALS gold-set-record én een hard-negative wegschrijft, en dáárvoor is een uitsnede nodig (pHash). De aanname was dat élk reviewitem een automatisch voorgestelde uitsnede heeft.

### Omvang (gecorrigeerd na adversariële review)

Die aanname klopte **nooit**. `artwork-crosscheck.ts` maakt sinds **Epic 8** voor elke "gedeclareerd maar niet gevonden"-code een open reviewitem **zonder** uitsnede — er is immers niets gedetecteerd om uit te snijden. Het gat dateert dus van **Story 14.1**, toen de reden `geen-keurmerk` werd toegevoegd, en niet van de recente handmatig-tekenen-verzoeken.

Gemeten op ACC (2026-07-26): **50 kaderloze items** in totaal — **48** uit juni met reden `Verwacht maar niet gevonden op het artwork (gedeclareerd…)`, en 2 uit juli (route-A). Elk van die 48 loopt op dezelfde 422 zodra iemand ze met "geen keurmerk" probeert af te wijzen. De route-A-items hebben de bug alleen zichtbaar gemaakt.

**Consequentie voor de fix:** stuur op `cropPath IS NULL` (het generieke geval). Gebruik GEEN route-A-markers — die bestaan alleen als data-conventie in de wachtrij, nergens in de code.

### Waarom 422 hier inhoudelijk onjuist is

Bij een kaderloos item betekent "geen keurmerk": *ik heb dit artwork bekeken en het keurmerk staat er niet op*. Er is dan niets om als tegenvoorbeeld vast te leggen — en dat hoeft ook niet. De registers zijn niet incompleet, ze zijn niet van toepassing. De afwijzing zelf hoort gewoon te slagen.

De frontend biedt wél een tweede knop ("Onjuiste locatie / verkeerde code") die op een kaderloos item gewoon 200 geeft. Dat is echter een **andere uitspraak** — die zegt dat de toewijzing fout is, niet dat het keurmerk ontbreekt. De reviewer moet dus liegen over zijn oordeel om verder te komen, en dat vervuilt de betekenis van de registers.

### Afbakening

- Alleen de reject-handler in `apps/api/src/api/v1/artwork-pipeline.ts`. Geen wijziging aan het accept-pad, de gold-set-logica of de hard-negative-registratie zelf.
- **Gedrag voor items MÉT uitsnede blijft byte-identiek**, inclusief de fail-closed 503 bij een pHash-storing en de idempotentie-guard op een al afgewezen item.

## Acceptatiecriteria

1. **Kaderloos + "geen keurmerk" → 200, geen registers.** Given een open reviewitem met `cropPath = NULL`, when het wordt afgewezen met `{"reason":"geen-keurmerk"}`, then antwoordt het endpoint **200** met `status: 'rejected'` **én het veld `registersSkipped: true`**, wordt de itemstatus `rejected`, en wordt er **géén** gold-set-record en **géén** hard-negative geschreven (er is geen uitsnede om te hashen).
   - `registersSkipped` is **verplicht**, niet optioneel (review M2: AC en Dev Notes spraken elkaar tegen). Het is een additief backend-veld; de bestaande frontend-typing breekt er niet op. Bij een item mét uitsnede wordt het veld weggelaten of op `false` gezet.
2. **Geen regressie op items mét uitsnede.** Given een item met `cropPath`, when afgewezen met `geen-keurmerk`, then blijft het bestaande gedrag ongewijzigd: VALS gold-set-record + hard-negative, fail-closed **503** bij een pHash-storing (géén statuswijziging), en de idempotentie-guard blijft een tweede register op een al afgewezen item voorkomen.
3. **De andere reden blijft werken.** Given `onjuiste-locatie-verkeerde-code`, then ongewijzigd gedrag, met of zonder uitsnede.
4. **Waarneembaar in de log.** Given een kaderloze "geen keurmerk"-afwijzing, then logt de handler expliciet dat de registers zijn overgeslagen wegens ontbrekende uitsnede — zodat een latere analyse niet denkt dat de hard-negative-registratie stilzwijgend faalde.
5. **Regressietest op het echte scenario.** Een test die een kaderloos item (`cropPath: null`) afwijst met `geen-keurmerk` en aantoont: **200**, `status: 'rejected'`, `registersSkipped: true`, en dat de itemstatus in de DB op `rejected` staat. Plus een test die bewijst dat de crop-variant ongewijzigd blijft (registers wél gevoed).
   - **Let op de bestaande testopzet** (review, low): de suite voor dit endpoint mockt `prisma` + `mlClient`, niet de modules. Een module-mock op `review-decision` sloopt 11 zustertests. Toon het overslaan dus aan via het waarneembare gedrag (respons + DB-status + het uitblijven van de gold-set-/hard-negative-schrijfacties op de bestaande prisma-mock), niet via een spy op `recordRejectGeenKeurmerk`.

## Tasks / Subtasks

- [x] 1. Guard vervangen: bij `reason === 'geen-keurmerk'` zonder `cropPath` de registerstap **overslaan** i.p.v. 422 teruggeven (AC1).
- [x] 2. Logregel toevoegen bij het overslaan (AC4).
- [x] 3. Tests: kaderloos → 200 zonder registers; met crop → registers wél; 503-pad en idempotentie-guard onaangetast (AC2/AC3/AC5).
- [ ] 4. Verificatie op ACC ná deploy: het nog openstaande kaderloze item (`05000394169654`, SEPARATE_COLLECTION) via de UI kunnen afwijzen.

## Dev Notes

- `registersSkipped` is in AC1 verplicht gemaakt (was hier eerst "optioneel" — dat sprak AC1 tegen).
- **Nu al handmatig rechtgezet:** het item uit de reproductie (`ed7add58…`) is op ACC direct op `rejected` gezet — alleen de status, géén registers, precies wat het endpoint had moeten doen. Er staat nog **één** kaderloos item open (`05000394169654`) dat als verificatiegeval kan dienen.
- **Niet sturen op markers.** `method = 'human-annotation-request'` / `reason LIKE 'route-a-handmatig:%'` zijn alleen data-conventies uit de wachtrij en komen in geen enkele regel code voor. De 48 oudere kaderloze items hebben ze niet. Stuur uitsluitend op `cropPath IS NULL`.
- **AC1 is inhoudelijk veilig** (review-verificatie): `cropPath = NULL` betekent "heeft nooit een uitsnede gehad". Een zoekgeraakte crop houdt zijn pad en loopt dus gewoon in het bestaande fail-closed 503-pad — er ontstaat geen stil gat.
- Geen enkele bestaande test hangt aan de 422; die weghalen breekt niets (review-verificatie).
- [Source: apps/api/src/api/v1/artwork-pipeline.ts reject-handler; services/flywheel/review-decision.ts (`recordRejectGeenKeurmerk`, `PhashUnavailableError`)]

### Dev Agent Record — implementatie 2026-07-26
- **Fix**: de 422-guard is vervangen door een skip. De register-tak draait nu alleen bij `reason === 'geen-keurmerk' && item.cropPath`; zonder crop wordt `registersSkipped = true` gezet en een expliciete logregel geschreven (`reasonSkipped: 'geen-crop-om-te-hashen'`). Respons: `{ status, reason, registersSkipped }`.
- **Bewust op `cropPath` gestuurd**, niet op method/reason-markers — anders bleven de 48 oudere kruischeck-items (juni) op de 422 lopen.
- Verouderde comment "De crop is vereist om een hash/hard-negative te maken" verwijderd; die beschreef precies de aanname die deze story weerlegt.
- **Tests** (3, in de bestaande route-suite, zelfde mock-opzet — géén module-mock, dus de 11 zustertests blijven heel): kaderloos → 200 + `registersSkipped: true` + geen phash/gold-set/hard-negative + status wél `rejected`; mét crop → `registersSkipped: false` en registers wél gevoed; kaderloos + andere reden → ongewijzigd.
- **RED-bewijs**: de oude 422-guard terugzetten maakt exact de kaderloze test rood; na herstel schoon.
- **Verificatie**: tsc 0. Route-suite **54/54**. Volledige api-suite 1002 passed / 3 failed — alle drie geïsoleerd groen (6/6, 4/4, 17/17), bekende belasting-afhankelijke flakes.
- **Resteert**: ACC-verificatie ná deploy op het nog openstaande kaderloze item `05000394169654` (SEPARATE_COLLECTION).

## Change Log
- 2026-07-26: Story aangemaakt na live 422 op ACC (Friso).
- 2026-07-26: Geïmplementeerd; status → review.
- 2026-07-26: Herzien na adversariële review (FAIL, 2 medium). M1: oorzaakanalyse gecorrigeerd — bestaande bug sinds 14.1 die 50 items raakt (48 uit juni via de kruischeck), niet een nieuw gat door route-A. M2: `registersSkipped` verplicht gemaakt i.p.v. tegenstrijdig optioneel. Plus: frontend-premisse gecorrigeerd (er ís een tweede knop, maar met een andere betekenis) en de testaanpak afgestemd op de bestaande mock-opzet.
