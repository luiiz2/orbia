import type { StructuredReason } from '../../../types/discovery'

export class ReasonGenerator {
  public static becauseWatched(targetTitle: string): StructuredReason {
    return {
      type: 'because_watched',
      params: { targetTitle }
    }
  }

  public static sharedCategory(category: string): StructuredReason {
    return {
      type: 'shared_category',
      params: { category }
    }
  }

  public static sharedTags(tags: string[]): StructuredReason {
    return {
      type: 'shared_tags',
      params: { count: tags.length, tags: tags.slice(0, 3).join(', ') }
    }
  }

  public static almostFinished(progressPercent: number): StructuredReason {
    return {
      type: 'almost_finished',
      params: { percent: Math.round(progressPercent) }
    }
  }

  public static timeFit(minutes: number): StructuredReason {
    return {
      type: 'time_fit',
      params: { minutes }
    }
  }

  public static journeyNext(sourceTitle: string): StructuredReason {
    return {
      type: 'journey_next',
      params: { sourceTitle }
    }
  }

  public static favoriteInterest(): StructuredReason {
    return {
      type: 'favorite_interest',
      params: {}
    }
  }

  public static rediscover(daysInactive: number): StructuredReason {
    return {
      type: 'rediscover',
      params: { days: daysInactive }
    }
  }

  public static quickWin(durationMinutes: number): StructuredReason {
    return {
      type: 'quick_win',
      params: { minutes: Math.round(durationMinutes) }
    }
  }

  public static freshAddition(): StructuredReason {
    return {
      type: 'fresh_addition',
      params: {}
    }
  }
}
