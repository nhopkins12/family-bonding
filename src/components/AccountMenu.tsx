import { useEffect, useRef, useState } from 'react'
import { signOut } from 'aws-amplify/auth'
import { useAppData } from '../state/AppDataContext'
import type { ThemeOverride } from '../lib/themePreference'
import { SignInForm } from './SignInForm'

interface AccountMenuProps {
  isSignedIn: boolean
  onOpenAdmin: () => void
  onOpenMyRankings: () => void
  themeOverride: ThemeOverride
  onSetTheme: (theme: ThemeOverride) => void
  animationsEnabled: boolean
  onSetAnimationsEnabled: (enabled: boolean) => void
}

export function AccountMenu({
  isSignedIn,
  onOpenAdmin,
  onOpenMyRankings,
  themeOverride,
  onSetTheme,
  animationsEnabled,
  onSetAnimationsEnabled,
}: AccountMenuProps) {
  const { myDisplayName, myUsername, isAdmin, renameMe } = useAppData()
  const [open, setOpen] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(myDisplayName)
  const containerRef = useRef<HTMLDivElement>(null)

  // The document-level listener below is registered once on mount, so it
  // closes over stale state/functions unless it reads through refs instead —
  // in particular commitNameRef, since commitName itself closes over renameMe,
  // which closes over myProfile, which is still null at mount (profile data
  // loads asynchronously). Without this, the mount-time commitName would be
  // permanently stuck with myProfile=null and silently no-op forever.
  const isEditingRef = useRef(isEditingName)
  isEditingRef.current = isEditingName
  const nameDraftRef = useRef(nameDraft)
  nameDraftRef.current = nameDraft
  // Guards against saving twice for the same edit — clicking outside the menu
  // triggers our own explicit save below, and depending on browser event
  // timing the input's onBlur can *also* still fire for that same click.
  // Reset whenever a fresh edit starts.
  const hasSubmittedRef = useRef(false)

  function commitName(value: string) {
    if (hasSubmittedRef.current) return
    hasSubmittedRef.current = true
    const trimmed = value.trim()
    if (trimmed) renameMe(trimmed).catch((err) => console.error('Failed to save display name', err))
  }

  const commitNameRef = useRef(commitName)
  commitNameRef.current = commitName

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // Clicking outside used to just discard whatever was typed, silently —
        // the input unmounts before its onBlur ever gets a chance to save it.
        if (isEditingRef.current) commitNameRef.current(nameDraftRef.current)
        setOpen(false)
        setIsEditingName(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  function submitName() {
    commitName(nameDraft)
    setIsEditingName(false)
  }

  // Shared by both the signed-in and signed-out panel layouts — each control
  // gets its own row (not crammed side by side) so it reads as part of the
  // normal menu flow rather than a bolted-on settings block.
  const settingsRows = (
    <>
      <div className="account-menu-setting-row">
        <span className="account-menu-setting-label">Theme</span>
        <div className="theme-toggle" role="group" aria-label="Theme">
          <button type="button" className={themeOverride === null ? 'active' : ''} onClick={() => onSetTheme(null)}>
            Default
          </button>
          <button type="button" className={themeOverride === 'light' ? 'active' : ''} onClick={() => onSetTheme('light')}>
            Light
          </button>
          <button type="button" className={themeOverride === 'dark' ? 'active' : ''} onClick={() => onSetTheme('dark')}>
            Dark
          </button>
        </div>
      </div>
      <div className="account-menu-setting-row">
        <span className="account-menu-setting-label">Animations</span>
        <label className="animations-toggle">
          <input type="checkbox" checked={animationsEnabled} onChange={(e) => onSetAnimationsEnabled(e.target.checked)} />
        </label>
      </div>
    </>
  )

  return (
    <div className="account-menu" ref={containerRef}>
      <button type="button" className="account-menu-trigger" onClick={() => setOpen((v) => !v)}>
        {isSignedIn ? myDisplayName : 'Sign in'}
      </button>

      {open && (
        <div className="account-menu-panel">
          {!isSignedIn ? (
            <>
              <div className="account-signin-wrap">
                <SignInForm />
              </div>
              {settingsRows}
            </>
          ) : (
            <>
              <div className="account-profile-row">
                {isEditingName ? (
                  <form
                    className="account-name-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      submitName()
                    }}
                  >
                    <input
                      autoFocus
                      aria-label="Display name"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={submitName}
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </form>
                ) : (
                  <>
                    <span className="account-profile-identity">
                      <span className="account-profile-name">{myDisplayName}</span>
                      {/* The permanent sign-in handle — shown so renaming the display
                          name above never leaves you unable to recall what you actually
                          type in the sign-in form. No "Sign in as" label: bold-on-top,
                          plain-underneath already reads as name/handle without it. */}
                      <span className="account-profile-username">{myUsername}</span>
                    </span>
                    <button
                      type="button"
                      className="account-profile-edit"
                      onClick={() => {
                        setNameDraft(myDisplayName)
                        hasSubmittedRef.current = false
                        setIsEditingName(true)
                      }}
                    >
                      Edit display name
                    </button>
                  </>
                )}
              </div>

              <button
                type="button"
                className="account-menu-item"
                onClick={() => {
                  onOpenMyRankings()
                  setOpen(false)
                }}
              >
                My Rankings
              </button>

              {isAdmin && (
                <button
                  type="button"
                  className="account-menu-item"
                  onClick={() => {
                    onOpenAdmin()
                    setOpen(false)
                  }}
                >
                  Admin controls
                </button>
              )}

              {settingsRows}

              <button type="button" className="account-menu-item account-menu-signout" onClick={() => signOut()}>
                Sign out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
