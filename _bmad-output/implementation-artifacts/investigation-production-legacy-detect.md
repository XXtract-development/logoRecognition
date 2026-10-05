# Onderzoek: bestaande productieaanroep behouden

## Symptoom en bewijs
De huidige productieconsument gebruikt POST /detect met X-API-Key, image_url en product_id. Bron: logo/src/main.py en logo/src/models/detection.py. De nieuwe applicatie heeft alleen /api/v1/recognize met JWT/base64. Rechtstreeks omschakelen breekt deze consument.

## Hypothesen
- Bevestigd: route, invoer en authenticatie verschillen.
- Bevestigd: oud antwoord heeft genormaliseerde xyxy-boxen; nieuwe detector gebruikt pixel-xywh.
- Weerlegd: dezelfde numerieke confidence betekent hetzelfde model. Scores moeten ongewijzigd met hun nieuwe betekenis worden behouden.
- Open: live eind-tot-eind vergelijking; pas na productieproef aantoonbaar.

## Eigenaar en fixrichting
logoRecognition API: aparte compatibiliteitsroute zonder JWT-hook, met dezelfde geheime sleutel, veilige publieke HTTPS-afbeeldingsdownload en echte ML-aanroep. Alleen geaccepteerde resultaten, hoogste per code; twijfelresultaten niet omzetten naar positieve herkenning. Geen productieactie tijdens implementatie.

## Follow-up: eerste gerichte tests
38 tests uitgevoerd, 37 slagen. De fixture beschouwde GHS01 als ongeldig, maar de gedeelde contractmapping definieert dit expliciet als alias van EXPLODING_BOMB. Hypothese bevestigd door reference-code-mapping.json; eigenaar testfixture. Correcte richting: ongeldige GHS99 testen en geldige alias apart bewijzen, geen productiecode aanpassen om correcte normalisatie te breken.

Reviewfollow-up: sevenconcretegapsconfirmed. ExistingMLclassification attachesdetectorscore but classmatchcanbe0.8; adapterexposesthatmismatch. ComponentMLdetector/response andAPIcompatibilityclassification. Fixdirectioncarryactualmatchconfidence, rejectinsufficientclassificationevidence; constraincodeuniverse/downloaddecodeconcurrency andtestEXIFpositivecodes. Imagepairmustberebuiltaftercode andfreezeupdatedbyroot. Noproductionroutehaschanged.
