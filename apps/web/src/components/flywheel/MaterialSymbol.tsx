/**
 * MaterialSymbol (Story 15.1) — rendert een Material Symbols Outlined-icoon via
 * de ligature-conventie (DESIGN.md §Typography, iconen fill 0).
 *
 * Het font wordt geladen in index.html; de `.material-symbol`-utility staat in
 * globals.css. Gebruikt voor het `autorenew`-nav-icoon en (later) flywheel-
 * iconen. Bewust een dun component: geen dependency op een icoon-library voor
 * Material Symbols (@ant-design/icons blijft voor antd-interne iconen).
 */

import React from 'react';

interface MaterialSymbolProps {
  /** Ligature-naam van het icoon, bijv. "autorenew". */
  name: string;
  /** Fontgrootte in px (DESIGN.md: 16–18px in antd-context). */
  size?: number;
  style?: React.CSSProperties;
  className?: string;
  'aria-hidden'?: boolean;
}

export const MaterialSymbol: React.FC<MaterialSymbolProps> = ({
  name,
  size = 18,
  style,
  className,
  'aria-hidden': ariaHidden = true,
}) => {
  return (
    <span
      className={className ? `material-symbol ${className}` : 'material-symbol'}
      style={{ fontSize: size, ...style }}
      aria-hidden={ariaHidden}
      data-icon={name}
    >
      {name}
    </span>
  );
};

export default MaterialSymbol;
