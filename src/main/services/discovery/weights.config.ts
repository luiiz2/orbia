export interface DiscoveryWeights {
  categoryMatch: number
  tagOverlapMax: number
  sameCollection: number
  customMetadataMatch: number
  favoriteSignal: number
  recentInterestSignal: number
  inProgressBoost: number
  almostFinishedBoost: number
  completedPenalty: number
  feedbackLikeBoost: number
  feedbackDislikePenalty: number
  feedbackNotInterestedPenalty: number
  recentExposurePenalty: number
  shortDurationBoost: number
}

export const DEFAULT_DISCOVERY_WEIGHTS: DiscoveryWeights = {
  categoryMatch: 30,
  tagOverlapMax: 20,
  sameCollection: 15,
  customMetadataMatch: 10,
  favoriteSignal: 15,
  recentInterestSignal: 12,
  inProgressBoost: 18,
  almostFinishedBoost: 25,
  completedPenalty: -30,
  feedbackLikeBoost: 20,
  feedbackDislikePenalty: -40,
  feedbackNotInterestedPenalty: -60,
  recentExposurePenalty: -15,
  shortDurationBoost: 10
}
