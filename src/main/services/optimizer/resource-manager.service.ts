import { powerMonitor } from 'electron'
import type { OptimizationSettings } from '../../../types/optimizer'

export class ResourceManagerService {
  private isPlayerActive = false
  private isIdle = false

  constructor() {
    try {
      if (powerMonitor) {
        powerMonitor.on('on-battery', () => {
          // React to battery mode
        })
        powerMonitor.on('on-ac', () => {
          // React to AC mode
        })
      }
    } catch {
      // Ignore if not in full Electron environment
    }
  }

  public setPlayerActive(active: boolean): void {
    this.isPlayerActive = active
  }

  public setIdle(idle: boolean): void {
    this.isIdle = idle
  }

  public isSystemIdle(): boolean {
    return this.isIdle
  }

  /**
   * Determines if the background optimizer is permitted to process jobs right now.
   */
  public canProcessJobs(settings: OptimizationSettings): boolean {
    if (settings.pauseWhileWatching && this.isPlayerActive) {
      return false
    }

    if (settings.pauseOnBattery) {
      try {
        if (powerMonitor && typeof powerMonitor.isOnBatteryPower === 'function') {
          if (powerMonitor.isOnBatteryPower()) {
            return false
          }
        }
      } catch {
        // Ignore
      }
    }

    return true
  }

  /**
   * Returns encoder priority delay based on resource mode and current system state.
   */
  public getConcurrencyLimit(settings: OptimizationSettings): number {
    if (this.isPlayerActive) return 1

    switch (settings.resourceMode) {
      case 'economy':
        return 1
      case 'max_performance':
        return Math.max(1, Math.min(settings.maxConcurrentJobs || 1, 2))
      case 'balanced':
      case 'automatic':
      default:
        return 1
    }
  }
}

export const resourceManagerService = new ResourceManagerService()
