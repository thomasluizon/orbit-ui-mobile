import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chromium, type BrowserServer } from '@playwright/test'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { closeChrome, launchChrome } from './chromium'

describe('Chrome process lifecycle', () => {
  let server: BrowserServer | undefined

  beforeEach(() => {
    server = undefined
    const launchServer = chromium.launchServer.bind(chromium)
    vi.spyOn(chromium, 'launchServer').mockImplementation(async (options) => {
      server = await launchServer(options)
      return server
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (server) await server.kill()
  })

  it.each(['pass', 'fail'])('releases an open page and profile after cases %s', async (outcome) => {
    const browserLaunch = launchChrome()
    const browser = await browserLaunch
    if (!server) throw new Error('Chrome must have an owned process')
    const chromeProcess = server.process()
    const profileArgument = chromeProcess.spawnargs.find((argument) => argument.startsWith('--user-data-dir='))
    if (!profileArgument) throw new Error('Chrome must own a temporary profile')
    const profileDirectory = profileArgument.slice('--user-data-dir='.length)
    const processClosed = once(chromeProcess, 'close')
    expect(existsSync(profileDirectory)).toBe(true)

    const runCase = async () => {
      try {
        const page = await browser.newPage()
        await page.setContent('<button>Continue</button>')
        expect(await page.locator('button').textContent()).toBe('Continue')
        if (outcome === 'fail') throw new Error('geometry assertion failed')
      } finally {
        await closeChrome(browserLaunch)
      }
    }

    if (outcome === 'fail') await expect(runCase()).rejects.toThrow('geometry assertion failed')
    else await runCase()

    await processClosed
    expect(browser.isConnected()).toBe(false)
    expect(existsSync(profileDirectory)).toBe(false)
  })

  it('kills a process whose graceful close never completes', async () => {
    const browserLaunch = launchChrome()
    const browser = await browserLaunch
    if (!server) throw new Error('Chrome must have an owned process')
    const chromeProcess = server.process()
    const processClosed = once(chromeProcess, 'close')
    const kill = vi.spyOn(server, 'kill')
    vi.spyOn(server, 'close').mockImplementation(() => new Promise(() => undefined))

    const shutdownStartedAt = performance.now()
    await closeChrome(browserLaunch)

    await processClosed
    expect(kill).toHaveBeenCalledOnce()
    expect(browser.isConnected()).toBe(false)
    expect(performance.now() - shutdownStartedAt).toBeLessThan(30_000)
  })
})
