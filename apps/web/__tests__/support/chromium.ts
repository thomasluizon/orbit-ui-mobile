import { chromium, type Browser, type BrowserServer } from '@playwright/test'

export type { Browser }
export type BrowserLaunch = Promise<Browser> & { close: () => Promise<void> }
export type HookRegistrar = (hook: () => Promise<void> | void, timeout?: number) => void

export const CHROME_LAUNCH_HOOK_TIMEOUT_MS = 45_000

const CHROME_LAUNCH_TIMEOUT_MS = 30_000
const CHROME_GRACEFUL_CLOSE_TIMEOUT_MS = 5_000

async function closeChromeServer(server: BrowserServer): Promise<void> {
  let shutdownTimer: ReturnType<typeof setTimeout> | undefined
  let gracefullyClosed: boolean
  try {
    gracefullyClosed = await Promise.race([
      server.close().then(() => true),
      new Promise<boolean>((resolve) => {
        shutdownTimer = setTimeout(() => { resolve(false) }, CHROME_GRACEFUL_CLOSE_TIMEOUT_MS)
      }),
    ])
  } catch (cause) {
    await server.kill()
    throw cause
  } finally {
    clearTimeout(shutdownTimer)
  }
  if (!gracefullyClosed) await server.kill()
}

export function launchChrome(): BrowserLaunch {
  const launchStartedAt = performance.now()
  const serverLaunch = chromium.launchServer({
    channel: 'chrome',
    host: '127.0.0.1',
    timeout: CHROME_LAUNCH_TIMEOUT_MS,
  })
  const browserLaunch = serverLaunch.then(async (server) => {
    try {
      return await chromium.connect(server.wsEndpoint(), {
        timeout: Math.max(1, CHROME_LAUNCH_TIMEOUT_MS - (performance.now() - launchStartedAt)),
      })
    } catch (cause) {
      await server.kill()
      throw cause
    }
  }).catch((cause: unknown) => {
    throw new Error('Chrome launch failed for the installed chrome channel.', { cause })
  })
  let shutdown: Promise<void> | undefined
  return Object.assign(browserLaunch, {
    close: () => {
      shutdown ??= browserLaunch.then(async (browser) => {
        try {
          await closeChromeServer(await serverLaunch)
        } finally {
          await browser.close()
        }
      }, () => undefined)
      return shutdown
    },
  })
}

export function registerChromeLaunchHook(
  registerHook: HookRegistrar,
  useBrowserLaunch: (browserLaunch: BrowserLaunch) => Promise<void> | void,
): void {
  registerHook(async () => { await useBrowserLaunch(launchChrome()) }, CHROME_LAUNCH_HOOK_TIMEOUT_MS)
}

export async function closeChrome(browserLaunch: BrowserLaunch | undefined): Promise<void> {
  await browserLaunch?.close()
}
