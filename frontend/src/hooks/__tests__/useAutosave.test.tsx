import React, { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { useAutosave } from '../useAutosave';

const AutosaveHarness: React.FC<{ saveDraft: () => Promise<void> }> = ({ saveDraft }) => {
  const { markDirty } = useAutosave({ enabled: true, intervalMs: 1000, saveDraft });
  useEffect(() => {
    markDirty();
  }, [markDirty]);
  return null;
};

describe('useAutosave', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('executes autosave after interval when dirty', async () => {
    const saveDraft = jest.fn().mockResolvedValue(undefined);
    render(<AutosaveHarness saveDraft={saveDraft} />);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(saveDraft).toHaveBeenCalledTimes(1);
  });
});

