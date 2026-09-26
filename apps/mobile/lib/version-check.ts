export interface AppStoreLookup {
  version: string
  storeUrl: string | null
}

/**
 * Fetches the latest published version from the Apple App Store via the public iTunes Search
 * API. No auth, no scraping -- this is the official standard for iOS update detection.
 */
export async function getAppStoreLookup(bundleId: string): Promise<AppStoreLookup | null> {
  try {
    const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&_=${Date.now()}`
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const data = (await response.json()) as {
      resultCount?: number
      results?: { version?: string; trackViewUrl?: string }[]
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
