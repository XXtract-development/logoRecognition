/**
 * Kleursemantiek-tokens (UX-DR5, DESIGN.md) — de bindende statuskleuren van het
 * vliegwiel-dashboard. Eén bron zodat geen paneel per ongeluk antd-blauw of een
 * eigen hex introduceert.
 *
 * KRITIEK (UX-DR5): amber = quarantaine/wachtend/aan-cap/openstaande outliers —
 * GÉÉN fout; rood UITSLUITEND het regressie-meetpunt in de trend en de stilstand-
 * banner (15.4). Afkeur-/deactiveer-knoppen zijn in ruststand nooit rood.
 */

export const FLYWHEEL_COLORS = {
  primary: '#2F5A7A',
  primaryHover: '#245068',
  primaryLight: '#E8F0F5',
  primaryFaint: '#F2F7FA',
  secondary: '#54949E',
  secondaryLight: '#EBF5F6',
  success: '#B7D945',
  successDark: '#8AAE1F',
  successLight: '#F4FADF',
  warning: '#E6A817',
  warningLight: '#FDF6E3',
  warningText: '#92600A', // amber-tekst op lichte achtergrond (contrast, UX-DR9)
  destructive: '#D64545',
  destructiveLight: '#FDE8E8',
  background: '#FFFFFF',
  backgroundMuted: '#F8FAFB',
  border: '#E2E8F0',
  borderSoft: '#EBF0F6',
  foreground: '#1E293B',
  foregroundHeading: '#2F5A7A',
  foregroundMuted: '#64748B',
  appBg: '#EDF1F7',
  neutralBadgeBg: '#F1F5F9',
  neutralBadgeText: '#64748B',
} as const;

/** Semantische badge-tint (dot/icoon + tekst — nooit kleur als enige kanaal). */
export type BadgeTone = 'ok' | 'warn' | 'info' | 'neutral' | 'alarm';

export function badgeStyle(tone: BadgeTone): { background: string; color: string; dot: string } {
  switch (tone) {
    case 'ok':
      return { background: FLYWHEEL_COLORS.successLight, color: FLYWHEEL_COLORS.successDark, dot: FLYWHEEL_COLORS.successDark };
    case 'warn':
      return { background: FLYWHEEL_COLORS.warningLight, color: FLYWHEEL_COLORS.warningText, dot: FLYWHEEL_COLORS.warning };
    case 'info':
      return { background: FLYWHEEL_COLORS.secondaryLight, color: FLYWHEEL_COLORS.secondary, dot: FLYWHEEL_COLORS.secondary };
    case 'alarm':
      return { background: FLYWHEEL_COLORS.destructiveLight, color: FLYWHEEL_COLORS.destructive, dot: FLYWHEEL_COLORS.destructive };
    case 'neutral':
    default:
      return { background: FLYWHEEL_COLORS.neutralBadgeBg, color: FLYWHEEL_COLORS.neutralBadgeText, dot: '#94A3B8' };
  }
}
