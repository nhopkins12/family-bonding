import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'
import {
  client,
  type AppUserRecord,
  type MovieRecord,
  type MovieWatchRecord,
  type RankingRecordFull,
  type ReviewRecordFull,
  type WatchVoteRecord,
} from '../lib/dataClient'
import { createUpsertQueue } from '../lib/upsertQueue'
import { latestByKey, latestByKeyMap } from '../lib/records'
import { SUBRATING_KEYS, type Subratings } from '../types'

interface ReviewInput {
  text: string
  subratings: Subratings
}

interface AppDataContextValue {
  movies: MovieRecord[]
  moviesLoading: boolean
  isSignedIn: boolean
  myDisplayName: string
  myUsername: string
  isAdmin: boolean
  renameMe: (name: string) => Promise<void>
  rankedIds: string[]
  setMyRanking: (movieIds: string[]) => void
  profilesByOwner: Map<string, AppUserRecord>
  allRankings: RankingRecordFull[]
  allReviews: ReviewRecordFull[]
  allMovieWatches: MovieWatchRecord[]
  watchedMovieIds: Set<string>
  allWatchVotes: WatchVoteRecord[]
  myVotesByMovieId: Map<string, WatchVoteRecord>
  myReviewsByMovieId: Map<string, ReviewRecordFull>
  setMyReview: (movieId: string, input: ReviewInput) => Promise<void>
  setMyWatchVote: (movieId: string, voted: boolean) => Promise<void>
  upsertMovieWatch: (input: { movieId: string; scheduledFor?: string; watchedAt?: string; status: string; notes?: string }) => Promise<void>
  deleteMovieWatch: (movieId: string) => Promise<void>
  setVotingDate: (dateKey: string, notes?: string) => Promise<void>
  clearVotingDate: (dateKey: string) => Promise<void>
  ensureVotingPlaceholders: (dateKeys: string[]) => Promise<void>
  createMovie: (input: { title: string; year: number; actor: string; posterUrl: string }) => Promise<void>
  createMember: (input: { name: string; password: string; isAdmin: boolean }) => Promise<void>
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

function deriveDefaultName(loginId?: string): string {
  if (!loginId) return 'Me'
  const localPart = loginId.split('@')[0]
  return localPart.charAt(0).toUpperCase() + localPart.slice(1)
}

// The immutable handle, as opposed to deriveDefaultName's capitalized version — this is
// what create-member/handler.ts actually slugified into the Cognito login, so it's what
// stays true even after someone customizes their displayName.
function deriveUsername(loginId?: string): string {
  if (!loginId) return 'me'
  return loginId.split('@')[0]
}

function latestByOwner<T extends { owner?: string | null; updatedAt?: string | null; createdAt?: string | null; id?: string | null }>(records: T[]) {
  return latestByKeyMap(records, (record) => record.owner)
}

function latestReviewsByOwnerAndMovie(reviews: ReviewRecordFull[]) {
  return latestByKey(reviews, (review) => (review.owner ? `${review.owner}:${review.movieId}` : null))
}

function latestVotesByOwnerAndMovie(votes: WatchVoteRecord[]) {
  return latestByKey(votes, (vote) => (vote.owner ? `${vote.owner}:${vote.movieId}` : null))
}

// latestByKey, not latestByKeyMap: a voting or skipped placeholder row has no
// movieId, and latestByKeyMap silently drops any record whose key is null/undefined
// — which was quietly excluding every placeholder from allMovieWatches entirely, no
// matter how successfully it saved server-side. latestByKey keeps keyless records
// as-is while still collapsing legacy duplicate rows for the same movie.
function latestWatchByMovie(watches: MovieWatchRecord[]) {
  return latestByKey(watches, (watch) => watch.movieId)
}

function assertNoDataErrors(result: { errors?: { message?: string | null }[] | null }) {
  if (result.errors?.length) throw new Error(result.errors.map((error) => error.message ?? 'Request failed').join('; '))
}

type UpsertModel = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create: (input: any) => Promise<{ errors?: { message?: string | null }[] | null }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (input: any) => Promise<{ errors?: { message?: string | null }[] | null }>
}

