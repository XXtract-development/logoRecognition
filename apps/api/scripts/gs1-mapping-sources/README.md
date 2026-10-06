# Bronnen van `gs1-mapping.json`

Het JSON wordt nooit met de hand bewerkt: pas een bron hier aan en draai `node apps/api/scripts/generate-gs1-mapping.js`.

## `categorieen-overrides.json` (Verhaal 1.7)

Per categorie een lijst GPC-prefixen (2/4/6/8 cijfers: segment/family/class/brick). Een soort met gevulde `categorieen`
wordt alleen gezocht als de `gpcCategoryCode` van de aanvraag met een van die prefixen begint. Leeg = altijd zoeken.

Gevuld is alleen wat zeker is: Nutri-Score (NUTRISCORE_A..E) krijgt `["50"]` (segment Voeding/Drank/Tabak). Dieetsoorten (`DietTypeCode`) blijven bewust leeg (besluit Friso 2026-10-06): dieetlogo's kunnen ook op supplementen, verzorging of dierenvoeding staan; ze worden pas beperkt na de meting op ACC.
Gevaarsymbolen (GHS) en alle overige soorten blijven leeg: een gemist gevaarsymbool is onaanvaardbaar en de
GPC-dekking van keurmerken is niet bewezen. Een prefix toevoegen vraagt een meting (zie `scripts/meet-zoekruimte.ts`).

De overrides werken per categorie (`NutritionalScore`, `DietTypeCode`, ...), niet per soort. Een wijziging verandert `policyVersion`
(hash van het bestand); afnemers die die waarde pinnen moeten hem bijwerken.
