/**
 * Feedback incorporation service (Epic 9, Story 9.3 — incorporate-feedback step).
 *
 * Single source of truth for "turn validated feedback into training data".
 * Shared by:
 *   - the manual route POST /api/v1/feedback/incorporate (feedback.ts)
 *   - the incorporate-feedback worker step in the training flow (workers.ts)
 *
 * Extracted from the inline route handler so the pipeline step does not make an
 * HTTP self-call (which would require a JWT and a live HTTP server). The worker
 * calls the service layer directly.
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';

const logger = createLogger('feedback-incorporation');

export interface IncorporationResult {
  incorporated: number;
}

/**
 * Incorporate all pending (unincorporated, correctly-labelled) feedback into
 * the training-data set. Each eligible feedback entry whose source log has an
 * image becomes a validated TrainingData row; the feedback is then marked
 * incorporated so it is never double-counted.
 *
 * Idempotent at the batch level: a second call with no pending feedback is a
 * no-op returning { incorporated: 0 }.
 */
export async function incorporatePendingFeedback(): Promise<IncorporationResult> {
  const pendingFeedback = await prisma.feedbackEntry.findMany({
    where: {
      incorporated: false,
      correctLogoId: { not: null },
    },
    include: { log: true },
  });

  if (pendingFeedback.length === 0) {
    return { incorporated: 0 };
  }

  let incorporatedCount = 0;
  for (const feedback of pendingFeedback) {
    if (feedback.log.imageHash) {
      const image = await prisma.logoImage.findFirst({
        where: {
          metadata: {
            path: ['hash'],
            equals: feedback.log.imageHash,
          },
        },
      });

      if (image) {
        await prisma.trainingData.create({
          data: {
            imageId: image.id,
            label: feedback.correctLogoId!,
            confidence: feedback.confidence || 1.0,
            validated: true,
            validationDate: new Date(),
            validatedBy: feedback.validatedBy || 'system',
          },
        });
      }
    }

    await prisma.feedbackEntry.update({
      where: { id: feedback.id },
      data: { incorporated: true },
    });

    incorporatedCount++;
  }

  logger.info('Feedback incorporated', { count: incorporatedCount });

  return { incorporated: incorporatedCount };
}
