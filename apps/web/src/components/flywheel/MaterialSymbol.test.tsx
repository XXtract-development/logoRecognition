/**
 * Story 15.1 — MaterialSymbol (Material Symbols Outlined-icoon via ligature).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MaterialSymbol } from './MaterialSymbol';

describe('MaterialSymbol (Story 15.1)', () => {
  it('rendert de ligature-naam met de material-symbol-utility', () => {
    render(<MaterialSymbol name="autorenew" />);
    const el = screen.getByText('autorenew');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('material-symbol');
    expect(el).toHaveAttribute('data-icon', 'autorenew');
    // Decoratief: standaard aria-hidden zodat het icoon geen ruis geeft.
    expect(el).toHaveAttribute('aria-hidden', 'true');
  });

  it('respecteert size, className en aria-hidden overrides', () => {
    render(
      <MaterialSymbol name="tune" size={24} className="extra" aria-hidden={false} />
    );
    const el = screen.getByText('tune');
    expect(el.style.fontSize).toBe('24px');
    expect(el.className).toContain('extra');
    expect(el).toHaveAttribute('aria-hidden', 'false');
  });
});
