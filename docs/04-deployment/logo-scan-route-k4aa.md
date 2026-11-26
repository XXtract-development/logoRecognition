# Logo-scan: letterlezer-route (`LOGO_SCAN_ROUTE=k4aa`)

> [!note]
> Stand 25-11-2026. ACC: standaard aan. Productie: **uit**, en alleen aan te zetten na een apart
> akkoord van Friso (zie "Productie" hieronder). Specs: `_bmad-output/specs/spec-logo-scan-k4aa/` en
> `_bmad-output/specs/spec-nutriscore-k4aa-letterlezer/`. Meting:
> `_bmad-output/implementation-artifacts/investigations/nutriscore-k4aa-letterlezer-meting-20261125.md`.

## Wat de schakelaar doet

`LOGO_SCAN_ROUTE` wordt per aanvraag gelezen (`scanRoute()` in `apps/api`). `k4aa` kiest de route met de
aparte Nutri-Score-letterlezer; elke andere waarde of geen waarde kiest de oude route (`legacy`). Het
antwoordformat (`logoResults.v1`) is gelijk; alleen `modelVersion` krijgt het achtervoegsel `/k4aa`.

## ACC (Coolify-app `qsookwow8koko0kwg00g0cwk`, tak `acc-deploy`)

- `LOGO_SCAN_ROUTE=k4aa` staat er als gewone (niet-preview) variabele, permanent. Besluit Friso 25-11-2026:
  "eerst standaard aan op ACC".
- Terugdraaien op ACC: variabele verwijderen in Coolify en opnieuw uitrollen; `modelVersion` heeft dan
  geen `/k4aa` meer.
- Meetresultaat op de 352 bevestigde etiketten: Nutri-Score A–E elk 100% gevonden, 0–4% foute
  meldingen (335 van 352 beantwoord).

## Kosten

±$0,02 per scan (volle run van 335 scans: ≈ $4,87; gemiddelde scantijd 24 s, langste 148 s). De kosten
zitten in de extra letterlezer-aanroepen naar het taalmodel; ze staan als `cost=` in de ml-service-log
(`K4-aa scan done: …`). Dit is hogere kosten dan de oude route, die geen modelaanroep per balk doet.

## Bekende beperkingen (afbeeldingen die geen antwoord geven)

Van 352 etiketten gaven 17 geen antwoord; de oorzaak is invoer, niet de route:

| aantal | gedrag | oorzaak |
|---|---|---|
| 11 | HTTP 400 `INVALID_IMAGE` | beeld heeft meer dan 80.000.000 pixels (88–94 miljoen; extreem lange drukwerkbestanden) |
| 4 | scan `failed` (`invalid_image`, opnieuw gemeten 25-11: alle 4 weer `invalid_image`) | genormaliseerde PNG groter dan 20 MB (`MAX_NORMALIZED_BYTES`) |
| 2 | scan `failed` tijdens de volle run | tijdelijk: bij opnieuw sturen op 25-11 (VERIFIED) slagen beide (`done`, 42 s). INFERENCE: drukte tijdens de volle run; de reden van toen is niet bewaard |

Een afnemer krijgt dus een duidelijke 400 of een mislukte scan met reden; er wordt niets verkeerds gemeld.

## Provider-instellingen van de K4-aa-route

De K4-aa-route (venster- en letterverzoeken) leest `K4AA_REVIEW_BASE_URL` en `K4AA_REVIEW_API_KEY`; zijn die leeg, dan geldt
`GHS_REVIEW_BASE_URL` / `GHS_REVIEW_API_KEY` (ACC zet alleen die, dus ongewijzigd). De basis moet
`https://openrouter.ai/api/v1` zijn, anders `provider_unavailable` zonder verzoek. Eigen basis zonder eigen
sleutel weigert ook (de Google-sleutel gaat nooit naar OpenRouter). Op productie dus BEIDE zetten.
`docker-compose.prod.yml` geeft ze waardeloos door: een geëxporteerde `K4AA_*` in de shell wint van het
env-bestand en de offline controle ziet dat niet, dus uitrollen vanuit een schone shell.

## Productie: apart akkoord van Friso nodig

Niets hiervan is uitgevoerd. Reden: kosten (±$0,02 per scan, lopend), een wijziging van het gedrag voor
afnemers, en een uitrol op productie. Dit is een CONCEPT-manifest; elke stap vraagt een eigen
goedkeuring en na elke stap wordt de bron teruggelezen.

**CONCEPT productiemanifest — niet uitvoeren zonder akkoord van Friso**

| # | wat | waar | letterlijk | terugdraaien |
|---|---|---|---|---|
| 0 | Voorwaarden controleren | prod-app Logorecognition | akkoord Friso op kosten (±$0,02 per scan × verwacht aantal scans per maand), prod draait dezelfde commit als ACC (≥ `550c1d9`), modelsleutel en budget voor de letterlezer zijn aanwezig in de prod-ml-service | n.v.t. (alleen lezen) |
| 0b | K4-aa-provider zetten | Coolify, prod-ml-service, niet-preview, runtime | `K4AA_REVIEW_BASE_URL=https://openrouter.ai/api/v1` en `K4AA_REVIEW_API_KEY=<OpenRouter-sleutel>` (BEIDE; zonder eigen basis valt de route terug op `GHS_REVIEW_*`, dat op productie naar Google wijst, en weigert) | Beide variabelen verwijderen, opnieuw uitrollen |
| 1 | Variabele zetten | Coolify, prod-app Logorecognition (uuid in te vullen door Sanne), niet-preview, runtime | `LOGO_SCAN_ROUTE=k4aa` | Variabele verwijderen (stap 3) |
| 2 | Uitrollen | zelfde app, via de gewone uitrolroute (geen handmatige containeractie zonder akkoord) | redeploy van de bestaande commit | Zelfde uitrol na verwijderen van de variabele |
| 3 | Terugdraaien (alleen indien nodig) | zelfde app | variabele `LOGO_SCAN_ROUTE` verwijderen, opnieuw uitrollen | n.v.t. |
| 4 | Controle | prod | `/health` 200; één echte scan met een bestaande consumer geeft `modelVersion` met `/k4aa`; ml-service-log toont `K4-aa scan done` met `cost=`; na één dag kosten tellen en vergelijken met $0,02 per scan | zie stap 3 |

Geen databasewijziging nodig; er is geen migratie. Een proefscan op productie kost ook ≈ $0,02 en telt
als schrijfactie buiten de repo: eerst akkoord.
