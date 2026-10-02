---
id: SPEC-ci-release-environment
companions: [ci-contract.md]
sources: []
---
# Betrouwbare vrijgavecontroles

## Why
De categoriecorrectie kan niet betrouwbaar worden vrijgegeven: de browsercontrole stopt vóór de applicatie start door een verdwenen opslagimage, terwijl de Pythoncontrole fouten ten onrechte als succes toont.

## Capabilities
- **CAP-1**
  - **intent:** CI kan tijdelijke S3-opslag beschikbaar maken voor echte browsercontroles.
  - **success:** De drie benodigde buckets bestaan; ontbrekende opslag, gezondheid of bucketcreatie stopt de controle met een fout.
- **CAP-2**
  - **intent:** CI kan de Pythoncontroles veilig uitvoeren en het werkelijke resultaat gebruiken.
  - **success:** Collectie gebruikt schrijfbare tijdelijke modelpaden; pytest-fouten resulteren in een mislukte job.

- **CAP-3**
  - **intent:** De automatische ACC-vrijgave kan de bewezen bestaande opslagversie hergebruiken zonder afhankelijk te zijn van een verdwenen downloadbron.
  - **success:** Het ACC-opslagimage is vastgepind op de geverifieerde lokale digest met pull_policy never; command, environment en datapad blijven identiek.

## Constraints
- Tijdelijke CI-opslag en uitsluitend bestaande ACC-imagedigest vastpinnen; bestaande S3-semantiek en buckets training-data, models en artwork blijven behouden.
- Officiële vastgepinde bronnen met integriteitscontrole; geen nieuwe leverancier, privécredentials of gepubliceerde spiegelimage. Zie ci-contract.md.
- Geen tests overslaan, verwijderen of als verwacht falend markeren; onderzoek nieuwe failures vóór reparaties.
- De bestaande categoriecorrectie en andermans bestanden blijven behouden.

## Non-goals
- ACC-data, opslagupgrade, coldhostprovisioning, productmodel, herkenningsregels, handmatige containeracties en publicatie door deze agent.

## Success signal
Parent bevestigt vóór merge dat de huidige deployhost de vastgepinde digest heeft en dat de geïnstalleerde Coolifyparser volgens read-only bronbewijs pull_policy never behoudt. Coldhosts vereisen apart expliciet provisioningbesluit. Lokale contractcontroles slagen aantoonbaar na hun falende uitgangsmeting. De hoofdtaak publiceert daarna en hervat vrijgave uitsluitend wanneer echte GitHub-controles groen zijn.
