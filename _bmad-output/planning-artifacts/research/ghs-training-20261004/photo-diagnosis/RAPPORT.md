# Herkenning op productfoto’s

Schaduw en kromming van etiketten verstoorden de uitsnede van pictogrammen voordat het getrainde model ze kon beoordelen. De verbetering corrigeert uitsluitend geldige gesloten rode ruiten en scheidt het donkere symbool van de neutrale achtergrond. Hetzelfde model en dezelfde acceptatiegrenzen blijven gelden.

Op drie oorspronkelijke productfoto’s worden nu zeven van zeven AI-gelabelde pictogrammen correct en zonder onzekerheidsmarkering herkend bij grens0,87, tegenover drie eerder. Een verkleinde variant van één van deze foto’s geeft drie van drie tegenover één eerder; dit is geen extra onafhankelijke productfamilie. De eerdere34 productobjecten en18 nieuwe SDS-productobjecten blijven correct. Een ADR-transportteken wordt niet als GHS voorgesteld.

Een eerste meting vond één nieuw onzeker voorstel op een zeer klein ingrediëntsymbool. Die misser is bewaard en onderzocht voordat de herstelregel is aangepast: fotoherstel vereist32 echte beeldpixels per as. De gewone eerdere route blijft16 pixels ondersteunen. De vervolgmeting toont geen nieuwe extra voorstellen op de aanvullende SDS-pagina’s. Eén eerder bestaand onzeker klein-objectvoorstel blijft zichtbaar.

197 gerichte Pythoncontroles slagen, inclusief45 specialistcontroles. De modelhash blijft8d989fa8e183fd83f1921f0fdf60167c2ac6658bfbcdfaa49421407a186dfd7d. Onderzoek, eerste misser, vervolgmeting en producthashes worden behouden. Onafhankelijke codecontrole heeft geen open materiële bevindingen.

Alle bekeken bronnen zijn ontwikkelgegevens met AI-voorstellen, zonder menselijke definitieve annotaties. De onafhankelijke eindtest met20 productfamilies per pictogram en100 negatieve families ontbreekt nog. De hier beschreven resultaten zijn lokaal; ACC-uitrol en werkelijke API-controle volgen afzonderlijk.
