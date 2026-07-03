/**
 * FlywheelThemeProvider (Story 15.1, AC1) — GESCOPEERDE XXtract-theming.
 *
 * Een geneste antd 5 `ConfigProvider` die UITSLUITEND de /flywheel-subtree
 * hertheme't met de XXtract-tokens uit de UX-DESIGN.md-frontmatter (navy primair,
 * teal links, groen succes, amber waarschuwing, rood uitsluitend echte fouten,
 * Inter 14px). Antd 5 ondersteunt geneste ConfigProviders: deze wrapper erft de
 * app-brede provider (App.tsx) en overschrijft alleen binnen zijn eigen subtree.
 *
 * Bewust BUITEN scope (PRD §5-non-goal, UX-DR1): een app-brede retheme. De
 * app-brede ConfigProvider in App.tsx (colorPrimary #007AFF, fontSize 16) blijft
 * ongewijzigd; bestaande schermen (Home, Review, Dashboard) renderen
 * pixel-ongewijzigd omdat deze wrapper alleen rond de flywheel-children hangt.
 *
 * De tokenwaarden zijn de bindende DESIGN.md-set — géén nieuwe hexwaarden en
 * géén antd-defaultblauw binnen de subtree.
 */

import React from 'react';
import { ConfigProvider, theme } from 'antd';

/**
 * XXtract Design System v3-tokens (DESIGN.md-frontmatter, bindend).
 * Kleursemantiek (UX-DR5): amber = quarantaine/wachtend (géén fout); rood
 * uitsluitend voor regressie-alarm en automatische stilstand.
 */
export const FLYWHEEL_THEME_TOKENS = {
  colorPrimary: '#2F5A7A', // Navy — navigatie, primaire acties
  colorSuccess: '#B7D945', // Groen — gepasseerd / gepromoveerd
  colorWarning: '#E6A817', // Amber — quarantaine / wacht op mens
  colorError: '#D64545', // Rood — uitsluitend regressie-alarm en stilstand
  colorLink: '#54949E', // Teal — links, informatief
  colorText: '#1E293B', // Primaire tekst — nooit hard zwart
  colorBorder: '#E2E8F0',
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontSize: 14,
  borderRadius: 8, // buttons, inputs, nav-items (DESIGN.md §Shapes)
} as const;

interface FlywheelThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Wrap alle flywheel-UI in de gescopeerde XXtract-theming. Forceert het
 * lichte antd-algoritme: het vliegwiel-dashboard is een licht besturingsscherm
 * (app-bg #EDF1F7 achter witte cards), onafhankelijk van de globale dark-mode
 * van de rest van de app.
 */
export const FlywheelThemeProvider: React.FC<FlywheelThemeProviderProps> = ({
  children,
}) => {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: { ...FLYWHEEL_THEME_TOKENS },
        components: {
          // DESIGN.md §Shapes: cards 12px, controls 8px.
          Card: { borderRadiusLG: 12 },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
};

export default FlywheelThemeProvider;
