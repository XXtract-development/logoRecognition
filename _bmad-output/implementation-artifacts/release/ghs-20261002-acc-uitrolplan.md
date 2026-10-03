# ACC-vrijgave gevarenpictogrammen

Gebruiker autoriseert alle vervolgstappen tot implementatie. Push/merge ACC en bijbehorende automatische Coolify-uitrol hebben bovendien staande toestemming in persoonlijk geheugen. Geen Zoho Sprints.

## Concrete uitvoering
1. Productcode voor negen GHSklassen, declaratievergelijking, verplichte menselijke review, officiële gebundelde referenties en lokale kwaliteitsmeting bouwen en offline verifiëren.
2. Alle contract-/beeld-/regressietests werkelijk uitvoeren; implementatiediff onafhankelijk reviewen en bevindingen oplossen.
3. Alleen eigen bestanden expliciet stagen, versions.md in dezelfde Engelstalige commit met Codexsignatuur/coauthor; gebruikerswijziging .gitignore en oude onderzoekbestanden bewaren.
4. Featurebranch codex/ghs-recognition pushen, PR naar acc aanmaken/aanhangen, echte CIuitslag controleren, squashmerge na succesvolle controles.
5. Coolify automatische uitrol uitlezen, concrete draaiende commit van app/ML controleren en GHSbeeldsmoke zonder databasewrites uitvoeren. Geen handmatige deploy of containeracties.

## Effect en grenzen
De gebundelde startreferenties worden samen met de beeldservice uitgerold; geen reference_logos-import, modelgewichtenwijziging of database-schemawijziging. De bestaande negen GHSnummerwaarden blijven extern behouden. Nieuwe GHSvoorstellen vragen menselijke beoordeling en worden niet automatisch trainingsmateriaal. Dit levert functionele herkenning plus meetinstrumenten; voldoende veldkwaliteit per pictogram vereist onafhankelijke echte verpakkingstests en wordt nooit afgeleid uit de negen officiële templates.

Read-only preflight: Coolifyapp qsookwow8koko0kwg00g0cwk (Logorecognition), brancheacc, running:healthy bij preflight in deze fase (vastlegging 2026-10-02T20:41:47.941252+00:00). git_commit_sha=HEAD is geen bewijs van draaiende SHA; na uitrol containerlabels/bron inspecteren.

## Terugdraaien
Bij een regressie kan de code via een nieuwe gecontroleerde ACCcommit worden teruggedraaid. Er zijn geen geplande live DBmutaties die handmatig moeten worden teruggedraaid. Een falende check voorkomt de merge; onvolledig veldbewijs blijft als ontbrekendbewijs gerapporteerd.

Preflight herhaald 2026-10-04 (lokaal): openbare ACChealth HTTP200/statusok; app en ML gezond met image-tag305733f197058d6dc0931830b9fa71be433e8c81; Coolify running:healthy/brancheacc. Dit is alleen baselinebewijs, nog geen GHSuitrol.
