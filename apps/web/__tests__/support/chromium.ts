import { chromium, type Browser } from '@playwright/test'

export type { Browser }
export type BrowserLaunch = Promise<Browser>

const CHROME_LAUNCH_TIMEOUT_MS = 10_000

export function launchChrome(): BrowserLaunch {
  return chromium.launch({
    channel: 'chrome',
    timeout: CHROME_LAUNCH_TIMEOUT_MS,
  }).catch((cause: unknown) => {
    throw new Error('Chrome launch failed for the installed chrome channel.', { cause })
  })
}

export async function closeChrome(browserLaunch: BrowserLaunch | undefined): Promise<void> {
  if (!browserLaunch) return

  let browser: Browser
  try {
    browser = await browserLaunch
  } catch {
    return
  }

  if (browser.isConnected()) await browser.close()
}
