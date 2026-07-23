import { useCallback, useEffect, useState } from 'react'
import { getStoredAnimationsEnabled, storeAnimationsEnabled } from './animationPreference'

export function useAnimationsEnabled() {
  const [enabled, setEnabledState] = useState<boolean>(getStoredAnimationsEnabled)

  useEffect(() => {
    document.documentElement.setAttribute('data-animations', enabled ? 'on' : 'off')
  }, [enabled])

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value)
    storeAnimationsEnabled(value)
  }, [])

  return { enabled, setEnabled }
}
