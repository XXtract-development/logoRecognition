# GHS-herstel op dichte witte etiketten

Geselecteerd: uitsluitend de gecontroleerde beeldverwerking; model `ghs-glyph-v1-58a1db6819e8` blijft onveranderd (SHA256 `68b9ce1488150d32722bb116790fcd065a89d53525fa43dfd48c3148f63d8974`). Het bestaande model bevat daadwerkelijke featurebijdragen van23 gecontroleerde productievoorbeelden uit16 beelden en10 voorlopige brongroepen, naast officiële referenties.

Publieke bekeken ontwikkelmeting:56→59 van61 gekwalificeerde objecten,60 normale lokaleAPIaanroepen op30 oorspronkelijke beelden bij vaste0,87/0,99. Drie brede HEALTH-symbolen hersteld; één klein HEALTH en één BOMB blijven gemist. Eén extra voorstel blijft ongeadjudiceerd. Geen menselijke gold, onafhankelijke eindtest of voldoende-getraindclaim voor alle negen klassen.

Aparte oudepraktijkmeting:154 normale lokaleAPIaanroepen,103 vereiste niet-ingrediëntobjecten pergrens behouden zonder perobjectwijziging; elf ontwikkelnegatieveframes blijven in beidekanalen zonder GHS. Andere ADRchallenge blijft afzonderlijk en telt niet als negatiefbenchmark.

Drie nieuwe trainingskandidaten zijn veilig afgewezen.37 rawpublieke crops verloren oude FLAME/SKULL;14 opnieuw dubbelbeoordeelde neutrale/SDSderivaten haalden60/61publiek maar verloren oude SKULL;2explosiederivaten behielden oudebeelden maar maakten twee openbare objecten onzeker (58/61 nonuncertain tegenover59baseline). Alle freezes, bronbeelden en geweigerde modellen blijven lokaal bewaard; geen geweigerdegewichten gepubliceerd. Verder tunen op dezelfde bekeken bronnen geeft onvoldoende onafhankelijk kwaliteitsbewijs.

Nieuwe randnabije papiercontrole vereist65% neutraalwit in elk vanvier sectoren, behoudt fysieke rand/geometrie/contrast/budgetchecks en verlangt uitsluitend op de extra route de bestaande classifierzekerheid. Alle classinterpretaties doen eerst mee aan conflictcontrole. Betekenisvolle regressies bewaken daadwerkelijke publieke beelden, negatiefartwork, mixedstrokeconflict en numerieke sectorboundary.

Controle:134specialisttests en616 volledigeMLtests geslaagd (14bestaande skips); black/isort/ruff/diffcheck groen. Drie onafhankelijke reviewlagen, oorspronkelijke blindreviewer hercontrole vanconflictpatch en apartepublicatieaudit afgerond. CC BY4.0fixturelicentielink toegevoegd na publicatieaudit. Bronpixels en hashes onveranderd. Geen rawproductiebeelden, DBsnapshots of reviewantwoorden inpublicatie; unrelatedwijzigingen behouden. Transportverificatie corrigeert uitsluitend finiteconfidenceafronding met absolute1e-9; anderevelden strikt.

ACC-vrijgave volgt vooraf geautoriseerde PR/squashmerge en bestaande automatische deployment; daadwerkelijke nieuwe runtimecontrole volgt pas na exacthealthyrevision. Geen handmatigecontaineractie, productie-deploy of databasewrites.
