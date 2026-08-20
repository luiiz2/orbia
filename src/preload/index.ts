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
    getImportHistory: () => ipcRenderer.invoke('courses:get-import-history'),
    recordImportHistory: (entry) => ipcRenderer.invoke('courses:record-import-history', entry),
    clearImportHistory: () => ipcRenderer.invoke('courses:clear-import-history'),
    selectCoverImage: () => ipcRenderer.invoke('courses:select-cover-image'),
    updateCourseCover: (courseId, coverPath) => ipcRenderer.invoke('courses:update-course-cover', { courseId, coverPath }),
    updateLessonCover: (lessonId, coverPath) => ipcRenderer.invoke('courses:update-lesson-cover', { lessonId, coverPath }),
    list: () => ipcRenderer.invoke('courses:list'),
    getById: (courseId: string) => ipcRenderer.invoke('courses:get-by-id', { courseId }),
    delete: (courseId: string, deleteFiles: boolean) => ipcRenderer.invoke('courses:delete', { courseId, deleteFiles }),
    toggleFavorite: (courseId: string) => ipcRenderer.invoke('courses:toggle-favorite', { courseId }),
    updateLessonDuration: (lessonId: string, duration: number) =>
      ipcRenderer.invoke('courses:update-lesson-duration', { lessonId, duration }),
    convertSrtToVtt: (srtPath: string) => ipcRenderer.invoke('courses:convert-srt-to-vtt', { srtPath }),
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
    exportCourseNotes: (courseId: string) => ipcRenderer.invoke('player:export-course-notes', { courseId })
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
