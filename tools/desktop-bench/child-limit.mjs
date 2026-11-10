import { spawnSync } from 'node:child_process'

// The harness tests run their native producers as child processes. The slowest passing child in the 30 Desktop Installed
// Acceptance runs 42592767083 to 42792519121 was one cold powershell.exe start: 9965 ms, against a median of 3558 ms in 37
// Windows runs of "PowerShell producer writes finite JSON for every rectangle component". The old fixed 10 s limit killed that
// child in 2 of those runs, so a child gets three times the slowest measured pass.
export const childLimit = 30000

export function runChild(command, argumentsList, options = {}) {
  const result = spawnSync(command, argumentsList, { encoding: 'utf8', timeout: childLimit, ...options })
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(`${command} ran past the ${options.timeout ?? childLimit} ms child limit; ` +
      'the limit is three times the slowest passing harness child of the 30 measured Desktop Installed Acceptance runs')
  }
  return result
}
