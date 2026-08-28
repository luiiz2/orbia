import { ipcMain } from 'electron'
import { databaseService } from '../services/database.service'
import { appConfigService } from '../services/app-config.service'
import { discoveryEngineService } from '../services/discovery/discovery-engine.service'
import { timeMatcherService } from '../services/discovery/time-matcher.service'
import { libraryInsightsService } from '../services/discovery/insights.service'
import { courseRelationshipsService } from '../services/discovery/relationships.service'
import { recommendationFeedbackService } from '../services/discovery/feedback.service'
import type {
  DiscoveryRail,
  DiscoveryItem,
  TimeBasedRecommendation,
  SurpriseRecommendation,
  CategoryDiscoveryData,
  LibraryInsights,
  ProfileDiscoveryPreferences,
  RecommendationFeedbackType,
  CourseRelationship,
  CourseRelationshipType
} from '../../types/discovery'

export function registerDiscoveryIpc(): void {
  ipcMain.handle(
    'discovery:get-rails',
    async (_event, profileId?: string): Promise<DiscoveryRail[]> => {
      const db = (
        databaseService as unknown as { db: import('better-sqlite3').Database }
      ).db
      if (!db) return []
      const activeProfileId = profileId || 'default_profile'
      const prefs =
        appConfigService.getProfileDiscoveryPreferences(activeProfileId)
      return discoveryEngineService.getDiscoveryRails(
        db,
        activeProfileId,
        prefs
      )
    }
  )

  ipcMain.handle(
    'discovery:get-similar-courses',
    async (
      _event,
      courseId: string,
      limit?: number
    ): Promise<DiscoveryItem[]> => {
      const db = (
        databaseService as unknown as { db: import('better-sqlite3').Database }
      ).db
      if (!db) return []
      return discoveryEngineService.getSimilarCourses(db, courseId, limit || 6)
    }
  )

  ipcMain.handle(
    'discovery:get-time-recommendations',
    async (
      _event,
      minutes: number,
      profileId?: string
    ): Promise<TimeBasedRecommendation[]> => {
      const db = (
        databaseService as unknown as { db: import('better-sqlite3').Database }
      ).db
      if (!db) return []
      return timeMatcherService.getRecommendationsForTimeWindow(
        db,
        minutes,
        profileId
      )
    }
  )

  ipcMain.handle(
    'discovery:get-surprise-me',
    async (
      _event,
      profileId?: string,
      mode?: 'continue' | 'start_new' | 'quick_lesson' | 'random'
    ): Promise<SurpriseRecommendation | null> => {
      const db = (
        databaseService as unknown as { db: import('better-sqlite3').Database }
      ).db
      if (!db) return null
      return discoveryEngineService.getSurpriseMe(db, profileId, mode)
    }
  )

  ipcMain.handle(
    'discovery:get-category-discovery',
    async (): Promise<CategoryDiscoveryData[]> => {
      const db = (
        databaseService as unknown as { db: import('better-sqlite3').Database }
      ).db
      if (!db) return []
      return discoveryEngineService.getCategoryDiscovery(db)
    }
  )

  ipcMain.handle(
    'discovery:get-insights',
    async (): Promise<LibraryInsights> => {
      const db = (
        databaseService as unknown as { db: import('better-sqlite3').Database }
      ).db
      if (!db) {
        return {
          totalCourses: 0,
          totalLessons: 0,
          totalDurationHours: 0,
          watchedHoursThisMonth: 0,
          coursesStartedCount: 0,
          coursesCompletedCount: 0,
          topTags: []
        }
      }
      return libraryInsightsService.getInsights(db)
    }
  )

  ipcMain.handle(
    'discovery:get-profile-preferences',
    async (_event, profileId: string): Promise<ProfileDiscoveryPreferences> => {
      return appConfigService.getProfileDiscoveryPreferences(profileId)
    }
  )

  ipcMain.handle(
    'discovery:save-profile-preferences',
    async (_event, prefs: ProfileDiscoveryPreferences): Promise<boolean> => {
      discoveryEngineService.invalidateCache()
      return appConfigService.saveProfileDiscoveryPreferences(prefs)
    }
  )

  ipcMain.handle(
    'discovery:submit-feedback',
    async (
      _event,
      profileId: string,
      courseId: string,
      feedbackType: RecommendationFeedbackType
    ): Promise<boolean> => {
      const db = (
        databaseService as unknown as { db: import('better-sqlite3').Database }
      ).db
      if (!db) return false
      discoveryEngineService.invalidateCache()
      return recommendationFeedbackService.submitFeedback(
        db,
        profileId,
        courseId,
        feedbackType
      )
    }
  )

  ipcMain.handle(
    'discovery:list-relationships',
    async (_event, courseId?: string): Promise<CourseRelationship[]> => {
      const db = (
        databaseService as unknown as { db: import('better-sqlite3').Database }
      ).db
      if (!db) return []
      return courseRelationshipsService.listRelationships(db, courseId)
    }
  )

  ipcMain.handle(
    'discovery:add-relationship',
    async (
      _event,
      sourceCourseId: string,
      targetCourseId: string,
      relationshipType: CourseRelationshipType
    ): Promise<CourseRelationship | null> => {
      const db = (
        databaseService as unknown as { db: import('better-sqlite3').Database }
      ).db
      if (!db) return null
      discoveryEngineService.invalidateCache()
      return courseRelationshipsService.addRelationship(
        db,
        sourceCourseId,
        targetCourseId,
        relationshipType
      )
    }
  )

  ipcMain.handle(
    'discovery:delete-relationship',
    async (_event, id: string): Promise<boolean> => {
      const db = (
        databaseService as unknown as { db: import('better-sqlite3').Database }
      ).db
      if (!db) return false
      discoveryEngineService.invalidateCache()
      return courseRelationshipsService.deleteRelationship(db, id)
    }
  )
}
