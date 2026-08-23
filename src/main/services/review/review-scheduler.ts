import type { FlashcardState, FlashcardReviewGrade } from '../../../types'

export interface ReviewCalculationResult {
  state: FlashcardState
  dueAt: number
  intervalDays: number
  successCount: number
}

/**
 * Pure scheduling function for manual flashcards spaced review in Orbia v0.3.
 *
 * Rules:
 * - AGAIN ("Não lembrei"): 10 minutes interval, resets successCount to 0, state -> LEARNING
 * - HARD ("Difícil"): 1 day interval, preserves/ensures successCount >= 1, state -> LEARNING
 * - GOOD ("Lembrei"): Progressive intervals [3d, 7d, 14d, 30d], increments successCount, state -> REVIEW
 */
export function calculateNextReview(
  current: { state: FlashcardState; intervalDays: number; successCount: number },
  grade: FlashcardReviewGrade,
  now = Date.now()
): ReviewCalculationResult {
  if (grade === 'AGAIN') {
    return {
      state: 'LEARNING',
      dueAt: now + 10 * 60 * 1000, // 10 minutes
      intervalDays: 0,
      successCount: 0
    }
  }

  if (grade === 'HARD') {
    return {
      state: 'LEARNING',
      dueAt: now + 24 * 60 * 60 * 1000, // 1 day
      intervalDays: 1,
      successCount: Math.max(1, current.successCount)
    }
  }

  // GOOD
  const nextSuccess = current.successCount + 1
  let nextInterval = 3
  if (nextSuccess === 1) nextInterval = 3
  else if (nextSuccess === 2) nextInterval = 7
  else if (nextSuccess === 3) nextInterval = 14
  else nextInterval = 30

  return {
    state: 'REVIEW',
    dueAt: now + nextInterval * 24 * 60 * 60 * 1000,
    intervalDays: nextInterval,
    successCount: nextSuccess
  }
}
