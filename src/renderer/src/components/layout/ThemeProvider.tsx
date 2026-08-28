import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback
} from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'

type Theme = 'dark' | 'light' | 'system'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => Promise<void>
  resolvedTheme: 'dark' | 'light'
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function applyThemeToDOM(theme: Theme): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark'

  const root = document.documentElement
  const isLight =
    theme === 'system'
      ? typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: light)').matches
      : theme === 'light'

  const resolved = isLight ? 'light' : 'dark'

  if (isLight) {
    root.classList.remove('dark')
    root.classList.add('light')
    root.setAttribute('data-theme', 'light')
    root.style.colorScheme = 'light'
  } else {
    root.classList.remove('light')
    root.classList.add('dark')
    root.setAttribute('data-theme', 'dark')
    root.style.colorScheme = 'dark'
  }

  // Clear inline color overrides so .light/.dark stylesheet definitions take effect
  if (root.style && typeof root.style.removeProperty === 'function') {
    const colorProps = [
      '--background',
      '--foreground',
      '--card',
      '--card-foreground',
      '--popover',
      '--popover-foreground',
      '--primary',
      '--primary-foreground',
      '--secondary',
      '--secondary-foreground',
      '--accent',
      '--accent-foreground',
      '--border',
      '--input',
      '--ring',
      '--card-border'
    ]
    for (const prop of colorProps) {
      root.style.removeProperty(prop)
    }
  }

  try {
    localStorage.setItem('orbia_theme', theme)
  } catch {
    // Ignore localStorage failures in restricted contexts
  }

  return resolved
}

export function ThemeProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const { settings, setTheme: storeSetTheme, init } = useSettingsStore()
  const currentTheme: Theme = (settings?.theme as Theme) || 'dark'

  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() => {
    return applyThemeToDOM(currentTheme)
  })

  const handleSetTheme = useCallback(
    async (newTheme: Theme) => {
      const resolved = applyThemeToDOM(newTheme)
      setResolvedTheme(resolved)
      await storeSetTheme(newTheme)
    },
    [storeSetTheme]
  )

  useEffect(() => {
    init().catch((err) =>
      console.warn('Failed to init settings store in ThemeProvider:', err)
    )
  }, [init])

  useEffect(() => {
    const resolved = applyThemeToDOM(currentTheme)
    setResolvedTheme(resolved)

    if (currentTheme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
      const handleChange = (): void => {
        const newResolved = applyThemeToDOM('system')
        setResolvedTheme(newResolved)
      }
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    return undefined
  }, [currentTheme])

  return (
    <ThemeContext.Provider
      value={{ theme: currentTheme, setTheme: handleSetTheme, resolvedTheme }}
    >
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
