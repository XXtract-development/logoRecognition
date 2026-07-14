/**
 * Story 12.17 — ImageStage draft/confirm wiring (the logic the deck relies on but
 * which its ImageStage mock cannot exercise): reporting a drawn-but-unconfirmed
 * box (onDraftChange) and confirming it from outside via confirmToken WITHOUT
 * firing on mount.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { language: 'nl', changeLanguage: () => {} },
  }),
}));

import ImageStage from './ImageStage';

// jsdom has no layout — give every element a deterministic 100×100 rect so the
// draw → artwork-fraction math in `confirm` yields a real rel.
const RECT = {
  left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0,
  toJSON: () => ({}),
} as DOMRect;

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(RECT);
});
afterEach(() => {
  vi.restoreAllMocks();
});

// jsdom has no PointerEvent (clientX is dropped by fireEvent.pointer*), so build a
// MouseEvent — which carries clientX/clientY — under the pointer* type React
// listens for. pointerId is added for the handler; setPointerCapture is guarded.
const pointer = (type: string, x: number, y: number) => {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(ev, 'pointerId', { value: 1, configurable: true });
  return ev;
};

/** Drag a ~50×50 box on the stage (well above the 6px draw threshold). */
const drawBox = (stage: HTMLElement) => {
  fireEvent(stage, pointer('pointerdown', 10, 10));
  fireEvent(stage, pointer('pointermove', 60, 60));
  fireEvent(stage, pointer('pointerup', 60, 60));
};

describe('ImageStage — Story 12.17 draft/confirm wiring', () => {
  it('bevestigt niets op mount, ook niet wanneer confirmToken al 0 is', () => {
    const onConfirmBox = vi.fn();
    const onDraftChange = vi.fn();
    render(
      <ImageStage
        src="x"
        canDraw
        onConfirmBox={onConfirmBox}
        onDraftChange={onDraftChange}
        confirmToken={0}
        data-testid="stage"
      />
    );
    expect(onConfirmBox).not.toHaveBeenCalled();
    // Zonder getekend kader wordt nooit "draft aanwezig" gemeld.
    expect(onDraftChange).not.toHaveBeenCalledWith(true);
  });

  it('meldt onDraftChange(true) na tekenen en (false) na wissen', () => {
    const onDraftChange = vi.fn();
    render(<ImageStage src="x" canDraw onDraftChange={onDraftChange} data-testid="stage" />);

    drawBox(screen.getByTestId('stage'));
    expect(onDraftChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByTestId('stage-box-clear'));
    expect(onDraftChange).toHaveBeenLastCalledWith(false);
  });

  it('confirmToken-bump bevestigt het getekende kader met een live rel (niet op mount)', () => {
    const onConfirmBox = vi.fn();
    const { rerender } = render(
      <ImageStage src="x" canDraw onConfirmBox={onConfirmBox} confirmToken={0} data-testid="stage" />
    );

    drawBox(screen.getByTestId('stage'));
    // Tekenen alleen bevestigt nog niet.
    expect(onConfirmBox).not.toHaveBeenCalled();

    rerender(
      <ImageStage src="x" canDraw onConfirmBox={onConfirmBox} confirmToken={1} data-testid="stage" />
    );
    expect(onConfirmBox).toHaveBeenCalledTimes(1);
    const rel = onConfirmBox.mock.calls[0][0];
    expect(rel.width).toBeGreaterThan(0.005);
    expect(rel.height).toBeGreaterThan(0.005);
  });

  it('confirmToken-bump zonder getekend kader is een no-op', () => {
    const onConfirmBox = vi.fn();
    const { rerender } = render(
      <ImageStage src="x" canDraw onConfirmBox={onConfirmBox} confirmToken={0} data-testid="stage" />
    );
    rerender(
      <ImageStage src="x" canDraw onConfirmBox={onConfirmBox} confirmToken={1} data-testid="stage" />
    );
    expect(onConfirmBox).not.toHaveBeenCalled();
  });

  it('meldt onDraftChange(false) bij unmount (host-flag blijft niet hangen)', () => {
    const onDraftChange = vi.fn();
    const { unmount } = render(
      <ImageStage src="x" canDraw onDraftChange={onDraftChange} data-testid="stage" />
    );
    drawBox(screen.getByTestId('stage'));
    onDraftChange.mockClear();
    unmount();
    expect(onDraftChange).toHaveBeenCalledWith(false);
  });
});
