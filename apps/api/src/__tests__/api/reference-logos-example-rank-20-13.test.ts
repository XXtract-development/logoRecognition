/**
 * Story 20.13 — het VOORBEELDlogo wordt gekozen op HERKOMST, niet op alfabet.
 *
 * Voorheen koos het endpoint `findFirst({ orderBy: { variantLabel: 'asc' } })`.
 * Gemeten op ACC (2026-07-27): 9 van de 53 codes met een gidslogo toonden iets
 * anders, langs twee patronen die deze suite allebei vastlegt:
 *   - `auto-…` sorteert vóór `gs1-guide`  (RECYCLABLE_GENERAL_CLAIM → leeg vakje)
 *   - `default` sorteert vóór `gs1-guide` (EU_ORGANIC_FARMING → wikimedia i.p.v. GS1)
 */

import { describe, it, expect } from 'vitest';
import { exampleSourceRank } from '../../api/v1/reference-logos';

const GIDS = 'gs1-packaging-label-guide';
const NUTRI_ZAAD = 'synthetic-nutriscore-bootstrap';
const MENS = 'review-confirmed';
const POC = 'realref-live-poc';
const VLIEGWIEL = 'flywheel-promotion';
const WIKI = 'https://commons.wikimedia.org/wiki/File:The_Green_Dot.svg';

/** Kies zoals het endpoint doet: laagste rang wint, bij gelijkspel de eerste. */
function pick<T extends { source: string | null }>(refs: T[]): T {
  return refs.reduce((best, r) =>
    exampleSourceRank(r.source) < exampleSourceRank(best.source) ? r : best
  );
}

describe('AC1 — rangorde op herkomst', () => {
  it('officieel zaadlogo staat bovenaan', () => {
    expect(exampleSourceRank(GIDS)).toBe(0);
    expect(exampleSourceRank(NUTRI_ZAAD)).toBe(0);
  });

  it('mens-bevestigd komt vóór de overige echte crops', () => {
    expect(exampleSourceRank(MENS)).toBeLessThan(exampleSourceRank(POC));
    expect(exampleSourceRank(MENS)).toBeLessThan(exampleSourceRank(VLIEGWIEL));
  });

  it('wikimedia en source:null staan onderaan', () => {
    expect(exampleSourceRank(WIKI)).toBe(3);
    expect(exampleSourceRank(null)).toBe(3);
    expect(exampleSourceRank(undefined)).toBe(3);
    // ...maar ze worden NIET weggefilterd: een code met alleen zulke rijen
    // houdt een voorbeeld (anders zou een notIn-filter ze stil laten vallen).
    expect(pick([{ source: WIKI }, { source: null }]).source).toBe(WIKI);
  });
});

describe('AC2 — de gemeten productiegevallen', () => {
  it('RECYCLABLE_GENERAL_CLAIM: gidslogo wint van de auto-crop', () => {
    // variantLabels: auto-788eeea6-4 (a) sorteerde vóór gs1-guide (g).
    const refs = [
      { variantLabel: 'auto-788eeea6-4', source: VLIEGWIEL },
      { variantLabel: 'gs1-guide', source: GIDS },
      { variantLabel: 'real-crop:d1', source: POC },
    ];
    expect(pick(refs).variantLabel).toBe('gs1-guide');
  });

  it('EU_ORGANIC_FARMING: gidslogo wint van de wikimedia-default', () => {
    const refs = [
      { variantLabel: 'default', source: WIKI },
      { variantLabel: 'gs1-guide', source: GIDS },
    ];
    expect(pick(refs).variantLabel).toBe('gs1-guide');
  });

  it('TRIMAN: idem, ongeacht de volgorde waarin de rijen binnenkomen', () => {
    const a = [
      { variantLabel: 'auto-788eeea6-5', source: VLIEGWIEL },
      { variantLabel: 'gs1-guide', source: GIDS },
    ];
    const b = [...a].reverse();
    expect(pick(a).variantLabel).toBe('gs1-guide');
    expect(pick(b).variantLabel).toBe('gs1-guide');
  });
});

describe('AC3 — codes zonder gidslogo blijven werken', () => {
  it('PREGNANCY_WARNING-achtig: mens-bevestigde crop wordt getoond', () => {
    // Deze code heeft géén gidslogo (staat niet in de GS1-gids).
    const refs = [
      { variantLabel: 'auto-1', source: VLIEGWIEL },
      { variantLabel: 'crop-9', source: MENS },
      { variantLabel: 'poc-2', source: POC },
    ];
    expect(pick(refs).variantLabel).toBe('crop-9');
  });

  it('alleen auto-crops: dan die, geen 404-situatie', () => {
    const refs = [{ variantLabel: 'auto-1', source: VLIEGWIEL }];
    expect(pick(refs).variantLabel).toBe('auto-1');
  });
});

describe('AC5 — deterministisch', () => {
  it('bij gelijke herkomst wint de eerste (variantLabel asc uit de query)', () => {
    const refs = [
      { variantLabel: 'gs1-guide', source: GIDS },
      { variantLabel: 'gs1-guide-1', source: GIDS },
    ];
    expect(pick(refs).variantLabel).toBe('gs1-guide');
    // Twee identieke aanroepen geven hetzelfde resultaat.
    expect(pick(refs).variantLabel).toBe(pick(refs).variantLabel);
  });
});
