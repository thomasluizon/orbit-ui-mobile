import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { useQuery } from '@tanstack/react-query'
import { versionCheckKeys } from '@orbit/shared/query'
import { getPlayStoreVersion, isVersionOutdated } from '@/lib/version-check'

const SIX_HOURS = 1000 * 60 * 60 * 6
const ONE_DAY = 1000 * 60 * 60 * 24

interface VersionCheckResult {
  updateAvailable: boolean
  latestVersion: string | null
  currentVersion: string | null
}

export function useVersionCheck(): VersionCheckResult {
  const currentVersion = Constants.expoConfig?.version ?? null
  const packageName = Constants.expoConfig?.android?.package ?? null
  const enabled = Platform.OS === 'android' && !!currentVersion && !!packageName

  const { data } = useQuery<string | null>({
    queryKey: enabled ? versionCheckKeys.latest(packageName ?? '') : versionCheckKeys.all,
    queryFn: () => (packageName ? getPlayStoreVersion(packageName) : Promise.resolve(null)),
    enabled,
    staleTime: SIX_HOURS,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const latestVersion = data ?? null
  const updateAvailable =
    enabled && !!currentVersion && !!latestVersion && isVersionOutdated(currentVersion, latestVersion)

  return { updateAvailable, latestVersion, currentVersion }
}
