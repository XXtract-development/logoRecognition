# Onafhankelijke controle vóór ACC-vrijgave

Gecontroleerd op 2026-10-04, coördinator root plus onafhankelijke verification-gap reviewer. Dit betreft technische implementatie; geen voldoende-getraindverklaring.

Root edge-case findings zijn opgelost en met gerichte tests beschermd: uitsluitend GHS-categorieën ontdubbelen, sterkere bestaande resultaten behouden, bij een specialistfout alle bestaande resultaten behouden, ongeldige scores weigeren en beeldwerk/kandidaten begrenzen. De minimumscore van de API blijft intact; onderdrempelgevallen blijven review_proposals met oorspronkelijke scores.

De onafhankelijke reviewer vond twee echte verificatiegaten: de succesvolle learned fallback werd niet via de werkelijke herkenningsroute geassert, en grootbeeldvakken werden uitsluitend op bounds gecontroleerd. Beide zijn opgelost met tests die respectievelijk een echte vervormde glyph via detect_ghs en gewone API behandelen en de oorspronkelijke plaats plus afmetingen toetsen. Herbeoordeling: geen nieuw materieel verificatiegat gevonden.

Een aanvankelijk altijd-onzeker classifierlabel blokkeerde terecht de strikte evaluatie. Deze betekenisfout is vóór nieuwebronmeting opgelost: onzekerheid volgt de bestaande vaste grens 0,87, terwijl ongekalibreerde scores en verplichte review afzonderlijk expliciet blijven. De trainbare gewichten, bias en support veranderden niet. Root en onafhankelijke reviewer controleerden het nieuwe contract en de bewijsgrens.

Modelversie: ghs-glyph-v1-46ddcb5bd01b. SHA256: 8d989fa8e183fd83f1921f0fdf60167c2ac6658bfbcdfaa49421407a186dfd7d. Negen officiële bronhashes en eindige numerieke arrays zijn onafhankelijk geverifieerd. Training: 1.849 gedocumenteerde varianten, nul onafhankelijke praktijkgroepen. Volledige hertraining is byte-identiek.

Verificatie door implementer: 182 Python-controles, 15 Node route-/serializer-controles, API-build, gerichte lint/format en diffcheck geslaagd. Reviewer heeft tests inhoudelijk gelezen en niet opnieuw uitgevoerd. Root diffcheck geslaagd. Tijdelijke reproductieartifacts en andermans werkboomwijzigingen blijven behouden.

Bekende kwaliteitsbeperking: één extra onzeker klein ingrediëntvoorstel op ontwikkelbeeld input23, naast tien nog niet juist gekoppelde kandidaten inclusief betwist etiketvak. Alle 34 gekoppelde productvakken zijn juist geclassificeerd en gelokaliseerd; dit is ontwikkelbewijs op AI-annotaties, geen foutloze hele-etiket- of onafhankelijke eindtestclaim.

Gebruiker heeft zelfstandig trainen/implementeren en ACC-push/merge met automatische deployment vooraf geautoriseerd. Geen aanvullende goedkeuring open. De volgende fase is CI, ACC-vrijgave en werkelijke runtimecontrole van exact deze versie.
