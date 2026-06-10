-- 0011: align Nutri-Score reference logos with the correct GS1 codelist name.
--
-- Migration 0010 set the Nutri-Score A–E logos to fieldType
-- 'NutritionalProgramCode'. That codelist actually holds program identifiers
-- (values 1–10); the A–E grades live in the separate GS1 codelist
-- 'NutritionalScore' (gs1_field = 'nutritionalScore', unchanged). This corrects
-- the codelist name so reference_logos.field_type == the GS1-codelijstnaam 1:1.
--
-- Idempotent; gs1_field stays 'nutritionalScore'.
UPDATE reference_logos
SET field_type = 'NutritionalScore'
WHERE field_type = 'NutritionalProgramCode';
