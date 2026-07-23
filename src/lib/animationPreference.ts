const STORAGE_KEY = 'family-bonding:animations-enabled'

/** On by default — only ever "off" once someone has explicitly turned it off. */
export function getStoredAnimationsEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== 'off'
}

export function storeAnimationsEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
}
