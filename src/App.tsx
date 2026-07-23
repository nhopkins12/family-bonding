import { useEffect, useState } from 'react'
import { isBackendConfigured } from './lib/amplifyConfig'
import { useAuthState } from './lib/useAuthState'
import { useTheme } from './lib/useTheme'
import { useAnimationsEnabled } from './lib/useAnimationsEnabled'
import type { ThemeOverride } from './lib/themePreference'
import { AppDataProvider } from './state/AppDataContext'
import { NotDeployedScreen } from './components/NotDeployedScreen'
import { AccountMenu } from './components/AccountMenu'
import { AdminPanel } from './components/AdminPanel'
import { RankingBoard } from './components/RankingBoard'
import { GroupRanking } from './components/GroupRanking'
import { MembersList } from './components/MembersList'
import { MemberRankingPage } from './components/MemberRankingPage'
import { MovieDetailModal } from './components/MovieDetailModal'
import { MyReviewModal } from './components/MyReviewModal'
import { IndividualMovieReview } from './components/IndividualMovieReview'
import { GunBarrelLoader } from './components/GunBarrelLoader'
import { DotsSweepLoader } from './components/DotsSweepLoader'

type Page =
  | { kind: 'browse'; tab: 'global' | 'members' }
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
  function openMember(ownerId: string) {
    setOverlay(null)
    setPage({ kind: 'member-ranking', ownerId })
  }

  return (
    <AppDataProvider userId={userId} loginId={loginId} authLoading={authLoading}>
      <div className="app">
        <header className="app-header">
          <h1>Family Bonding</h1>
          <AccountMenu
            isSignedIn={isSignedIn}
            onOpenAdmin={() => setAdminPanelOpen(true)}
            onOpenMyRankings={() => setPage({ kind: 'my-rankings' })}
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
              <button type="button" className={page.tab === 'members' ? 'active' : ''} onClick={openMembers}>
                Members
              </button>
            </nav>

            <main className="app-main">
              {page.tab === 'global' && <GroupRanking onOpenMovie={(movieId) => setOverlay({ kind: 'global-detail', movieId })} />}
              {page.tab === 'members' && <MembersList onOpenMember={openMember} />}
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
              <RankingBoard onOpenMovie={(movieId) => setOverlay({ kind: 'my-review', movieId })} />
            </main>
          </>
        )}

        {page.kind === 'member-ranking' && (
          <MemberRankingPage
            ownerId={page.ownerId}
            onBack={openMembers}
            onOpenMovie={(movieId) => setOverlay({ kind: 'member-review', ownerId: page.ownerId, movieId })}
          />
        )}

        {overlay?.kind === 'global-detail' && (
          <MovieDetailModal movieId={overlay.movieId} onClose={() => setOverlay(null)} onOpenProfile={openMember} />
        )}
        {overlay?.kind === 'my-review' && <MyReviewModal movieId={overlay.movieId} onClose={() => setOverlay(null)} />}
        {overlay?.kind === 'member-review' && (
          <IndividualMovieReview ownerId={overlay.ownerId} movieId={overlay.movieId} onClose={() => setOverlay(null)} />
        )}

        {adminPanelOpen && <AdminPanel onClose={() => setAdminPanelOpen(false)} />}
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
  // If animations are off, skip the splash outright rather than mounting an
  // animated component and letting the near-zero-duration CSS override race
  // through it — cleaner to just not show it at all.
  const [showIntro, setShowIntro] = useState(animationsEnabled)

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
        (introTheme === 'dark' ? (
          <DotsSweepLoader loading={auth.status === 'loading'} onDone={() => setShowIntro(false)} />
        ) : (
          <GunBarrelLoader loading={auth.status === 'loading'} onFinish={() => setShowIntro(false)} />
        ))}
    </>
  )
}
