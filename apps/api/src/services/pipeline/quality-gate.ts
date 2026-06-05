/**
 * Champion/Challenger Quality Gate (Epic 9, Story 9.4)
 *
 * Evaluates whether a newly trained challenger model is good enough to replace
 * the current champion. Gate passes when:
 *   challenger.holdoutAccuracy >= champion.holdoutAccuracy + minImprovement
 *
 * Edge-cases (auto-pass):
 *   - No active champion (first training run)
 *   - Champion has no holdoutHash (pre-Epic-7.2 model, no valid baseline)
 *
 * Both models MUST have been evaluated on the same holdout set (same holdoutHash).
 * Mismatched holdout sets always fail — comparison on unequal basis is invalid.
 *
 * AC references:
 *   AC1: pass on equal or better accuracy (same holdout)
 *   AC2: fail on lower accuracy, include comparison figures
 *   AC3: refuse mismatched holdout sets
 *   AC4: no champion → auto-pass
 *   AC5: champion without holdoutHash → auto-pass
 *   AC7: configurable minImprovement (GATE_MIN_IMPROVEMENT env, default 0.0)
 */

import { socketIOManager } from '../socket-io-manager';
import { createLogger } from '../../core/logger';

const logger = createLogger('pipeline-quality-gate');

// ============================================
// Types
// ============================================

export interface ModelMetrics {
  holdoutAccuracy: number;
  holdoutHash?: string | null;
}

export interface GateVerdict {
  passed: boolean;
  reason?: string;
  comparison?: {
    championAccuracy: number;
    challengerAccuracy: number;
    minImprovement: number;
  };
}

export interface EvaluateGateOptions {
  champion?: ModelMetrics | null;
  challenger: ModelMetrics;
  minImprovement?: number;
}

export interface GateFailureEvent {
  modelVersionId?: string;
  comparison?: GateVerdict['comparison'];
  reason?: string;
}

// ============================================
// Core gate function
// ============================================

/**
 * Evaluate whether the challenger passes the quality gate.
 *
 * AC4: champion=null/undefined → auto-pass (first run, no baseline)
 * AC5: champion.holdoutHash=null/undefined → auto-pass (pre-7.2 model)
 * AC3: mismatched holdoutHash → fail with holdout-related reason
 * AC7: configurable minImprovement (env GATE_MIN_IMPROVEMENT, default 0.0)
 * AC1: challenger.accuracy >= champion.accuracy + minImprovement → pass
 * AC2: otherwise → fail with comparison figures
 */
export function evaluateGate(options: EvaluateGateOptions): GateVerdict {
  const {
    champion,
    challenger,
    minImprovement = parseFloat(process.env.GATE_MIN_IMPROVEMENT || '0.0'),
  } = options;

  // AC4: no active champion — first training run
  if (!champion) {
    return {
      passed: true,
      reason: 'geen actief model — eerste run',
    };
  }

  // AC5: champion without holdout metrics (pre-7.2 model)
  if (!champion.holdoutHash) {
    return {
      passed: true,
      reason: 'champion zonder holdout-metrics (pre-7.2 model) — gate niet van toepassing',
    };
  }

  // AC3: mismatched holdout sets — comparison is invalid
  if (challenger.holdoutHash !== champion.holdoutHash) {
    return {
      passed: false,
      reason: `holdout-sets komen niet overeen: champion=${champion.holdoutHash}, challenger=${challenger.holdoutHash ?? 'geen'} — vergelijking op ongelijke basis is ongeldig`,
    };
  }

  // AC1/AC2: compare accuracies with threshold
  const threshold = champion.holdoutAccuracy + minImprovement;
  const passed = challenger.holdoutAccuracy >= threshold;

  if (passed) {
    return { passed: true };
  }

  // AC2: fail with comparison figures
  return {
    passed: false,
    comparison: {
      championAccuracy: champion.holdoutAccuracy,
      challengerAccuracy: challenger.holdoutAccuracy,
      minImprovement,
    },
  };
}

// ============================================
// Gate failure notification (AC6)
// ============================================

/**
 * Emit Socket.IO gate_failed event with comparison figures (AC6).
 * Called after evaluateGate returns { passed: false }.
 */
export function emitGateFailure(payload: GateFailureEvent): void {
  logger.warn('Quality gate failed — emitting gate_failed event', payload);
  socketIOManager.broadcastAll('gate_failed', payload);
}
