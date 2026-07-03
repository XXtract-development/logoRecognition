/**
 * Overview-paneel `standstill` (Story 15.4, AC 5) — de pauze-/stilstandstatus die
 * de amber pauzebanner en de rode stilstand-banner voedt.
 *
 * Onderscheid (UX-DR5/DR6):
 *  - `mode: 'manual'`  → handmatig gepauzeerd (amber banner, wie/wanneer).
 *  - `mode: 'auto'`    → automatische stilstand (K=2, 13.6): rode banner met
 *    aanleiding + links naar de betrokken batches.
 *  - `mode: 'running'` → niet gepauzeerd (geen banner).
 *
 * De bron is de persistente pauze-stand (`system_settings`, 13.6) plus de
 * stilstand-record (batch-ids). `by === 'system'` markeert de automatische
 * stilstand; elke andere `by` (of een handmatige pauze zonder stilstand-record)
 * is een handmatige pauze.
 */

import { getPauseState, getStandstillRecord } from '../pause';

export type StandstillMode = 'running' | 'manual' | 'auto';

export interface StandstillPanel {
  mode: StandstillMode;
  paused: boolean;
  reason: string | null;
  since: string | null;
  by: string | null;
  /** Betrokken batch-ids bij een automatische stilstand (voor de banner-links). */
  batchIds: string[];
  /** K bij een automatische stilstand (aantal opeenvolgende quarantaines). */
  k: number | null;
}

/**
 * Bouw het stilstand-paneel. Automatische stilstand wint van handmatig: als er
 * een stilstand-record staat én het vliegwiel door 'system' gepauzeerd is, is het
 * een `auto`-stilstand (rode banner). Anders bepaalt de pauze-stand of het een
 * handmatige pauze (`manual`, amber) of geen pauze (`running`) is.
 */
export async function getStandstillPanel(): Promise<StandstillPanel> {
  const pause = await getPauseState();

  if (!pause.paused) {
    return { mode: 'running', paused: false, reason: null, since: null, by: null, batchIds: [], k: null };
  }

  const standstill = await getStandstillRecord();
  const isAuto = pause.by === 'system' && standstill !== null;

  return {
    mode: isAuto ? 'auto' : 'manual',
    paused: true,
    reason: pause.reason,
    since: pause.since,
    by: pause.by,
    batchIds: isAuto ? standstill!.batchIds : [],
    k: isAuto ? standstill!.k : null,
  };
}
