import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ launch: vi.fn() }))

vi.mock('@playwright/test', () => ({ chromium: { launch: mocks.launch } }))

import { closeChrome, launchChrome, type Browser } from './chromium'

describe('Chromium test lifecycle', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('names the Chrome launch when the browser is unavailable', async () => {
    mocks.launch.mockRejectedValueOnce(new Error('browser executable unavailable'))

    await expect(launchChrome()).rejects.toThrow('Chrome launch failed')
  })

  it('skips teardown when launch never produced a browser', async () => {
    await expect(closeChrome(undefined)).resolves.toBeUndefined()
  })

  it('does not close an already disconnected browser', async () => {
    const close = vi.fn()
    const browser = { close, isConnected: () => false } as unknown as Browser

    await closeChrome(browser)

    expect(close).not.toHaveBeenCalled()
  })

  it('closes a connected browser', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    const browser = { close, isConnected: () => true } as unknown as Browser

    await closeChrome(browser)

    expect(close).toHaveBeenCalledOnce()
  })
})
