export type ThemeOverride = 'light' | 'dark' | null

const STORAGE_KEY = 'family-bonding:theme'

/** null means "no manual override yet" — follow the system setting. */
export function getStoredTheme(): ThemeOverride {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : null
}

export function storeTheme(theme: ThemeOverride): void {
  if (theme === null) {
    localStorage.removeItem(STORAGE_KEY)
  } else {
    localStorage.setItem(STORAGE_KEY, theme)
  }
}