/**
 * Every MovieWatch row here uses a deterministic id (movieId or vote-<dateKey>)
 * instead of a random one, specifically so re-touching the same
 * logical record updates it in place rather than duplicating it. That means the
 * create-vs-update choice has to be right, but the live `allMovieWatches` list this
 * decision is normally guessed from is a subscription snapshot that can be a beat
 * behind the real table — guess wrong (e.g. right after another edit's write hasn't
 * echoed back yet) and DynamoDB's own existence condition on create/update rejects
 * the request outright ("The conditional request failed"). Trying the guessed
 * operation first and silently falling back to the other one on that specific
 * failure makes the call self-correcting instead of trusting a snapshot that might
 * already be stale.
 */
async function upsertById(model: UpsertModel, payload: Record<string, unknown>, guessExists: boolean) {
  const [primary, fallback] = guessExists ? [model.update, model.create] : [model.create, model.update]
  const result = await primary(payload)
  if (!result.errors?.length) return result
  return fallback(payload)
}

// Deterministic per-date id — every open Sunday gets its own "voting" placeholder
// row, so several can be open across different weeks at once instead of there being a
// single system-wide vote slot, and re-touching the same date updates that same row
// instead of creating a duplicate.
function voteRecordId(dateKey: string) {
  return `vote-${dateKey}`
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
  const [movieWatches, setMovieWatches] = useState<MovieWatchRecord[]>([])
  const [watchVotes, setWatchVotes] = useState<WatchVoteRecord[]>([])
  const [profilesSynced, setProfilesSynced] = useState(false)
  const [rankingsSynced, setRankingsSynced] = useState(false)
  const [reviewsSynced, setReviewsSynced] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const hasAttemptedProfileCreate = useRef(false)
  const currentUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    currentUserIdRef.current = userId
  }, [userId])

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
      next: ({ items, isSynced }) => {
        setProfiles([...items])
        if (isSynced) setProfilesSynced(true)
      },
      error: (err) => console.error('AppUser subscription error', err),
    })
    return () => {
      setProfilesSynced(false)
      sub.unsubscribe()
    }
  }, [readAuthMode, authLoading])

  useEffect(() => {
    if (authLoading) return
    const sub = client.models.Ranking.observeQuery({ authMode: readAuthMode }).subscribe({
      next: ({ items, isSynced }) => {
        setRankings([...items])
        if (isSynced) setRankingsSynced(true)
      },
      error: (err) => console.error('Ranking subscription error', err),
    })
    return () => {
      setRankingsSynced(false)
      sub.unsubscribe()
    }
  }, [readAuthMode, authLoading])

  useEffect(() => {
    if (authLoading) return
    const sub = client.models.Review.observeQuery({ authMode: readAuthMode }).subscribe({
      next: ({ items, isSynced }) => {
        setReviews([...items])
        if (isSynced) setReviewsSynced(true)
      },
      error: (err) => console.error('Review subscription error', err),
    })
    return () => {
      setReviewsSynced(false)
      sub.unsubscribe()
    }
  }, [readAuthMode, authLoading])

  useEffect(() => {
    if (authLoading) return
    const model = (client.models as { MovieWatch?: typeof client.models.MovieWatch }).MovieWatch
    if (!model) {
      setMovieWatches([])
      return
    }
    const sub = model.observeQuery({ authMode: readAuthMode }).subscribe({
      next: ({ items }) => setMovieWatches([...items]),
      error: (err) => console.error('MovieWatch subscription error', err),
    })
    return () => sub.unsubscribe()
  }, [readAuthMode, authLoading])

  useEffect(() => {
    if (authLoading) return
    const model = (client.models as { WatchVote?: typeof client.models.WatchVote }).WatchVote
    if (!model) {
      setWatchVotes([])
      return
    }
    const sub = model.observeQuery({ authMode: readAuthMode }).subscribe({
      next: ({ items }) => {
        setWatchVotes([...items])
      },
      error: (err) => console.error('WatchVote subscription error', err),
    })
    return () => {
      sub.unsubscribe()
    }
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

  const rawProfilesByOwner = useMemo(() => latestByOwner(profiles), [profiles])

  const profilesByOwner = useMemo(() => {
    const map = new Map(rawProfilesByOwner)
    for (const [ownerId, profile] of map) {
      if (profile.active === false) map.delete(ownerId)
    }
    return map
  }, [rawProfilesByOwner])

  const activeOwnerIds = useMemo(() => new Set(profilesByOwner.keys()), [profilesByOwner])

  const myProfile = useMemo(() => (userId ? (rawProfilesByOwner.get(userId) ?? null) : null), [rawProfilesByOwner, userId])

  // Auto-provision a profile the first time a newly admin-created user signs in.
  useEffect(() => {
    if (!userId || myProfile || hasAttemptedProfileCreate.current) return
    if (!profilesSynced) return
    hasAttemptedProfileCreate.current = true
    client.models.AppUser.create({ id: userId, displayName: deriveDefaultName(loginId), username: deriveUsername(loginId) }).catch((err) => {
      console.error('Failed to auto-provision profile', err)
      hasAttemptedProfileCreate.current = false
    })
  }, [userId, myProfile, profilesSynced, loginId])

  useEffect(() => {
    hasAttemptedProfileCreate.current = false
  }, [userId])

  const myRankingRecord = useMemo(
    () => (userId ? (latestByOwner(rankings).get(userId) ?? null) : null),
    [rankings, userId],
  )
  const rankedIds = useMemo(
    () => (myRankingRecord?.orderedMovieIds ?? []).filter((id): id is string => Boolean(id)),
    [myRankingRecord],
  )

  const myReviewsByMovieId = useMemo(() => {
    const map = new Map<string, ReviewRecordFull>()
    if (!userId) return map
    for (const review of latestReviewsByOwnerAndMovie(reviews)) {
      if (review.owner === userId) map.set(review.movieId, review)
    }
    return map
  }, [reviews, userId])

  const activeRankings = useMemo(
    () => [...latestByOwner(rankings).values()].filter((ranking) => ranking.owner && activeOwnerIds.has(ranking.owner)),
    [rankings, activeOwnerIds],
  )
  const activeReviews = useMemo(
    () => latestReviewsByOwnerAndMovie(reviews).filter((review) => review.owner && activeOwnerIds.has(review.owner)),
    [reviews, activeOwnerIds],
  )
  const activeWatchVotes = useMemo(
    () => latestVotesByOwnerAndMovie(watchVotes).filter((vote) => vote.owner && activeOwnerIds.has(vote.owner)),
    [watchVotes, activeOwnerIds],
  )
  const allMovieWatches = useMemo(() => latestWatchByMovie(movieWatches), [movieWatches])
  const watchedMovieIds = useMemo(
    () =>
      new Set(
        allMovieWatches
          .filter((watch): watch is typeof watch & { movieId: string } => Boolean(watch.movieId) && (watch.status === 'watched' || Boolean(watch.watchedAt)))
          .map((watch) => watch.movieId),
      ),
    [allMovieWatches],
  )
  const myVotesByMovieId = useMemo(() => {
    const map = new Map<string, WatchVoteRecord>()
    if (!userId) return map
    for (const vote of activeWatchVotes) {
      if (vote.owner === userId) map.set(vote.movieId, vote)
    }
    return map
  }, [activeWatchVotes, userId])

  const renameMe = useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed || !myProfile) return
      await client.models.AppUser.update({ id: myProfile.id, displayName: trimmed })
    },
    [myProfile],
  )

  // --- Ranking upsert: one queue for "my" ranking record, id locked in on first create. ---
  const rankingIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (myRankingRecord) rankingIdRef.current = myRankingRecord.id
  }, [myRankingRecord])
  useEffect(() => {
    rankingIdRef.current = null
  }, [userId])

  const rankingQueueRef = useRef(
    createUpsertQueue<string[]>({
      getExistingId: () => rankingIdRef.current,
      create: async (orderedMovieIds) => {
        const { data } = await client.models.Ranking.create({ id: currentUserIdRef.current ?? undefined, orderedMovieIds })
        return data!.id
      },
      update: async (id, orderedMovieIds) => {
        await client.models.Ranking.update({ id, orderedMovieIds })
      },
    }),
  )

  const setMyRanking = useCallback((movieIds: string[]) => {
    if (!userId || !rankingsSynced) return
    rankingQueueRef.current(movieIds).catch((err) => console.error('Failed to save ranking', err))
  }, [rankingsSynced, userId])

  // --- Review upsert: one queue per movie, created lazily, keyed by movieId. ---
  const reviewQueuesRef = useRef(new Map<string, ReturnType<typeof createUpsertQueue<ReviewInput>>>())
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
      queue = createUpsertQueue<ReviewInput>({
        getExistingId: () => reviewIdsRef.current.get(movieId) ?? null,
        create: async (input) => {
          const categoryFields = Object.fromEntries(SUBRATING_KEYS.map((key) => [key, input.subratings[key] ?? null]))
          const userScopedId = currentUserIdRef.current ? `${currentUserIdRef.current}_${movieId}` : undefined
          const { data } = await client.models.Review.create({ id: userScopedId, movieId, text: input.text, ...categoryFields })
          reviewIdsRef.current.set(movieId, data!.id)
          return data!.id
        },
        update: async (id, input) => {
          const categoryFields = Object.fromEntries(SUBRATING_KEYS.map((key) => [key, input.subratings[key] ?? null]))
          await client.models.Review.update({ id, text: input.text, ...categoryFields })
        },
      })
      reviewQueuesRef.current.set(movieId, queue)
    }
    return queue
  }

  const setMyReview = useCallback((movieId: string, input: ReviewInput) => {
    if (!userId || !reviewsSynced) return Promise.reject(new Error('Review data is still syncing. Try again in a moment.'))
    return getReviewQueue(movieId)(input).catch((err) => {
      console.error('Failed to save review', err)
      throw err
    })
  }, [reviewsSynced, userId])

  const setMyWatchVote = useCallback(
    async (movieId: string, voted: boolean) => {
      if (!userId) return
      const model = (client.models as { WatchVote?: typeof client.models.WatchVote }).WatchVote
      if (!model) throw new Error('Watch votes are not deployed yet.')
      const existing = myVotesByMovieId.get(movieId)
      const id = existing?.id ?? `${userId}_${movieId}`
      if (voted) {
        await Promise.all(
          [...myVotesByMovieId.values()]
            .filter((vote) => vote.movieId !== movieId)
            .map(async (vote) => assertNoDataErrors(await model.delete({ id: vote.id }))),
        )
        if (existing) {
          assertNoDataErrors(await model.update({ id, vote: 'interested' }))
          return
        }
        try {
          const result = await model.create({ id, movieId, vote: 'interested' })
          assertNoDataErrors(result)
        } catch {
          assertNoDataErrors(await model.update({ id, vote: 'interested' }))
        }
      } else {
        await Promise.all([...myVotesByMovieId.values()].map(async (vote) => assertNoDataErrors(await model.delete({ id: vote.id }))))
      }
    },
    [myVotesByMovieId, userId],
  )

  const upsertMovieWatch = useCallback(
    async (input: { movieId: string; scheduledFor?: string; watchedAt?: string; status: string; notes?: string }) => {
      if (!isAdmin) throw new Error('Only admins can schedule movie nights.')
      const model = (client.models as { MovieWatch?: typeof client.models.MovieWatch }).MovieWatch
      if (!model) throw new Error('Movie watch scheduling is not deployed yet.')
      const voteModel = (client.models as { WatchVote?: typeof client.models.WatchVote }).WatchVote
      const existing = allMovieWatches.find((watch) => watch.movieId === input.movieId)
      const payload = {
        id: input.movieId,
        movieId: input.movieId,
        status: input.status,
        scheduledFor: input.scheduledFor || null,
        watchedAt: input.watchedAt || null,
        notes: input.notes || null,
      }
      assertNoDataErrors(await upsertById(model, payload, Boolean(existing)))
      // Being scheduled OR marked watched both take a movie out of the votable pool,
      // so either transition should clear its votes — not just the watched one, or a
      // vote for a movie that just got scheduled sits orphaned: uncounted, invisible,
      // with no UI left to change it, until someone else happens to switch their vote.
      if (voteModel) {
        await Promise.all(
          activeWatchVotes.filter((vote) => vote.movieId === input.movieId).map(async (vote) => assertNoDataErrors(await voteModel.delete({ id: vote.id }))),
        )
      }
      // A movie just claimed this date, so the "open for voting, no movie chosen yet"
      // placeholder reserving it (if any) has done its job — clear it rather than
      // leaving a phantom placeholder sitting on the same date as a real movie.
      const placeholder = allMovieWatches.find((watch) => !watch.movieId && watch.scheduledFor === input.scheduledFor)
      if (placeholder) assertNoDataErrors(await model.delete({ id: placeholder.id }))
    },
    [activeWatchVotes, allMovieWatches, isAdmin],
  )

  const deleteMovieWatch = useCallback(
    async (movieId: string) => {
      if (!isAdmin) throw new Error('Only admins can change movie night scheduling.')
      const model = (client.models as { MovieWatch?: typeof client.models.MovieWatch }).MovieWatch
      if (!model) throw new Error('Movie watch scheduling is not deployed yet.')
      const existing = allMovieWatches.find((watch) => watch.movieId === movieId)
      if (existing) assertNoDataErrors(await model.delete({ id: existing.id }))
    },
    [allMovieWatches, isAdmin],
  )

  // Reserves a date for "movie night" before a movie has been picked. Every open day
  // carries its own placeholder row (id is date-bound), so several weeks can each be
  // open at the same time instead of there being one system-wide slot. There's no
  // separate "skip this day" concept — an open day an admin doesn't want is simply
  // deleted (see clearVotingDate), not converted into a different kind of record.
  const setVotingDate = useCallback(
    async (dateKey: string, notes?: string) => {
      if (!isAdmin) throw new Error('Only admins can change the vote date.')
      const model = (client.models as { MovieWatch?: typeof client.models.MovieWatch }).MovieWatch
      if (!model) throw new Error('Movie watch scheduling is not deployed yet.')
      // Matched by date (any non-movie row, not just one already carrying the current
      // 'voting' status string) so a placeholder from an older id/status shape is
      // still found and updated in place instead of leaving that row orphaned next to
      // a brand new one.
      const existing = allMovieWatches.find((watch) => !watch.movieId && watch.scheduledFor === dateKey)
      const id = existing?.id ?? voteRecordId(dateKey)
      const payload = { id, status: 'voting', scheduledFor: dateKey, movieId: null, watchedAt: null, notes: notes || null }
      assertNoDataErrors(await upsertById(model, payload, Boolean(existing)))
    },
    [allMovieWatches, isAdmin],
  )

  const clearVotingDate = useCallback(
    async (dateKey: string) => {
      if (!isAdmin) throw new Error('Only admins can change the vote date.')
      const model = (client.models as { MovieWatch?: typeof client.models.MovieWatch }).MovieWatch
      if (!model) throw new Error('Movie watch scheduling is not deployed yet.')
      const existing = allMovieWatches.find((watch) => !watch.movieId && watch.scheduledFor === dateKey)
      if (existing) assertNoDataErrors(await model.delete({ id: existing.id }))
    },
    [allMovieWatches, isAdmin],
  )

  // Backfills a plain "voting" placeholder onto every given date that has no
  // MovieWatch row at all yet. Triggered only by an explicit admin click (the "Fill
  // Sundays" button in WatchPlanner) rather than automatically as the calendar is
  // browsed — an earlier version ran this from an effect, which meant it could race
  // a drag or delete that was touching the very same date at the same time. The
  // caller is responsible for only passing dates it has already confirmed are empty.
  const ensureVotingPlaceholders = useCallback(
    async (dateKeys: string[]) => {
      if (!isAdmin || dateKeys.length === 0) return
      const model = (client.models as { MovieWatch?: typeof client.models.MovieWatch }).MovieWatch
      if (!model) return
      await Promise.all(
        dateKeys.map(async (dateKey) => {
          const payload = { id: voteRecordId(dateKey), status: 'voting', scheduledFor: dateKey, movieId: null, watchedAt: null, notes: null }
          assertNoDataErrors(await upsertById(model, payload, false))
        }),
      )
    },
    [isAdmin],
  )

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
      myUsername: myProfile?.username ?? deriveUsername(loginId),
      isAdmin,
      renameMe,
      rankedIds,
      setMyRanking,
      profilesByOwner,
      allRankings: activeRankings,
      allReviews: activeReviews,
      allMovieWatches,
      watchedMovieIds,
      allWatchVotes: activeWatchVotes,
      myVotesByMovieId,
      myReviewsByMovieId,
      setMyReview,
      setMyWatchVote,
      upsertMovieWatch,
      deleteMovieWatch,
      setVotingDate,
      clearVotingDate,
      ensureVotingPlaceholders,
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
      rankedIds,
      setMyRanking,
      profilesByOwner,
      activeRankings,
      activeReviews,
      allMovieWatches,
      watchedMovieIds,
      activeWatchVotes,
      myVotesByMovieId,
      myReviewsByMovieId,
      setMyReview,
      setMyWatchVote,
      upsertMovieWatch,
      deleteMovieWatch,
      setVotingDate,
      clearVotingDate,
      ensureVotingPlaceholders,
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
