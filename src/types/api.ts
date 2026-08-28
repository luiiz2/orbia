import type { ContentResource, Course, MediaType, MergePreview, Module, Lesson, ProposedCourseStructure } from './course'
import type { Vault, AppSettings, VaultStats } from './vault'
import type { LessonProgress, WatchHistoryEntry, CourseProgressSummary } from './progress'
import type { LessonNote } from './notes'
import type {
  AiChatInput,
  AiChatResponse,
  AiDataType,
  AiEmbeddingRequest,
  AiEmbeddingResponse,
  AiModel,
  AiPrivacyMode,
  AiProviderHealth,
  AiProviderId,
  AiProviderUpdate,
  AiRouteUpdate,
  AiSettingsSnapshot
} from './ai'
import type {
  Transcript,
  TranscriptProgressEvent,
  TranscriptSummary,
  TranscriptionBatchResult,
  TranscriptionEnqueueResult,
  TranscriptionOptions,
  TranscriptionSettings
} from './transcription'
import type {
  SemanticIndexEnqueueInput,
  SemanticIndexMetrics,
  SemanticIndexSettings,
  SemanticIndexStatus,
  SemanticSourceSelection
} from './semantic-index'
import type {
  ChatConversation,
  ChatConversationSummary,
  GroundedChatRequest,
  GroundedChatResponse,
  SourceNavigationRequest,
  SourceNavigationResult
} from './grounded-chat'
import type {
  LibrarySearchNavigationResult,
  LibrarySearchRequest,
  LibrarySearchResponse,
  RelatedContentRequest,
  RelatedContentResponse
} from './library-search'

export interface SelectedCourseSource {
  path: string
  name: string
  isZip: boolean
}

export interface SearchResultItem {
  type: 'course' | 'module' | 'lesson'
  id: string
  title: string
  courseId: string
  courseTitle: string
  moduleId?: string
  moduleTitle?: string
}

/**
 * Opaque capability returned by a native source picker. The absolute source
 * path stays in the Main process and is consumed exactly once during prepare.
 */
export interface ImportSourceCapability {
  token: string
  name: string
  isZip: boolean
}

export interface PrepareImportSourceInput {
  token: string
}

export interface ExtractProgressPayload {
  percent: number
  currentFile: string
}

/**
 * Public, opaque import-session source kind. The Main process owns all
 * temporary staging details for ZIP sessions.
 */
export type ImportSessionSourceKind = 'zip' | 'folder'

/**
 * Result of the strict source validation performed before an import preview.
 */
export interface ImportSessionValidation {
  verificationOk: boolean
  /** File names only; never a source or staging path. */
  failedEntries: string[]
  warnings: string[]
  extractedFiles: number
}

/** A path-free material representation safe for the Renderer preview. */
export interface ImportSessionResourcePreview {
  id: string
  name: string
  fileExtension: string
  fileSize: number
  type: ContentResource['type']
  role: ContentResource['role']
  language?: string
  label?: string
}

/** A path-free lesson representation safe for the Renderer preview. */
export interface ImportSessionLessonPreview {
  id: string
  title: string
  originalFileName: string
  fileExtension: string
  mediaType: MediaType
  fileSize: number
  orderIndex: number
  duration?: number
  contentResources: ImportSessionResourcePreview[]
}

/** A path-free module representation safe for the Renderer preview. */
export interface ImportSessionModulePreview {
  id: string
  title: string
  orderIndex: number
  duration?: number
  resources: ImportSessionResourcePreview[]
  lessons: ImportSessionLessonPreview[]
}

/** Duplicate metadata intentionally omits the source paths. */
export interface ImportSessionDuplicatePreview {
  fileName: string
  fileSize: number
  count: number
}

/**
 * Sanitized, renderer-safe view of the Main-owned proposal. Physical paths,
 * cover paths and duplicate locations deliberately never cross the bridge.
 */
export interface ImportSessionPreview {
  suggestedTitle: string
  totalDuration?: number
  totalLessons: number
  totalFilesScanned: number
  modules: ImportSessionModulePreview[]
  duplicates?: ImportSessionDuplicatePreview[]
}

/**
 * Data safe to return to the Renderer after preparing an import. `sessionId`
 * is an opaque capability; no staging path is exposed through this contract.
 */
