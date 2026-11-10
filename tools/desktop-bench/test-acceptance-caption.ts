import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'

// Caption inspection of the Windows installed acceptance (#2084): inspectCaption in acceptance-runner.mjs, driven
// through its real source with a fake proxy and a scripted native caption reader.
type CaptionReading = { colors: { color: number[]; count: number }[]; sampled: number; darkMode?: number; darkModeStatus?: number }
type CaptionReport = { caption: Record<string, CaptionReading & { expected: number[] }> }

function captionContext(readings: Record<string, CaptionReading[]>) {
  const runner = readFileSync(new URL('./acceptance-runner.mjs', import.meta.url), 'utf8')
  const inspect = runner.slice(runner.indexOf('const captionCanvas'), runner.indexOf('async function installedLaunch'))
  const host = readFileSync(new URL('./host.mjs', import.meta.url), 'utf8')
  const polling = host.slice(host.indexOf('export async function waitFor('), host.indexOf('export async function waitForHttp'))
    .replace('export async function', 'async function')
  let elapsed = 0
  let mode = ''
  const sent: string[] = []
  const reads: { pid: number; command: string; capture: string }[] = []
  const proxy = {
    send(command: string) { sent.push(command); mode = command.replace('appearance-', '') },
    read(kind: string) { return sent.includes(kind) ? { kind } : undefined },
  }
  const native = async (pid: number, command: string, _menu: undefined, { capture }: { capture: string }) => {
    reads.push({ pid, command, capture })
    const queue = readings[mode]!
    return queue.length > 1 ? queue.shift() : queue[0]
  }
  const context = { Error, join, Date: { now: () => elapsed }, delay: async (milliseconds: number) => { elapsed += milliseconds } }
  runInNewContext(`${polling}\n${inspect}\nglobalThis.inspect = inspectCaption`, context)
  const inspectCaption = (context as typeof context & { inspect: (...args: unknown[]) => Promise<void> }).inspect
  return { sent, reads, elapsed: () => elapsed, run: (report: object) => inspectCaption(proxy, native, { child: { pid: 7 } }, 'output', report) }
}

// The reader reads DWMWA_USE_IMMERSIVE_DARK_MODE back from the window: 1 for the dark window theme, 0 for the light one, and
// its HRESULT. The default flag is the one the page mode of each canvas asks for.
const caption = (color: number[], count = 100, sampled = 100, darkMode = color[0]! > 128 ? 0 : 1, darkModeStatus = 0) =>
  ({ colors: [{ color, count }], sampled, darkMode, darkModeStatus })
// The Windows 11 immersive dark caption is not the canvas, so a shell that sets only the window theme never passes.
const immersiveDark = caption([32, 32, 32])
// E_INVALIDARG, as the signed 32-bit integer that the reader serialises.
const failedRead = -2147024809

test('caption inspection drives both page modes and polls each until the caption shows its canvas', async () => {
  const check = captionContext({
    light: [caption([243, 243, 243]), caption([250, 250, 250], 95)],
    dark: [immersiveDark, caption([9, 9, 11])],
  })
  const recorded = {} as CaptionReport
  await check.run(recorded)
  // The runner builds its report inside a separate VM context, so only plain copies compare by value.
  const report = JSON.parse(JSON.stringify(recorded)) as CaptionReport
  assert.deepEqual(check.sent, ['appearance-light', 'appearance-dark'])
  assert.deepEqual(check.reads, [
    ...Array(2).fill({ pid: 7, command: 'caption', capture: join('output', 'caption-light.png') }),
    ...Array(2).fill({ pid: 7, command: 'caption', capture: join('output', 'caption-dark.png') }),
  ])
  assert.deepEqual(report.caption.light, { expected: [250, 250, 250], ...caption([250, 250, 250], 95) })
  assert.deepEqual(report.caption.dark, { expected: [9, 9, 11], ...caption([9, 9, 11]) })
})

test('caption inspection fails on a caption that never takes the canvas and keeps its last reading', async () => {
  for (const [readings, failed] of [
    [{ light: [caption([250, 250, 250])], dark: [immersiveDark] }, 'dark'],
    [{ light: [caption([250, 250, 250], 89)], dark: [caption([9, 9, 11])] }, 'light'],
    [{ light: [{ colors: [], sampled: 0, darkMode: 0, darkModeStatus: 0 }], dark: [caption([9, 9, 11])] }, 'light'],
  ] as const) {
    const check = captionContext(structuredClone(readings) as Record<string, CaptionReading[]>)
    const recorded = {} as CaptionReport
    await assert.rejects(() => check.run(recorded), new RegExp(`Timed out waiting for ${failed} caption in the Orbit canvas colour`))
    assert.ok(check.elapsed() >= 30000)
    const report = JSON.parse(JSON.stringify(recorded)) as CaptionReport
    assert.deepEqual(report.caption[failed], { expected: failed === 'dark' ? [9, 9, 11] : [250, 250, 250], ...readings[failed][0] })
  }
})

// DWMWA_CAPTION_COLOR paints the canvas whatever the window theme is, so only the read-back flag shows a dropped runtime theme (#2084).
test('caption inspection fails on the canvas colour with the wrong window theme flag or a failed read-back', async () => {
  for (const [readings, failed] of [
    [{ light: [caption([250, 250, 250], 100, 100, 1)], dark: [caption([9, 9, 11])] }, 'light'],
    [{ light: [caption([250, 250, 250])], dark: [caption([9, 9, 11], 100, 100, 0)] }, 'dark'],
    [{ light: [caption([250, 250, 250], 100, 100, 0, failedRead)], dark: [caption([9, 9, 11])] }, 'light'],
    [{ light: [caption([250, 250, 250])], dark: [caption([9, 9, 11], 100, 100, 1, failedRead)] }, 'dark'],
    [{ light: [{ colors: [{ color: [250, 250, 250], count: 100 }], sampled: 100 }], dark: [caption([9, 9, 11])] }, 'light'],
  ] as const) {
    const check = captionContext(structuredClone(readings) as Record<string, CaptionReading[]>)
    const recorded = {} as CaptionReport
    await assert.rejects(() => check.run(recorded), new RegExp(`Timed out waiting for ${failed} caption in the Orbit canvas colour`))
    assert.ok(check.elapsed() >= 30000)
    const report = JSON.parse(JSON.stringify(recorded)) as CaptionReport
    assert.deepEqual(report.caption[failed], { expected: failed === 'dark' ? [9, 9, 11] : [250, 250, 250], ...readings[failed][0] })
  }
})

test('caption inspection waits for the window theme flag of the page mode inside the same poll as the canvas colour', async () => {
  const check = captionContext({
    light: [caption([250, 250, 250], 100, 100, 1), caption([243, 243, 243]), caption([250, 250, 250])],
    dark: [caption([9, 9, 11], 100, 100, 0), caption([9, 9, 11])],
  })
  const recorded = {} as CaptionReport
  await check.run(recorded)
  assert.equal(check.reads.length, 5)
})
