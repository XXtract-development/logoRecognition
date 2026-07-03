/**
 * Story 15.1 — FlywheelThemeProvider (gescopeerde XXtract-theming, AC1).
 *
 * Dekt: de wrapper rendert zijn children (subtree), en de bindende
 * DESIGN.md-tokenset bevat de exacte XXtract-hexwaarden (navy primair, teal
 * links, groen succes, amber waarschuwing, rood alleen fout) op Inter 14px —
 * géén antd-defaultblauw.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FlywheelThemeProvider, FLYWHEEL_THEME_TOKENS } from './FlywheelThemeProvider';

describe('FlywheelThemeProvider (Story 15.1, AC1)', () => {
  it('rendert zijn children binnen de gescopeerde subtree', () => {
    render(
      <FlywheelThemeProvider>
        <div data-testid="flywheel-child">inhoud</div>
      </FlywheelThemeProvider>
    );
    expect(screen.getByTestId('flywheel-child')).toBeInTheDocument();
  });

  it('gebruikt de exacte XXtract-tokens (navy primair, teal links, geen antd-blauw)', () => {
    expect(FLYWHEEL_THEME_TOKENS.colorPrimary).toBe('#2F5A7A'); // navy
    expect(FLYWHEEL_THEME_TOKENS.colorLink).toBe('#54949E'); // teal
    expect(FLYWHEEL_THEME_TOKENS.colorSuccess).toBe('#B7D945'); // groen
    expect(FLYWHEEL_THEME_TOKENS.colorWarning).toBe('#E6A817'); // amber
    expect(FLYWHEEL_THEME_TOKENS.colorError).toBe('#D64545'); // rood
    expect(FLYWHEEL_THEME_TOKENS.fontSize).toBe(14);
    expect(FLYWHEEL_THEME_TOKENS.fontFamily).toContain('Inter');
    // Geen antd-defaultblauw #1677ff / #007AFF in de flywheel-subtree.
    expect(FLYWHEEL_THEME_TOKENS.colorPrimary).not.toBe('#007AFF');
    expect(FLYWHEEL_THEME_TOKENS.colorPrimary).not.toBe('#1677ff');
  });
});
