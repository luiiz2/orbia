import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { OrbiaApi, ExtractProgressPayload } from '../types'

// Type-safe IPC Bridge implementation
const api: OrbiaApi = {
  vault: {
    create: (path: string, name: string) => ipcRenderer.invoke('vault:create', { path, name }),
    open: (path: string) => ipcRenderer.invoke('vault:open', { path }),
    delete: (path: string, deleteFiles: boolean) => ipcRenderer.invoke('vault:delete', { path, deleteFiles }),
    getRecent: () => ipcRenderer.invoke('vault:get-recent'),
    getCurrent: () => ipcRenderer.invoke('vault:get-current'),
    getStats: () => ipcRenderer.invoke('vault:get-stats'),
    selectDirectory: () => ipcRenderer.invoke('vault:select-directory')
  },

  courses: {
    selectSource: () => ipcRenderer.invoke('courses:select-source'),
    selectZip: () => ipcRenderer.invoke('courses:select-zip'),
    selectFolder: () => ipcRenderer.invoke('courses:select-folder'),
    selectMultiCourseFolder: () => ipcRenderer.invoke('courses:select-multi-course-folder'),
    scanMultiCourseFolder: (folderPath: string) => ipcRenderer.invoke('courses:scan-multi-course-folder', { folderPath }),
    prepareZipImport: ({ token }) => ipcRenderer.invoke('courses:prepare-zip-import', { token }),
    prepareFolderImport: ({ token }) => ipcRenderer.invoke('courses:prepare-folder-import', { token }),
    cancelImportSession: (sessionId) => ipcRenderer.invoke('courses:cancel-import-session', { sessionId }),
    commitImportSession: (input) => ipcRenderer.invoke('courses:commit-import-session', input),
    extractZip: (zipPath: string, deleteSourceArchive?: boolean) =>
      ipcRenderer.invoke('courses:extract-zip', { zipPath, deleteSourceArchive }),
    scanFolder: (folderPath: string) => ipcRenderer.invoke('courses:scan-folder', { folderPath }),
    importCourse: (proposal, isExternal) => ipcRenderer.invoke('courses:import', { proposal, isExternal }),
    importBatch: (items) => ipcRenderer.invoke('courses:import-batch', { items }),
    getMergePreview: (courseIds) => ipcRenderer.invoke('courses:get-merge-preview', { courseIds }),
    mergeCourses: (courseIds) => ipcRenderer.invoke('courses:merge-courses', { courseIds }),
    unmergeCourse: (courseId) => ipcRenderer.invoke('courses:unmerge-course', courseId),
    generateOrganizationPlan: (courseId) => ipcRenderer.invoke('courses:generate-organization-plan', courseId),
    applyOrganizationPlan: (plan) => ipcRenderer.invoke('courses:apply-organization-plan', plan),
    autoOrganize: () => ipcRenderer.invoke('courses:auto-organize'),
    separateMistakenlyMergedCourses: () => ipcRenderer.invoke('courses:separate-courses'),
    getImportHistory: () => ipcRenderer.invoke('courses:get-import-history'),
    recordImportHistory: (entry) => ipcRenderer.invoke('courses:record-import-history', entry),
    clearImportHistory: () => ipcRenderer.invoke('courses:clear-import-history'),
    selectCoverImage: () => ipcRenderer.invoke('courses:select-cover-image'),
    updateCourseCover: (courseId, coverPath) => ipcRenderer.invoke('courses:update-course-cover', { courseId, coverPath }),
    updateLessonCover: (lessonId, coverPath) => ipcRenderer.invoke('courses:update-lesson-cover', { lessonId, coverPath }),
    extractThumbnails: (payload?: { courseId?: string }) => ipcRenderer.invoke('courses:extract-thumbnails', payload),
    list: () => ipcRenderer.invoke('courses:list'),
    getById: (courseId: string) => ipcRenderer.invoke('courses:get-by-id', { courseId }),
    delete: (courseId: string, deleteFiles: boolean) => ipcRenderer.invoke('courses:delete', { courseId, deleteFiles }),
    deleteLesson: (lessonId: string, deleteFileFromDisk?: boolean) =>
      ipcRenderer.invoke('courses:delete-lesson', { lessonId, deleteFileFromDisk }),
    getCourseHealth: (courseId: string) => ipcRenderer.invoke('courses:get-course-health', { courseId }),
    fixCourseProblems: (courseId: string) => ipcRenderer.invoke('courses:fix-course-problems', { courseId }),
    toggleFavorite: (courseId: string) => ipcRenderer.invoke('courses:toggle-favorite', { courseId }),
    updateMetadata: (input: { courseId: string; customTitle?: string }) =>
      ipcRenderer.invoke('courses:update-metadata', input),
    updateModuleMetadata: (input: { moduleId: string; customTitle?: string; displayOrder?: number }) =>
      ipcRenderer.invoke('courses:update-module-metadata', input),
    updateLessonMetadata: (input: { lessonId: string; customTitle?: string; displayOrder?: number }) =>
      ipcRenderer.invoke('courses:update-lesson-metadata', input),
    reorderModule: (moduleId: string, direction: 'up' | 'down') =>
      ipcRenderer.invoke('courses:reorder-module', { moduleId, direction }),
    reorderLesson: (lessonId: string, direction: 'up' | 'down') =>
      ipcRenderer.invoke('courses:reorder-lesson', { lessonId, direction }),
    toggleLessonFavorite: (lessonId: string) =>
      ipcRenderer.invoke('courses:toggle-lesson-favorite', { lessonId }),
    toggleModuleCompletion: (moduleId: string, courseId: string) =>
      ipcRenderer.invoke('courses:toggle-module-completion', { moduleId, courseId }),
    searchGlobal: (query: string) =>
      ipcRenderer.invoke('courses:search-global', { query }),
    updateLessonDuration: (lessonId: string, duration: number) =>
      ipcRenderer.invoke('courses:update-lesson-duration', { lessonId, duration }),
    convertSrtToVtt: (srtPath: string) => ipcRenderer.invoke('courses:convert-srt-to-vtt', { srtPath }),
    getReorganizePlan: (courseId: string) => ipcRenderer.invoke('courses:get-reorganize-plan', { courseId }),
    applyReorganizePlan: (groupId: string, mutations: import('../types').ProposedFileMutation[], courseId: string) =>
      ipcRenderer.invoke('courses:apply-reorganize-plan', { groupId, mutations, courseId }),
    undoReorganizePlan: (groupId: string) => ipcRenderer.invoke('courses:undo-reorganize-plan', { groupId }),
    onExtractProgress: (callback: (progress: ExtractProgressPayload) => void) => {
      const listener = (_event: IpcRendererEvent, progress: ExtractProgressPayload): void => {
        callback(progress)
      }
      ipcRenderer.on('courses:extract-progress', listener)
      return () => {
        ipcRenderer.removeListener('courses:extract-progress', listener)
      }
    }
  },

  player: {
    saveProgress: (progress) => ipcRenderer.invoke('player:save-progress', progress),
    getProgress: (lessonId: string) => ipcRenderer.invoke('player:get-progress', { lessonId }),
    getLessonsProgress: (courseId: string) => ipcRenderer.invoke('player:get-lessons-progress', { courseId }),
    getCourseProgress: (courseId: string) => ipcRenderer.invoke('player:get-course-progress', { courseId }),
    getAllProgressSummaries: () => ipcRenderer.invoke('player:get-all-progress-summaries'),
    toggleLessonCompletion: (lessonId: string, courseId: string) =>
      ipcRenderer.invoke('player:toggle-lesson-completion', { lessonId, courseId }),
    getWatchHistory: (limit?: number) => ipcRenderer.invoke('player:get-watch-history', { limit }),
    addWatchHistory: (entry) => ipcRenderer.invoke('player:add-watch-history', entry),
    getLessonNotes: (lessonId: string) => ipcRenderer.invoke('player:get-lesson-notes', { lessonId }),
    addLessonNote: (note) => ipcRenderer.invoke('player:add-lesson-note', note),
    updateLessonNote: (id: string, content: string) => ipcRenderer.invoke('player:update-lesson-note', { id, content }),
    deleteLessonNote: (id: string) => ipcRenderer.invoke('player:delete-lesson-note', { id }),
    exportCourseNotes: (courseId: string) => ipcRenderer.invoke('player:export-course-notes', { courseId }),
    getStudyAnalytics: (dailyGoalMinutes?: number) => ipcRenderer.invoke('player:get-study-analytics', { dailyGoalMinutes })
  },

  // Video Bookmarks (v0.3)
  bookmarks: {
    create: (bookmark) => ipcRenderer.invoke('bookmarks:create', bookmark),
    update: (id, updates) => ipcRenderer.invoke('bookmarks:update', { id, updates }),
    delete: (id) => ipcRenderer.invoke('bookmarks:delete', id),
    listByLesson: (lessonId) => ipcRenderer.invoke('bookmarks:list-by-lesson', lessonId),
    listByCourse: (courseId) => ipcRenderer.invoke('bookmarks:list-by-course', courseId),
    listRecent: (limit) => ipcRenderer.invoke('bookmarks:list-recent', limit)
  },

  // Flashcards (v0.3)
  flashcards: {
    create: (card) => ipcRenderer.invoke('flashcards:create', card),
    update: (id, updates) => ipcRenderer.invoke('flashcards:update', { id, updates }),
    delete: (id) => ipcRenderer.invoke('flashcards:delete', id),
    getById: (id) => ipcRenderer.invoke('flashcards:get-by-id', id),
    getDue: (limit) => ipcRenderer.invoke('flashcards:get-due', limit),
    listAll: (courseId) => ipcRenderer.invoke('flashcards:list-all', courseId),
    listByLesson: (lessonId) => ipcRenderer.invoke('flashcards:list-by-lesson', lessonId),
    review: (id, grade) => ipcRenderer.invoke('flashcards:review', { id, grade })
  },

  // Study Queue ("Estudar Depois") (v0.3)
  studyQueue: {
    add: (entityType, entityId) => ipcRenderer.invoke('studyQueue:add', { entityType, entityId }),
    remove: (id) => ipcRenderer.invoke('studyQueue:remove', id),
    reorder: (id, direction) => ipcRenderer.invoke('studyQueue:reorder', { id, direction }),
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
    create: (targetFilePath, vaultName) => ipcRenderer.invoke('backup:create', { targetFilePath, vaultName }),
    inspect: (backupFilePath) => ipcRenderer.invoke('backup:inspect', backupFilePath),
    restore: (backupFilePath) => ipcRenderer.invoke('backup:restore', backupFilePath),
    selectBackupFile: () => ipcRenderer.invoke('backup:select-backup-file'),
    selectSaveBackupPath: (defaultName) => ipcRenderer.invoke('backup:select-save-path', defaultName)
  },

  // Data Exports (v0.3)
  exports: {
    notesMarkdown: (courseId) => ipcRenderer.invoke('exports:notes-markdown', courseId),
    bookmarksMarkdown: (courseId) => ipcRenderer.invoke('exports:bookmarks-markdown', courseId),
    flashcardsCsv: (courseId) => ipcRenderer.invoke('exports:flashcards-csv', courseId),
    flashcardsMarkdown: (courseId) => ipcRenderer.invoke('exports:flashcards-markdown', courseId),
    saveExportToFile: (defaultFileName, content) => ipcRenderer.invoke('exports:save-file', { defaultFileName, content })
  },

  // Study Sessions (v0.3)
  sessions: {
    start: (courseId, source) => ipcRenderer.invoke('sessions:start', { courseId, source }),
    end: (sessionId, duration) => ipcRenderer.invoke('sessions:end', { sessionId, duration }),
    list: (limit) => ipcRenderer.invoke('sessions:list', limit)
  },

  // Review Dashboard (v0.3)
  review: {
    getDashboardStats: () => ipcRenderer.invoke('review:get-dashboard-stats')
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value })
  },

  system: {
    getLocale: () => ipcRenderer.invoke('system:get-locale'),
    openExternal: (url: string) => ipcRenderer.invoke('system:open-external', url),
    openPath: (filePath: string) => ipcRenderer.invoke('system:open-path', filePath),
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
  // @ts-ignore
  window.api = api
}
