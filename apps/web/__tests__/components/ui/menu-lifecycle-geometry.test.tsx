import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const branchTitle = 'Branch child with a long title about preparing the room and collecting every book and notebook for the next reading session'

describe('mounted headless menu lifecycle in Chromium', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let script: string
  registerChromeLaunchHook(beforeAll, async (next) => { launch = next; browser = await next })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    script = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { build } from 'esbuild';
      const options = JSON.parse(process.argv[1]);
      const result = await build({ ...options, alias: { '@sentry/nextjs': '@sentry/browser' }, plugins: [{
        name: 'notification-boundaries', setup(build) {
          build.onResolve({ filter: /^next\\/navigation$|^@\\/hooks\\/use-notification-inbox$/ }, ({ path }) => ({ path, namespace: 'notifications' }));
          build.onLoad({ filter: /.*/, namespace: 'notifications' }, ({ path }) => ({ contents: path === 'next/navigation'
            ? 'export const useRouter = () => ({ push() {} }); export const usePathname = () => "/today"; export const unstable_isUnrecognizedActionError = () => false;'
            : 'export const useNotificationInbox = () => ({ visibleUnreadCount: 0 });' }));
        }
      }] });
      process.stdout.write(result.outputFiles[0].text);
    `, JSON.stringify({
      entryPoints: ['__tests__/support/menu-lifecycle.tsx'], bundle: true, write: false,
      format: 'iife', platform: 'browser', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    })], { maxBuffer: 10 * 1024 * 1024 }).toString()
  })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  async function mount(surface: 'habit' | 'composer' | 'frequency', locale: 'en' | 'pt-BR', width: number, height: number, mode: 'light' | 'dark' = 'dark') {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' })
    onTestFinished(async () => { await page.close() })
    const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    await page.setContent(`<html class="${mode}" style="${theme}"><style>${stylesheet}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify({ surface, locale })}</script></html>`)
    await loadAppFonts(page)
    await page.addScriptTag({ content: script })
    return page
  }

  it.each((['en', 'pt-BR'] as const).flatMap((locale) => (['light', 'dark'] as const).map((mode) => ({ locale, mode }))))('drills through consecutive row menus at 320px with doubled $locale text in $mode', async ({ locale, mode }) => {
    const page = await mount('habit', locale, 320, 915, mode)
    const words = locale === 'en' ? en : ptBR
    try {
      await page.locator('html').evaluate((root) => { root.style.fontSize = '32px' })
      for (const title of ['Parent', branchTitle]) {
        await page.locator('[data-habit-row-control="menu"]').click()
        const menu = page.getByRole('menu', { name: title, exact: true })
        await expect.poll(() => menu.isVisible()).toBe(true)
        await menu.getByRole('menuitem', { name: words.habits.actions.openSubHabits, exact: true }).click()
        await expect.poll(() => menu.count()).toBe(0)
      }
      expect(await page.getByText('Deepest child', { exact: true }).isVisible()).toBe(true)
    } finally { await page.close() }
  })

  it.each(['en', 'pt-BR'] as const)('reopens the compact $locale composer menu after a wide-shell replacement', async (locale) => {
    const page = await mount('composer', locale, 412, 915)
    const words = locale === 'en' ? en : ptBR
    try {
      const trigger = page.getByRole('button', { name: words.shell.composer.actions, exact: true })
      const menu = page.getByRole('menu', { name: words.shell.composer.actions, exact: true })
      await trigger.click()
      await expect.poll(() => menu.isVisible()).toBe(true)
      await page.setViewportSize({ width: 1100, height: 915 })
      await expect.poll(() => menu.count()).toBe(0)
      await expect.poll(() => page.locator('[data-shell-astra-row]').evaluate((element) => element === document.activeElement)).toBe(true)
      await page.setViewportSize({ width: 412, height: 915 })
      await trigger.click()
      await expect.poll(() => menu.isVisible()).toBe(true)
      await page.keyboard.press('Escape')
      await expect.poll(() => menu.count()).toBe(0)
      await expect.poll(() => trigger.evaluate((element) => element === document.activeElement)).toBe(true)
      expect(await page.locator('[data-composer-input]').inputValue()).toBe('Retained draft')
    } finally { await page.close() }
  })

  it('keeps every frequency choice within landscape safe bounds after scrolling', async () => {
    const page = await mount('frequency', 'en', 844, 390)
    try {
      await page.locator('html').evaluate((root) => {
        root.style.setProperty('--safe-left', '44px')
        root.style.setProperty('--safe-right', '44px')
        root.style.setProperty('--safe-bottom', '21px')
      })
      await page.getByRole('button', { name: en.habits.listOptions }).click()
      await page.getByRole('menuitem', { name: en.habits.frequencyFilter }).click()
      await page.getByRole('dialog', { name: en.habits.frequencyFilter }).waitFor({ state: 'visible' })
      const positioning = await page.getByRole('menu', { name: en.habits.frequencyFilter }).locator('..').evaluate((element) => getComputedStyle(element).position)
      expect(['absolute', 'fixed']).not.toContain(positioning)
      const choices = page.getByRole('menuitemcheckbox')
      expect(await choices.count()).toBe(6)
      for (const choice of await choices.all()) {
        await choice.scrollIntoViewIfNeeded()
        const bounds = (await choice.boundingBox())!
        expect(bounds.x).toBeGreaterThanOrEqual(44)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(800)
        expect(bounds.y).toBeGreaterThanOrEqual(0)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(369)
      }
    } finally { await page.close() }
  })
})