export interface ImportSessionPreparation {
  sessionId: string
  sourceKind: ImportSessionSourceKind
  suggestedTitle: string
  preview?: ImportSessionPreview
  validation: ImportSessionValidation
}

export type PrepareImportSessionResult =
  | ({ success: true } & ImportSessionPreparation)
  | { success: false; error: string }

export interface ImportSessionTitleEdit {
  id: string
  title: string
}

/** The only proposal changes accepted after preview. */
export interface ImportSessionTitleEdits {
  courseTitle?: string
  modules?: ImportSessionTitleEdit[]
  lessons?: ImportSessionTitleEdit[]
}

/**
 * Opaque session commit. Paths and raw proposals are Main-owned and cannot be
 * supplied by the Renderer.
 */
export interface CommitImportSessionInput {
  sessionId: string
  isExternal: boolean
  titleEdits?: ImportSessionTitleEdits
}

export type CommitImportSessionResult =
  | { success: true; course: Course; operationGroupId?: string; warnings?: string[] }
  | { success: false; error: string }

export type CancelImportSessionResult =
  | { success: true }
  | { success: false; error: string }

export type GetMergePreviewResult =
  | { success: true; preview: MergePreview }
  | { success: false; error: string }

/**
 * Typed IPC Bridge interface exposed to the Renderer process via window.api
 */
export interface OrbiaApi {
  // Vault operations
  vault: {
    create: (path: string, name: string) => Promise<{ success: boolean; vault?: Vault; error?: string }>
    open: (path: string) => Promise<{ success: boolean; vault?: Vault; error?: string }>
    delete: (path: string, deleteFiles: boolean) => Promise<{ success: boolean; error?: string }>
    getRecent: () => Promise<Vault[]>
    getCurrent: () => Promise<Vault | null>
    getStats: () => Promise<VaultStats>
    selectDirectory: () => Promise<string | null>
  }

