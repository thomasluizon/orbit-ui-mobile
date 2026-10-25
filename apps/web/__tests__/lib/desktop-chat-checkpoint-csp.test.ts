import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'
import { useChatStore } from '@/stores/chat-store'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import type * as Checkpoint from '@/lib/desktop-chat-checkpoint'

let browserLaunch: BrowserLaunch | undefined
let browser: Browser
let checkpointScript: string
registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
beforeAll(() => {
  checkpointScript = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'esbuild';
    const result = await build({
      entryPoints: ['lib/desktop-chat-checkpoint.ts'], bundle: true, write: false,
      format: 'iife', globalName: 'Checkpoint', platform: 'browser',
    });
    process.stdout.write(result.outputFiles[0].text);
  `], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 })
})
afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

it('preserves real object URL images under the application CSP while unrelated connections stay blocked', async () => {
  const response = await proxy(new NextRequest('https://checkpoint.example.test/terms'))
  const policy = response.headers.get('Content-Security-Policy')!
  const nonce = policy.match(/'nonce-([^']+)'/)![1]!
  const page = await browser.newPage()
  try {
    await page.route('https://checkpoint.example.test/', route => route.fulfill({
      contentType: 'text/html', headers: { 'Content-Security-Policy': policy },
      body: `<script nonce="${nonce}">${checkpointScript}</script>`,
    }))
    await page.goto('https://checkpoint.example.test/')
    const result = await page.evaluate(async chat => {
      const checkpoint = (window as unknown as { Checkpoint: typeof Checkpoint }).Checkpoint
      const preview = URL.createObjectURL(new File(['image'], 'image.png', { type: 'image/png' }))
      try {
        await checkpoint.writeDesktopChatCheckpoint('desktop-account', {
          ...chat, messages: [{ id: 'image', role: 'user', content: 'Look', imageUrl: preview, timestamp: new Date() }],
        }, true)
        return { imageUrl: checkpoint.takeDesktopChatCheckpoint('desktop-account')?.chat.messages[0]?.imageUrl, error: null }
      } catch (error) {
        return { imageUrl: null, error: String(error) }
      } finally { URL.revokeObjectURL(preview) }
    }, JSON.parse(JSON.stringify(useChatStore.getInitialState())))
    expect(result).toEqual({ imageUrl: 'data:image/png;base64,aW1hZ2U=', error: null })
    expect(await page.evaluate(async () => {
      try { await fetch('https://blocked.example.test/'); return false } catch { return true }
    })).toBe(true)
  } finally { await page.close() }
})
