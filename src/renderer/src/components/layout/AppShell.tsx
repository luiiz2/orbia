import React from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { usePlayerStore } from '../../stores/usePlayerStore'
import { useNavigationStore } from '../../stores/useNavigationStore'
import { cn } from '../../lib/utils'

export interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps): React.JSX.Element {
  const { isFullscreen } = usePlayerStore()
  const { currentView } = useNavigationStore()

  // In pure fullscreen playback mode, we allow the video to occupy full screen without shell framing
  const isVideoFullscreen = isFullscreen && currentView === 'player'

  if (isVideoFullscreen) {
    return <div className="h-screen w-screen overflow-hidden bg-black">{children}</div>
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground select-none">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className={cn('flex-1 overflow-y-auto bg-background/95 relative')}>
          {children}
        </main>
      </div>
    </div>
  )
}
