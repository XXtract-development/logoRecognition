---
datum: 2026-10-02
status: ontwerp; geen productwijziging
---
# Code- en reviewcontract

| Ingress/pipeline | Interne canonieke naam |
|---|---|
| GHS01 | EXPLODING_BOMB |
| GHS02 | FLAME |
| GHS03 | FLAME_OVER_CIRCLE |
| GHS04 | GAS_CYLINDER |
| GHS05 | CORROSION |
| GHS06 | SKULL_AND_CROSSBONES |
| GHS07 | EXCLAMATION_MARK |
| GHS08 | HEALTH_HAZARD |
| GHS09 | ENVIRONMENT |

Alle negen: categorie `GHSSymbolDescriptionCode`, GS1-veld `gHSSymbolDescriptionCode`. Trim/case-normalisatie en aliasomzetting vóór profielvergelijking, classificatie en registratie. Profielen met naam of nummer beperken dezelfde klasse; een andere GHS-klasse blijft uitgesloten. Dubbele alias+naamdetectie met dezelfde box telt eenmaal. Onbekende codes worden nooit door fallback als GHS opgeslagen.

`NO_PICTOGRAM` blijft een declaratieve waarde, geen visuele klasse, template, positieve crop of traininglabel. Afwezigheid van treffers bewijst niet NO_PICTOGRAM. Samen met een positieve GHS-declaratie wordt tegenspraak getoond; nooit stil wegfilteren.

De pipelineadapter `/detect-symbols` levert GHS01–09 met GHS-codelijst, box en bestaande metadata. Interne artwork/review/reference-paden gebruiken namen. Geen nieuw API-veld of andere consumeroutput vereist in deze eerste reparatie. Het echte productpad en de pipelineadapter krijgen aparte tests; replay bewijst alleen outputnormalisatie. `imageUrl`-ondersteuning is niet bewezen: test echte base64beelden, of retourneer expliciet unsupported-input; geen leeg succesvol antwoord gebruiken als beeldbewijs.

De declaratieparser leest uitsluitend exacte XML-local-name `gHSSymbolDescriptionCode`, namespaces en herhalingen ondersteund. Bewaar bron/provenance en categorie; aliasnormalisatie wordt met echte bronfixtures gecontroleerd. Geen algemene enumerationValue-match. De GHS-pilot maakt ook bij hoge confidence en gelijke onafhankelijke declaratie een menselijke reviewuitkomst. Toevoegen van de parser mag de bestaande generieke autoacceptatie niet onbedoeld voor GHS openen. Reviewfloor/gate mogen onzekere gevallen niet als succesvolle of afwezige symbolen tellen; abstenstie blijft in meetrapport.

Uitvoerpunten: ML `app/symbol_contract.py` en `app/api/symbols.py`; API `services/reference-code-mapping.json`, `field-type-mapping.ts`, `ml-client.ts`, `t3777-declarations.ts`, `artwork-crosscheck.ts` en `api/v1/artwork-pipeline.ts`; frontend bestaande `spoor-codes.ts`. Contracttests bevestigen categorie, idempotentie, invalid-request zonder writes en beide flywheel-flagpaden. Seedaliassen niet rechtstreeks als onbekende verpakkingscodes importeren.

Bronnen: [onderzoek](../../implementation-artifacts/investigations/ghs-codecontract-20261002.md), [analistplan](../../planning-artifacts/research/ghs-herkenningsplan-2026-10-02.md). Lokale basis a0b5de44; ACC305733. Export/publicatieconsumer is open; een detectieresponse of CSV-export bewijst geen GS1-publicatie.
