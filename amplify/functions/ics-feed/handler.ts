import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb'
import type { LambdaFunctionURLHandler } from 'aws-lambda'
import { buildIcsCalendar, type IcsMovie, type IcsMovieWatch } from './ics'

const secretsClient = new SecretsManagerClient({})
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

// Persists across warm invocations of the same execution environment, so Secrets
// Manager is only actually called on a cold start, not on every calendar-client poll.
let cachedToken: string | undefined

async function getExpectedToken(): Promise<string> {
  if (cachedToken) return cachedToken
  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: process.env.ICS_FEED_SECRET_ARN }))
  if (!result.SecretString) throw new Error('ICS feed secret has no value')
  cachedToken = result.SecretString
  return cachedToken
}

// Path form: https://<id>.lambda-url.<region>.on.aws/<token>/family-bonding.ics
function extractToken(event: Parameters<LambdaFunctionURLHandler>[0]): string {
  const segments = event.rawPath.split('/').filter(Boolean)
  return segments[0] ?? event.queryStringParameters?.token ?? ''
}

// A hand-rolled constant-time compare, not Node's crypto.timingSafeEqual — that
// throws on mismatched buffer lengths, which itself becomes a length-leaking branch
// unless handled carefully. This sidesteps that entirely.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

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

export const handler: LambdaFunctionURLHandler = async (event) => {
  const expectedToken = await getExpectedToken()
  const providedToken = extractToken(event)
  // A plain 404 on any mismatch — not 401/403 — so a prober can't tell "wrong token"
  // apart from "nothing lives at this path at all".
  if (!providedToken || !timingSafeEqual(providedToken, expectedToken)) {
    return { statusCode: 404, body: 'Not found' }
  }

  const [watches, movies] = await Promise.all([
    scanAll<IcsMovieWatch>(process.env.MOVIE_WATCH_TABLE_NAME!),
    scanAll<IcsMovie>(process.env.MOVIE_TABLE_NAME!),
  ])
  const movieById = new Map(movies.map((movie) => [movie.id, movie]))
  const calendar = buildIcsCalendar(watches, movieById)

  return {
    statusCode: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': 'no-cache',
    },
    body: calendar,
  }
}
