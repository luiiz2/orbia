import { describe, it, expect } from 'vitest'
import { calculateNextReview } from '../src/main/services/review/review-scheduler'

describe('Review Scheduler (Spaced Repetition)', () => {
  const baseTime = 1756000000000 // Fixed reference timestamp

  it('handles AGAIN grade properly (resets to 10 minutes and LEARNING)', () => {
    const res = calculateNextReview(
      { state: 'REVIEW', intervalDays: 14, successCount: 3 },
      'AGAIN',
      baseTime
    )

    expect(res.state).toBe('LEARNING')
    expect(res.intervalDays).toBe(0)
    expect(res.successCount).toBe(0)
    expect(res.dueAt).toBe(baseTime + 10 * 60 * 1000)
  })

  it('handles HARD grade properly (1 day interval)', () => {
    const res = calculateNextReview(
      { state: 'NEW', intervalDays: 0, successCount: 0 },
      'HARD',
      baseTime
    )

    expect(res.state).toBe('LEARNING')
    expect(res.intervalDays).toBe(1)
    expect(res.successCount).toBe(1)
    expect(res.dueAt).toBe(baseTime + 24 * 60 * 60 * 1000)
  })

  it('advances through GOOD intervals progressively [3d -> 7d -> 14d -> 30d]', () => {
    // 1st GOOD
    const r1 = calculateNextReview(
      { state: 'NEW', intervalDays: 0, successCount: 0 },
      'GOOD',
      baseTime
    )
    expect(r1.state).toBe('REVIEW')
    expect(r1.intervalDays).toBe(3)
    expect(r1.successCount).toBe(1)
    expect(r1.dueAt).toBe(baseTime + 3 * 24 * 60 * 60 * 1000)

    // 2nd GOOD
    const r2 = calculateNextReview(
      {
        state: r1.state,
        intervalDays: r1.intervalDays,
        successCount: r1.successCount
      },
      'GOOD',
      baseTime
    )
    expect(r2.state).toBe('REVIEW')
    expect(r2.intervalDays).toBe(7)
    expect(r2.successCount).toBe(2)

    // 3rd GOOD
    const r3 = calculateNextReview(
      {
        state: r2.state,
        intervalDays: r2.intervalDays,
        successCount: r2.successCount
      },
      'GOOD',
      baseTime
    )
    expect(r3.state).toBe('REVIEW')
    expect(r3.intervalDays).toBe(14)
    expect(r3.successCount).toBe(3)

    // 4th GOOD
    const r4 = calculateNextReview(
      {
        state: r3.state,
        intervalDays: r3.intervalDays,
        successCount: r3.successCount
      },
      'GOOD',
      baseTime
    )
    expect(r4.state).toBe('REVIEW')
    expect(r4.intervalDays).toBe(30)
    expect(r4.successCount).toBe(4)

    // 5th GOOD (capped at 30 days)
    const r5 = calculateNextReview(
      {
        state: r4.state,
        intervalDays: r4.intervalDays,
        successCount: r4.successCount
      },
      'GOOD',
      baseTime
    )
    expect(r5.state).toBe('REVIEW')
    expect(r5.intervalDays).toBe(30)
    expect(r5.successCount).toBe(5)
  })
})
