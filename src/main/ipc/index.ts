import { registerVaultIpc } from './vault.ipc'
import { registerCoursesIpc } from './courses.ipc'
import { registerPlayerIpc } from './player.ipc'
import { registerSettingsIpc } from './settings.ipc'
import { registerReviewIpc } from './review.ipc'
import { registerStudioIpc } from './studio.ipc'
import { registerDiscoveryIpc } from './discovery.ipc'
import { registerOptimizerIpc } from './optimizer.ipc'
import { registerSourcesIpc } from './sources.ipc'
import { registerAiIpc } from './ai.ipc'
import { registerTranscriptionIpc } from './transcription.ipc'
import { registerSemanticIndexIpc } from './semantic-index.ipc'
import { registerChatIpc } from './chat.ipc'

export function registerAllIpc(): void {
  registerVaultIpc()
  registerCoursesIpc()
  registerPlayerIpc()
  registerSettingsIpc()
  registerReviewIpc()
  registerStudioIpc()
  registerDiscoveryIpc()
  registerOptimizerIpc()
  registerSourcesIpc()
  registerAiIpc()
  registerTranscriptionIpc()
  registerSemanticIndexIpc()
  registerChatIpc()
}

