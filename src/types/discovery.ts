import type { Course } from './course'

export type DiscoveryReasonType =
  | 'because_watched'
  | 'shared_category'
  | 'shared_tags'
  | 'almost_finished'
  | 'time_fit'
  | 'journey_next'
  | 'favorite_interest'
  | 'frequently_accessed'
  | 'rediscover'
  | 'quick_win'
  | 'fresh_addition'

export interface StructuredReason {
  type: DiscoveryReasonType
  params: Record<string, string | number>
}

export type DiscoveryRailType =
  | 'for_you'
  | 'because_watched'
  | 'continue_journey'
  | 'almost_finished'
  | 'quick_wins'
  | 'rediscover'
  | 'similar_courses'
  | 'category_explorer'
  | 'recent'

export interface DiscoveryItem {
  course: Course
  score: number
  reasons: StructuredReason[]
  progressPercent: number
  remainingDurationMinutes: number
  nextLessonTitle?: string
  nextLessonId?: string
}

export interface DiscoveryRail {
  id: string
  title: string
  subtitle?: string
  railType: DiscoveryRailType
  items: DiscoveryItem[]
  badge?: string
}

export type CourseRelationshipType = 'prerequisite' | 'sequel' | 'same_journey' | 'related'

export interface CourseRelationship {
  id: string
  sourceCourseId: string
  targetCourseId: string
  relationshipType: CourseRelationshipType
  displayOrder: number
  createdAt: number
}

export type DiscoveryBalanceMode = 'familiar' | 'balanced' | 'explore'

export interface ProfileDiscoveryPreferences {
  profileId: string
  preferredCategories: string[]
  excludedCategories: string[]
  preferredTags: string[]
  discoveryMode: DiscoveryBalanceMode
  preferShortContent: boolean
  updatedAt: number
}

export type RecommendationFeedbackType =
  | 'like'
  | 'dislike'
  | 'not_interested'
  | 'show_less'
  | 'show_more'

export interface RecommendationFeedback {
  profileId: string
  courseId: string
  feedbackType: RecommendationFeedbackType
  updatedAt: number
}

export interface TimeBasedRecommendation {
  lessonId: string
  courseId: string
  courseTitle: string
  lessonTitle: string
  coverPath?: string | null
  totalDurationSeconds: number
  remainingDurationSeconds: number
  currentTimeSeconds: number
}

export interface SurpriseRecommendation {
  mode: 'continue' | 'start_new' | 'quick_lesson' | 'random'
  item: DiscoveryItem
  headline: string
}

export interface CategoryDiscoveryData {
  category: string
  courseCount: number
  totalDurationHours: number
  courses: Course[]
}

export interface LibraryInsights {
  totalCourses: number
  totalLessons: number
  totalDurationHours: number
  watchedHoursThisMonth: number
  coursesStartedCount: number
  coursesCompletedCount: number
  mostWatchedCategory?: string
  mostWatchedCourseTitle?: string
  topTags: Array<{ tag: string; count: number }>
}
