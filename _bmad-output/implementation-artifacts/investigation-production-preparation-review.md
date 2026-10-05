# Onderzoek productievoorbereiding: reviewafwijkingen

Symptoom: het lokaal voorbereide contract kan valide lijken terwijl login geen MySQLverbinding heeft, media naar ACC terugvalt, opslag niet de beloofde Storage Box gebruikt of de bestaande route kan worden geclaimd. Een synthetische quoteprobe toont verschil tussen envparser en Compose.

Evidence: drie onafhankelijke reviews; concrete callers getAuthPool/authQuery en MediaServerClient; exacte Compose/validatorvelden; envprecedence en synthetische input. De oorspronkelijke 19 tests slagen maar dekken deze grenzen niet. De lokale lege schemaherstelproef slaagt. Geen livefout of productieactie.

Hypothesen: ontbrekende expliciete verbindingen confirmed; onjuist opslagvolume confirmed; onvoldoende hostname/env/wiring/URLguards confirmed; gebrek entrypoint/CIdekking confirmed. Geen hypothese over onvoldoende GHSherkenningskwaliteit wordt hiermee bevestigd.

Eigenaar: logoRecognition productiecompose en deploymentvalidators. Structurele richting: corrigeer het bestaande productiecontract en voeg grens-/mutatie-/entrypointtests en CI-invocation toe, behoud bevroren imagepaar, staged profiles en beperkte runtime-identiteiten. App/MLherkenningscode blijft buiten deze correctie. Alle reviewbevindingen staan individueel in de spectriage.

Follow-up: onafhankelijke hercontrole bevestigt alle oorspronkelijke correcties, maar de nieuwe succesentrypointtest controleert alleen status/tekst. Hypothese confirmed op testbody: verwijderen van helpercall is ongedekt. Component: deploymenttest, richting: assert daadwerkelijk gemaakte/gecontroleerde vier buckets; geen runtimewijziging nodig.
