import { useCallback, useEffect, useState } from 'react'
import { getStoredTheme, storeTheme, type ThemeOverride } from './themePreference'

type ResolvedTheme = 'light' | 'dark'

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Single source of truth for theme state — call this once (in App) and pass
 * the pieces down, rather than calling it again in other components, so a
 * toggle click updates every consumer immediately instead of only the one
 * that happened to own its own separate hook instance. */
export function useTheme() {
  const [override, setOverride] = useState<ThemeOverride>(getStoredTheme)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme)

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemTheme(mql.matches ? 'dark' : 'light')
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (override) {
      document.documentElement.setAttribute('data-theme', override)
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [override])

  const setTheme = useCallback((theme: ThemeOverride) => {
    setOverride(theme)
    storeTheme(theme)
  }, [])

  return { theme: override ?? systemTheme, override, setTheme }
}
