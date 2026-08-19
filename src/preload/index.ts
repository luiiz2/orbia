import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { OrbiaApi, ExtractProgressPayload } from '../types'

// Type-safe IPC Bridge implementation
const api: OrbiaApi = {
  vault: {
    create: (path: string, name: string) => ipcRenderer.invoke('vault:create', { path, name }),
    open: (path: string) => ipcRenderer.invoke('vault:open', { path }),
    getRecent: () => ipcRenderer.invoke('vault:get-recent'),
    getCurrent: () => ipcRenderer.invoke('vault:get-current'),
    getStats: () => ipcRenderer.invoke('vault:get-stats'),
    selectDirectory: () => ipcRenderer.invoke('vault:select-directory')
  },

  courses: {
    selectSource: () => ipcRenderer.invoke('courses:select-source'),
    selectZip: () => ipcRenderer.invoke('courses:select-zip'),
    selectFolder: () => ipcRenderer.invoke('courses:select-folder'),
    extractZip: (zipPath: string) => ipcRenderer.invoke('courses:extract-zip', { zipPath }),
    scanFolder: (folderPath: string) => ipcRenderer.invoke('courses:scan-folder', { folderPath }),
    importCourse: (proposal, isExternal) => ipcRenderer.invoke('courses:import', { proposal, isExternal }),
    importBatch: (items) => ipcRenderer.invoke('courses:import-batch', { items }),
    selectCoverImage: () => ipcRenderer.invoke('courses:select-cover-image'),
    updateCourseCover: (courseId, coverPath) => ipcRenderer.invoke('courses:update-course-cover', { courseId, coverPath }),
    updateLessonCover: (lessonId, coverPath) => ipcRenderer.invoke('courses:update-lesson-cover', { lessonId, coverPath }),
    list: () => ipcRenderer.invoke('courses:list'),
    getById: (courseId: string) => ipcRenderer.invoke('courses:get-by-id', { courseId }),
    delete: (courseId: string, deleteFiles: boolean) => ipcRenderer.invoke('courses:delete', { courseId, deleteFiles }),
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
    getCourseProgress: (courseId: string) => ipcRenderer.invoke('player:get-course-progress', { courseId }),
    getAllProgressSummaries: () => ipcRenderer.invoke('player:get-all-progress-summaries'),
    toggleLessonCompletion: (lessonId: string, courseId: string) =>
      ipcRenderer.invoke('player:toggle-lesson-completion', { lessonId, courseId }),
    getWatchHistory: (limit?: number) => ipcRenderer.invoke('player:get-watch-history', { limit }),
    addWatchHistory: (entry) => ipcRenderer.invoke('player:add-watch-history', entry)
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value })
  },

  system: {
    getLocale: () => ipcRenderer.invoke('system:get-locale')
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
