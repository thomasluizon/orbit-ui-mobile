import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ launch: vi.fn() }))

vi.mock('@playwright/test', () => ({ chromium: { launch: mocks.launch } }))

import { closeChrome, launchChrome, type Browser } from './chromium'

describe('Chromium test lifecycle', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('names the Chrome launch when the browser is unavailable', async () => {
    mocks.launch.mockRejectedValueOnce(new Error('browser executable unavailable'))
    const browserLaunch = launchChrome()

    await expect(browserLaunch).rejects.toThrow('Chrome launch failed')
    await expect(closeChrome(browserLaunch)).resolves.toBeUndefined()
  })

  it('skips teardown when launch never started', async () => {
    await expect(closeChrome(undefined)).resolves.toBeUndefined()
  })

  it('does not close an already disconnected browser', async () => {
    const close = vi.fn()
    const browser = { close, isConnected: () => false } as unknown as Browser

    await closeChrome(Promise.resolve(browser))

    expect(close).not.toHaveBeenCalled()
  })

  it('closes a connected browser', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    const browser = { close, isConnected: () => true } as unknown as Browser

    await closeChrome(Promise.resolve(browser))

    expect(close).toHaveBeenCalledOnce()
  })

  it('closes a browser that resolves after teardown starts', async () => {
    let resolveBrowser!: (browser: Browser) => void
    const close = vi.fn().mockResolvedValue(undefined)
    const browser = { close, isConnected: () => true } as unknown as Browser
    mocks.launch.mockReturnValueOnce(new Promise<Browser>((resolve) => { resolveBrowser = resolve }))
    const browserLaunch = launchChrome()

    const teardown = closeChrome(browserLaunch)
    expect(close).not.toHaveBeenCalled()
    resolveBrowser(browser)
    await teardown

    expect(close).toHaveBeenCalledOnce()
  })
})