  // Course scanning & management
  courses: {
    selectSource: () => Promise<SelectedCourseSource[] | null>
    selectZip: () => Promise<ImportSourceCapability[] | null>
    selectFolder: () => Promise<ImportSourceCapability[] | null>
    selectMultiCourseFolder: () => Promise<{ path: string; name: string } | null>
    scanMultiCourseFolder: (folderPath: string) => Promise<{ success: boolean; proposals?: ProposedCourseStructure[]; error?: string }>
    prepareZipImport: (input: PrepareImportSourceInput) => Promise<PrepareImportSessionResult>
    prepareFolderImport: (input: PrepareImportSourceInput) => Promise<PrepareImportSessionResult>
    cancelImportSession: (sessionId: string) => Promise<CancelImportSessionResult>
    commitImportSession: (input: CommitImportSessionInput) => Promise<CommitImportSessionResult>
    extractZip: (zipPath: string, deleteSourceArchive?: boolean) => Promise<{ success: boolean; extractedPath?: string; suggestedTitle?: string; error?: string }>
    scanFolder: (folderPath: string) => Promise<{ success: boolean; proposal?: ProposedCourseStructure; error?: string }>
    importCourse: (proposal: ProposedCourseStructure, isExternal: boolean) => Promise<{ success: boolean; course?: Course; error?: string }>
    importBatch: (items: { proposal: ProposedCourseStructure; isExternal: boolean }[]) => Promise<{ success: boolean; courses?: Course[]; error?: string }>
    getMergePreview: (courseIds: string[]) => Promise<GetMergePreviewResult>
    mergeCourses: (courseIds: string[]) => Promise<{ success: boolean; canonicalCourseId?: string; error?: string; mergedGroupsCount?: number; removedCoursesCount?: number }>
    unmergeCourse: (courseId: string) => Promise<{ success: boolean; restoredCoursesCount?: number; error?: string }>
    generateOrganizationPlan: (courseId: string) => Promise<{ success: boolean; plan?: import('./course').OrganizationPlan; error?: string }>
    applyOrganizationPlan: (plan: import('./course').OrganizationPlan) => Promise<{ success: boolean; appliedCount?: number; error?: string }>
    autoOrganize: () => Promise<import('./course').AutoOrganizeResult>
    separateMistakenlyMergedCourses: () => Promise<import('./course').SeparateCoursesResult>
    getImportHistory: () => Promise<import('./course').ImportHistoryEntry[]>
    recordImportHistory: (entry: Omit<import('./course').ImportHistoryEntry, 'id' | 'createdAt'>) => Promise<import('./course').ImportHistoryEntry>
    clearImportHistory: () => Promise<boolean>
    selectCoverImage: () => Promise<string | null>
    updateCourseCover: (courseId: string, coverPath: string) => Promise<{ success: boolean; error?: string }>
    updateLessonCover: (lessonId: string, coverPath: string) => Promise<{ success: boolean; error?: string }>
    extractThumbnails: (payload?: { courseId?: string }) => Promise<{ success: boolean; updatedLessons?: number; updatedCourses?: number; error?: string }>
    list: () => Promise<Course[]>
    getById: (courseId: string) => Promise<{ course: Course; modules: (Module & { lessons: Lesson[] })[] } | null>
    delete: (courseId: string, deleteFiles: boolean) => Promise<{ success: boolean; error?: string }>
    deleteLesson: (lessonId: string, deleteFileFromDisk?: boolean) => Promise<{ success: boolean; error?: string }>
    getCourseHealth: (courseId: string) => Promise<import('./course').CourseHealthReport>
    fixCourseProblems: (courseId: string) => Promise<{ success: boolean; fixedCount: number; removedCount: number; error?: string }>
    toggleFavorite: (courseId: string) => Promise<boolean>
    updateMetadata: (input: { courseId: string; customTitle?: string }) => Promise<{ success: boolean }>
    updateModuleMetadata: (input: { moduleId: string; customTitle?: string; displayOrder?: number }) => Promise<{ success: boolean }>
    updateLessonMetadata: (input: { lessonId: string; customTitle?: string; displayOrder?: number }) => Promise<{ success: boolean }>
    reorderModule: (moduleId: string, direction: 'up' | 'down') => Promise<{ success: boolean }>
    reorderLesson: (lessonId: string, direction: 'up' | 'down') => Promise<{ success: boolean }>
    toggleLessonFavorite: (lessonId: string) => Promise<boolean>
    toggleModuleCompletion: (moduleId: string, courseId: string) => Promise<{ success: boolean; affectedCount: number }>
    searchGlobal: (query: string) => Promise<SearchResultItem[]>
    updateLessonDuration: (lessonId: string, duration: number) => Promise<{ success: boolean; error?: string }>
    convertSrtToVtt: (srtPath: string) => Promise<{ success: boolean; vttContent?: string; error?: string }>
    getReorganizePlan: (courseId: string) => Promise<{ success: boolean; plan?: import('./journal').OperationPlan; error?: string }>
    applyReorganizePlan: (groupId: string, mutations: import('./journal').ProposedFileMutation[], courseId: string) => Promise<{ success: boolean; appliedCount?: number; error?: string }>
    undoReorganizePlan: (groupId: string) => Promise<{ success: boolean; revertedCount?: number; error?: string }>
    onExtractProgress: (callback: (progress: ExtractProgressPayload) => void) => () => void
  }

  // Player & Progress
  player: {
    saveProgress: (progress: { lessonId: string; courseId: string; currentTime: number; duration: number; completed: boolean }) => Promise<void>
    getProgress: (lessonId: string) => Promise<LessonProgress | null>
    getLessonsProgress: (courseId: string) => Promise<LessonProgress[]>
    getCourseProgress: (courseId: string) => Promise<CourseProgressSummary | null>
    getAllProgressSummaries: () => Promise<Record<string, CourseProgressSummary>>
    toggleLessonCompletion: (lessonId: string, courseId: string) => Promise<boolean>
    getWatchHistory: (limit?: number) => Promise<WatchHistoryEntry[]>
    addWatchHistory: (entry: Omit<WatchHistoryEntry, 'id' | 'watchedAt'>) => Promise<void>
    getLessonNotes: (lessonId: string) => Promise<LessonNote[]>
    addLessonNote: (note: { lessonId: string; courseId: string; timestampSeconds: number; content: string }) => Promise<LessonNote>
    updateLessonNote: (id: string, content: string) => Promise<boolean>
    deleteLessonNote: (id: string) => Promise<boolean>
    exportCourseNotes: (courseId: string) => Promise<string>
    getStudyAnalytics: (dailyGoalMinutes?: number) => Promise<import('./progress').StudyAnalytics>
    setActive: (active: boolean) => Promise<void>
  }

