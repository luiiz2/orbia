import React, { createContext, useContext, useEffect } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'

type Theme = 'dark' | 'light' | 'system'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => Promise<void>
  resolvedTheme: 'dark' | 'light'
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { settings, setTheme: storeSetTheme, init } = useSettingsStore()
  const currentTheme = settings.theme || 'dark'

  const [resolvedTheme, setResolvedTheme] = React.useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark'
    if (currentTheme === 'system') {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    }
    return currentTheme
  })

  useEffect(() => {
    init().catch((err) => console.warn('Failed to init settings store in ThemeProvider:', err))
  }, [init])

  useEffect(() => {
    const root = document.documentElement

    const updateClass = (): void => {
      const isLight =
        currentTheme === 'system'
          ? window.matchMedia('(prefers-color-scheme: light)').matches
          : currentTheme === 'light'

      setResolvedTheme(isLight ? 'light' : 'dark')

      if (isLight) {
        root.classList.add('light')
        root.classList.remove('dark')
      } else {
        root.classList.add('dark')
        root.classList.remove('light')
      }
    }

    updateClass()

    if (currentTheme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
      const handleChange = (): void => updateClass()
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    return undefined
  }, [currentTheme])

  return (
    <ThemeContext.Provider value={{ theme: currentTheme, setTheme: storeSetTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
