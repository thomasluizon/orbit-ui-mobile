import { expect, it } from 'vitest'
import { isTransientStapleFailure, stapleBackoffMilliseconds, stapleWithRetry, type StapleDependencies, type XcrunResult } from '../scripts/staple.ts'

const dmg = 'bundle/dmg/Orbit Staging_0.1.27_aarch64.dmg'
const connectionLost: XcrunResult = {
  status: 68,
  output: [
    'Processing: Orbit Staging.app',
    'error is Error Domain=NSURLErrorDomain Code=-1005 "The network connection was lost." UserInfo={NSErrorFailingURLStringKey=https://api.apple-cloudkit.com/database/1/com.apple.gk.ticket-delivery/production/public/records/lookup}',
    "CloudKit's response is inconsistent with expections: (null)",
    'The staple and validate action failed! Error 68.',
  ].join('\n'),
}
const success: XcrunResult = { status: 0, output: 'The staple and validate action worked!' }

function harness(results: XcrunResult[]) {
  const calls: string[][] = []
  const sleeps: number[] = []
  const lines: string[] = []
  const dependencies: StapleDependencies = {
    xcrun: args => {
      calls.push(args)
      return results.shift() ?? success
    },
    sleep: milliseconds => { sleeps.push(milliseconds); return Promise.resolve() },
    write: line => lines.push(line),
  }
  return { dependencies, calls, sleeps, lines }
}

it('recognizes only the CloudKit connection loss that exits 68', () => {
  expect(isTransientStapleFailure(connectionLost)).toBe(true)
  expect(isTransientStapleFailure({ ...connectionLost, status: 1 })).toBe(false)
  expect(isTransientStapleFailure({ status: 68, output: 'The staple and validate action failed! Error 68.' })).toBe(false)
  expect(isTransientStapleFailure({ status: 65, output: 'Could not find base64 encoded ticket in response for 2/ab12' })).toBe(false)
})

it('staples once and validates the stapled ticket when the first attempt works', async () => {
  const { dependencies, calls, sleeps } = harness([success])
  await stapleWithRetry(dmg, dependencies)
  expect(calls).toEqual([['stapler', 'staple', dmg], ['stapler', 'validate', dmg]])
  expect(sleeps).toEqual([])
})

it('retries a dropped CloudKit connection with backoff and validates after the retry works', async () => {
  const { dependencies, calls, sleeps, lines } = harness([connectionLost, connectionLost, success])
  await stapleWithRetry(dmg, dependencies)
  expect(calls).toEqual([['stapler', 'staple', dmg], ['stapler', 'staple', dmg], ['stapler', 'staple', dmg], ['stapler', 'validate', dmg]])
  expect(sleeps).toEqual(stapleBackoffMilliseconds.slice(0, 2))
  expect(lines).toEqual([
    'stapler lost the CloudKit connection on attempt 1 of 4; retrying in 10 s',
    'stapler lost the CloudKit connection on attempt 2 of 4; retrying in 30 s',
  ])
})

it('fails loudly after the last bounded attempt and never validates', async () => {
  const { dependencies, calls, sleeps } = harness([connectionLost, connectionLost, connectionLost, connectionLost, success])
  await expect(stapleWithRetry(dmg, dependencies)).rejects.toThrow(`xcrun stapler staple failed for ${dmg} with status 68 on attempt 4 of 4`)
  expect(calls).toHaveLength(4)
  expect(calls.every(call => call[1] === 'staple')).toBe(true)
  expect(sleeps).toEqual(stapleBackoffMilliseconds)
})

it.each([
  { name: 'a rejected ticket', result: { status: 65, output: 'Could not find base64 encoded ticket in response for 2/ab12' } },
  { name: 'a failure with another status', result: { status: 1, output: connectionLost.output } },
  { name: 'a signal kill', result: { status: null, output: '' } },
])('fails at once on $name without a retry', async ({ result }) => {
  const { dependencies, calls, sleeps } = harness([result])
  await expect(stapleWithRetry(dmg, dependencies)).rejects.toThrow('xcrun stapler staple failed')
  expect(calls).toHaveLength(1)
  expect(sleeps).toEqual([])
})

it('fails when validation rejects the stapled ticket', async () => {
  const { dependencies } = harness([success, { status: 65, output: 'does not have a ticket stapled to it' }])
  await expect(stapleWithRetry(dmg, dependencies)).rejects.toThrow(`xcrun stapler validate rejected ${dmg} with status 65`)
})
