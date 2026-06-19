import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { APP_VERSION_HEADER } from '@orbit/shared/utils'

/**
 * The installed app's version. Prefers the native APK `versionName`
 * (`Application.nativeApplicationVersion`) over the bundled Expo config so the
 * value reflects what the user actually has installed. `null` when neither is
 * available.
 */
export function getAppVersion(): string | null {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null
}

/**
 * The `X-App-Version` request header for the minimum-version gate, or an empty
 * object when the version cannot be resolved (so the request stays unjudged
 * and is allowed by the fail-safe server gate).
 */
export function buildAppVersionHeaders(): Record<string, string> {
  const version = getAppVersion()
  return version ? { [APP_VERSION_HEADER]: version } : {}
}
