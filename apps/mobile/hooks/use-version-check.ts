import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { useQuery } from '@tanstack/react-query'
import SpInAppUpdates, { IAUUpdateKind, type NeedsUpdateResponse } from 'sp-react-native-in-app-updates'
import { versionCheckKeys } from '@orbit/shared/query'
import { getAppStoreLookup, isVersionOutdated } from '@/lib/version-check'

const SIX_HOURS = 1000 * 60 * 60 * 6
const ONE_DAY = 1000 * 60 * 60 * 24

// Google considers priority 4+ a strong signal to force an immediate update.
// The developer sets this in the Play Console Publishing API when rolling out a release.
const ANDROID_IMMEDIATE_PRIORITY = 4

export interface VersionNeedsUpdateResponse {
  updateAvailable: boolean
  forceUpdate: boolean
  latestVersion: string | null
  currentVersion: string | null
  /** Android only: the Play Core result. `null` on iOS or when no update. */
  androidCheck: NeedsUpdateResponse | null
  /** iOS only: App Store deep link from iTunes lookup. `null` on Android or when no update. */
  iosStoreUrl: string | null
}

interface QueryResult {
  androidCheck: NeedsUpdateResponse | null
  latestIosVersion: string | null
  iosStoreUrl: string | null
}

async function resolveVersionSources(bundleId: string | null): Promise<QueryResult> {
  if (Platform.OS === 'android') {
    try {
      const inAppUpdates = new SpInAppUpdates(false)
      const result = await inAppUpdates.checkNeedsUpdate()
      return { androidCheck: result, latestIosVersion: null, iosStoreUrl: null }
    } catch {
      return { androidCheck: null, latestIosVersion: null, iosStoreUrl: null }
    }
  }

  if (Platform.OS === 'ios' && bundleId) {
    const lookup = await getAppStoreLookup(bundleId)
    return {
      androidCheck: null,
      latestIosVersion: lookup?.version ?? null,
      iosStoreUrl: lookup?.storeUrl ?? null,
    }
  }

  return { androidCheck: null, latestIosVersion: null, iosStoreUrl: null }
}

export function useVersionCheck(): VersionNeedsUpdateResponse {
  const currentVersion = Constants.expoConfig?.version ?? null
  const bundleId =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.bundleIdentifier ?? null
      : Constants.expoConfig?.android?.package ?? null

  const enabled = (Platform.OS === 'android' || Platform.OS === 'ios') && !!currentVersion

  const { data } = useQuery<QueryResult>({
    queryKey: enabled
      ? versionCheckKeys.latest(`${Platform.OS}:${bundleId ?? ''}`)
      : versionCheckKeys.all,
    queryFn: () => resolveVersionSources(bundleId),
    enabled,
    staleTime: SIX_HOURS,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
    retry: false,
  })

  if (Platform.OS === 'android') {
    const androidCheck = data?.androidCheck ?? null
    const shouldUpdate = androidCheck?.shouldUpdate === true
    const androidExtras = (androidCheck as { other?: { updatePriority?: number } } | null)?.other
    const priority = androidExtras?.updatePriority ?? 0
    return {
      updateAvailable: shouldUpdate,
      forceUpdate: shouldUpdate && priority >= ANDROID_IMMEDIATE_PRIORITY,
      latestVersion: androidCheck?.storeVersion ?? null,
      currentVersion,
      androidCheck,
      iosStoreUrl: null,
    }
  }

  const latestVersion = data?.latestIosVersion ?? null
  const iosStoreUrl = data?.iosStoreUrl ?? null
  const updateAvailable =
    enabled && !!currentVersion && !!latestVersion && isVersionOutdated(currentVersion, latestVersion)

  return {
    updateAvailable,
    forceUpdate: false,
    latestVersion,
    currentVersion,
    androidCheck: null,
    iosStoreUrl,
  }
}

/**
 * Triggers the native Google Play update flow. Flexible by default; the
 * caller can force IMMEDIATE when the developer-set priority is high.
 */
export async function startAndroidUpdate(
  options: { immediate?: boolean } = {},
): Promise<void> {
  if (Platform.OS !== 'android') return
  try {
    const inAppUpdates = new SpInAppUpdates(false)
    await inAppUpdates.startUpdate({
      updateType: options.immediate ? IAUUpdateKind.IMMEDIATE : IAUUpdateKind.FLEXIBLE,
    })
  } catch {
    // User dismissed the flow or Play Services unavailable. Silent fail is fine --
    // the check will run again on next app cold start.
  }
}

/**
 * Installs an already-downloaded flexible update. No-op on iOS or if no
 * update is staged.
 */
export async function installAndroidUpdate(): Promise<void> {
  if (Platform.OS !== 'android') return
  try {
    const inAppUpdates = new SpInAppUpdates(false)
    await inAppUpdates.installUpdate()
  } catch {
    // noop
  }
}
