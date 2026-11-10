import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import type { Sleep } from './release-asset.ts'

const stapleBackoffMilliseconds = [10_000, 30_000, 60_000]

export interface XcrunResult { status: number | null; output: string }
export interface StapleDependencies {
  xcrun: (args: string[]) => XcrunResult
  sleep: Sleep
  write: (line: string) => void
}

const stapleNetworkFailureStatus = 68
const connectionLost = /NSURLErrorDomain Code=-1005 "The network connection was lost\."/

/** WHY: stapler looks the ticket up in CloudKit, and a dropped connection there exits 68 with NSURLErrorDomain -1005; every other stapler failure is real. */
export function isTransientStapleFailure(result: XcrunResult): boolean {
  return result.status === stapleNetworkFailureStatus && connectionLost.test(result.output)
}

export async function stapleWithRetry(path: string, dependencies: StapleDependencies): Promise<void> {
  const attempts = stapleBackoffMilliseconds.length + 1
  for (let attempt = 1; ; attempt++) {
    const result = dependencies.xcrun(['stapler', 'staple', path])
    if (result.status === 0) return
    if (attempt === attempts || !isTransientStapleFailure(result)) {
      throw new Error(`xcrun stapler staple failed for ${path} with status ${String(result.status)} on attempt ${attempt} of ${attempts}`)
    }
    const delay = stapleBackoffMilliseconds[attempt - 1]!
    dependencies.write(`stapler lost the CloudKit connection on attempt ${attempt} of ${attempts}; retrying in ${delay / 1000} s`)
    await dependencies.sleep(delay)
  }
}

function runXcrun(args: string[]): XcrunResult {
  const result = spawnSync('xcrun', args, { encoding: 'utf8' })
  if (result.error) throw result.error
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  return { status: result.status, output: result.stdout + result.stderr }
}

async function main() {
  const paths = process.argv.slice(2)
  if (paths.length === 0) throw new Error('Usage: staple.ts <path>...')
  for (const path of paths) {
    await stapleWithRetry(path, {
      xcrun: runXcrun,
      sleep,
      write: line => process.stdout.write(`${line}\n`),
    })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
