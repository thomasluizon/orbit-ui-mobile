import { captureException } from '@sentry/nextjs'

const RELOAD_KEY = 'orbit-stale-build-reload'

export function reloadStaleBuildOnce(): boolean {
  const build = process.env.NEXT_PUBLIC_WEB_COMMIT_SHA || 'unknown'
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === build) return false
    sessionStorage.setItem(RELOAD_KEY, build)
  } catch (error) {
    captureException(error)
    return false
  }
  globalThis.location.reload()
  return true
}

function isMissingBuildModule(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'ChunkLoadError') return true
  return error instanceof TypeError && /^\w+\[\w+\] is not a function$/.test(error.message)
    && /webpack-[\w-]+\.js:\d+:\d+/.test(error.stack?.split('\n')[1] ?? '')
}

export function installStaleBuildRecovery(): void {
  window.addEventListener('error', (event) => {
    if (isMissingBuildModule(event.error)) reloadStaleBuildOnce()
  })
  window.addEventListener('unhandledrejection', (event) => {
    if (isMissingBuildModule(event.reason)) reloadStaleBuildOnce()
  })
}
