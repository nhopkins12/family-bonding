import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../../amplify/data/resource'

export const client = generateClient<Schema>()

export type MovieRecord = Schema['Movie']['type']
export type AppUserRecord = Schema['AppUser']['type']
export type RankingRecordFull = Schema['Ranking']['type']
export type ReviewRecordFull = Schema['Review']['type']
export type MovieWatchRecord = Schema['MovieWatch']['type']
export type WatchVoteRecord = Schema['WatchVote']['type']
