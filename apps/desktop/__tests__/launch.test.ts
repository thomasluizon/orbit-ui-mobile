import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { neutralColors } from '../../../packages/shared/src/theme/neutral-ramp.ts'
import { schemes } from '../../../packages/shared/src/theme/color-schemes.ts'
import { launchAsset, paintMascot } from '../scripts/launch-assets.ts'

const origin = 'https://app.useorbit.org'
const script = readFileSync(new URL('../src-tauri/src/launch.js', import.meta.url), 'utf8')
  .replace('__ORBIT_LAUNCH_ORIGIN__', JSON.stringify(origin))

function documentLaunch({ paint = true, nested = false, url = origin, loading = true, content = 'Hoje', mode = 'dark' } = {}) {
  const invoke = vi.fn((_command: string, _payload: { generation: number | null }) => Promise.resolve(7))
  const windowEvents = new Map<string, Array<() => void>>()
  const documentEvents = new Map<string, () => void>()
  const frames: Array<() => void> = []
  const observers: PaintObserver[] = []
  let mutation: (() => void) | undefined
  const body = { innerText: content, querySelector: () => null }
  class PaintObserver {
    static supportedEntryTypes = paint ? ['paint'] : []
    disconnected = false
    options?: { type: string; buffered: boolean }
    constructor(public callback: (entries: { getEntries(): Array<{ name: string }> }) => void) { observers.push(this) }
    observe(options: { type: string; buffered: boolean }) { this.options = options }
    disconnect() { this.disconnected = true }
  }
  const window = {
    top: {} as object,
    location: { origin: url },
    __TAURI_INTERNALS__: { invoke },
    addEventListener: (event: string, callback: () => void) => windowEvents.set(event, [...windowEvents.get(event) ?? [], callback]),
  }
  if (!nested) window.top = window
  // eslint-disable-next-line sonarjs/code-eval -- the test runs the repository's own injected script source, with no external input
  runInNewContext(script, {
    window, console, PerformanceObserver: PaintObserver, setTimeout: vi.fn(),
    MutationObserver: class {
      constructor(callback: () => void) { mutation = callback }
      observe() {}
      disconnect() {}
    },
    document: {
      body,
      documentElement: { classList: { contains: (value: string) => value === mode } },
      readyState: loading ? 'loading' : 'complete',
      addEventListener: (event: string, callback: () => void) => documentEvents.set(event, callback),
    },
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
  })
  return {
    invoke, windowEvents, documentEvents, frames,
    contentArrives: () => { body.innerText = 'Hoje'; mutation?.() },
    painted: (name: string) => observers.at(-1)?.callback({ getEntries: () => [{ name }] }),
    observer: () => observers.at(-1),
  }
}

describe('native launch handoff', () => {
  it('keeps the native mark through first paint and reveals only at contentful paint', async () => {
    const launch = documentLaunch()
    expect(launch.invoke.mock.calls).toEqual([['desktop_launch', { generation: null }]])
    expect(launch.observer()?.options).toEqual({ type: 'paint', buffered: true })
    launch.painted('first-paint')
    await Promise.resolve()
    expect(launch.invoke).toHaveBeenCalledTimes(1)
    launch.painted('first-contentful-paint')
    await Promise.resolve()
    expect(launch.invoke).toHaveBeenLastCalledWith('desktop_launch', { generation: 7, mode: 'dark' })
    expect(launch.observer()?.disconnected).toBe(true)
    launch.painted('first-contentful-paint')
    await Promise.resolve()
    expect(launch.invoke).toHaveBeenCalledTimes(2)
  })

  it.each([{ nested: true }, { url: 'https://untrusted.example' }])('does not invoke from another frame or origin: %j', (options) => {
    expect(documentLaunch(options).invoke).not.toHaveBeenCalled()
  })

  it('ignores a paint delivered after navigating away', async () => {
    const launch = documentLaunch()
    launch.windowEvents.get('pagehide')?.forEach(callback => callback())
    launch.painted('first-contentful-paint')
    await Promise.resolve()
    expect(launch.invoke).toHaveBeenCalledTimes(1)
  })

  it.each([true, false])('supports WebKit without paint entries after document parsing: loading=%s', async (loading) => {
    const launch = documentLaunch({ paint: false, loading })
    if (loading) {
      expect(launch.frames).toHaveLength(0)
      launch.documentEvents.get('DOMContentLoaded')?.()
    }
    expect(launch.invoke).toHaveBeenCalledTimes(1)
    launch.frames.shift()?.()
    expect(launch.invoke).toHaveBeenCalledTimes(1)
    launch.frames.shift()?.()
    await Promise.resolve()
    expect(launch.invoke).toHaveBeenLastCalledWith('desktop_launch', { generation: 7, mode: 'dark' })
  })

  it('keeps the mark over an empty WebKit document until content arrives', async () => {
    const launch = documentLaunch({ paint: false, loading: false, content: '' })
    launch.frames.shift()?.()
    launch.frames.shift()?.()
    await Promise.resolve()
    expect(launch.invoke).toHaveBeenCalledTimes(1)
    launch.contentArrives()
    launch.frames.shift()?.()
    launch.frames.shift()?.()
    await Promise.resolve()
    expect(launch.invoke).toHaveBeenLastCalledWith('desktop_launch', { generation: 7, mode: 'dark' })
  })
})

it.each(['dark', 'light'] as const)('keeps the %s native mark generated from the brand source and shared tokens', async (mode) => {
  const asset = readFileSync(new URL(`../src-tauri/native/launch-${mode}.png`, import.meta.url))
  expect(asset).toEqual(await launchAsset(mode))
  const native = readFileSync(new URL('../src-tauri/src/launch.rs', import.meta.url), 'utf8')
  const channels = [1, 3, 5].map(start => Number.parseInt(neutralColors[mode].bg.slice(start, start + 2), 16))
  expect(native).toContain(`Color(${channels.join(', ')}, 255)`)
})

it.each(['dark', 'light'] as const)('preserves the granted canvas and accent moon in the %s launch raster', async (mode) => {
  const source = readFileSync(new URL('../../../design/brand/orbit-mascot.svg', import.meta.url), 'utf8')
  const expected = await sharp(Buffer.from(paintMascot(source, mode)), { density: (72 * 512) / 420 })
    .resize(512, 512, { fit: 'contain', background: neutralColors[mode].bg })
    .flatten({ background: neutralColors[mode].bg }).raw().toBuffer()
  const generated = await launchAsset(mode)
  const generatedPixels = await sharp(generated).flatten({ background: neutralColors[mode].bg }).raw().toBuffer()
  expect(generatedPixels.equals(expected), 'generated pixels preserve the untrimmed brand canvas').toBe(true)
  const committed = readFileSync(new URL(`../src-tauri/native/launch-${mode}.png`, import.meta.url))
  const committedPixels = await sharp(committed).flatten({ background: neutralColors[mode].bg }).raw().toBuffer()
  expect(committedPixels.equals(expected), 'committed pixels preserve the untrimmed brand canvas').toBe(true)
  const moon = Number.parseInt(schemes.orange.accent[mode].primary.slice(1), 16)
  let moonPixels = 0
  for (let index = 0; index < committedPixels.length; index += 3) {
    if (committedPixels.readUIntBE(index, 3) === moon) moonPixels += 1
  }
  expect(moonPixels, 'the accent moon is drawn in the launch raster').toBeGreaterThan(0)
})
