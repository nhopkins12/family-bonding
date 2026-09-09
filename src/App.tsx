import { lazy, Suspense, useEffect, useState } from 'react'
import { isBackendConfigured } from './lib/amplifyConfig'
import { useAuthState } from './lib/useAuthState'
import { useTheme } from './lib/useTheme'
import { useAnimationsEnabled } from './lib/useAnimationsEnabled'
import type { ThemeOverride } from './lib/themePreference'
import { AppDataProvider } from './state/AppDataContext'
import { NotDeployedScreen } from './components/NotDeployedScreen'
import { AccountMenu } from './components/AccountMenu'
import { GroupRanking } from './components/GroupRanking'
import { GunBarrelLoader } from './components/GunBarrelLoader'
import { DotsSweepLoader } from './components/DotsSweepLoader'

// Everything below is reached only by a deliberate click (a tab, a member, a
// movie, "write a review", the admin panel) rather than needed for first
// paint — splitting them into their own chunks keeps the initial bundle to
// just what's actually on screen when the splash finishes. MyReviewModal in
// particular pulls in the spellcheck/grammar-check libraries, which are
// otherwise dead weight for anyone who never opens the review editor.
const AdminPanel = lazy(() => import('./components/AdminPanel').then((m) => ({ default: m.AdminPanel })))
const RankingBoard = lazy(() => import('./components/RankingBoard').then((m) => ({ default: m.RankingBoard })))
const MembersList = lazy(() => import('./components/MembersList').then((m) => ({ default: m.MembersList })))
const WatchPlanner = lazy(() => import('./components/WatchPlanner').then((m) => ({ default: m.WatchPlanner })))
const MemberRankingPage = lazy(() => import('./components/MemberRankingPage').then((m) => ({ default: m.MemberRankingPage })))
const MovieDetailModal = lazy(() => import('./components/MovieDetailModal').then((m) => ({ default: m.MovieDetailModal })))
const MyReviewModal = lazy(() => import('./components/MyReviewModal').then((m) => ({ default: m.MyReviewModal })))
const IndividualMovieReview = lazy(() => import('./components/IndividualMovieReview').then((m) => ({ default: m.IndividualMovieReview })))

type Page =
  | { kind: 'browse'; tab: 'global' | 'next' | 'members' }
  | { kind: 'my-rankings' }
  | { kind: 'member-ranking'; ownerId: string }

type Overlay =
  | { kind: 'global-detail'; movieId: string }
  | { kind: 'my-review'; movieId: string }
  | { kind: 'member-review'; ownerId: string; movieId: string }

function AppShell({
  userId,
  loginId,
  authLoading,
  themeOverride,
  onSetTheme,
  animationsEnabled,
  onSetAnimationsEnabled,
}: {
  userId: string | null
  loginId?: string
  authLoading: boolean
  themeOverride: ThemeOverride
  onSetTheme: (theme: ThemeOverride) => void
  animationsEnabled: boolean
  onSetAnimationsEnabled: (enabled: boolean) => void
}) {
  const [page, setPage] = useState<Page>({ kind: 'browse', tab: 'global' })
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [adminPanelOpen, setAdminPanelOpen] = useState(false)
  const isSignedIn = Boolean(userId)

  // My Rankings is a signed-in-only page — bounce back to browsing if the session ends.
  useEffect(() => {
    if (!isSignedIn && page.kind === 'my-rankings') setPage({ kind: 'browse', tab: 'global' })
  }, [isSignedIn, page])

  function openGlobal() {
    setPage({ kind: 'browse', tab: 'global' })
  }
  function openMembers() {
    setPage({ kind: 'browse', tab: 'members' })
  }
  function openNext() {
    setPage({ kind: 'browse', tab: 'next' })
  }
  function openMember(ownerId: string) {
    setOverlay(null)
    setPage({ kind: 'member-ranking', ownerId })
  }
  function openMyRankings() {
    setPage({ kind: 'my-rankings' })
  }

  return (
    <AppDataProvider userId={userId} loginId={loginId} authLoading={authLoading}>
      <div className="app">
        <header className="app-header">
          <h1>Family Bonding</h1>
          <AccountMenu
            isSignedIn={isSignedIn}
            onOpenAdmin={() => setAdminPanelOpen(true)}
            onOpenMyRankings={openMyRankings}
            themeOverride={themeOverride}
            onSetTheme={onSetTheme}
            animationsEnabled={animationsEnabled}
            onSetAnimationsEnabled={onSetAnimationsEnabled}
          />
        </header>

        {page.kind === 'browse' && (
          <>
            <nav className="tabs">
              <button type="button" className={page.tab === 'global' ? 'active' : ''} onClick={openGlobal}>
                Ranking
              </button>
              <button type="button" className={page.tab === 'next' ? 'active' : ''} onClick={openNext}>
                Upcoming
              </button>
              <button type="button" className={page.tab === 'members' ? 'active' : ''} onClick={openMembers}>
                Members
              </button>
            </nav>

            <main className="app-main">
              {page.tab === 'global' && <GroupRanking onOpenMovie={(movieId) => setOverlay({ kind: 'global-detail', movieId })} />}
              {page.tab === 'next' && (
                <Suspense fallback={null}>
                  <WatchPlanner onOpenMovie={(movieId) => setOverlay({ kind: 'global-detail', movieId })} />
                </Suspense>
              )}
              {page.tab === 'members' && (
                <Suspense fallback={null}>
                  <MembersList onOpenMember={openMember} />
                </Suspense>
              )}
            </main>
          </>
        )}

        {page.kind === 'my-rankings' && (
          <>
            <button type="button" className="page-back-link" onClick={openGlobal}>
              ← Ranking
            </button>
            <main className="app-main">
              <h2 className="page-title">My Rankings</h2>
              <Suspense fallback={null}>
                <RankingBoard onOpenMovie={(movieId) => setOverlay({ kind: 'my-review', movieId })} />
              </Suspense>
            </main>
          </>
        )}

        {page.kind === 'member-ranking' && (
          <Suspense fallback={null}>
            <MemberRankingPage
              ownerId={page.ownerId}
              onBack={openMembers}
              onOpenMovie={(movieId) => setOverlay({ kind: 'member-review', ownerId: page.ownerId, movieId })}
            />
          </Suspense>
        )}

        {overlay?.kind === 'global-detail' && (
          <Suspense fallback={null}>
            <MovieDetailModal movieId={overlay.movieId} onClose={() => setOverlay(null)} onOpenProfile={openMember} />
          </Suspense>
        )}
        {overlay?.kind === 'my-review' && (
          <Suspense fallback={null}>
            <MyReviewModal movieId={overlay.movieId} onClose={() => setOverlay(null)} />
          </Suspense>
        )}
        {overlay?.kind === 'member-review' && (
          <Suspense fallback={null}>
            <IndividualMovieReview ownerId={overlay.ownerId} movieId={overlay.movieId} onClose={() => setOverlay(null)} />
          </Suspense>
        )}

        {adminPanelOpen && (
          <Suspense fallback={null}>
            <AdminPanel onClose={() => setAdminPanelOpen(false)} />
          </Suspense>
        )}
      </div>
    </AppDataProvider>
  )
}

