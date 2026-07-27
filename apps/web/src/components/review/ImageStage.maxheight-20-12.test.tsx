/**
 * Story 20.12 — het review-deck toont het artwork paginabreed.
 *
 * Twee begrenzingen bepaalden de oude, kleine weergave:
 *   - `ImageStage` zette `maxHeight: '64vh'` op ZOWEL de container ALS de <img>;
 *     één van de twee aanpassen laat de andere hem alsnog begrenzen (halve fix);
 *   - de deck-container op de reviewpagina stond op 880px.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ImageStage from './ImageStage';

describe('AC1/AC2 — instelbare beeldhoogte', () => {
  it('default blijft 64vh, zodat andere gebruikers ongemoeid blijven', () => {
    const { getByTestId } = render(
      <ImageStage data-testid="stage" src="/x.png" alt="x" />
    );
    const container = getByTestId('stage');
    expect(container.style.maxHeight).toBe('64vh');
  });

  it('een meegegeven maxHeight geldt voor de container', () => {
    const { getByTestId } = render(
      <ImageStage data-testid="stage" src="/x.png" alt="x" maxHeight="calc(100vh - 260px)" />
    );
    expect(getByTestId('stage').style.maxHeight).toBe('calc(100vh - 260px)');
  });

  it('BEIDE begrenzingen schuiven mee — container én de afbeelding zelf', () => {
    // Dit is de kern: alleen de container verruimen laat de <img> hem
    // terugklemmen op 64vh, en het beeld blijft dan even klein.
    const { getByTestId, container } = render(
      <ImageStage data-testid="stage" src="/x.png" alt="x" maxHeight="calc(100vh - 260px)" />
    );
    const img = container.querySelector('img') as HTMLImageElement;
    expect(getByTestId('stage').style.maxHeight).toBe('calc(100vh - 260px)');
    expect(img.style.maxHeight).toBe('calc(100vh - 260px)');
    expect(img.style.maxHeight).not.toBe('64vh');
  });

  it('de hoogte is gereserveerd in pixels, niet als percentage', () => {
    // Een vh-breuk (bv. 80vh) duwt op een laag scherm de actieknoppen weg en laat
    // op een hoog scherm ruimte liggen; de chrome kost een vast aantal pixels.
    const { getByTestId } = render(
      <ImageStage data-testid="stage" src="/x.png" alt="x" maxHeight="calc(100vh - 260px)" />
    );
    const mh = getByTestId('stage').style.maxHeight;
    expect(mh).toContain('calc(');
    expect(mh).toContain('px');
  });
});
