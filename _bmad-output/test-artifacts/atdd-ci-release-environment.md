---
stepsCompleted: [step-01-preflight-and-context, step-02-generation-mode, step-03-test-strategy, step-04-generate-tests, step-04c-aggregate, step-05-validate-and-complete]
lastSaved: 2026-10-02
---
# Gerichte acceptatiecontrole testomgeving
Input: spec-ci-release-environment.md, SPEC.md en ci-contract.md. Fullstack project; gerichte CIchange heeft shellcontracten in Pythonunittest en bestaand Playwright/pytest framework. AIgeneration zonder browser nodig voor runnerinfrastructuur. Geïsoleerde tijdelijke fixtures, echte exitcodeassertions, begrensde retries en geen sleeps in mocks volgen TEAtestquality/TDD.
Capprobe: collaboration.spawn_agent geweigerd threadlimit. Direct sequential fallback, geen zichtbare childtasks. Skillskipplaceholders bewust niet gebruikt: expliciete opdracht vereist betekenisvolle daadwerkelijk falende tests.
P0: healthtimeout stopt zonder bucketcalls; bucketfout stopt; pytestexit13 blijft13. P1: gezonde setup maakt alle drie buckets; immutableofficialsource/integriteit en alwayscleanup; writable tijdelijke MLpaden en dummy localhostsettings.
RED vóór productiecode: python3 -m unittest discover -s .github/tests -v =>6tests uitgevoerd,6failures. /tmp/logo-ci-release-red.log. Tests active, geen skip/xfail/deletion; timeoutfixtures max5sec, geen extern systeem.
Toetsbestand: .github/tests/test_ci_release_environment.py. Bevat shell-executie met tempCLI mocks en workflowexitcodecontract; sourcepolicyguard is bewust statische veiligheidscontrole. Geen nieuwe browser, agent of achtergrondservice uit deze controles.
Vervolg: bmad-build directfallback na onafhankelijke specreview; GREEN en daadwerkelijke LinuxCI blijven noodzakelijk.

Independent spec-review guards adopted before implementation; RED8/8, healthrequestlimit and PID-before-readiness. Approved runtime safety extension: exactcachedimage+never+allotherMinIOfields immutable, independent specsweepPASS; RED1/9 thenGREEN10/10. Added dotenvguard regression after code as direct environmentintegrity check. No new skippedtests. Failurefixture MODELpaths fixed onlyafter investigation; deadfakehealthy schedulingrace isolated deterministically without weakeningassertion. Realnativebuild/storage smoke and fullpinnedMLsuite independently verify behavior.

Reviewregression durable11thtest: GITHUB_ENVdirectory causes actualownPIDleak RED1/11 beforetrapmove, then11/11GREEN. Root's independentreview3lensesreported thissolematerialfinding, patchedtrapinstalledbeforePIDwrite. This newtestisactive, no production/workflowfallbackweakening.
