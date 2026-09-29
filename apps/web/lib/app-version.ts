const SHORT_COMMIT_LENGTH = 7

/**
 * The served build's version: the short source commit that the release passes
 * as the `WEB_COMMIT_SHA` build arg, the same commit `/api/health` reports.
 * `null` when the build carries no commit (local dev, unit tests), so a surface
 * shows no version rather than a placeholder.
 */
export function getAppVersion(): string | null {
  const commit = process.env.NEXT_PUBLIC_WEB_COMMIT_SHA
  return commit ? commit.slice(0, SHORT_COMMIT_LENGTH) : null
}
