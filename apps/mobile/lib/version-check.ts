/**
 * Fetches and parses the latest published version of an app from the
 * Google Play Store. Uses a resilient HTML scrape because there is no
 * official public API. All failures are swallowed and return `null`,
 * so callers never surface an error to the user.
 */
export async function getPlayStoreVersion(packageName: string): Promise<string | null> {
  try {
    const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}&hl=en&gl=US`
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
    })

    if (!response.ok) return null

    const html = await response.text()
    return extractVersionFromHtml(html)
  } catch {
    return null
  }
}

/**
 * Parses the Play Store HTML for the current published version.
 * Tries multiple markers so that small layout tweaks from Google do
 * not immediately break the check.
 */
export function extractVersionFromHtml(html: string): string | null {
  // JSON-LD / embedded JSON: "softwareVersion":"1.2.3"
  const jsonLd = /"softwareVersion"\s*:\s*"([^"]+)"/i.exec(html)
  if (jsonLd?.[1]) return jsonLd[1].trim()

  // Legacy label: `Current Version</div><...>1.2.3`
  const currentVersion = /Current Version[^0-9]*([0-9][0-9A-Za-z.\-+]*)/i.exec(html)
  if (currentVersion?.[1]) return currentVersion[1].trim()

  // Fallback: `>Version<...>1.2.3<`
  const versionLabel = /Version<\/div>[\s\S]*?>([0-9][0-9A-Za-z.\-+]*)</i.exec(html)
  if (versionLabel?.[1]) return versionLabel[1].trim()

  return null
}

/**
 * Compares two semver-ish version strings. Non-numeric segments (e.g.
 * `-beta`, `-rc1`) are ignored -- only the numeric `major.minor.patch`
 * portion is compared. Shorter versions are padded with zeros.
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
  // Strip any `-beta`, `+build`, etc. before splitting.
  const numeric = version.split(/[^0-9.]/)[0] ?? ''
  return numeric
    .split('.')
    .map((segment) => {
      const parsed = Number.parseInt(segment, 10)
      return Number.isFinite(parsed) ? parsed : 0
    })
}
