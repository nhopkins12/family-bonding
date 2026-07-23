import { Amplify } from 'aws-amplify'
import outputs from '../../amplify_outputs.json'

/** True once `amplify_outputs.json` has been replaced by a real `ampx sandbox`/deploy. */
export const isBackendConfigured = outputs.auth.user_pool_id !== 'REPLACE_AFTER_DEPLOY'

if (isBackendConfigured) {
  Amplify.configure(outputs)
}