  // Transcription Engine & Transcript Storage (v0.9 Phase 2)
  transcription: {
    getCurrent: (lessonId: string) => Promise<Transcript | null>
    listVersions: (lessonId: string) => Promise<TranscriptSummary[]>
    getSubtitleCandidate: (lessonId: string, language?: string) => Promise<{
      resourceId: string
      filePath: string
      language?: string
      label?: string
      sourceRevision: string
      segments: import('./transcription').TranscriptSegment[]
    } | null>
    enqueueLesson: (lessonId: string, options?: TranscriptionOptions) => Promise<TranscriptionEnqueueResult>
    enqueueModule: (moduleId: string, options?: TranscriptionOptions) => Promise<TranscriptionBatchResult>
    enqueueCourse: (courseId: string, options?: TranscriptionOptions) => Promise<TranscriptionBatchResult>
    reuseSubtitle: (lessonId: string, language?: string) => Promise<Transcript | null>
    listQueue: () => Promise<import('./optimizer').OptimizationQueueItem[]>
    pauseJob: (jobId: string) => Promise<boolean>
    resumeJob: (jobId: string) => Promise<boolean>
    cancelJob: (jobId: string) => Promise<boolean>
    retryJob: (jobId: string) => Promise<boolean>
    getSettings: () => Promise<TranscriptionSettings>
    updateSettings: (settings: Partial<TranscriptionSettings>) => Promise<boolean>
    getCourseAutoTranscribe: (courseId: string) => Promise<boolean>
    setCourseAutoTranscribe: (courseId: string, enabled: boolean) => Promise<boolean>
    onProgress: (callback: (event: TranscriptProgressEvent) => void) => () => void
  }

  // Video Bookmarks (v0.3)
  bookmarks: {
    create: (bookmark: { courseId: string; lessonId: string; timestamp: number; title?: string; color?: string }) => Promise<import('./review').VideoBookmark>
    update: (id: string, updates: { title?: string; color?: string; timestamp?: number }) => Promise<boolean>
    delete: (id: string) => Promise<boolean>
    listByLesson: (lessonId: string) => Promise<import('./review').VideoBookmark[]>
    listByCourse: (courseId: string) => Promise<import('./review').VideoBookmark[]>
    listRecent: (limit?: number) => Promise<import('./review').VideoBookmark[]>
  }

  // Flashcards (v0.3)
  flashcards: {
    create: (card: { courseId?: string; moduleId?: string; lessonId?: string; timestamp?: number; question: string; answer: string; state?: import('./review').FlashcardState; dueAt?: number }) => Promise<import('./review').Flashcard>
    update: (id: string, updates: Partial<import('./review').Flashcard>) => Promise<boolean>
    delete: (id: string) => Promise<boolean>
    getById: (id: string) => Promise<import('./review').Flashcard | null>
    getDue: (limit?: number) => Promise<import('./review').Flashcard[]>
    listAll: (courseId?: string) => Promise<import('./review').Flashcard[]>
    listByLesson: (lessonId: string) => Promise<import('./review').Flashcard[]>
    review: (id: string, grade: import('./review').FlashcardReviewGrade) => Promise<{ success: boolean; flashcard?: import('./review').Flashcard }>
  }

  // Study Queue ("Estudar Depois") (v0.3)
  studyQueue: {
    add: (entityType: import('./review').StudyQueueEntityType, entityId: string) => Promise<import('./review').StudyQueueItem>
    remove: (id: string) => Promise<boolean>
    reorder: (id: string, direction: 'up' | 'down') => Promise<boolean>
    list: () => Promise<import('./review').StudyQueueItem[]>
  }

  // Course Goals (v0.3)
  goals: {
    get: (courseId: string) => Promise<import('./review').CourseGoal | null>
    set: (goal: { courseId: string; targetDate?: number; dailyMinutes?: number; weeklyLessons?: number }) => Promise<import('./review').CourseGoal>
    delete: (courseId: string) => Promise<boolean>
  }

