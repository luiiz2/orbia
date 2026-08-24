import { registerVaultIpc } from './vault.ipc'
import { registerCoursesIpc } from './courses.ipc'
import { registerPlayerIpc } from './player.ipc'
import { registerSettingsIpc } from './settings.ipc'
import { registerReviewIpc } from './review.ipc'
import { registerStudioIpc } from './studio.ipc'
import { registerDiscoveryIpc } from './discovery.ipc'
import { registerOptimizerIpc } from './optimizer.ipc'

export function registerAllIpc(): void {
  registerVaultIpc()
  registerCoursesIpc()
  registerPlayerIpc()
  registerSettingsIpc()
  registerReviewIpc()
  registerStudioIpc()
  registerDiscoveryIpc()
  registerOptimizerIpc()
}


