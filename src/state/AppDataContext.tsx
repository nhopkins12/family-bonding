import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'
import { client, type AppUserRecord, type MovieRecord, type RankingRecordFull, type ReviewRecordFull } from '../lib/dataClient'
import { createUpsertQueue } from '../lib/upsertQueue'
import type { SortKey } from '../types'

interface AppDataContextValue {
  movies: MovieRecord[]
  moviesLoading: boolean
  isSignedIn: boolean
  myDisplayName: string
  isAdmin: boolean
  renameMe: (name: string) => Promise<void>
  myRankingsByCategory: Map<SortKey, string[]>
  setMyRanking: (category: SortKey, movieIds: string[]) => void
  profilesByOwner: Map<string, AppUserRecord>
  allRankings: RankingRecordFull[]
  allReviews: ReviewRecordFull[]
  myReviewsByMovieId: Map<string, ReviewRecordFull>
  setMyReview: (movieId: string, text: string) => Promise<void>
  createMovie: (input: { title: string; year: number; actor: string; posterUrl: string }) => Promise<void>
  createMember: (input: { name: string; password: string; isAdmin: boolean }) => Promise<void>
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

function deriveDefaultName(loginId?: string): string {
  if (!loginId) return 'Me'
  const localPart = loginId.split('@')[0]
  return localPart.charAt(0).toUpperCase() + localPart.slice(1)
}

export function AppDataProvider({
  userId,
  loginId,
  authLoading,
  children,
}: {
  userId: string | null
  loginId?: string
  authLoading: boolean
  children: ReactNode
}) {
  const [movies, setMovies] = useState<MovieRecord[]>([])
  const [moviesLoading, setMoviesLoading] = useState(true)
  const [profiles, setProfiles] = useState<AppUserRecord[]>([])
  const [rankings, setRankings] = useState<RankingRecordFull[]>([])
  const [reviews, setReviews] = useState<ReviewRecordFull[]>([])
  const [isAdmin, setIsAdmin] = useState(false)

  const hasAttemptedProfileCreate = useRef(false)

  // Signed-in reads satisfy `allow.owner()`/`allow.authenticated()`/`allow.groups()` under
  // the default 'userPool' auth mode; signed-out reads only satisfy `allow.guest()`, which
  // requires explicitly selecting 'identityPool' (the Cognito Identity Pool's unauthenticated
  // IAM role) — otherwise the client keeps trying userPool auth with no session and every
  // read silently fails, which is why the app was unusable when signed out.
  const isSignedIn = Boolean(userId)
  const readAuthMode = isSignedIn ? 'userPool' : 'identityPool'

  // Don't guess an auth mode while auth is still resolving — subscribing with a
  // provisional 'identityPool' guess (because userId is null before we actually
  // know) fires a real guest-credentials fetch via Cognito Identity Pool for
  // every signed-in user too, on every load, only to be abandoned and
  // resubscribed in 'userPool' mode moments later. Besides the waste, a reload
  // fast enough to abort that in-flight guest-credentials call mid-request can
  // leave Amplify's local-storage-cached identity in a partial state that
  // subsequent loads keep reusing and failing against. Waiting for authLoading
  // to clear means we only ever subscribe once, already in the right mode.
  useEffect(() => {
    if (authLoading) return
    const sub = client.models.Movie.observeQuery({ authMode: readAuthMode }).subscribe({
      next: ({ items }) => {
        setMovies([...items].sort((a, b) => a.sortOrder - b.sortOrder))
        setMoviesLoading(false)
      },
      error: (err) => console.error('Movie subscription error', err),
    })
    return () => sub.unsubscribe()
  }, [readAuthMode, authLoading])

  useEffect(() => {
    if (authLoading) return
    const sub = client.models.AppUser.observeQuery({ authMode: readAuthMode }).subscribe({
      next: ({ items }) => setProfiles([...items]),
      error: (err) => console.error('AppUser subscription error', err),
    })
    return () => sub.unsubscribe()
  }, [readAuthMode, authLoading])

  useEffect(() => {
    if (authLoading) return
    const sub = client.models.Ranking.observeQuery({ authMode: readAuthMode }).subscribe({
      next: ({ items }) => setRankings([...items]),
      error: (err) => console.error('Ranking subscription error', err),
    })
    return () => sub.unsubscribe()
  }, [readAuthMode, authLoading])

  useEffect(() => {
    if (authLoading) return
    const sub = client.models.Review.observeQuery({ authMode: readAuthMode }).subscribe({
      next: ({ items }) => setReviews([...items]),
      error: (err) => console.error('Review subscription error', err),
    })
    return () => sub.unsubscribe()
  }, [readAuthMode, authLoading])

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false)
      return
    }
    fetchAuthSession()
      .then((session) => {
        const groups = session.tokens?.idToken?.payload['cognito:groups']
        setIsAdmin(Array.isArray(groups) && groups.includes('Admins'))
      })
      .catch(() => setIsAdmin(false))
  }, [userId])

  const myProfile = useMemo(() => (userId ? (profiles.find((p) => p.owner === userId) ?? null) : null), [profiles, userId])

  // Auto-provision a profile the first time a newly admin-created user signs in.
  useEffect(() => {
    if (!userId || myProfile || hasAttemptedProfileCreate.current) return
    if (profiles.length === 0 && moviesLoading) return // wait for first sync to avoid a duplicate race
    hasAttemptedProfileCreate.current = true
    client.models.AppUser.create({ displayName: deriveDefaultName(loginId) }).catch((err) => {
      console.error('Failed to auto-provision profile', err)
      hasAttemptedProfileCreate.current = false
    })
  }, [userId, myProfile, profiles.length, moviesLoading, loginId])

  useEffect(() => {
    hasAttemptedProfileCreate.current = false
  }, [userId])

  // One Ranking record per (owner, category) — 'overall' plus one per subrating category,
  // all using the same relative drag-and-drop ordering.
  const myRankingsByCategory = useMemo(() => {
    const map = new Map<SortKey, string[]>()
    if (!userId) return map
    for (const ranking of rankings) {
      if (ranking.owner !== userId || !ranking.category) continue
      map.set(
        ranking.category as SortKey,
        (ranking.orderedMovieIds ?? []).filter((id): id is string => Boolean(id)),
      )
    }
    return map
  }, [rankings, userId])

  const myReviewsByMovieId = useMemo(() => {
    const map = new Map<string, ReviewRecordFull>()
    if (!userId) return map
    for (const review of reviews) {
      if (review.owner === userId) map.set(review.movieId, review)
    }
    return map
  }, [reviews, userId])

  const profilesByOwner = useMemo(() => {
    const map = new Map<string, AppUserRecord>()
    for (const profile of profiles) {
      if (profile.owner) map.set(profile.owner, profile)
    }
    return map
  }, [profiles])

  const renameMe = useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed || !myProfile) return
      await client.models.AppUser.update({ id: myProfile.id, displayName: trimmed })
    },
    [myProfile],
  )

  // --- Ranking upsert: one queue per category, created lazily, keyed by category —
  // same pattern as the review queue below, keyed by movieId instead. ---
  const rankingQueuesRef = useRef(new Map<string, ReturnType<typeof createUpsertQueue<string[]>>>())
  const rankingIdsRef = useRef(new Map<string, string>())

  useEffect(() => {
    if (!userId) return
    for (const ranking of rankings) {
      if (ranking.owner === userId && ranking.category) rankingIdsRef.current.set(ranking.category, ranking.id)
    }
  }, [rankings, userId])

  useEffect(() => {
    rankingIdsRef.current.clear()
    rankingQueuesRef.current.clear()
  }, [userId])

  function getRankingQueue(category: string) {
    let queue = rankingQueuesRef.current.get(category)
    if (!queue) {
      queue = createUpsertQueue<string[]>({
        getExistingId: () => rankingIdsRef.current.get(category) ?? null,
        create: async (orderedMovieIds) => {
          const { data } = await client.models.Ranking.create({ category, orderedMovieIds })
          rankingIdsRef.current.set(category, data!.id)
          return data!.id
        },
        update: async (id, orderedMovieIds) => {
          await client.models.Ranking.update({ id, orderedMovieIds })
        },
      })
      rankingQueuesRef.current.set(category, queue)
    }
    return queue
  }

  const setMyRanking = useCallback((category: SortKey, movieIds: string[]) => {
    getRankingQueue(category)(movieIds).catch((err) => console.error('Failed to save ranking', err))
  }, [])

  // --- Review upsert: one queue per movie, created lazily, keyed by movieId. ---
  const reviewQueuesRef = useRef(new Map<string, ReturnType<typeof createUpsertQueue<string>>>())
  const reviewIdsRef = useRef(new Map<string, string>())

  useEffect(() => {
    for (const review of myReviewsByMovieId.values()) {
      reviewIdsRef.current.set(review.movieId, review.id)
    }
  }, [myReviewsByMovieId])

  useEffect(() => {
    reviewIdsRef.current.clear()
    reviewQueuesRef.current.clear()
  }, [userId])

  function getReviewQueue(movieId: string) {
    let queue = reviewQueuesRef.current.get(movieId)
    if (!queue) {
      queue = createUpsertQueue<string>({
        getExistingId: () => reviewIdsRef.current.get(movieId) ?? null,
        create: async (text) => {
          const { data } = await client.models.Review.create({ movieId, text })
          reviewIdsRef.current.set(movieId, data!.id)
          return data!.id
        },
        update: async (id, text) => {
          await client.models.Review.update({ id, text })
        },
      })
      reviewQueuesRef.current.set(movieId, queue)
    }
    return queue
  }

  const setMyReview = useCallback((movieId: string, text: string) => {
    return getReviewQueue(movieId)(text).catch((err) => {
      console.error('Failed to save review', err)
      throw err
    })
  }, [])

  const createMovie = useCallback(
    async (input: { title: string; year: number; actor: string; posterUrl: string }) => {
      await client.models.Movie.create({ ...input, sortOrder: movies.length })
    },
    [movies.length],
  )

  const createMember = useCallback(
    async (input: { name: string; password: string; isAdmin: boolean }) => {
      const { errors } = await client.mutations.createMember(input)
      if (errors) throw new Error(errors.map((e) => e.message).join('; '))
    },
    [],
  )

  const value = useMemo<AppDataContextValue>(
    () => ({
      movies,
      moviesLoading,
      isSignedIn,
      myDisplayName: myProfile?.displayName ?? deriveDefaultName(loginId),
      isAdmin,
      renameMe,
      myRankingsByCategory,
      setMyRanking,
      profilesByOwner,
      allRankings: rankings,
      allReviews: reviews,
      myReviewsByMovieId,
      setMyReview,
      createMovie,
      createMember,
    }),
    [
      movies,
      moviesLoading,
      isSignedIn,
      myProfile,
      loginId,
      isAdmin,
      renameMe,
      myRankingsByCategory,
      setMyRanking,
      profilesByOwner,
      rankings,
      reviews,
      myReviewsByMovieId,
      setMyReview,
      createMovie,
      createMember,
    ],
  )

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
