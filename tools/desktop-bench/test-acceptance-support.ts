import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import * as acceptanceContract from './acceptance-contract.mjs'

// Shared by test-acceptance.ts and test-acceptance-keys.ts. It holds no test case, so no job starts it on its own.
export const button = { id: '0/0', role: 'Button', name: 'Today', interactive: true, focused: false, selected: false,
  AutomationId: 'today', ClassName: 'button', FrameworkId: 'Chrome', IsOffscreen: false, IsEnabled: true,
  IsKeyboardFocusable: true, IsControlElement: true, IsContentElement: true, LocalizedControlType: 'button',
  BoundingRectangle: { X: 0, Y: 0, Width: 40, Height: 40 } }

// Runs the real inspectSurfaces from acceptance-runner.mjs with the real host.mjs waitFor on a fake clock.
export function inspectionContext(platform: string) {
  const runner = readFileSync(new URL('./acceptance-runner.mjs', import.meta.url), 'utf8')
  const inspect = runner.slice(runner.indexOf('async function inspectSurfaces'), runner.indexOf('async function installedLaunch'))
  const host = readFileSync(new URL('./host.mjs', import.meta.url), 'utf8')
  const polling = host.slice(host.indexOf('export async function waitFor('), host.indexOf('export async function waitForHttp'))
    .replace('export async function', 'async function')
  let elapsed = 0
  const records: { path: string; value: unknown }[] = []
  const logs: string[] = []
  const context = { Error, join, ...acceptanceContract, process: { platform, stdout: { write: (line: string) => { logs.push(line) } } },
    Date: { now: () => elapsed }, delay: async (milliseconds: number) => { elapsed += milliseconds },
    record: async (path: string, value: unknown) => { records.push({ path, value }) },
  }
  runInNewContext(`${polling}\n${inspect}\nglobalThis.inspect = inspectSurfaces`, context)
  return { records, logs, elapsed: () => elapsed,
    inspect: (context as typeof context & { inspect: (...args: unknown[]) => Promise<void> }).inspect }
}
