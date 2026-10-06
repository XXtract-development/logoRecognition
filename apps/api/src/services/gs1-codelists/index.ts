/**
 * Verhaal 1.6 — GS1-codelijsten (FR-12, AD-10). Afgeleid bestand, gegenereerd door scripts/generate-gs1-codelists.py.
 */
import data from './gs1-codelists-3.1.37.1.json';

export const GS1_RELEASE: string = data.release;
export const GS1_SOURCE_SHA256: string = data.bronSha256;

/** Veldnaam in de omzettabel -> lijstnaam in de GS1-release. */
export const GS1_FIELD_LISTS: Record<string, string> = {
  packagingMarkedLabelAccreditationCode: 'PackagingMarkedLabelAccreditationCode',
  dietTypeCode: 'DietTypeCode',
  gHSSymbolDescriptionCode: 'GHSSymbolDescriptionCode',
  enumerationValue: 'EU_consumerUsageLabelCodeList',
  nutritionalProgramCode: 'NutritionalProgramCode',
  /** Geen GS1-codelijst maar de constante `nutritionalScore` in het JSON. */
  nutritionalScore: 'nutritionalScore',
};

const lists = data.lijsten as Record<string, string[]>;
const sets = new Map(Object.entries(lists).map(([k, v]) => [k, new Set(v)]));
sets.set('nutritionalScore', new Set(data.nutritionalScore.waarden));

export function getCodelist(name: string): readonly string[] {
  return name === 'nutritionalScore' ? data.nutritionalScore.waarden : (lists[name] ?? []);
}

export function isValidGs1Value(veld: string, waarde: string): boolean {
  if (veld === 'isDietTypeMarkedOnPackage') return waarde === 'true' || waarde === 'false';
  const list = GS1_FIELD_LISTS[veld];
  return !!list && !!sets.get(list)?.has(waarde);
}
