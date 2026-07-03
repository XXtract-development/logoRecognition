/**
 * Sneltoetsen-hook voor de quarantaine-afhandeling (Story 15.3, taak 4).
 *
 * Volgt EXACT het reviewstation-patroon (MobileReviewDeck.tsx:419-466):
 *   - `window.addEventListener('keydown')`, opgeruimd bij unmount;
 *   - TYPING-GUARD: een INPUT/TEXTAREA/contentEditable met focus negeert álle
 *     sneltoetsen (reviewstation-conventie, EXPERIENCE.md Interaction Primitives);
 *   - meta/ctrl/alt → negeren (laat browser-sneltoetsen met rust);
 *   - een open modal/paneel bezit het toetsenbord: staat `modalOpen`, dan handelt
 *     de hook ALLEEN Esc af (sluiten) en laat de rest los;
 *   - `e.preventDefault()` per afgehandelde toets.
 *
 * Toewijzing (EXPERIENCE.md): A = vrijgeven, R = afkeuren, U = undo,
 * ←/→ = vorige/volgende kandidaat, Esc = modal/paneel sluiten.
 */

import { useEffect } from 'react';

export interface CandidateKeyboardHandlers {
  onRelease: () => void;
  onReject: () => void;
  onUndo: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEscape: () => void;
  /** Staat er een modal/paneel open? Dan bezit dat het toetsenbord (alleen Esc). */
  modalOpen: boolean;
  /** Zolang false doet de hook niets (bijv. tijdens laden). */
  enabled: boolean;
}

export function useCandidateKeyboard(handlers: CandidateKeyboardHandlers): void {
  const { onRelease, onReject, onUndo, onPrev, onNext, onEscape, modalOpen, enabled } = handlers;

  useEffect(() => {
    if (!enabled) return undefined;

    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const typing =
        !!tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable);

      // Open modal/paneel bezit het toetsenbord: alleen Esc sluit.
      if (modalOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          onEscape();
        }
        return;
      }

      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'a':
        case 'A':
          e.preventDefault();
          onRelease();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          onReject();
          break;
        case 'u':
        case 'U':
          e.preventDefault();
          onUndo();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onPrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          onNext();
          break;
        case 'Escape':
          e.preventDefault();
          onEscape();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onRelease, onReject, onUndo, onPrev, onNext, onEscape, modalOpen, enabled]);
}

export default useCandidateKeyboard;
