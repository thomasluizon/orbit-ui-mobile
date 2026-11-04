import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { applyThemeTokensToDOM } from '@/lib/theme-dom'

const invoke = vi.fn<(command: string, payload: { generation: number | null; mode?: string | null }) => Promise<number>>()
const frames: FrameRequestCallback[] = []
const observe = vi.fn()
const disconnect = vi.fn()
const pageWindow = window
let painted: (names: string[]) => void

class PaintObserver {
  static supportedEntryTypes = ['paint']

  constructor(callback: (entries: { getEntries(): Array<{ name: string }> }) => void) {
    painted = names => callback({ getEntries: () => names.map(name => ({ name })) })
  }

  observe = observe
  disconnect = disconnect
}

async function loadLaunch({ paint = 'supported', loading = false } = {}) {
  if (paint === 'missing') vi.stubGlobal('PerformanceObserver', undefined)
  else {
    PaintObserver.supportedEntryTypes = paint === 'supported' ? ['paint'] : []
    vi.stubGlobal('PerformanceObserver', PaintObserver)
  }
  vi.spyOn(document, 'readyState', 'get').mockReturnValue(loading ? 'loading' : 'complete')
  const launchScript = resolve(__dirname, '../../../desktop/src-tauri/src/launch.js')
  await import(launchScript)
}

async function frame() {
  frames.splice(0).forEach(callback => callback(0))
  await Promise.resolve()
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.useFakeTimers()
  invoke.mockResolvedValue(7)
  frames.length = 0
  document.body.innerHTML = ''
  Object.defineProperty(document.body, 'innerText', { configurable: true, get() { return this.textContent } })
  applyThemeTokensToDOM('orange', 'dark')
  vi.stubGlobal('__ORBIT_LAUNCH_ORIGIN__', window.location.origin)
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
})

