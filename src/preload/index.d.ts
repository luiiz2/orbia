import { ElectronAPI } from '@electron-toolkit/preload'
import type { OrbiaApi } from '../types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: OrbiaApi
  }
}
