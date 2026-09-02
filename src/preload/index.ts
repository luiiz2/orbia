import {
  contextBridge,
  ipcRenderer,
  IpcRendererEvent,
  webUtils
} from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { OrbiaApi, ExtractProgressPayload } from '../types'

// Type-safe IPC Bridge implementation
const api: OrbiaApi = {
  vault: {
    create: (path: string, name: string) =>
      ipcRenderer.invoke('vault:create', { path, name }),
    open: (path: string) => ipcRenderer.invoke('vault:open', { path }),
    delete: (path: string, deleteFiles: boolean) =>
      ipcRenderer.invoke('vault:delete', { path, deleteFiles }),
    getRecent: () => ipcRenderer.invoke('vault:get-recent'),
    getCurrent: () => ipcRenderer.invoke('vault:get-current'),
    getStats: () => ipcRenderer.invoke('vault:get-stats'),
    selectDirectory: () => ipcRenderer.invoke('vault:select-directory')
  },

  courses: {
    selectSource: () => ipcRenderer.invoke('courses:select-source'),
    selectZip: () => ipcRenderer.invoke('courses:select-zip'),
    selectFolder: () => ipcRenderer.invoke('courses:select-folder'),
    selectMultiCourseFolder: () =>
      ipcRenderer.invoke('courses:select-multi-course-folder'),
    scanMultiCourseFolder: ({ token }) =>
      ipcRenderer.invoke('courses:scan-multi-course-folder', { token }),
    prepareZipImport: ({ token }) =>
      ipcRenderer.invoke('courses:prepare-zip-import', { token }),
    prepareFolderImport: ({ token }) =>
      ipcRenderer.invoke('courses:prepare-folder-import', { token }),
    cancelImportSession: (sessionId) =>
      ipcRenderer.invoke('courses:cancel-import-session', { sessionId }),
    commitImportSession: (input) =>
      ipcRenderer.invoke('courses:commit-import-session', input),
    extractZip: (zipPath: string, deleteSourceArchive?: boolean) =>
      ipcRenderer.invoke('courses:extract-zip', {
        zipPath,
        deleteSourceArchive
      }),
    scanFolder: (folderPath: string) =>
      ipcRenderer.invoke('courses:scan-folder', { folderPath }),
    importCourse: (proposal, isExternal) =>
      ipcRenderer.invoke('courses:import', { proposal, isExternal }),
    importBatch: (items) =>
      ipcRenderer.invoke('courses:import-batch', { items }),
    generateOrganizationPlan: (courseId) =>
      ipcRenderer.invoke('courses:generate-organization-plan', courseId),
    applyOrganizationPlan: (plan) =>
      ipcRenderer.invoke('courses:apply-organization-plan', plan),
    getImportHistory: () => ipcRenderer.invoke('courses:get-import-history'),
    recordImportHistory: (entry) =>
      ipcRenderer.invoke('courses:record-import-history', entry),
    clearImportHistory: () =>
      ipcRenderer.invoke('courses:clear-import-history'),
    selectCoverImage: () => ipcRenderer.invoke('courses:select-cover-image'),
    updateCourseCover: (courseId, coverPath) =>
      ipcRenderer.invoke('courses:update-course-cover', {
        courseId,
        coverPath
      }),
    updateLessonCover: (lessonId, coverPath) =>
      ipcRenderer.invoke('courses:update-lesson-cover', {
        lessonId,
        coverPath
      }),
    extractThumbnails: (payload?: { courseId?: string }) =>
      ipcRenderer.invoke('courses:extract-thumbnails', payload),
    list: () => ipcRenderer.invoke('courses:list'),
    getById: (courseId: string) =>
      ipcRenderer.invoke('courses:get-by-id', { courseId }),
    delete: (courseId: string, deleteFiles: boolean) =>
      ipcRenderer.invoke('courses:delete', { courseId, deleteFiles }),
    deleteLesson: (lessonId: string, deleteFileFromDisk?: boolean) =>
      ipcRenderer.invoke('courses:delete-lesson', {
        lessonId,
        deleteFileFromDisk
      }),
    getCourseHealth: (courseId: string) =>
      ipcRenderer.invoke('courses:get-course-health', { courseId }),
    fixCourseProblems: (courseId: string) =>
      ipcRenderer.invoke('courses:fix-course-problems', { courseId }),
    toggleFavorite: (courseId: string) =>
      ipcRenderer.invoke('courses:toggle-favorite', { courseId }),
    updateMetadata: (input: { courseId: string; customTitle?: string }) =>
      ipcRenderer.invoke('courses:update-metadata', input),
    updateModuleMetadata: (input: {
      moduleId: string
      customTitle?: string
      displayOrder?: number
    }) => ipcRenderer.invoke('courses:update-module-metadata', input),
    updateLessonMetadata: (input: {
      lessonId: string
      customTitle?: string
      displayOrder?: number
    }) => ipcRenderer.invoke('courses:update-lesson-metadata', input),
    reorderModule: (moduleId: string, direction: 'up' | 'down') =>
      ipcRenderer.invoke('courses:reorder-module', { moduleId, direction }),
    reorderLesson: (lessonId: string, direction: 'up' | 'down') =>
      ipcRenderer.invoke('courses:reorder-lesson', { lessonId, direction }),
    toggleLessonFavorite: (lessonId: string) =>
      ipcRenderer.invoke('courses:toggle-lesson-favorite', { lessonId }),
    toggleModuleCompletion: (moduleId: string, courseId: string) =>
      ipcRenderer.invoke('courses:toggle-module-completion', {
        moduleId,
        courseId
      }),
    searchGlobal: (query: string) =>
      ipcRenderer.invoke('courses:search-global', { query }),
    updateLessonDuration: (lessonId: string, duration: number) =>
      ipcRenderer.invoke('courses:update-lesson-duration', {
        lessonId,
        duration
      }),
    convertSrtToVtt: (srtPath: string) =>
      ipcRenderer.invoke('courses:convert-srt-to-vtt', { srtPath }),
    getReorganizePlan: (courseId: string) =>
      ipcRenderer.invoke('courses:get-reorganize-plan', { courseId }),
    applyReorganizePlan: (
      groupId: string,
      mutations: import('../types').ProposedFileMutation[],
      courseId: string
    ) =>
      ipcRenderer.invoke('courses:apply-reorganize-plan', {
        groupId,
        mutations,
        courseId
      }),
    undoReorganizePlan: (groupId: string) =>
      ipcRenderer.invoke('courses:undo-reorganize-plan', { groupId }),
    onExtractProgress: (
      callback: (progress: ExtractProgressPayload) => void
    ) => {
      const listener = (
        _event: IpcRendererEvent,
        progress: ExtractProgressPayload
      ): void => {
        callback(progress)
      }
      ipcRenderer.on('courses:extract-progress', listener)
      return () => {
        ipcRenderer.removeListener('courses:extract-progress', listener)
      }
    }
  },

  player: {
    saveProgress: (progress) =>
      ipcRenderer.invoke('player:save-progress', progress),
    getProgress: (lessonId: string) =>
      ipcRenderer.invoke('player:get-progress', { lessonId }),
    getLessonsProgress: (courseId: string) =>
      ipcRenderer.invoke('player:get-lessons-progress', { courseId }),
    getCourseProgress: (courseId: string) =>
      ipcRenderer.invoke('player:get-course-progress', { courseId }),
    getAllProgressSummaries: () =>
      ipcRenderer.invoke('player:get-all-progress-summaries'),
    toggleLessonCompletion: (lessonId: string, courseId: string) =>
      ipcRenderer.invoke('player:toggle-lesson-completion', {
        lessonId,
        courseId
      }),
    getWatchHistory: (limit?: number) =>
      ipcRenderer.invoke('player:get-watch-history', { limit }),
    addWatchHistory: (entry) =>
      ipcRenderer.invoke('player:add-watch-history', entry),
    getLessonNotes: (lessonId: string) =>
      ipcRenderer.invoke('player:get-lesson-notes', { lessonId }),
    addLessonNote: (note) => ipcRenderer.invoke('player:add-lesson-note', note),
    updateLessonNote: (id: string, content: string) =>
      ipcRenderer.invoke('player:update-lesson-note', { id, content }),
    deleteLessonNote: (id: string) =>
      ipcRenderer.invoke('player:delete-lesson-note', { id }),
    exportCourseNotes: (courseId: string) =>
      ipcRenderer.invoke('player:export-course-notes', { courseId }),
    getStudyAnalytics: (dailyGoalMinutes?: number) =>
      ipcRenderer.invoke('player:get-study-analytics', { dailyGoalMinutes }),
    setActive: (active: boolean) =>
      ipcRenderer.invoke('player:set-active', { active })
  },

  // Video Bookmarks (v0.3)
  bookmarks: {
    create: (bookmark) => ipcRenderer.invoke('bookmarks:create', bookmark),
    update: (id, updates) =>
      ipcRenderer.invoke('bookmarks:update', { id, updates }),
    delete: (id) => ipcRenderer.invoke('bookmarks:delete', id),
    listByLesson: (lessonId) =>
      ipcRenderer.invoke('bookmarks:list-by-lesson', lessonId),
    listByCourse: (courseId) =>
      ipcRenderer.invoke('bookmarks:list-by-course', courseId),
    listRecent: (limit) => ipcRenderer.invoke('bookmarks:list-recent', limit)
  },

  // Flashcards (v0.3)
  flashcards: {
    create: (card) => ipcRenderer.invoke('flashcards:create', card),
    update: (id, updates) =>
      ipcRenderer.invoke('flashcards:update', { id, updates }),
    delete: (id) => ipcRenderer.invoke('flashcards:delete', id),
    getById: (id) => ipcRenderer.invoke('flashcards:get-by-id', id),
    getDue: (limit) => ipcRenderer.invoke('flashcards:get-due', limit),
    listAll: (courseId) => ipcRenderer.invoke('flashcards:list-all', courseId),
    listByLesson: (lessonId) =>
      ipcRenderer.invoke('flashcards:list-by-lesson', lessonId),
    review: (id, grade) =>
      ipcRenderer.invoke('flashcards:review', { id, grade })
  },

  // Study Queue ("Estudar Depois") (v0.3)
  studyQueue: {
    add: (entityType, entityId) =>
      ipcRenderer.invoke('studyQueue:add', { entityType, entityId }),
    remove: (id) => ipcRenderer.invoke('studyQueue:remove', id),
    reorder: (id, direction) =>
      ipcRenderer.invoke('studyQueue:reorder', { id, direction }),
    list: () => ipcRenderer.invoke('studyQueue:list')
  },

  // Course Goals (v0.3)
  goals: {
    get: (courseId) => ipcRenderer.invoke('goals:get', courseId),
    set: (goal) => ipcRenderer.invoke('goals:set', goal),
    delete: (courseId) => ipcRenderer.invoke('goals:delete', courseId)
  },

  // Backup & Restore (.orbia) (v0.3)
  backup: {
    create: (targetFilePath, vaultName) =>
      ipcRenderer.invoke('backup:create', { targetFilePath, vaultName }),
    inspect: (backupFilePath) =>
      ipcRenderer.invoke('backup:inspect', backupFilePath),
    restore: (backupFilePath) =>
      ipcRenderer.invoke('backup:restore', backupFilePath),
    selectBackupFile: () => ipcRenderer.invoke('backup:select-backup-file'),
    selectSaveBackupPath: (defaultName) =>
      ipcRenderer.invoke('backup:select-save-path', defaultName)
  },

  // Data Exports (v0.3)
  exports: {
    notesMarkdown: (courseId) =>
      ipcRenderer.invoke('exports:notes-markdown', courseId),
    bookmarksMarkdown: (courseId) =>
      ipcRenderer.invoke('exports:bookmarks-markdown', courseId),
    flashcardsCsv: (courseId) =>
      ipcRenderer.invoke('exports:flashcards-csv', courseId),
    flashcardsMarkdown: (courseId) =>
      ipcRenderer.invoke('exports:flashcards-markdown', courseId),
    saveExportToFile: (defaultFileName, content) =>
      ipcRenderer.invoke('exports:save-file', { defaultFileName, content })
  },

  // Study Sessions (v0.3)
  sessions: {
    start: (courseId, source) =>
      ipcRenderer.invoke('sessions:start', { courseId, source }),
    end: (sessionId, duration) =>
      ipcRenderer.invoke('sessions:end', { sessionId, duration }),
    list: (limit) => ipcRenderer.invoke('sessions:list', limit)
  },

  // Review Dashboard (v0.3)
  review: {
    getDashboardStats: () => ipcRenderer.invoke('review:get-dashboard-stats')
  },

  // Library Studio & Customization (v0.5)
  studio: {
    listAppearances: (courseId, includeHidden) =>
      ipcRenderer.invoke('studio:list-appearances', courseId, includeHidden),
    updateAppearance: (id, updates) =>
      ipcRenderer.invoke('studio:update-appearance', id, updates),
    createReference: (
      entityType,
      entityId,
      targetCourseId,
      parentAppearanceId
    ) =>
      ipcRenderer.invoke(
        'studio:create-reference',
        entityType,
        entityId,
        targetCourseId,
        parentAppearanceId
      ),
    deleteAppearance: (appearanceId) =>
      ipcRenderer.invoke('studio:delete-appearance', appearanceId),
    setHidden: (appearanceIds, isHidden) =>
      ipcRenderer.invoke('studio:set-hidden', appearanceIds, isHidden),

    createSection: (courseId, title, moduleId) =>
      ipcRenderer.invoke('studio:create-section', courseId, title, moduleId),
    updateSection: (id, updates) =>
      ipcRenderer.invoke('studio:update-section', id, updates),
    deleteSection: (id) => ipcRenderer.invoke('studio:delete-section', id),
    listSections: (courseId) =>
      ipcRenderer.invoke('studio:list-sections', courseId),

    createCollection: (name, description, color, icon) =>
      ipcRenderer.invoke(
        'studio:create-collection',
        name,
        description,
        color,
        icon
      ),
    updateCollection: (id, updates) =>
      ipcRenderer.invoke('studio:update-collection', id, updates),
    deleteCollection: (id) =>
      ipcRenderer.invoke('studio:delete-collection', id),
    listCollections: () => ipcRenderer.invoke('studio:list-collections'),
    addItemsToCollection: (collectionId, appearanceIds) =>
      ipcRenderer.invoke(
        'studio:add-items-to-collection',
        collectionId,
        appearanceIds
      ),
    removeItemsFromCollection: (collectionId, appearanceIds) =>
      ipcRenderer.invoke(
        'studio:remove-items-from-collection',
        collectionId,
        appearanceIds
      ),

    listCustomFieldDefinitions: () =>
      ipcRenderer.invoke('studio:list-custom-field-definitions'),
    createCustomFieldDefinition: (name, fieldType, options) =>
      ipcRenderer.invoke(
        'studio:create-custom-field-definition',
        name,
        fieldType,
        options
      ),
    deleteCustomFieldDefinition: (id) =>
      ipcRenderer.invoke('studio:delete-custom-field-definition', id),
    getCustomFieldValues: (entityId) =>
      ipcRenderer.invoke('studio:get-custom-field-values', entityId),
    setCustomFieldValue: (entityId, fieldId, value) =>
      ipcRenderer.invoke(
        'studio:set-custom-field-value',
        entityId,
        fieldId,
        value
      ),

    courseToModule: (sourceCourseId, targetCourseId) =>
      ipcRenderer.invoke(
        'studio:course-to-module',
        sourceCourseId,
        targetCourseId
      ),
    moduleToCourse: (moduleId, newCourseTitle) =>
      ipcRenderer.invoke('studio:module-to-course', moduleId, newCourseTitle),
    moveItems: (appearanceIds, targetParentId, targetCourseId) =>
      ipcRenderer.invoke(
        'studio:move-items',
        appearanceIds,
        targetParentId,
        targetCourseId
      ),
    createCourseFromSelection: (appearanceIds, courseTitle) =>
      ipcRenderer.invoke(
        'studio:create-course-from-selection',
        appearanceIds,
        courseTitle
      ),

    listHistory: (limit) => ipcRenderer.invoke('studio:list-history', limit),
    undo: (historyId) => ipcRenderer.invoke('studio:undo', historyId),

    renamePreview: (appearanceIds, options) =>
      ipcRenderer.invoke('studio:rename-preview', appearanceIds, options),
    renameApply: (items) => ipcRenderer.invoke('studio:rename-apply', items),
    applySpreadsheetDraft: (changes) =>
      ipcRenderer.invoke('studio:apply-spreadsheet-draft', changes),

    listAutomationRules: () =>
      ipcRenderer.invoke('studio:list-automation-rules'),
    saveAutomationRule: (rule) =>
      ipcRenderer.invoke('studio:save-automation-rule', rule),
    deleteAutomationRule: (id) =>
      ipcRenderer.invoke('studio:delete-automation-rule', id),
    executeAutomationRule: (ruleId) =>
      ipcRenderer.invoke('studio:execute-automation-rule', ruleId),

    listProfiles: () => ipcRenderer.invoke('studio:list-profiles'),
    createProfile: (name, avatarPath) =>
      ipcRenderer.invoke('studio:create-profile', name, avatarPath),
    updateProfile: (id, updates) =>
      ipcRenderer.invoke('studio:update-profile', id, updates),
    deleteProfile: (id) => ipcRenderer.invoke('studio:delete-profile', id),

    listThemePresets: () => ipcRenderer.invoke('studio:list-theme-presets'),
    saveThemePreset: (preset) =>
      ipcRenderer.invoke('studio:save-theme-preset', preset),
    getResolvedTheme: (profileId, vaultPath, courseId, sectionId) =>
      ipcRenderer.invoke(
        'studio:get-resolved-theme',
        profileId,
        vaultPath,
        courseId,
        sectionId
      ),
    saveAppearanceOverride: (scopeType, scopeId, overrides, presetId) =>
      ipcRenderer.invoke(
        'studio:save-appearance-override',
        scopeType,
        scopeId,
        overrides,
        presetId
      ),
    resetAppearanceOverride: (scopeType, scopeId, category) =>
      ipcRenderer.invoke(
        'studio:reset-appearance-override',
        scopeType,
        scopeId,
        category
      ),
    exportThemePackage: (presetId, targetPath) =>
      ipcRenderer.invoke('studio:export-theme-package', presetId, targetPath),
    importThemePackage: (filePath) =>
      ipcRenderer.invoke('studio:import-theme-package', filePath)
  },

  discovery: {
    getDiscoveryRails: (profileId) =>
      ipcRenderer.invoke('discovery:get-rails', profileId),
    getSimilarCourses: (courseId, limit) =>
      ipcRenderer.invoke('discovery:get-similar-courses', courseId, limit),
    getTimeBasedRecommendations: (minutes, profileId) =>
      ipcRenderer.invoke(
        'discovery:get-time-recommendations',
        minutes,
        profileId
      ),
    getSurpriseMe: (profileId, mode) =>
      ipcRenderer.invoke('discovery:get-surprise-me', profileId, mode),
    getCategoryDiscovery: () =>
      ipcRenderer.invoke('discovery:get-category-discovery'),
    getLibraryInsights: () => ipcRenderer.invoke('discovery:get-insights'),
    getProfileDiscoveryPreferences: (profileId) =>
      ipcRenderer.invoke('discovery:get-profile-preferences', profileId),
    saveProfileDiscoveryPreferences: (preferences) =>
      ipcRenderer.invoke('discovery:save-profile-preferences', preferences),
    submitFeedback: (profileId, courseId, feedbackType) =>
      ipcRenderer.invoke(
        'discovery:submit-feedback',
        profileId,
        courseId,
        feedbackType
      ),
    listCourseRelationships: (courseId) =>
      ipcRenderer.invoke('discovery:list-relationships', courseId),
    addCourseRelationship: (sourceCourseId, targetCourseId, relationshipType) =>
      ipcRenderer.invoke(
        'discovery:add-relationship',
        sourceCourseId,
        targetCourseId,
        relationshipType
      ),
    deleteCourseRelationship: (id) =>
      ipcRenderer.invoke('discovery:delete-relationship', id)
  },

  sources: {
    listSummaries: () => ipcRenderer.invoke('sources:list-summaries'),
    syncNow: (rootId) => ipcRenderer.invoke('sources:sync-now', { rootId }),
    listCandidates: (status) =>
      ipcRenderer.invoke('sources:list-candidates', { status }),
    link: (sourceItemId, canonicalType, canonicalId) =>
      ipcRenderer.invoke('sources:link', {
        sourceItemId,
        canonicalType,
        canonicalId
      }),
    unlink: (sourceItemId, canonicalType, canonicalId) =>
      ipcRenderer.invoke('sources:unlink', {
        sourceItemId,
        canonicalType,
        canonicalId
      }),
    reviewCandidate: (candidateId, decision) =>
      ipcRenderer.invoke('sources:review-candidate', { candidateId, decision }),
    matchRoot: (rootId) => ipcRenderer.invoke('sources:match-root', { rootId }),
    googleDrive: {
      getStatus: () => ipcRenderer.invoke('sources:google-status'),
      connect: () => ipcRenderer.invoke('sources:google-connect'),
      disconnect: () => ipcRenderer.invoke('sources:google-disconnect'),
      listFolder: (folderId, options) =>
        ipcRenderer.invoke('sources:google-list-folder', {
          folderId,
          ...options
        }),
      listSharedWithMe: (options) =>
        ipcRenderer.invoke('sources:google-list-shared-with-me', options),
      preparePlayback: (input) =>
        ipcRenderer.invoke('sources:google-prepare-playback', input),
      download: (input) =>
        ipcRenderer.invoke('sources:google-download', input),
      openExternal: (input) =>
        ipcRenderer.invoke('sources:google-open-external', input)
    }
  },

  // Media Optimization Engine (v0.7)
  optimizer: {
    analyzeVault: (profile) =>
      ipcRenderer.invoke('optimizer:analyze-vault', profile),
    getHardwareCapabilities: () =>
      ipcRenderer.invoke('optimizer:get-hardware-capabilities'),
    queueVaultOptimization: (options) =>
      ipcRenderer.invoke('optimizer:queue-vault-optimization', options),
    queueLessonOptimization: (lessonId, profile, allowShared) =>
      ipcRenderer.invoke(
        'optimizer:queue-lesson-optimization',
        lessonId,
        profile,
        allowShared
      ),
    listQueue: () => ipcRenderer.invoke('optimizer:list-queue'),
    pauseJob: (jobId) => ipcRenderer.invoke('optimizer:pause-job', jobId),
    resumeJob: (jobId) => ipcRenderer.invoke('optimizer:resume-job', jobId),
    cancelJob: (jobId) => ipcRenderer.invoke('optimizer:cancel-job', jobId),
    retryJob: (jobId) => ipcRenderer.invoke('optimizer:retry-job', jobId),
    clearCompletedQueue: () =>
      ipcRenderer.invoke('optimizer:clear-completed-queue'),
    pauseAll: () => ipcRenderer.invoke('optimizer:pause-all'),
    resumeAll: () => ipcRenderer.invoke('optimizer:resume-all'),
    generateVisualComparison: (lessonId, profile) =>
      ipcRenderer.invoke(
        'optimizer:generate-visual-comparison',
        lessonId,
        profile
      ),
    listRecords: (limit) => ipcRenderer.invoke('optimizer:list-records', limit),
    restoreOriginal: (recordId) =>
      ipcRenderer.invoke('optimizer:restore-original', recordId),
    reoptimizeLesson: (lessonId, profile) =>
      ipcRenderer.invoke('optimizer:reoptimize-lesson', lessonId, profile),
    getMetrics: () => ipcRenderer.invoke('optimizer:get-metrics'),
    getSettings: () => ipcRenderer.invoke('optimizer:get-settings'),
    updateSettings: (settings) =>
      ipcRenderer.invoke('optimizer:update-settings', settings),
    listExclusions: () => ipcRenderer.invoke('optimizer:list-exclusions'),
    setExclusion: (scopeType, scopeId, isExcluded) =>
      ipcRenderer.invoke(
        'optimizer:set-exclusion',
        scopeType,
        scopeId,
        isExcluded
      ),
    onProgress: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        item: import('../types/optimizer').OptimizationQueueItem
      ) => callback(item)
      ipcRenderer.on('optimizer:progress', handler)
      return () => {
        ipcRenderer.removeListener('optimizer:progress', handler)
      }
    }
  },

  transcription: {
    getCurrent: (lessonId: string) =>
      ipcRenderer.invoke('transcription:get-current', { lessonId }),
    listVersions: (lessonId: string) =>
      ipcRenderer.invoke('transcription:list-versions', { lessonId }),
    getSubtitleCandidate: (lessonId: string, language?: string) =>
      ipcRenderer.invoke('transcription:get-subtitle-candidate', {
        lessonId,
        language
      }),
    enqueueLesson: (
      lessonId: string,
      options?: import('../types').TranscriptionOptions
    ) =>
      ipcRenderer.invoke('transcription:enqueue-lesson', { lessonId, options }),
    enqueueModule: (
      moduleId: string,
      options?: import('../types').TranscriptionOptions
    ) =>
      ipcRenderer.invoke('transcription:enqueue-module', { moduleId, options }),
    enqueueCourse: (
      courseId: string,
      options?: import('../types').TranscriptionOptions
    ) =>
      ipcRenderer.invoke('transcription:enqueue-course', { courseId, options }),
    reuseSubtitle: (lessonId: string, language?: string) =>
      ipcRenderer.invoke('transcription:reuse-subtitle', {
        lessonId,
        language
      }),
    listQueue: () => ipcRenderer.invoke('transcription:list-queue'),
    pauseJob: (jobId: string) =>
      ipcRenderer.invoke('transcription:pause-job', { jobId }),
    resumeJob: (jobId: string) =>
      ipcRenderer.invoke('transcription:resume-job', { jobId }),
    cancelJob: (jobId: string) =>
      ipcRenderer.invoke('transcription:cancel-job', { jobId }),
    retryJob: (jobId: string) =>
      ipcRenderer.invoke('transcription:retry-job', { jobId }),
    getSettings: () => ipcRenderer.invoke('transcription:get-settings'),
    updateSettings: (
      settings: Partial<import('../types').TranscriptionSettings>
    ) => ipcRenderer.invoke('transcription:update-settings', settings),
    getCourseAutoTranscribe: (courseId: string) =>
      ipcRenderer.invoke('transcription:get-course-auto-transcribe', {
        courseId
      }),
    setCourseAutoTranscribe: (courseId: string, enabled: boolean) =>
      ipcRenderer.invoke('transcription:set-course-auto-transcribe', {
        courseId,
        enabled
      }),
    onProgress: (
      callback: (event: import('../types').TranscriptProgressEvent) => void
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        progress: import('../types').TranscriptProgressEvent
      ) => callback(progress)
      ipcRenderer.on('transcription:progress', handler)
      return () => ipcRenderer.removeListener('transcription:progress', handler)
    }
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value })
  },

  ai: {
    getSettings: () => ipcRenderer.invoke('ai:get-settings'),
    saveProvider: (input) => ipcRenderer.invoke('ai:save-provider', input),
    setRoute: (input) => ipcRenderer.invoke('ai:set-route', input),
    setPrivacyMode: (privacyMode) =>
      ipcRenderer.invoke('ai:set-privacy-mode', privacyMode),
    setAllowedCloudDataTypes: (dataTypes) =>
      ipcRenderer.invoke('ai:set-allowed-cloud-data-types', dataTypes),
    discoverModels: (providerId) =>
      ipcRenderer.invoke('ai:discover-models', providerId),
    health: (providerId, modelId) =>
      ipcRenderer.invoke('ai:health', { providerId, modelId }),
    chat: (input) => ipcRenderer.invoke('ai:chat', input),
    embed: (input) => ipcRenderer.invoke('ai:embed', input),
    getStorageStats: () => ipcRenderer.invoke('ai:get-storage-stats'),
    clearStorageCategory: (category) =>
      ipcRenderer.invoke('ai:clear-storage-category', category),
    getUsageStats: () => ipcRenderer.invoke('ai:get-usage-stats'),
    resetUsageStats: () => ipcRenderer.invoke('ai:reset-usage-stats')
  },

  semanticIndex: {
    getStatus: () => ipcRenderer.invoke('semantic-index:get-status'),
    getMetrics: () => ipcRenderer.invoke('semantic-index:get-metrics'),
    getSettings: () => ipcRenderer.invoke('semantic-index:get-settings'),
    updateSettings: (settings) =>
      ipcRenderer.invoke('semantic-index:update-settings', settings),
    enqueue: (input) => ipcRenderer.invoke('semantic-index:enqueue', input),
    rebuild: (input) => ipcRenderer.invoke('semantic-index:rebuild', input),
    refreshSource: (selection, options) =>
      ipcRenderer.invoke('semantic-index:refresh-source', {
        selection,
        options
      }),
    removeSource: (selection) =>
      ipcRenderer.invoke('semantic-index:remove-source', { selection }),
    listQueue: () => ipcRenderer.invoke('semantic-index:list-queue'),
    pauseJob: (jobId) =>
      ipcRenderer.invoke('semantic-index:pause-job', { jobId }),
    resumeJob: (jobId) =>
      ipcRenderer.invoke('semantic-index:resume-job', { jobId }),
    cancelJob: (jobId) =>
      ipcRenderer.invoke('semantic-index:cancel-job', { jobId }),
    retryJob: (jobId) =>
      ipcRenderer.invoke('semantic-index:retry-job', { jobId }),
    onProgress: (callback) => {
      const listener = (
        _event: IpcRendererEvent,
        item: import('../types').OptimizationQueueItem
      ) => callback(item)
      ipcRenderer.on('semantic-index:progress', listener)
      return () =>
        ipcRenderer.removeListener('semantic-index:progress', listener)
    }
  },

  chat: {
    ask: (input) => ipcRenderer.invoke('chat:ask', input),
    cancel: (requestId) => ipcRenderer.invoke('chat:cancel', { requestId }),
    listConversations: () => ipcRenderer.invoke('chat:list-conversations'),
    getConversation: (id) =>
      ipcRenderer.invoke('chat:get-conversation', { id }),
    renameConversation: (id, title) =>
      ipcRenderer.invoke('chat:rename-conversation', { id, title }),
    deleteConversation: (id) =>
      ipcRenderer.invoke('chat:delete-conversation', { id }),
    resolveSource: (input) => ipcRenderer.invoke('chat:resolve-source', input)
  },

  search: {
    findInLibrary: (input) =>
      ipcRenderer.invoke('search:find-in-library', input),
    related: (input) => ipcRenderer.invoke('search:related', input),
    resolveResult: (input) => ipcRenderer.invoke('search:resolve-result', input)
  },

  summaries: {
    get: (scope) => ipcRenderer.invoke('summaries:get', scope),
    generate: (input) => ipcRenderer.invoke('summaries:generate', input),
    invalidate: (scope) => ipcRenderer.invoke('summaries:invalidate', scope)
  },

  chapters: {
    get: (lessonId) => ipcRenderer.invoke('chapters:get', lessonId),
    generate: (input) => ipcRenderer.invoke('chapters:generate', input),
    save: (input) => ipcRenderer.invoke('chapters:save', input),
    update: (input) => ipcRenderer.invoke('chapters:update', input),
    delete: (input) => ipcRenderer.invoke('chapters:delete', input)
  },

  aiNotes: {
    suggest: (input) => ipcRenderer.invoke('ai-notes:suggest', input)
  },

  system: {
    getLocale: () => ipcRenderer.invoke('system:get-locale'),
    openExternal: (url: string) =>
      ipcRenderer.invoke('system:open-external', url),
    openPath: (filePath: string) =>
      ipcRenderer.invoke('system:open-path', filePath),
    getPathForFile: (file: File) => webUtils.getPathForFile(file)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Failed to expose IPC API bridge:', error)
  }
} else {
  // @ts-ignore (fallback when context isolation is disabled)
  window.electron = electronAPI
  // @ts-ignore (fallback when context isolation is disabled)
  window.api = api
}
