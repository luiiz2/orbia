import { registerVaultIpc } from './vault.ipc'
import { registerCoursesIpc } from './courses.ipc'
import { registerPlayerIpc } from './player.ipc'
import { registerSettingsIpc } from './settings.ipc'

export function registerAllIpc(): void {
  registerVaultIpc()
  registerCoursesIpc()
  registerPlayerIpc()
  registerSettingsIpc()
}
