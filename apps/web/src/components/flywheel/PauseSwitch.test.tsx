/**
 * Story 15.4 — PauseSwitch (pauzebediening).
 *
 * Dekt (AC 3/4):
 *  - omzetten opent altijd een bevestigingsmodal met de consequentie-tekst;
 *  - de hervat-modal waarschuwt over openstaande quarantaines ZONDER te blokkeren;
 *  - pauzeren/hervatten roepen de juiste service-functie aan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, opts?: Record<string, unknown> & { defaultValue?: string }) => {
      let s = opts?.defaultValue ?? _k;
      if (opts) for (const [k, v] of Object.entries(opts)) if (k !== 'defaultValue') s = s.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
      return s;
    },
    i18n: { language: 'nl', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const pauseFlywheel = vi.fn();
const resumeFlywheel = vi.fn();
vi.mock('@/services/flywheelService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/flywheelService')>();
  return {
    ...actual,
    pauseFlywheel: (...a: unknown[]) => pauseFlywheel(...a),
    resumeFlywheel: (...a: unknown[]) => resumeFlywheel(...a),
  };
});

import { PauseSwitch } from './PauseSwitch';

function renderSwitch(props: { paused: boolean; openQuarantines: number; auto?: boolean }) {
  return render(
    <App>
      <PauseSwitch {...props} />
    </App>
  );
}

beforeEach(() => {
  pauseFlywheel.mockReset().mockResolvedValue({ paused: true, reason: null, since: null, by: 'sanne', openQuarantines: null });
  resumeFlywheel.mockReset().mockResolvedValue({ paused: false, reason: null, since: null, by: 'sanne', openQuarantines: 2 });
});

describe('PauseSwitch (AC 3/4)', () => {
  it('toont "Vliegwiel actief" wanneer niet gepauzeerd', () => {
    renderSwitch({ paused: false, openQuarantines: 0 });
    expect(screen.getByText('Vliegwiel actief')).toBeInTheDocument();
  });

  it('omzetten naar pauze opent de bevestigingsmodal met de consequentie-tekst', async () => {
    const user = userEvent.setup();
    renderSwitch({ paused: false, openQuarantines: 0 });
    await user.click(screen.getByTestId('pause-toggle'));
    expect(await screen.findByTestId('pause-confirm-modal')).toBeInTheDocument();
    expect(screen.getByTestId('pause-consequence')).toHaveTextContent(
      'Nominatie en promotie stoppen; detectie en trainingsdata-registratie lopen door.'
    );
  });

  it('bevestigen roept pauseFlywheel aan', async () => {
    const user = userEvent.setup();
    renderSwitch({ paused: false, openQuarantines: 0 });
    await user.click(screen.getByTestId('pause-toggle'));
    await screen.findByTestId('pause-confirm-modal');
    await user.click(screen.getByTestId('pause-confirm-ok').closest('button')!);
    await waitFor(() => expect(pauseFlywheel).toHaveBeenCalled());
  });

  it('hervat-modal waarschuwt over openstaande quarantaines zonder te blokkeren', async () => {
    const user = userEvent.setup();
    renderSwitch({ paused: true, openQuarantines: 2 });
    await user.click(screen.getByTestId('pause-toggle'));
    expect(await screen.findByTestId('resume-modal')).toBeInTheDocument();
    expect(screen.getByTestId('resume-quarantine-warning')).toHaveTextContent(
      '2 batches wachten nog op jouw beoordeling.'
    );
    // De hervat-knop is beschikbaar (blokkeert niet).
    const resumeOk = screen.getByTestId('resume-confirm-ok').closest('button')!;
    expect(resumeOk).not.toBeDisabled();
    await user.click(resumeOk);
    await waitFor(() => expect(resumeFlywheel).toHaveBeenCalled());
  });

  it('toont "Gepauzeerd (automatisch)" bij een automatische stilstand', () => {
    renderSwitch({ paused: true, openQuarantines: 0, auto: true });
    expect(screen.getByText('Gepauzeerd (automatisch)')).toBeInTheDocument();
  });
});
