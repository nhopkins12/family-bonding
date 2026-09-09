import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb'
import type { LambdaFunctionURLHandler } from 'aws-lambda'
import { buildIcsCalendar, type IcsMovie, type IcsMovieWatch, type IcsWatchVote } from './ics'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

async function scanAll<T>(tableName: string): Promise<T[]> {
  const items: T[] = []
  let ExclusiveStartKey: Record<string, unknown> | undefined
  do {
    const result = await ddb.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey }))
    items.push(...((result.Items ?? []) as T[]))
    ExclusiveStartKey = result.LastEvaluatedKey
  } while (ExclusiveStartKey)
  return items
}

export const handler: LambdaFunctionURLHandler = async () => {
  const [watches, movies, votes] = await Promise.all([
    scanAll<IcsMovieWatch>(process.env.MOVIE_WATCH_TABLE_NAME!),
    scanAll<IcsMovie>(process.env.MOVIE_TABLE_NAME!),
    scanAll<IcsWatchVote>(process.env.WATCH_VOTE_TABLE_NAME!),
  ])
  const movieById = new Map(movies.map((movie) => [movie.id, movie]))
  const calendar = buildIcsCalendar(watches, movieById, votes)

  return {
    statusCode: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'no-cache',
    },
    body: calendar,
  }
}
