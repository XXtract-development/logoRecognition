-- Story 12.x — align reference_logos.field_type to the GS1 codelist names
-- (1:1 with GS1) and add gs1_field (the GS1 declaration element) for crosscheck.
-- Backward-compatible: no runtime query filters on field_type. Idempotent.

ALTER TABLE reference_logos ALTER COLUMN field_type TYPE VARCHAR(60);
ALTER TABLE reference_logos ALTER COLUMN field_type SET DEFAULT 'PackagingMarkedLabelAccreditationCode';
ALTER TABLE reference_logos ADD COLUMN IF NOT EXISTS gs1_field VARCHAR(60);

-- rename the legacy enum values to the GS1 codelist names + set the GS1 field
UPDATE reference_logos SET field_type = 'PackagingMarkedLabelAccreditationCode',
       gs1_field = 'packagingMarkedLabelAccreditationCode'
 WHERE field_type = 'ACCREDITATION';

UPDATE reference_logos SET field_type = 'NutritionalProgramCode',
       gs1_field = 'nutritionalScore'
 WHERE field_type = 'NUTRITIONAL';
