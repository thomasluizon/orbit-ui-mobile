import { beforeEach, describe, expect, it, vi } from 'vitest'
import vitestConfig from '../../vitest.config'

const mocks = vi.hoisted(() => ({ launchServer: vi.fn(), connect: vi.fn() }))

vi.mock('@playwright/test', () => ({ chromium: mocks }))

import {
  closeChrome,
  launchChrome,
  registerChromeLaunchHook,
  type Browser,
  type HookRegistrar,
} from './chromium'

describe('Chromium test lifecycle', () => {
  const server = {
    close: vi.fn<() => Promise<void>>(),
    kill: vi.fn<() => Promise<void>>(),
    wsEndpoint: () => 'ws://127.0.0.1:1234/chromium',
  }
  const browser = { close: vi.fn(), isConnected: () => true } as unknown as Browser

  beforeEach(() => {
    vi.resetAllMocks()
    server.close.mockResolvedValue(undefined)
    server.kill.mockResolvedValue(undefined)
    mocks.launchServer.mockResolvedValue(server)
    mocks.connect.mockResolvedValue(browser)
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
