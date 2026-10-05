---
status: confirmed
owner: Codex/root
date: 2026-10-05
---
# Onderzoek: daadwerkelijke productiebronverbindingen

VERIFIED: catalog.xxtract.com resolveert lokaal naar92.111.159.162 maar HTTPSGETbereikt connecttimeout; vanafBanana faaltnaamresolutie (gaierror). Eenblindcanonicalprodadres levertgeenwerkendebronverbinding.

VERIFIED: catalog.stage.xxtract.com werktvanafMac enBanana; exactX-API-Key uit actievecatalogcontainer levert404opbekendenietbestaandXML-id, ongeldigesleutel401. Container p40... DB_HOST46.224.119.158/DB_DATABASExxtractCatalogService (productie). Stagehostnameisnaam van huidigepublieksroute, nieteenanderedataset.

VERIFIED: media.stage.xxtract.com health200; naamnaarBanana188.245.118.226, media-server-xscs... MONGO_URL46.224.119.158/application en mount/media/Xmedia. De reedsgebruikte productie-trainingsmanifesten verwijzennaarzelfdemedia.stagehost. media.xxtract.com heeftgeenDNSresultaat indezecontrole.

INFERENCE: voorlogoRecognitionproductie moetde huidige gedeeldeproductiebronroute worden gebruikt, met exactebeperkte uitzonderingen in bronvalidator. Dit raaktgeenbestaandedatabases/broncontainers. AlleenMEDIASERVER_DOMAIN exacthttps://media.stage.xxtract.com enCATALOG_API_BASE exacthttps://catalog.stage.xxtract.com toestaan; andereACC/stageroutesblijvengeweigerd. Leg deze concreteinrichting vastnaastalgemenenaamconventie.

Authenticatie: centraleproductieportal gebruikt46.224.119.158/xxtractdb03. ACCauthverbinding10.0.0.6mag nietmee; maakapartereadonlyidentity vanafBanana10.0.0.2 alleenSELECTopusers. Geenportaalusers/wachtwoordenwijzigen.