export default function App() {
  const auth = useAuthState()
  const { theme, override, setTheme } = useTheme()
  const { enabled: animationsEnabled, setEnabled: setAnimationsEnabled } = useAnimationsEnabled()
  // Captured once at startup — the loading splash shouldn't swap mid-flight
  // if the system theme changes (or the user toggles it) while it's playing.
  const [introTheme] = useState(theme)
  // The gun-barrel splash uses a real image sized to exactly fill the viewport,
  // which is what all of the mobile-only splash bugs (dvh/vh centering, the
  // rubber-band bounce gap) traced back to. The dots splash draws its hole with
  // a box-shadow that bleeds thousands of px past any real viewport, so it has
  // none of that fragility — use it everywhere on a touch/coarse-pointer device
  // regardless of theme, and keep the theme-based choice for desktop, where none
  // of those issues exist in the first place.
  const [isMobile] = useState(() => window.matchMedia('(pointer: coarse)').matches)
  // If animations are off, skip the splash outright rather than mounting an
  // animated component and letting the near-zero-duration CSS override race
  // through it — cleaner to just not show it at all.
  const [showIntro, setShowIntro] = useState(animationsEnabled)

  // The static #preload-splash div (see index.html) covers the screen solid black
  // from the very first paint, before this component (or even index.css) has
  // loaded — its whole job is done the instant this first render actually commits,
  // whether that's the real animated splash taking over (same black background, so
  // the handoff is invisible) or, if animations are off, the real app appearing
  // immediately in its place.
  useEffect(() => {
    document.getElementById('preload-splash')?.remove()
  }, [])

  // <meta name="theme-color"> (in index.html) is pinned to a static dark value,
  // matching the splash's black background — but it never updated again after
  // that, so a light-theme session stayed marked as dark forever. On Android
  // Chrome that meta tag directly colors the browser's own toolbar in any
  // regular tab, and even where a platform ignores the tag itself (iOS Safari
  // in a normal tab reportedly does, per the note in index.html) it can still
  // only pick up a lighter tint once the real page content near the top/bottom
  // edges has actually settled into its final color — so updating this the
  // instant the splash finishes, rather than never, is a real (if
  // platform-limited) improvement either way. Held off while showIntro is true
  // so it doesn't flip light while the screen is still mostly the black splash.
  useEffect(() => {
    if (showIntro) return
    const meta = document.querySelector('meta[name="theme-color"]')
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    if (meta && bg) meta.setAttribute('content', bg)
  }, [showIntro, theme])

  if (!isBackendConfigured) {
    return <NotDeployedScreen />
  }

  return (
    <>
      <AppShell
        userId={auth.userId}
        loginId={auth.loginId}
        authLoading={auth.status === 'loading'}
        themeOverride={override}
        onSetTheme={setTheme}
        animationsEnabled={animationsEnabled}
        onSetAnimationsEnabled={setAnimationsEnabled}
      />
      {showIntro &&
        (isMobile || introTheme === 'dark' ? (
          <DotsSweepLoader loading={auth.status === 'loading'} onDone={() => setShowIntro(false)} />
        ) : (
          <GunBarrelLoader loading={auth.status === 'loading'} onFinish={() => setShowIntro(false)} />
        ))}
    </>
  )
}
