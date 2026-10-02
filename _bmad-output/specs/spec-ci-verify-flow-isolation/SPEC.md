---
id: SPEC-ci-verify-flow-isolation
companions: []
sources: []
---
# Offline verificatiecontroles
## Why
De echte API-controle blokkeert vrijgave met zes vijfseconden-timeouts. De tests vervangen slechts één van twee parallelle catalogusopzoekers; de tweede doet onbedoeld een echte aanvraag. Brontracering en een tijdelijke netwerkval bevestigen exact zes pogingen bij dezelfde zes tests, terwijl alle negentien betekeniscontroles slagen met direct gecontroleerde foutuitkomst.
## Capabilities
- **CAP-1**
  - **intent:** Verificatiecontroles kunnen betrouwbaar met vaste testgegevens lopen zonder catalogusverbinding.
  - **success:** De bestaande negentien controles slagen; geen test probeert fetch; een blijvende nul-aanvragencontrole faalt wanneer een afhankelijkheid niet wordt vervangen.
## Constraints
- Alleen apps/api/src/__tests__/services/verify-flow.test.ts, BMad-bewijs en versions.md wijzigen. Productcode, globale testsetup, tijdslimieten, model, credentials en externe systemen blijven ongemoeid.
- Beide declaratiepaden krijgen per test eigen defaults; Nutri-Score-tests kunnen hun bestaande overrides blijven gebruiken. Spies, globale fetch en omgevingsvariabelen worden per test hersteld, ook bij een gefaalde netwerkassertie.
- Throw alleen is onvoldoende: productgedrag vangt catalogusfouten af. Daarom een expliciete nul-aanvragenassertie bij iedere test.
- Geen tests verwijderen, overslaan, xfail, timeouts verhogen of blind proberen tot een groene run verschijnt.
## Non-goals
- Catalogusbeschikbaarheid herstellen, service/productgedrag wijzigen, ACC-aanvragen of deployments uitvoeren.
## Success signal
Actieve nul-aanvragencontrole toont eerst precies de ontbrekende testisolatie aan. Na de fixturecorrectie slagen alle negentien bestaande betekeniscontroles zonder fetch; onafhankelijke review en gerichte regressies sluiten de lokale wijziging. Root publiceert daarna voor echte GitHub-CI.
