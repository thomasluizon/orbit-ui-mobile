import { chromium, type Browser, type BrowserServer } from '@playwright/test'

export type { Browser }
export type BrowserLaunch = Promise<Browser> & { close: () => Promise<void> }
export type HookRegistrar = (hook: () => Promise<void> | void, timeout?: number) => void

export const CHROME_LAUNCH_HOOK_TIMEOUT_MS = 45_000

const CHROME_LAUNCH_TIMEOUT_MS = 30_000
export const CHROME_WARM_START_TIMEOUT_MS = 120_000
const CHROME_CONNECT_TIMEOUT_MS = 10_000
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

function withinLaunchBudget(serverLaunch: Promise<BrowserServer>): Promise<BrowserServer> {
  let launchTimer: ReturnType<typeof setTimeout> | undefined
  let expired = false
  const budget = new Promise<never>((_, reject) => {
    launchTimer = setTimeout(() => {
      expired = true
      reject(new Error(`Chrome server launch exceeded ${CHROME_LAUNCH_TIMEOUT_MS}ms.`))
    }, CHROME_LAUNCH_TIMEOUT_MS)
  })
  void serverLaunch.then(async (server) => { if (expired) await server.kill() }, () => undefined)
  return Promise.race([serverLaunch, budget]).finally(() => { clearTimeout(launchTimer) })
}

export function launchChrome(options?: Parameters<typeof chromium.launchServer>[0]): BrowserLaunch {
  // WHY: launchServer runs its launch without a deadline and ignores this timeout. https://github.com/thomasluizon/orbit-tickets/issues/315
  const serverLaunch = withinLaunchBudget(chromium.launchServer({
    ...options,
    channel: 'chrome',
    host: '127.0.0.1',
    timeout: CHROME_LAUNCH_TIMEOUT_MS,
  }))
  const browserLaunch = serverLaunch.then(async (server) => {
    try {
      return await chromium.connect(server.wsEndpoint(), {
        timeout: CHROME_CONNECT_TIMEOUT_MS,
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

type WarmStartStep = 'launch' | 'first page' | 'first content' | 'close'

// WHY: a fresh runner pays its first Chrome start and first page inside the first case's timer unless that cost is paid before suites start. https://github.com/thomasluizon/orbit-tickets/issues/2074
export async function warmChrome(): Promise<void> {
  let step: WarmStartStep = 'launch'
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined
  // WHY: global setup runs with no Vitest timer, and Playwright opens a page and closes the browser with no timeout of its own. https://github.com/thomasluizon/orbit-tickets/issues/2074
  const deadline = new Promise<never>((_, reject) => {
    deadlineTimer = setTimeout(() => {
      reject(new Error(`Chrome warm start exceeded ${CHROME_WARM_START_TIMEOUT_MS}ms in the ${step} step.`))
    }, CHROME_WARM_START_TIMEOUT_MS)
  })
  const browserLaunch = chromium.launch({ channel: 'chrome', timeout: CHROME_WARM_START_TIMEOUT_MS })
  try {
    const browser = await Promise.race([browserLaunch, deadline])
    try {
      step = 'first page'
      const page = await Promise.race([browser.newPage(), deadline])
      step = 'first content'
      await Promise.race([page.setContent('<p>Orbit</p>', { timeout: CHROME_WARM_START_TIMEOUT_MS }), deadline])
    } finally {
      step = 'close'
      await Promise.race([browser.close(), deadline])
    }
  } catch (cause) {
    if (step === 'launch') void browserLaunch.then((lateBrowser) => lateBrowser.close(), () => undefined)
    throw new Error('Chrome warm start failed.', { cause })
  } finally {
    clearTimeout(deadlineTimer)
  }
}

export function registerChromeLaunchHook(
  registerHook: HookRegistrar,
  useBrowserLaunch: (browserLaunch: BrowserLaunch) => Promise<void> | void,
  options?: Parameters<typeof chromium.launchServer>[0],
): void {
  registerHook(async () => { await useBrowserLaunch(launchChrome(options)) }, CHROME_LAUNCH_HOOK_TIMEOUT_MS)
}

export async function closeChrome(browserLaunch: BrowserLaunch | undefined): Promise<void> {
  await browserLaunch?.close()
}
