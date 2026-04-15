export interface AppStoreLookup {
  version: string
  storeUrl: string | null
}

/**
 * Fetches the latest published version from the Apple App Store via the
 * public iTunes Search API. No auth, no scraping -- this is the official
 * standard for iOS update detection.
 *
 * Android does not need this: we use Google Play In-App Updates via
 * sp-react-native-in-app-updates, which talks to Play Services directly.
 */
export async function getAppStoreLookup(bundleId: string): Promise<AppStoreLookup | null> {
  try {
    // Cache-bust because iTunes caches aggressively at the CDN layer.
    const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&_=${Date.now()}`
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const data = (await response.json()) as {
      resultCount?: number
      results?: Array<{ version?: string; trackViewUrl?: string }>
    } | null
    const entry = data?.results?.[0]
    const version = entry?.version
    if (typeof version !== 'string' || version.length === 0) return null
    const storeUrl = typeof entry?.trackViewUrl === 'string' ? entry.trackViewUrl : null
    return { version, storeUrl }
  } catch {
    return null
  }
}

/**
 * Compares two semver-ish version strings. Non-numeric segments (e.g.
 * `-beta`, `-rc1`) are ignored -- only the numeric `major.minor.patch`
 * portion is compared.
 *
 * Returns `true` iff `current` is strictly older than `latest`.
 */
export function isVersionOutdated(current: string, latest: string): boolean {
  const currentParts = normalizeVersion(current)
  const latestParts = normalizeVersion(latest)

  const length = Math.max(currentParts.length, latestParts.length)
  for (let i = 0; i < length; i++) {
    const c = currentParts[i] ?? 0
    const l = latestParts[i] ?? 0
    if (c < l) return true
    if (c > l) return false
  }
  return false
}

function normalizeVersion(version: string): number[] {
  if (!version) return [0]
  const numeric = version.split(/[^0-9.]/)[0] ?? ''
  return numeric
    .split('.')
    .map((segment) => {
      const parsed = Number.parseInt(segment, 10)
      return Number.isFinite(parsed) ? parsed : 0
    })
}
