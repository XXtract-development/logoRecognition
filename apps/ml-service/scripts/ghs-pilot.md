---
status: lokale evaluatie-instructie
versie: ghs-eval-v1
---
# GHS pilot lokaal uitvoeren

Gebruik uitsluitend toegestane lokale beelden met onafhankelijke dubbele annotatie. De negen gebundelde CCOHS-pictogrammen zijn startreferenties en worden als holdout/validatie geweigerd. Geen afbeelding uit deze pilot naar live training of referenties schrijven.

Manifest: JSONobject met `version`, `annotationVersion`, `samples`. Elk sample bevat `sampleId`, `sourceId`, `sourceURL`, `provenance`, `artworkVersion`, `familyId`, `originalHash` (SHA256), `split` (`reference|train|validation|holdout`), `imageWidth`, `imageHeight`, `annotator`, `secondReviewer` (twee verschillende personen), `readability` (`readable|unreadable|uncertain`), `quality`, `fullImagePath`, `perceptualHash` (hex,pHash via app.ghs_dataset.perceptual_hash), `duplicateReview='confirmed'`, `objects`. Elk object bevat `label` (canonieke GHSnaam of UNKNOWN), `bbox={x,y,width,height}`, `readable`; optioneel `cropPath` met verplicht `cropHash` én `cropPerceptualHash`. Zonder cropPath zijn de nieuwe cropvelden niet nodig. ImageWidth/Height moeten eindige positieve gehele getallen zijn en overeenkomen met het gedecodeerde bronbeeld; bboxcoördinaten moeten eindig en binnen het bronbeeld liggen.

Dezelfde product/artworkfamilie, pagina's, crops en resoluties delen familyId en split. Verschillende familyIDs met exact/nearidentiek beeld worden geweigerd, ook binnenholdout. Onzekere annotaties/onleesbarebeelden tellen nooit als voldoende onafhankelijke evidence.

Vanuit `apps/ml-service`:

```sh
python scripts/ghs_eval.py validate-development --manifest /pad/manifest.json --protocol /pad/dev.json --output /pad/dev-report.json
python scripts/ghs_eval.py freeze --manifest /pad/manifest.json --protocol /pad/frozen.json --output /pad/final-report.json
python scripts/ghs_eval.py evaluate --manifest /pad/manifest.json --protocol /pad/frozen.json --output /pad/final-report.json
```

Ontwikkelmodus gebruikt uitsluitend validatiebeelden voor selectie. Freeze schrijft configuratie/hash/codecommit zonder finale beelden te decoderen. Finalevaluatie vereist hetzelfde protocol en controleert eerst metadata zonder eindbeelden te decoderen en schrijft daarna een exclusieve `.ghs-final-{datasetidentiteit}.exposed`ledger in de datasetmap vóór beeldtoegang; een andere protocolnaam of gekopieerde manifestnaam binnen deze datasetmap geeft dezelfde beelden geen tweede vrijgave. herhaling mislukt ook na een mislukte run. Wijzig geen ongunstige samples en verwijder geen exposureledger om de set opnieuw als verzegeldselectiebewijs te gebruiken. Broncodehashes beschermen oncommitted ontwikkeling; officiëletemplatechecksums worden apart geverifieerd.

Rapport toont perklasse crop/wholelabeltellers,noemers,objectmatches,missers,extras,verwisselingen,abstenties,kwaliteits- en groottebakken, onafhankelijke groepsaantallen en bewijsstatus. Onzekere GHSvoorstellen tellen als foutvoorstel op negatieve etiketten; UNKNOWN is afzonderlijke abstentie. Geen baseline/challengerinputs betekent expliciet ontbrekend vergelijkingsbewijs, nooit een vrijgaveclaim.

Live registratie: stel indien een pilotmanifest op de servicehost beschikbaar is `GHS_PILOT_MANIFEST=/pad/manifest.json` in. Registratie valideert dat manifest en weigert zowel oorspronkelijke paths als hernoemde, opnieuw opgeslagen of verkleinde beelden met exacte of perceptuele pilotchecksums vóór databasewrites. Deploy/configwijziging is een aparte gebruikersactie; deze implementatie voert die niet uit.


Schemafragment voor een geannoteerde crop (alleen veldvoorbeeld, geen werkelijk sample of kwaliteitsbewijs):

```json
{
  "label": "FLAME",
  "bbox": {"x": 100, "y": 100, "width": 40, "height": 40},
  "readable": true,
  "cropPath": "crops/sample-flame.png",
  "cropHash": "<SHA256 van het cropbestand>",
  "cropPerceptualHash": "<64-bit hex van perceptual_hash(croppad)>"
}
```

Alle full-image- en cropchecksums worden onderling vergeleken én tegen officiële templates. Exact/perceptueel dezelfde beelden kunnen binnen dezelfde familyId en split hergebruikt worden; zij tellen daardoor nooit als meerdere onafhankelijke families. Ook een officiële crop op een verder unrelated pagina blijft uitgesloten van holdout/validatie.
