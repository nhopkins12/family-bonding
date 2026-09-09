import { Amplify } from 'aws-amplify'
import outputs from '../../amplify_outputs.json'

/** True once `amplify_outputs.json` has been replaced by a real `ampx sandbox`/deploy. */
export const isBackendConfigured = outputs.auth.user_pool_id !== 'REPLACE_AFTER_DEPLOY'

if (isBackendConfigured) {
  Amplify.configure(outputs)
}

// TypeScript infers this JSON import's shape from whatever's actually on disk right
// now — the checked-in file has no `custom` key until the ics-feed backend has
// actually been deployed once, so this has to be read defensively rather than
// assumed to exist. Undefined here just means "not deployed yet", not an error.
export const icsFeedUrl = (outputs as { custom?: { icsFeedUrl?: string } }).custom?.icsFeedUrl
