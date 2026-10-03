/** Canonical reference category data shared with the Python ML runtime. */
import mapping from './reference-code-mapping.json';
export const DEFAULT_FIELD_TYPE = mapping.default.fieldType;
export const DEFAULT_GS1_FIELD = mapping.default.gs1Field;
export const GS1_FIELD_BY_FIELD_TYPE: Record<string, string> = {
  [DEFAULT_FIELD_TYPE]: DEFAULT_GS1_FIELD,
  ...Object.fromEntries(Object.entries(mapping.categories).map(([field, group]) => [field, group.gs1Field])),
};
const SPECIFIC_FIELD_TYPES_BY_CODE: Record<string, string[]> = {};
for (const [field, group] of Object.entries(mapping.categories)) {
  for (const code of group.codes) {
    (SPECIFIC_FIELD_TYPES_BY_CODE[code] ??= []).push(field);
  }
}
const DEFAULT_OVERLAP_CODES = new Set<string>(mapping.defaultOverlapCodes);

export type FieldTypeResolutionKind = 'default' | 'unique' | 'default-overlap-resolved' | 'unresolved';

export interface FieldTypeResolution {
  /** De genormaliseerde (trim + uppercase) code waarop is geresolved. */
  code: string;
  /** Geresolveerde fieldType, of `null` als de ambiguïteit NIET is opgelost (AC2). */
  fieldType: string | null;
  /** Bijbehorend GS1-declaratieveld, of `null` naast een niet-opgeloste fieldType. */
  gs1Field: string | null;
  /** True zodra de code in meer dan één codelijst voorkomt (opgelost of niet). */
  ambiguous: boolean;
  resolution: FieldTypeResolutionKind;
  /** Uitleg van de toegepaste regel/tiebreak, of de reden dat niet gezet is. */
  note: string | null;
}

/**
 * PURE classificatie (testbaar met geïnjecteerde lookups — zo is ook de
 * "twee specifieke codelijsten botsen"-tak (vandaag onbereikbaar met de echte
 * data) rechtstreeks te unit-testen zonder data te verzinnen die niet bestaat).
 */
export function classifyCode(
  code: string,
  specificFieldTypesFor: (code: string) => string[],
  isDefaultOverlap: (code: string) => boolean
): FieldTypeResolution {
  const specific = specificFieldTypesFor(code);

  if (specific.length === 0) {
    return {
      code,
      fieldType: DEFAULT_FIELD_TYPE,
      gs1Field: DEFAULT_GS1_FIELD,
      ambiguous: false,
      resolution: 'default',
      note: null,
    };
  }

  if (specific.length > 1) {
    return {
      code,
      fieldType: null,
      gs1Field: null,
      ambiguous: true,
      resolution: 'unresolved',
      note: `Code komt voor in meerdere specifieke codelijsten (${specific.join(', ')}) — handmatige beslissing nodig, niet gezet.`,
    };
  }

  const fieldType = specific[0];
  const gs1Field = GS1_FIELD_BY_FIELD_TYPE[fieldType] ?? null;

  if (isDefaultOverlap(code)) {
    return {
      code,
      fieldType,
      gs1Field,
      ambiguous: true,
      resolution: 'default-overlap-resolved',
      note:
        `Code komt ook voor in het T3777-default-universum (${DEFAULT_FIELD_TYPE}); ` +
        `primaire regel "specifieke codelijst wint van de generieke default" toegepast → ${fieldType}.`,
    };
  }

  return { code, fieldType, gs1Field, ambiguous: false, resolution: 'unique', note: null };
}

/** Resolve een losse code naar zijn `field_type`/`gs1_field` (echte statische data). */
export function normalizeReferenceCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  return (mapping.aliases as Record<string, string>)[normalized] ?? normalized;
}
export function isGhsCode(code: string): boolean {
  return mapping.categories.GHSSymbolDescriptionCode.codes.includes(normalizeReferenceCode(code)) && normalizeReferenceCode(code) !== 'NO_PICTOGRAM';
}
export function assertPositiveReferenceCode(code: string): void {
  const normalized = normalizeReferenceCode(code);
  if (normalized === 'NO_PICTOGRAM' || /^GHS\d+$/.test(normalized)) throw new Error('Not a positive GHS reference class');
}

export function resolveFieldType(code: string): FieldTypeResolution {
  if (typeof code !== 'string' || !code.trim()) throw new Error('Reference code must be a nonempty string');
  const normalized = normalizeReferenceCode(code);
  return classifyCode(
    normalized,
    (c) => SPECIFIC_FIELD_TYPES_BY_CODE[c] ?? [],
    (c) => DEFAULT_OVERLAP_CODES.has(c)
  );
}
