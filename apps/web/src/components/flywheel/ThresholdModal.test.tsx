/**
 * Story 15.4 — ThresholdModal (drempelbeheer-UI).
 *
 * Dekt (AC 2, UX-DR7):
 *  - opslaan disabled zolang de reden leeg is (verplicht-redenveld-blokkade);
 *  - per-methode-drempels (template/embedding/classifier) elk afzonderlijk;
 *  - de vaste audittrail-hint;
 *  - de wijzigingshistorie zichtbaar in de modal;
 *  - een geslaagde wijziging roept changeThreshold met (methode, waarde, reden) aan.
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

const fetchThresholds = vi.fn();
const changeThreshold = vi.fn();
vi.mock('@/services/flywheelService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/flywheelService')>();
  return {
    ...actual,
    fetchThresholds: (...a: unknown[]) => fetchThresholds(...a),
    changeThreshold: (...a: unknown[]) => changeThreshold(...a),
  };
});

import { ThresholdModal } from './ThresholdModal';

const VIEW = {
  methods: [
    { method: 'template', value: 0.9, envValue: 0.9, source: 'default', min: 0.5, max: 0.99, step: 0.01 },
    { method: 'embedding', value: 0.92, envValue: 0.9, source: 'override', min: 0.5, max: 0.99, step: 0.01 },
    { method: 'classifier', value: 0.9, envValue: 0.9, source: 'default', min: 0.5, max: 0.99, step: 0.01 },
  ],
  history: [
    {
      id: 'tc-1',
      thresholdKey: 'flywheel.promotionThreshold.embedding',
      method: 'embedding',
      oldValue: '0.9',
      newValue: '0.92',
      reason: 'twee besmette batches',
      userId: 'sanne',
      changedAt: '2026-07-03T09:00:00Z',
    },
  ],
};

function renderModal() {
  return render(
    <App>
      <ThresholdModal />
    </App>
  );
}

beforeEach(() => {
  fetchThresholds.mockReset().mockResolvedValue(VIEW);
  changeThreshold.mockReset().mockResolvedValue({ method: 'template', oldValue: 0.9, newValue: 0.91, reason: 'x', changedAt: '2026-07-03T09:00:00Z' });
});

describe('ThresholdModal (AC 2)', () => {
  it('toont de per-methode-drempels afzonderlijk na openen', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTestId('thresholds-open'));
    await waitFor(() => expect(screen.getByTestId('threshold-modal')).toBeInTheDocument());
    expect(await screen.findByTestId('threshold-value-template')).toHaveTextContent('0.90');
    expect(screen.getByTestId('threshold-value-embedding')).toHaveTextContent('0.92');
    expect(screen.getByTestId('threshold-value-classifier')).toHaveTextContent('0.90');
  });

  it('toont de vaste audittrail-hint', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTestId('thresholds-open'));
    expect(await screen.findByTestId('threshold-hint')).toHaveTextContent(
      'Wijzigingen worden gelogd met oude en nieuwe waarde.'
    );
  });

  it('opslaan is disabled zolang de reden leeg is (verplicht redenveld)', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTestId('thresholds-open'));
    await screen.findByTestId('threshold-modal');
    // Wijzig de waarde maar laat de reden leeg.
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '0.93');
    const saveBtn = screen.getByTestId('threshold-save').closest('button')!;
    expect(saveBtn).toBeDisabled();
  });

  it('toont de wijzigingshistorie in de modal (UX-DR7)', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTestId('thresholds-open'));
    await screen.findByTestId('threshold-history');
    expect(screen.getByText('twee besmette batches')).toBeInTheDocument();
    expect(screen.getByText('0.9 → 0.92')).toBeInTheDocument();
  });

  it('opslaan met reden roept changeThreshold(methode, waarde, reden) aan', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTestId('thresholds-open'));
    await screen.findByTestId('threshold-modal');
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '0.93');
    const reason = screen.getByTestId('threshold-reason');
    await user.type(reason, 'kalibratie');
    const saveBtn = screen.getByTestId('threshold-save').closest('button')!;
    await waitFor(() => expect(saveBtn).not.toBeDisabled());
    await user.click(saveBtn);
    await waitFor(() => expect(changeThreshold).toHaveBeenCalledWith('template', 0.93, 'kalibratie'));
  });
});
