/**
 * ATDD red-phase scaffold — Story 16.3: Datakwaliteitsrapport "gevonden-niet-gedeclareerd"
 *
 * Alle tests zijn it.todo (red phase). Beoogd endpoint:
 * GET /api/v1/flywheel/reports/data-quality (JSON + CSV-export).
 */
import { describe, it } from 'vitest';

describe('Story 16.3 — Datakwaliteitsrapport gevonden-niet-gedeclareerd (RED)', () => {
  it.todo(
    'AC1: rapport over found-not-declared-events van een periode is gegroepeerd per GLN (GLN=null => groep "onbekend") met per geval GTIN, code, confidence en bronbestand; exporteerbaar als CSV-download naast JSON via reports/data-quality met periode-parameters en optionele GLN-filter; leeg-rapport-pad geeft geldige lege respons'
  );

  it.todo(
    'AC2: bronrestrictie (NFR-6, hard) — rapport en export bevatten uitsluitend eigen crops (artwork-crops/-paden); een event met een reference-logos/-pad wordt door een expliciete guard geweigerd/gefilterd met gelogde waarschuwing en verschijnt aantoonbaar niet in de payload'
  );
});
