/**
 * Verhaal 1.7 — zoekruimte beperken op GPC-productcategorie (FR-4, AD-2).
 * Een soort valt alleen af als de omzettabel categorieen kent en de gpc-code met geen enkele prefix begint.
 */
import { findGs1Entry } from './gs1-mapping';

export interface Zoekruimte { gpcCategoryCode?: string; beperkt: boolean; aantalSoorten: number }

export const isGpcCode = (c: unknown): c is string => typeof c === 'string' && /^\d{8}$/.test(c);

export function beperkSoorten(codes: string[], gpc: string | undefined, lookup: typeof findGs1Entry = findGs1Entry): { codes: string[]; zoekruimte: Zoekruimte } {
  if (!isGpcCode(gpc)) return { codes, zoekruimte: { beperkt: false, aantalSoorten: codes.length } };
  const kept = codes.filter((c) => {
    const cat = lookup(c)?.categorieen ?? [];
    return cat.length === 0 || cat.some((p) => gpc.startsWith(p));
  });
  return { codes: kept, zoekruimte: { gpcCategoryCode: gpc, beperkt: kept.length < codes.length, aantalSoorten: kept.length } };
}
