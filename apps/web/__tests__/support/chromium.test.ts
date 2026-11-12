import type { Page } from '@playwright/test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import vitestConfig from '../../vitest.config'
import { setup as chromiumGlobalSetup } from './chromium-global-setup'

const mocks = vi.hoisted(() => ({ launchServer: vi.fn(), connect: vi.fn(), launch: vi.fn() }))

vi.mock('@playwright/test', () => ({ chromium: mocks }))

import {
  closeChrome,
  CHROME_LAUNCH_HOOK_TIMEOUT_MS,
  CHROME_WARM_START_TIMEOUT_MS,
  launchChrome,
  registerChromeLaunchHook,
  warmChrome,
  type Browser,
  type HookRegistrar,
} from './chromium'

describe('Chromium test lifecycle', () => {
  const server = {
    close: vi.fn<() => Promise<void>>(),
    kill: vi.fn<() => Promise<void>>(),
    wsEndpoint: () => 'ws://127.0.0.1:1234/chromium',
  }
  const page = { setContent: vi.fn() }
  const browser = { close: vi.fn(), isConnected: () => true, newPage: vi.fn() } as unknown as Browser

  beforeEach(() => {
    vi.resetAllMocks()
    server.close.mockResolvedValue(undefined)
    server.kill.mockResolvedValue(undefined)
    mocks.launchServer.mockResolvedValue(server)
    mocks.connect.mockResolvedValue(browser)
    mocks.launch.mockResolvedValue(browser)
    vi.mocked(browser.newPage).mockResolvedValue(page as unknown as Page)
    page.setContent.mockResolvedValue(undefined)
  })

  it('keeps jsdom before Chromium even when the worker limit resolves to one', () => {
    const projects = vitestConfig.test?.projects
      ?.flatMap((project) => typeof project === 'object' && 'test' in project ? [project.test] : [])
    const jsdom = projects?.find((project) => project?.name === 'jsdom')
    const chromium = projects?.find((project) => project?.name === 'chromium')
    const jsdomOrder = jsdom?.sequence?.groupOrder
    const chromiumOrder = chromium?.sequence?.groupOrder

    expect(jsdomOrder).toBeGreaterThan(0)
    expect(chromiumOrder).toBeGreaterThan(0)
    expect(chromiumOrder).toBeGreaterThan(jsdomOrder!)
    expect(chromium?.maxWorkers).toBe(1)
  })

  it('keeps the Chrome launch budget between the global and Chromium hook budgets', () => {
    let registeredHook: (() => Promise<void> | void) | undefined
    let chromiumHookTimeout: number | undefined
    const registerHook: HookRegistrar = (hook, timeout) => {
      registeredHook = hook
      chromiumHookTimeout = timeout
    }
    mocks.launchServer.mockReturnValueOnce(new Promise(() => undefined))

    registerChromeLaunchHook(registerHook, () => undefined)
    expect(registeredHook).toBeTypeOf('function')
    void registeredHook?.()

    const [{ timeout: chromeLaunchTimeout }] = mocks.launchServer.mock.calls[0] as [{ timeout: number }]
    const globalHookTimeout = vitestConfig.test?.hookTimeout
    expect(globalHookTimeout).toBeTypeOf('number')
    if (typeof globalHookTimeout !== 'number') throw new Error('Global hook timeout must be numeric')
    const effectiveChromiumHookTimeout = chromiumHookTimeout ?? globalHookTimeout
    expect(globalHookTimeout).toBe(15_000)
    expect(chromeLaunchTimeout).toBe(30_000)
    expect(effectiveChromiumHookTimeout).toBe(45_000)
    expect(effectiveChromiumHookTimeout - chromeLaunchTimeout).toBe(15_000)
    expect(globalHookTimeout).toBeLessThan(chromeLaunchTimeout)
    expect(chromeLaunchTimeout).toBeLessThan(effectiveChromiumHookTimeout)
  })

  it('names the Chrome launch when the browser is unavailable', async () => {
    mocks.launchServer.mockRejectedValueOnce(new Error('browser executable unavailable'))
    const browserLaunch = launchChrome()

    await expect(browserLaunch).rejects.toThrow('Chrome launch failed')
    await expect(closeChrome(browserLaunch)).resolves.toBeUndefined()
  })

  it.each([29_500, 30_000])('preserves a usable connection budget after a %ims server launch', async (launchDelay) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    mocks.launchServer.mockImplementationOnce(() => new Promise((resolve) => {
      setTimeout(() => { resolve(server) }, launchDelay)
    }))
    const browserLaunch = launchChrome()

    try {
      await vi.advanceTimersByTimeAsync(launchDelay)
      await expect(browserLaunch).resolves.toBe(browser)
      const [, { timeout: connectionTimeout }] = mocks.connect.mock.calls[0] as [string, { timeout: number }]
      expect(connectionTimeout).toBeGreaterThanOrEqual(10_000)
      expect(launchDelay + connectionTimeout).toBeLessThan(CHROME_LAUNCH_HOOK_TIMEOUT_MS)
    } finally {
      await closeChrome(browserLaunch)
      vi.useRealTimers()
    }
  })

  it('rejects a stalled server launch at its budget and still releases teardown', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    mocks.launchServer.mockReturnValueOnce(new Promise(() => undefined))
    const browserLaunch = launchChrome()
    const outcome = browserLaunch.then(() => 'connected', (error: Error) => `${error.message} ${(error.cause as Error).message}`)

    try {
      await vi.advanceTimersByTimeAsync(29_999)
      await expect(Promise.race([outcome, Promise.resolve('pending')])).resolves.toBe('pending')
      await vi.advanceTimersByTimeAsync(1)
      await expect(outcome).resolves.toBe('Chrome launch failed for the installed chrome channel. Chrome server launch exceeded 30000ms.')
      await expect(closeChrome(browserLaunch)).resolves.toBeUndefined()
      expect(mocks.connect).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('kills a server that finishes launching after its budget expired', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let finishLaunch!: (launched: typeof server) => void
    mocks.launchServer.mockReturnValueOnce(new Promise((resolve) => { finishLaunch = resolve }))
    const browserLaunch = launchChrome()
    const outcome = browserLaunch.then(() => 'connected', (error: Error) => `${error.message} ${(error.cause as Error).message}`)

    try {
      await vi.advanceTimersByTimeAsync(30_000)
      await expect(outcome).resolves.toMatch(/exceeded 30000ms/)
      finishLaunch(server)
      await vi.advanceTimersByTimeAsync(0)
      expect(server.kill).toHaveBeenCalledOnce()
      expect(mocks.connect).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('pays the runner first Chrome start and first page before any Chromium suite timer starts', async () => {
    const chromium = vitestConfig.test?.projects
      ?.flatMap((project) => typeof project === 'object' && 'test' in project ? [project.test] : [])
      .find((project) => project?.name === 'chromium')

    expect(chromium?.globalSetup).toEqual(['./__tests__/support/chromium-global-setup.ts'])
    expect(chromiumGlobalSetup).toBe(warmChrome)
    await warmChrome()

    expect(CHROME_WARM_START_TIMEOUT_MS).toBe(120_000)
    expect(mocks.launch).toHaveBeenCalledWith({ channel: 'chrome', timeout: CHROME_WARM_START_TIMEOUT_MS })
    expect(browser.newPage).toHaveBeenCalledOnce()
    expect(page.setContent).toHaveBeenCalledWith('<p>Orbit</p>', { timeout: CHROME_WARM_START_TIMEOUT_MS })
    expect(browser.close).toHaveBeenCalledOnce()
    expect(mocks.launchServer).not.toHaveBeenCalled()
  })

  it('fails the run with the launch cause when the warm start cannot launch', async () => {
    const cause = new Error('browserType.launch: Timeout 120000ms exceeded.')
    mocks.launch.mockRejectedValueOnce(cause)

    const failure = await warmChrome().then(() => undefined, (error: Error) => error)

    expect(failure).toBeInstanceOf(Error)
    expect(failure?.message).toBe('Chrome warm start failed.')
    expect(failure?.cause).toBe(cause)
    expect(browser.newPage).not.toHaveBeenCalled()
  })

  it('closes the warm browser when its first page fails', async () => {
    const cause = new Error('page.setContent: Timeout 120000ms exceeded.')
    page.setContent.mockRejectedValueOnce(cause)

    const failure = await warmChrome().then(() => undefined, (error: Error) => error)

    expect(failure?.message).toBe('Chrome warm start failed.')
    expect(failure?.cause).toBe(cause)
    expect(browser.close).toHaveBeenCalledOnce()
  })

  it('skips teardown when launch never started', async () => {
    await expect(closeChrome(undefined)).resolves.toBeUndefined()
  })

  it('releases the owned process even when the client has disconnected', async () => {
    mocks.connect.mockResolvedValueOnce({ close: vi.fn(), isConnected: () => false } as unknown as Browser)

    await closeChrome(launchChrome())

    expect(server.close).toHaveBeenCalledOnce()
  })

  it('closes a connected browser', async () => {
    await closeChrome(launchChrome())

    expect(server.close).toHaveBeenCalledOnce()
    expect(server.kill).not.toHaveBeenCalled()
  })

  it('closes a browser that resolves after teardown starts', async () => {
    let resolveBrowser!: (browser: Browser) => void
    mocks.connect.mockReturnValueOnce(new Promise<Browser>((resolve) => { resolveBrowser = resolve }))
    const browserLaunch = launchChrome()
    await Promise.resolve()

    const teardown = closeChrome(browserLaunch)
    expect(server.close).not.toHaveBeenCalled()
    resolveBrowser(browser)
    await teardown

    expect(server.close).toHaveBeenCalledOnce()
  })

  it('kills the process if connecting to the launched browser fails', async () => {
    const cause = new Error('connection failed')
    mocks.connect.mockRejectedValueOnce(cause)
    const browserLaunch = launchChrome()

    await expect(browserLaunch).rejects.toThrow('Chrome launch failed')
    await closeChrome(browserLaunch)

    expect(server.kill).toHaveBeenCalledOnce()
    expect(server.close).not.toHaveBeenCalled()
  })

  it('shares shutdown between concurrent teardown calls', async () => {
    const browserLaunch = launchChrome()

    await Promise.all([closeChrome(browserLaunch), closeChrome(browserLaunch)])

    expect(server.close).toHaveBeenCalledOnce()
  })

  it('kills the owned process and reports a graceful shutdown error', async () => {
    const cause = new Error('shutdown failed')
    server.close.mockRejectedValueOnce(cause)

    await expect(closeChrome(launchChrome())).rejects.toBe(cause)

    expect(server.kill).toHaveBeenCalledOnce()
  })

  it('clears the shutdown deadline after a graceful close', async () => {
    vi.useFakeTimers()
    try {
      await closeChrome(launchChrome())
      expect(vi.getTimerCount()).toBe(0)
      expect(server.kill).not.toHaveBeenCalled()
      expect(browser.close).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('awaits forced process cleanup before releasing the client', async () => {
    vi.useFakeTimers()
    let finishCleanup!: () => void
    server.close.mockImplementationOnce(() => new Promise(() => undefined))
    server.kill.mockImplementationOnce(() => new Promise((resolve) => { finishCleanup = resolve }))
    const teardown = closeChrome(launchChrome())

    try {
      await vi.advanceTimersByTimeAsync(5_000)
      expect(server.kill).toHaveBeenCalledOnce()
      expect(browser.close).not.toHaveBeenCalled()
      finishCleanup()
      await teardown
      expect(browser.close).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      finishCleanup()
      await teardown
      vi.useRealTimers()
    }
  })

  it('releases the owned process when graceful shutdown stalls', async () => {
    vi.useFakeTimers()
    let resolveClose!: () => void
    const close = vi.fn(() => new Promise<void>((resolve) => { resolveClose = resolve }))
    server.close.mockImplementationOnce(close)
    server.kill.mockImplementationOnce(async () => { resolveClose() })
    const browserLaunch = launchChrome()
    await browserLaunch
    const teardown = closeChrome(browserLaunch)

    try {
      await vi.advanceTimersByTimeAsync(5_000)
      expect(server.kill).toHaveBeenCalledOnce()
      await teardown
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      resolveClose()
      await teardown
      vi.useRealTimers()
    }
  })
})
