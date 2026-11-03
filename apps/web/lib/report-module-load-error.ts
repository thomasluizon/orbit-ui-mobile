import { captureException } from '@sentry/nextjs'
import { isMissingBuildModule, reloadStaleBuildOnce } from './stale-build-recovery'

export function reportModuleLoadError(error: unknown): void {
  captureException(error)
  if (isMissingBuildModule(error)) reloadStaleBuildOnce()
}
