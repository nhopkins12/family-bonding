import { useEffect, useState } from 'react'
import { getCurrentUser } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'

export interface AuthState {
  status: 'loading' | 'signed-in' | 'signed-out'
  userId: string | null
  loginId?: string
}

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading', userId: null })

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const user = await getCurrentUser()
        if (cancelled) return
        setState({ status: 'signed-in', userId: user.userId, loginId: user.signInDetails?.loginId })
      } catch {
        if (!cancelled) setState({ status: 'signed-out', userId: null })
      }
    }

    refresh()

    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn' || payload.event === 'signedOut') refresh()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return state
}
