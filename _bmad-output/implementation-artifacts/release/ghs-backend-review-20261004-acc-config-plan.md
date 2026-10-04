# Activering automatische beeldbeoordeling op ACC

Doelapplicatie: Logorecognition, Coolify UUID qsookwow8koko0kwg00g0cwk, acc-branch, docker-compose.acc.yml. Read-only vastgesteld: gezond; beide services hebben bestaande PIPELINE_SERVICE_KEY; vier providerconfigsleutels ontbreken. De Coolify-envinventaris toont sleutelmetadata zonder geheime waarden, daarom is geheimaanwezigheid afzonderlijk uit de container gecontroleerd.

## Eén gevraagde configuratieactie

1. Voeg als runtimeconfiguratie vier variabelen toe aan deze ACC-applicatie, vóór de al geautoriseerde acc-merge en automatische uitrol:

| Variabele | Waarde / veilige herkomst |
|---|---|
| GHS_REVIEW_BASE_URL | https://generativelanguage.googleapis.com/v1beta/openai |
| GHS_REVIEW_MODEL_A | gemini-3.8-flash |
| GHS_REVIEW_MODEL_B | gemini-3.1-pro-preview |
| GHS_REVIEW_API_KEY | Veilige kopie van bestaande GEMINI_API_KEY uit ~/claude-team-config/secrets/.env; nooit zichtbaar of in Git |

Geen nieuw geheim genereren. Bestaande PIPELINE_SERVICE_KEY blijft de interne route beschermen. De configuratie bevat geen beeld of labels. De compose-services lezen gedeelde runtimeconfig via .env; uitsluitend de ML-reviewcode gebruikt de providersleutel. Geen handmatige deploy/start/stop/herstart. Na de normale automatische uitrol volgen gecontroleerde geauthenticeerde aanvragen met bestaande voorbeeldbeelden; dat zijn echte betaalde Gemini-aanroepen.

De envactie wijzigt ACC-configuratie, geen database/trainingsdata of modelgewichten. Controleer na schrijven onmiddellijk sleutelmetadata en geheimewaarde-gelijkheid veilig in geheugen, zonder uitvoer van de sleutel. Controleer na automatische uitrol de werkelijk geladen configuratie en routewerking.

Rollbackrichting: herstel de vooraf vastgelegde vier ontbrekende variabelen door ze te verwijderen; afzonderlijke externe configuratieactie vereist opnieuw autorisatie. Code kan via een normale acc-revert en auto-uitrol terug; geen databasewijziging te herstellen.

Autoriseringsbron: ~/.claude/personal.md §3: “Andere schrijfacties op ACC of productie dan de hieronder toegestane ACC-vrijgave” staan onder “Eerst vragen”. Push/merge en automatische uitrol hebben staande toestemming; het handmatig toevoegen van deze configuratie valt daar buiten. Deze actie is nog niet uitgevoerd.

Modelkeuze onderbouwd met echte modellenlijst en8succesvolle positievebeoordelingen; plaatsvakoverlap met eerdereAIvisueleinschattingen0.803–0.982. Pro-model is expliciet een previewmodel; provider kan beschikbaarheid/gedrag wijzigen, daarom modelnamen configureerbaar en geen stillefallback. Dit is ontwikkelcontrole, geen onafhankelijkegoldmeting. Volledige10beeldroutecontrole volgt vóórgoedkeuringsvraag.