afterEach(() => {
  document.dispatchEvent(new Event('DOMContentLoaded'))
  pageWindow.dispatchEvent(new Event('pagehide'))
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('desktop launch bridge', () => {
  it.each(['origin', 'frame'])('ignores a foreign %s', async boundary => {
    if (boundary === 'origin') vi.stubGlobal('__ORBIT_LAUNCH_ORIGIN__', 'https://untrusted.example')
    else vi.stubGlobal('window', { top: {} })
    await loadLaunch()
    expect(invoke).not.toHaveBeenCalled()
    expect(observe).not.toHaveBeenCalled()
  })

  it.each(['dark', 'light'] as const)('reveals once at contentful paint with the resolved %s mode and generation', async mode => {
    await loadLaunch()
    expect(invoke).toHaveBeenCalledExactlyOnceWith('desktop_launch', { generation: null })
    expect(observe).toHaveBeenCalledExactlyOnceWith({ type: 'paint', buffered: true })
    painted(['first-paint'])
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledTimes(1)
    applyThemeTokensToDOM('orange', mode)
    painted(['first-contentful-paint'])
    await Promise.resolve()
    expect(invoke).toHaveBeenLastCalledWith('desktop_launch', { generation: 7, mode })
    expect(disconnect).toHaveBeenCalledOnce()
    painted(['first-contentful-paint'])
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('reports no mode when the page has no resolved appearance', async () => {
    document.documentElement.className = 'scheme-orange'
    await loadLaunch()
    painted(['first-contentful-paint'])
    await Promise.resolve()
    expect(invoke).toHaveBeenLastCalledWith('desktop_launch', { generation: 7, mode: null })
  })

  it.each(['dark', 'light'] as const)('synchronizes in-session appearance changes after a %s first paint without another reveal', async initial => {
    applyThemeTokensToDOM('orange', initial)
    await loadLaunch()
    painted(['first-contentful-paint'])
    await Promise.resolve()
    const changed = initial === 'dark' ? 'light' : 'dark'
    applyThemeTokensToDOM('orange', changed)
    await Promise.resolve()
    await Promise.resolve()
    expect(invoke).toHaveBeenLastCalledWith('desktop_launch', { generation: 7, mode: changed, reveal: false })
    expect(invoke).toHaveBeenCalledTimes(3)
    document.documentElement.classList.add('theme-transitioning')
    applyThemeTokensToDOM('orange', changed)
    painted(['first-contentful-paint'])
    await Promise.resolve()
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledTimes(3)
    applyThemeTokensToDOM('orange', initial)
    await Promise.resolve()
    await Promise.resolve()
    expect(invoke).toHaveBeenLastCalledWith('desktop_launch', { generation: 7, mode: initial, reveal: false })
    window.dispatchEvent(new Event('pagehide'))
    applyThemeTokensToDOM('orange', changed)
    await Promise.resolve()
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledTimes(4)
  })

  it('disconnects and ignores paint after pagehide', async () => {
    await loadLaunch()
    window.dispatchEvent(new Event('pagehide'))
    expect(disconnect).toHaveBeenCalledOnce()
    painted(['first-contentful-paint'])
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('ignores an in-flight generation reply after pagehide', async () => {
    let reply = (_generation: number) => {}
    invoke.mockImplementationOnce(() => new Promise(resolve => { reply = resolve }))
    await loadLaunch()
    painted(['first-contentful-paint'])
    window.dispatchEvent(new Event('pagehide'))
    reply(19)
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it.each(['generation', 'reveal'])('logs a rejected %s invoke once', async failure => {
    const error = new Error('IPC rejected')
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    if (failure === 'generation') invoke.mockRejectedValueOnce(error)
    else invoke.mockResolvedValueOnce(23).mockRejectedValueOnce(error)
    await loadLaunch()
    painted(['first-contentful-paint'])
    painted(['first-contentful-paint'])
    await vi.waitFor(() => expect(logged).toHaveBeenCalledExactlyOnceWith('Cannot finish desktop launch', error))
  })
})

describe('desktop launch without Paint Timing', () => {
  it.each(['missing', 'unsupported'])('keeps an empty body covered with %s Paint Timing until text arrives', async paint => {
    const disconnected = vi.spyOn(MutationObserver.prototype, 'disconnect')
    await loadLaunch({ paint })
    await frame()
    await frame()
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(disconnected).not.toHaveBeenCalled()
    document.body.textContent = 'Hoje'
    await Promise.resolve()
    await frame()
    expect(invoke).toHaveBeenCalledTimes(1)
    await frame()
    expect(invoke).toHaveBeenLastCalledWith('desktop_launch', { generation: 7, mode: 'dark' })
    expect(disconnected).toHaveBeenCalledOnce()
  })

  it.each(['svg', 'img', 'canvas', 'video'])('reveals a parsed %s after two frames', async tag => {
    document.body.innerHTML = `<${tag}></${tag}>`
    await loadLaunch({ paint: 'missing' })
    await frame()
    expect(invoke).toHaveBeenCalledTimes(1)
    await frame()
    expect(invoke).toHaveBeenLastCalledWith('desktop_launch', { generation: 7, mode: 'dark' })
  })

  it('waits for DOMContentLoaded while parsing', async () => {
    document.body.textContent = 'Hoje'
    await loadLaunch({ paint: 'missing', loading: true })
    expect(frames).toHaveLength(0)
    document.dispatchEvent(new Event('DOMContentLoaded'))
    await frame()
    expect(invoke).toHaveBeenCalledTimes(1)
    await frame()
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('keeps a missing body covered', async () => {
    vi.spyOn(document, 'body', 'get').mockReturnValue(null as unknown as HTMLElement)
    await loadLaunch({ paint: 'missing' })
    await frame()
    await frame()
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('stops observing at the deadline without revealing an empty document', async () => {
    const disconnected = vi.spyOn(MutationObserver.prototype, 'disconnect')
    await loadLaunch({ paint: 'missing' })
    await frame()
    await frame()
    vi.advanceTimersByTime(14999)
    expect(disconnected).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(disconnected).toHaveBeenCalledOnce()
    document.body.textContent = 'Hoje'
    await Promise.resolve()
    expect(frames).toHaveLength(0)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('stops pending frames on pagehide and ignores duplicates after reveal', async () => {
    document.body.textContent = 'Hoje'
    const disconnected = vi.spyOn(MutationObserver.prototype, 'disconnect')
    await loadLaunch({ paint: 'missing' })
    document.body.append('!')
    await Promise.resolve()
    await frame()
    await frame()
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(disconnected).toHaveBeenCalledOnce()
    window.dispatchEvent(new Event('pagehide'))
    expect(disconnected).toHaveBeenCalledTimes(3)
  })

  it('ignores a pending fallback paint after pagehide', async () => {
    document.body.textContent = 'Hoje'
    await loadLaunch({ paint: 'missing' })
    await frame()
    window.dispatchEvent(new Event('pagehide'))
    await frame()
    expect(invoke).toHaveBeenCalledTimes(1)
  })
})
