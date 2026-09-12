import { chromium, type Browser } from '@playwright/test'

export type { Browser }

export async function launchChrome(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: 'chrome' })
  } catch (cause) {
    throw new Error('Chrome launch failed for the installed chrome channel.', { cause })
  }
}

export async function closeChrome(browser: Browser | undefined): Promise<void> {
  if (browser?.isConnected()) await browser.close()
}