  // Backup & Restore (.orbia) (v0.3)
  backup: {
    create: (targetFilePath?: string, vaultName?: string) => Promise<{ success: boolean; filePath: string; fileSizeBytes: number; error?: string }>
    inspect: (backupFilePath: string) => Promise<import('./review').BackupPreview>
    restore: (backupFilePath: string) => Promise<{ success: boolean; restoredCoursesCount: number; error?: string }>
    selectBackupFile: () => Promise<string | null>
    selectSaveBackupPath: (defaultName?: string) => Promise<string | null>
  }

  // Data Exports (v0.3)
  exports: {
    notesMarkdown: (courseId?: string) => Promise<string>
    bookmarksMarkdown: (courseId?: string) => Promise<string>
    flashcardsCsv: (courseId?: string) => Promise<string>
    flashcardsMarkdown: (courseId?: string) => Promise<string>
    saveExportToFile: (defaultFileName: string, content: string) => Promise<{ success: boolean; filePath?: string }>
  }

  // Study Sessions & Focus Timer (v0.3)
  sessions: {
    start: (courseId?: string, source?: 'player' | 'focus_timer') => Promise<import('./review').StudySession>
    end: (sessionId: string, duration?: number) => Promise<boolean>
    list: (limit?: number) => Promise<import('./review').StudySession[]>
  }

  // Review Dashboard Aggregator (v0.3)
  review: {
    getDashboardStats: () => Promise<import('./review').ReviewDashboardStats>
  }

