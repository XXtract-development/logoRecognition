# Reference library seed artwork (Epic 7, Story 7.3)

Drop official keurmerk PNG artwork here, one file per T3777 class:

```
apps/api/seeds/reference-logos/<T3777_CODE>.png
```

Example: `EU_ORGANIC_FARMING.png`, `GREEN_DOT.png`, ...

The seed script `apps/api/scripts/seed-reference-logos.ts` reads these files and
uploads them through the same storage + database path as the upload API
(`reference-logos/{code}/{variantLabel}.png`, variant label `default`).

Collecting the official PNGs and recording their source is a deliberate
human/agent task — **source attribution is mandatory per keurmerk**. Any class
without a PNG is reported and skipped (soft fail); the script never hard-fails
on a missing file, so a partial library is valid.

Top-20 classes (descending pilot volume):
RECYCLABLE_GENERAL_CLAIM, GREEN_DOT, EUROPEAN_V_LABEL_VEGETARIAN,
FOREST_STEWARDSHIP_COUNCIL_MIX, EUROPEAN_V_LABEL_VEGAN, RAINFOREST_ALLIANCE,
EUROPEAN_VEGETARIAN_UNION, AISE, BEWUSTE_KEUZE, GHS07, GHS02, BLUE_ANGEL,
EU_ORGANIC_FARMING, FREE_FROM_GLUTEN, RETURNABLE_PET_BOTTLE_NL, GHS05,
TNO_APPROVED, MADE_OF_PLASTIC_BEVERAGE_CUPS, BETER_LEVEN_1_STER, DZG_GLUTEN_FREE
