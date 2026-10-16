import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'
import { nativeBuildVersion } from 'expo-application'
import Constants from 'expo-constants'
import { useQuery } from '@tanstack/react-query'
import SpInAppUpdates, {
  IAUInstallStatus,
  IAUUpdateKind,
  type NeedsUpdateResponse,
  type StatusUpdateEvent,
} from 'sp-react-native-in-app-updates'
import { versionCheckKeys } from '@orbit/shared/query'
import { isVersionBelow } from '@orbit/shared/utils'
import { getAppVersion } from '@/lib/app-version'
import { getAppStoreLookup } from '@/lib/version-check'
import { isAndroidUpdateDownloaded } from '@/modules/orbit-app-update'

const SIX_HOURS = 1000 * 60 * 60 * 6
const ONE_DAY = 1000 * 60 * 60 * 24

const ANDROID_IMMEDIATE_PRIORITY = 4

export interface VersionNeedsUpdateResponse {
  updateAvailable: boolean
  androidDownloaded: boolean
  forceUpdate: boolean
  latestVersion: string | null
  currentVersion: string | null
  /** Android only: the Play Core result. `null` on iOS or when no update. */
  androidCheck: NeedsUpdateResponse | null
  /** iOS only: App Store deep link from iTunes lookup. `null` on Android or when no update. */
  iosStoreUrl: string | null
}

interface QueryResult {
  androidDownloaded: boolean
  androidCheck: NeedsUpdateResponse | null
  latestIosVersion: string | null
  iosStoreUrl: string | null
}

function compareVersionCodes(offered: string, installed: string): -1 | 0 | 1 {
  const offeredCode = Number(offered)
  const installedCode = Number(installed)
  if (!Number.isSafeInteger(offeredCode) || offeredCode <= 0) return 0
  if (!Number.isSafeInteger(installedCode) || installedCode <= 0) return 0
  return offeredCode > installedCode ? 1 : offeredCode < installedCode ? -1 : 0
}

async function resolveVersionSources(bundleId: string | null): Promise<QueryResult> {
  if (Platform.OS === 'android') {
    try {
      const inAppUpdates = new SpInAppUpdates(false)
      const installedCode = Number(nativeBuildVersion)
      const [result, downloaded] = await Promise.all([
        Number.isSafeInteger(installedCode) && installedCode > 0
          ? inAppUpdates.checkNeedsUpdate({
              curVersion: String(installedCode),
              customVersionComparator: compareVersionCodes,
            })
          : Promise.resolve(null),
        isAndroidUpdateDownloaded(),
      ])
      return { androidCheck: result, androidDownloaded: downloaded, latestIosVersion: null, iosStoreUrl: null }
    } catch {
      return { androidCheck: null, androidDownloaded: false, latestIosVersion: null, iosStoreUrl: null }
    }
  }

  if (Platform.OS === 'ios' && bundleId) {
    const lookup = await getAppStoreLookup(bundleId)
    return {
      androidCheck: null,
      androidDownloaded: false,
      latestIosVersion: lookup?.version ?? null,
      iosStoreUrl: lookup?.storeUrl ?? null,
    }
  }

  return { androidCheck: null, androidDownloaded: false, latestIosVersion: null, iosStoreUrl: null }
}

export function useVersionCheck(): VersionNeedsUpdateResponse {
  const currentVersion = getAppVersion()
  const bundleId =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.bundleIdentifier ?? null
      : Constants.expoConfig?.android?.package ?? null

  const enabled = (Platform.OS === 'android' || Platform.OS === 'ios') && !!currentVersion

  const { data, refetch } = useQuery<QueryResult>({
    queryKey: enabled
      ? versionCheckKeys.latest(`${Platform.OS}:${bundleId ?? ''}`)
      : versionCheckKeys.all,
    queryFn: () => resolveVersionSources(bundleId),
    enabled,
    staleTime: SIX_HOURS,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
    refetchOnMount: Platform.OS === 'android' ? 'always' : true,
    retry: false,
  })

  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) return
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch()
    })
    return () => subscription.remove()
  }, [enabled, refetch])

  if (Platform.OS === 'android') {
    const androidCheck = data?.androidCheck ?? null
    const androidDownloaded = data?.androidDownloaded === true
    const shouldUpdate = androidCheck?.shouldUpdate === true && !androidDownloaded
    const androidExtras = (androidCheck as { other?: { updatePriority?: number } } | null)?.other
    const priority = androidExtras?.updatePriority ?? 0
    return {
      updateAvailable: shouldUpdate,
      androidDownloaded,
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
    enabled && !!currentVersion && !!latestVersion && isVersionBelow(currentVersion, latestVersion)

  return {
    updateAvailable,
    androidDownloaded: false,
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
  }
}

/**
 * Drives the Android FLEXIBLE in-app update. Without this `install` call a flexible update
 * downloads but never installs.
 */
export function useAndroidFlexibleUpdate(active: boolean, onInterrupted: () => void): {
  downloaded: boolean
  install: () => void
} {
  const inAppUpdates = useMemo(
    () => (Platform.OS === 'android' ? new SpInAppUpdates(false) : null),
    [],
  )
  const [downloaded, setDownloaded] = useState(false)
  const startedRef = useRef(false)

  const restoreAction = useCallback(() => {
    startedRef.current = false
    setDownloaded(false)
    onInterrupted()
  }, [onInterrupted])

  useEffect(() => {
    if (!inAppUpdates) return
    const onStatus = (event: StatusUpdateEvent) => {
      if (active && (event.status === IAUInstallStatus.FAILED || event.status === IAUInstallStatus.CANCELED)) {
        restoreAction()
      }
      if (event.status === IAUInstallStatus.DOWNLOADED) {
        void Promise.resolve().then(() => setDownloaded(true))
      }
    }
    const onIntentResult = (result: unknown) => {
      // WHY: onActivityResult emits a string despite InstallationResult's numeric type: https://github.com/SudoPlz/sp-react-native-in-app-updates/blob/v1.5.0/android/src/main/java/com/sudoplz/rninappupdates/SpReactNativeInAppUpdatesModule.java#L195
      if (active && result === String(IAUInstallStatus.CANCELED)) restoreAction()
    }
    inAppUpdates.addStatusUpdateListener(onStatus)
    inAppUpdates.addIntentSelectionListener(onIntentResult)
    return () => {
      inAppUpdates.removeStatusUpdateListener(onStatus)
      inAppUpdates.removeIntentSelectionListener(onIntentResult)
    }
  }, [active, inAppUpdates, restoreAction])

  useEffect(() => {
    if (!inAppUpdates || !active || startedRef.current) return
    startedRef.current = true
    void inAppUpdates
      .startUpdate({ updateType: IAUUpdateKind.FLEXIBLE })
      .catch(restoreAction)
  }, [active, inAppUpdates, restoreAction])

  const install = useCallback(() => {
    inAppUpdates?.installUpdate()
  }, [inAppUpdates])

  return { downloaded, install }
}