  // Library Studio & Customization Engine (v0.5)
  studio: {
    // Appearances
    listAppearances: (courseId?: string, includeHidden?: boolean) => Promise<import('./studio').LibraryAppearance[]>
    updateAppearance: (id: string, updates: Partial<import('./studio').LibraryAppearance>) => Promise<boolean>
    createReference: (entityType: import('./studio').StudioEntityType, entityId: string, targetCourseId: string, parentAppearanceId?: string) => Promise<import('./studio').LibraryAppearance>
    deleteAppearance: (appearanceId: string) => Promise<{ success: boolean; promotedAppearanceId?: string }>
    setHidden: (appearanceIds: string[], isHidden: boolean) => Promise<boolean>

    // Sections
    createSection: (courseId: string, title: string, moduleId?: string) => Promise<import('./studio').LibrarySection>
    updateSection: (id: string, updates: Partial<import('./studio').LibrarySection>) => Promise<boolean>
    deleteSection: (id: string) => Promise<boolean>
    listSections: (courseId: string) => Promise<import('./studio').LibrarySection[]>

    // Collections
    createCollection: (name: string, description?: string, color?: string, icon?: string) => Promise<import('./studio').Collection>
    updateCollection: (id: string, updates: Partial<import('./studio').Collection>) => Promise<boolean>
    deleteCollection: (id: string) => Promise<boolean>
    listCollections: () => Promise<import('./studio').Collection[]>
    addItemsToCollection: (collectionId: string, appearanceIds: string[]) => Promise<boolean>
    removeItemsFromCollection: (collectionId: string, appearanceIds: string[]) => Promise<boolean>

    // Custom Metadata Fields
    listCustomFieldDefinitions: () => Promise<import('./studio').CustomFieldDefinition[]>
    createCustomFieldDefinition: (name: string, fieldType: import('./studio').CustomFieldType, options?: string[]) => Promise<import('./studio').CustomFieldDefinition>
    deleteCustomFieldDefinition: (id: string) => Promise<boolean>
    getCustomFieldValues: (entityId: string) => Promise<Record<string, string>>
    setCustomFieldValue: (entityId: string, fieldId: string, value: string) => Promise<boolean>

    // Semantic Structural Operations
    courseToModule: (sourceCourseId: string, targetCourseId: string) => Promise<{ success: boolean; newModuleId?: string; error?: string }>
    moduleToCourse: (moduleId: string, newCourseTitle?: string) => Promise<{ success: boolean; newCourseId?: string; error?: string }>
    moveItems: (appearanceIds: string[], targetParentId: string | null, targetCourseId: string) => Promise<{ success: boolean; movedCount: number }>
    createCourseFromSelection: (appearanceIds: string[], courseTitle: string) => Promise<{ success: boolean; newCourse?: Course; error?: string }>

    // History & Transactional Undo
    listHistory: (limit?: number) => Promise<import('./studio').StudioHistoryEntry[]>
    undo: (historyId: string) => Promise<{ success: boolean; error?: string }>

    // Bulk Editing & Spreadsheet Drafts
    renamePreview: (appearanceIds: string[], options: import('./studio').BulkRenameOptions) => Promise<import('./studio').BulkRenamePreviewItem[]>
    renameApply: (items: { appearanceId: string; newTitle: string }[]) => Promise<boolean>
    applySpreadsheetDraft: (changes: import('./studio').SpreadsheetDraftChange[]) => Promise<{ success: boolean; appliedCount: number }>

    // Automation Rules
    listAutomationRules: () => Promise<import('./studio').AutomationRule[]>
    saveAutomationRule: (rule: Omit<import('./studio').AutomationRule, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<import('./studio').AutomationRule>
    deleteAutomationRule: (id: string) => Promise<boolean>
    executeAutomationRule: (ruleId: string) => Promise<{ success: boolean; affectedCount: number }>

    // Local Profiles
    listProfiles: () => Promise<import('./theme').LocalProfile[]>
    createProfile: (name: string, avatarPath?: string) => Promise<import('./theme').LocalProfile>
    updateProfile: (id: string, updates: Partial<import('./theme').LocalProfile>) => Promise<boolean>
    deleteProfile: (id: string) => Promise<boolean>

    // Themes & Appearance Cascades
    listThemePresets: () => Promise<import('./theme').ThemePreset[]>
    saveThemePreset: (preset: Omit<import('./theme').ThemePreset, 'id' | 'createdAt'> & { id?: string }) => Promise<import('./theme').ThemePreset>
    getResolvedTheme: (profileId?: string, vaultPath?: string, courseId?: string, sectionId?: string) => Promise<import('./theme').ResolvedTheme>
    saveAppearanceOverride: (scopeType: import('./theme').ThemeScope, scopeId: string, overrides: Partial<import('./theme').ThemeConfig>, presetId?: string) => Promise<boolean>
    resetAppearanceOverride: (scopeType: import('./theme').ThemeScope, scopeId: string, category?: string) => Promise<boolean>
    exportThemePackage: (presetId: string, targetPath?: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
    importThemePackage: (filePath: string) => Promise<{ success: boolean; preset?: import('./theme').ThemePreset; error?: string }>
  }

  // Discovery & Smart Recommendations (v0.6)
  discovery: {
    getDiscoveryRails: (profileId?: string) => Promise<import('./discovery').DiscoveryRail[]>
    getSimilarCourses: (courseId: string, limit?: number) => Promise<import('./discovery').DiscoveryItem[]>
    getTimeBasedRecommendations: (minutes: number, profileId?: string) => Promise<import('./discovery').TimeBasedRecommendation[]>
    getSurpriseMe: (profileId?: string, mode?: 'continue' | 'start_new' | 'quick_lesson' | 'random') => Promise<import('./discovery').SurpriseRecommendation | null>
    getCategoryDiscovery: () => Promise<import('./discovery').CategoryDiscoveryData[]>
    getLibraryInsights: () => Promise<import('./discovery').LibraryInsights>

    // Profile Discovery Preferences
    getProfileDiscoveryPreferences: (profileId: string) => Promise<import('./discovery').ProfileDiscoveryPreferences>
    saveProfileDiscoveryPreferences: (preferences: import('./discovery').ProfileDiscoveryPreferences) => Promise<boolean>

    // Recommendation Feedback
    submitFeedback: (profileId: string, courseId: string, feedbackType: import('./discovery').RecommendationFeedbackType) => Promise<boolean>

    // Course Relationships & Journeys
    listCourseRelationships: (courseId?: string) => Promise<import('./discovery').CourseRelationship[]>
    addCourseRelationship: (sourceCourseId: string, targetCourseId: string, relationshipType: import('./discovery').CourseRelationshipType) => Promise<import('./discovery').CourseRelationship>
    deleteCourseRelationship: (id: string) => Promise<boolean>
  }

  // Connected Library (v0.8)
  sources: {
    listSummaries: () => Promise<import('./source').SourceSummary[]>
    syncNow: (rootId: string) => Promise<import('./source').SourceSyncResult>
    listCandidates: (status?: import('./source').SourceMatchStatus) => Promise<import('./source').SourceMatchCandidateView[]>
    link: (sourceItemId: string, canonicalType: import('./source').CanonicalSourceType, canonicalId: string) => Promise<import('./source').CanonicalSourceLink>
    unlink: (sourceItemId: string, canonicalType: import('./source').CanonicalSourceType, canonicalId: string) => Promise<boolean>
    reviewCandidate: (candidateId: string, decision: Exclude<import('./source').SourceMatchStatus, 'pending'>) => Promise<import('./source').SourceMatchCandidateView>
    matchRoot: (rootId: string) => Promise<import('./source').SourceMatchSummary>
  }

  // Media Optimization Engine (v0.7)
  optimizer: {
    analyzeVault: (profile?: import('./optimizer').OptimizationProfile) => Promise<import('./optimizer').VaultOptimizationAnalysis>
    getHardwareCapabilities: () => Promise<import('./optimizer').HardwareCapabilities>
    queueVaultOptimization: (options?: {
      profile?: import('./optimizer').OptimizationProfile
      excludedLessonIds?: string[]
      allowSharedOptimization?: boolean
    }) => Promise<{ queuedCount: number }>
    queueLessonOptimization: (
      lessonId: string,
      profile?: import('./optimizer').OptimizationProfile,
      allowShared?: boolean
    ) => Promise<{ success: boolean; jobId?: string }>
    listQueue: () => Promise<import('./optimizer').OptimizationQueueItem[]>
    pauseJob: (jobId: string) => Promise<boolean>
    resumeJob: (jobId: string) => Promise<boolean>
    cancelJob: (jobId: string) => Promise<boolean>
    retryJob: (jobId: string) => Promise<boolean>
    clearCompletedQueue: () => Promise<boolean>
    pauseAll: () => Promise<boolean>
    resumeAll: () => Promise<boolean>
    generateVisualComparison: (
      lessonId: string,
      profile?: import('./optimizer').OptimizationProfile
    ) => Promise<import('./optimizer').VisualComparisonResult>
    listRecords: (limit?: number) => Promise<import('./optimizer').OptimizationRecord[]>
    restoreOriginal: (recordId: string) => Promise<{ success: boolean; error?: string }>
    reoptimizeLesson: (
      lessonId: string,
      profile?: import('./optimizer').OptimizationProfile
    ) => Promise<{ success: boolean; error?: string }>
    getMetrics: () => Promise<import('./optimizer').StorageOptimizerMetrics>
    getSettings: () => Promise<import('./optimizer').OptimizationSettings>
    updateSettings: (settings: Partial<import('./optimizer').OptimizationSettings>) => Promise<boolean>
    listExclusions: () => Promise<import('./optimizer').OptimizationExclusionRule[]>
    setExclusion: (
      scopeType: import('./optimizer').OptimizationExclusionRule['scopeType'],
      scopeId: string,
      isExcluded: boolean
    ) => Promise<boolean>
    onProgress: (callback: (item: import('./optimizer').OptimizationQueueItem) => void) => () => void
  }

  // App Settings
  settings: {
    get: () => Promise<AppSettings>
    set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
  }

  // AI foundation (v0.9 Phase 1 and final hardening)
  ai: {
    getSettings: () => Promise<AiSettingsSnapshot>
    saveProvider: (input: AiProviderUpdate) => Promise<AiSettingsSnapshot>
    setRoute: (input: AiRouteUpdate) => Promise<AiSettingsSnapshot>
    setPrivacyMode: (privacyMode: AiPrivacyMode) => Promise<AiSettingsSnapshot>
    setAllowedCloudDataTypes: (dataTypes: AiDataType[]) => Promise<AiSettingsSnapshot>
    discoverModels: (providerId: AiProviderId) => Promise<AiModel[]>
    health: (providerId: AiProviderId, modelId?: string) => Promise<AiProviderHealth>
    chat: (input: AiChatInput) => Promise<AiChatResponse>
    embed: (input: AiEmbeddingRequest) => Promise<AiEmbeddingResponse>
    getStorageStats: () => Promise<import('./ai').AiStorageStats>
    clearStorageCategory: (category: import('./ai').AiStorageCategory) => Promise<boolean>
    getUsageStats: () => Promise<import('./ai').AiLocalUsageStats>
    resetUsageStats: () => Promise<boolean>
  }

  // Content extraction, embeddings and local semantic index (v0.9 Phase 3)
  semanticIndex: {
    getStatus: () => Promise<SemanticIndexStatus>
    getMetrics: () => Promise<SemanticIndexMetrics>
    getSettings: () => Promise<SemanticIndexSettings>
    updateSettings: (settings: Partial<SemanticIndexSettings>) => Promise<boolean>
    enqueue: (input: SemanticIndexEnqueueInput) => Promise<import('./optimizer').OptimizationQueueItem>
    rebuild: (input: Omit<SemanticIndexEnqueueInput, 'rebuild'>) => Promise<import('./optimizer').OptimizationQueueItem>
    refreshSource: (
      selection: SemanticSourceSelection,
      options?: Omit<SemanticIndexEnqueueInput, 'scope' | 'rebuild'>
    ) => Promise<import('./optimizer').OptimizationQueueItem>
    removeSource: (selection: SemanticSourceSelection) => Promise<boolean>
    listQueue: () => Promise<import('./optimizer').OptimizationQueueItem[]>
    pauseJob: (jobId: string) => Promise<boolean>
    resumeJob: (jobId: string) => Promise<boolean>
    cancelJob: (jobId: string) => Promise<boolean>
    retryJob: (jobId: string) => Promise<boolean>
    onProgress: (callback: (item: import('./optimizer').OptimizationQueueItem) => void) => () => void
  }

  // Grounded chat and source navigation (v0.9 Phase 4)
  chat: {
    ask: (input: GroundedChatRequest) => Promise<GroundedChatResponse>
    cancel: (requestId: string) => Promise<boolean>
    listConversations: () => Promise<ChatConversationSummary[]>
    getConversation: (id: string) => Promise<ChatConversation | null>
    renameConversation: (id: string, title: string) => Promise<boolean>
    deleteConversation: (id: string) => Promise<boolean>
    resolveSource: (input: SourceNavigationRequest) => Promise<SourceNavigationResult>
  }

  // Semantic library search and related content (v0.9 Phase 5)
  search: {
    findInLibrary: (input: LibrarySearchRequest) => Promise<LibrarySearchResponse>
    related: (input: RelatedContentRequest) => Promise<RelatedContentResponse>
    resolveResult: (input: { chunkId: string }) => Promise<LibrarySearchNavigationResult>
  }

  // Summaries (v0.9 Phase 6)
  summaries: {
    get: (scope: import('./summaries').SummaryScope) => Promise<import('./summaries').SummaryRecord | null>
    generate: (input: import('./summaries').GenerateSummaryRequest) => Promise<import('./summaries').GenerateSummaryResponse>
    invalidate: (scope: import('./summaries').SummaryScope) => Promise<boolean>
  }

  // Automatic & Manual Chapters (v0.9 Phase 6)
  chapters: {
    get: (lessonId: string) => Promise<import('./chapters').LessonChapter[]>
    generate: (input: import('./chapters').GenerateChaptersRequest) => Promise<import('./chapters').GenerateChaptersResponse>
    save: (input: import('./chapters').SaveChaptersRequest) => Promise<import('./chapters').LessonChapter[]>
    update: (input: import('./chapters').UpdateChapterRequest) => Promise<import('./chapters').LessonChapter>
    delete: (input: import('./chapters').DeleteChapterRequest) => Promise<boolean>
  }

  // AI-Assisted Notes (v0.9 Phase 6)
  aiNotes: {
    suggest: (input: import('./ai-notes').AiNoteRequest) => Promise<import('./ai-notes').AiNoteSuggestion>
  }

  // System
  system: {
    getLocale: () => Promise<string>
    openExternal: (url: string) => Promise<boolean>
    openPath: (filePath: string) => Promise<boolean>
    getPathForFile: (file: File) => string
  }
}
