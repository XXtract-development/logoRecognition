# GHS-specialist: implementatie en ontwikkelresultaat

Engineeringfase afgerond 2026-10-04. Training en inference werken lokaal, de gewone detectieroute gebruikt de specialist en de API behoudt scoregrenzen en reviewmetadata. Geen live database/import/config/modelactivatie/containeractie, geen commit/push door deze deelagent. Coördinator beheert vrijgave.

Model: `ghs-glyph-v1-46ddcb5bd01b`; modelbestand SHA256 `8d989fa8e183fd83f1921f0fdf60167c2ac6658bfbcdfaa49421407a186dfd7d`.1849 deterministisch gemaakte trainingsvarianten van negen officiële bronfamilies plus UNKNOWN-achtergrondglyphs; nul onafhankelijke praktijkgroepen. Volledige hertraining levert byte-identiek model. Eerste engineeringmodel behouden voor audit; weights/bias/support bleven exact gelijk na semantische correctie van uncertainflag.

| Ontwikkelmeting | Voor | Na |
|---|---:|---:|
| Gekoppelde product-/product-SDS-AI-vakken met juiste klasse en IoU≥0,5 |25/34|34/34|
| Daarvan niet-onzeker volgens vaste modelpolicy |12/34|34/34|
| Alle46 kandidaten, inclusief11 ingrediëntvakken en één betwist Finish-vak |26/46|36/46|
| Niet-gekoppelde voorstellen |0|1 onzeker voorstel|

De nieuwe extra is een klein17×16 ingrediëntvak in input23: FLAME_OVER_CIRCLE met score0,8442. Mogelijke kleine-glyphverwisseling, geen bevestigde waarheid. Deze fout-/onzekerheidsmogelijkheid blijft zichtbaar. Voor de standaardAPI-scoregrens0,99 staat het apart in review_proposals. Hele etiketten zijn hierdoor niet allemaal foutloos; productvakmatches zijn geen vervanging voor whole-labelgroepcriteria. Vijf lege AI-fotobeoordelingen en een technische dieline zijn geen bewezen negatieve etiketten.

De API verhoogt geen scores. Onder de gevraagde grens blijft detections leeg voor dat voorstel en staat review_proposals met uncertain/requires_review/modelversie/confidence_kind. Boven de vaste onzekerheidsgrens0,87 is een classifieruitkomst niet ambigu volgens ontwikkelpolicy, maar blijft verplicht gereviewd en ongekalibreerd. Bestaande algemene logo's en sterkere legacy-GHS-uitkomsten blijven behouden; duplicatebehandeling is categorie- en overlapgebonden en transactioneel.

Verificatie:182 Pythoncontract-/GHS-/backendreviewregressietests,15 Node route-injecttests inclusief echte response-serializer, APIbuild en gerichte ruff/diffchecks geslaagd. Tests bewijzen onder meer daadwerkelijke learned fallback naar normaleAPI, vaste originele coördinaten na grootbeeldreductie, UNKNOWN/abstentie, corrupt model, familiesplit, reproduceerbaarheid, frozenweightwijzigingsweigering en minimumscore/proposals. Officiële/gemaakte testbeelden leveren integratiebewijs, geen onafhankelijke veldkwaliteit.

Coördinator deed onafhankelijke edge-case review; bestaande verification-gap reviewer vond twee ontbrekende tests, beide toegevoegd en geslaagd. Een verse contextvrije blindreviewer kon wegens platformthreadlimiet niet starten; gebruikersmandaat zelfstandige uitvoering toegepast en beperking vastgelegd. Geen onopgeloste gerapporteerde codefinding.

Nog nodig voor voldoende praktijkbewijs: onafhankelijke bronfamilies en negatieve etiketten meten op het bevroren artifact, alle negen klassen afzonderlijk rapporteren en eventuele tekortkomingen eerlijk behouden. Nieuwe door root gereserveerde beelden zijn door deze implementer niet gelezen of getest. Geen voldoende-getraindclaim.

Cleanup: tijdelijke eerste-/reproductieartifacts behouden voor audit, oorspronkelijke bronbeelden/evidence en andere werkboomwijzigingen behouden. Geen live cleanup uitgevoerd. Bron-/modelhashes en ownedfilelijst staan in [engineering-freeze.json](engineering-freeze.json); uitvoeruitkomsten in [baseline.json](baseline.json).
