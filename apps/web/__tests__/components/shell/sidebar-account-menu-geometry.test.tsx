import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { bundleGeometry } from '@/__tests__/support/profile-settings-browser'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const cases = (['en', 'pt-BR'] as const).flatMap(locale => (['dark', 'light'] as const).flatMap(theme =>
  [false, true].map(collapsed => ({ locale, theme, collapsed }))))
const account = 'A person with a longer account name spanning several words'
const email = 'a.person.with.a.very.long.complete.email.address@example.com'

describe('sidebar account menu geometry in Chromium', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let script: string
  registerChromeLaunchHook(beforeAll, async next => { launch = next; browser = await next })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    script = bundleGeometry(`import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { NextIntlClientProvider } from 'next-intl';
      import { ShellWide } from './components/shell/shell-wide';
      import SearchPage from './app/(app)/search/page';
      import { useShellStore } from './stores/shell-store';
      import en from '../../packages/shared/src/i18n/en.json';
      import ptBR from '../../packages/shared/src/i18n/pt-BR.json';
      const root = document.getElementById('root');
      const configuration = JSON.parse(root.dataset.configuration);
      const words = configuration.locale === 'en' ? en : ptBR;
      useShellStore.setState({ sidebarCollapsed: configuration.collapsed });
      createRoot(root).render(<NextIntlClientProvider locale={configuration.locale} messages={words} timeZone="UTC">
        <ShellWide items={[{ id: 'perfil', href: '/profile', label: words.nav.profile, icon: 'perfil' }]}
          activeId="perfil" navLabel={words.nav.mainNavigation} astraRow={{ label: 'Astra', onOpen: () => {} }}
          account={configuration.account} accountEmail={configuration.email}>{configuration.search ? <SearchPage /> : <h1>Orbit</h1>}</ShellWide>
      </NextIntlClientProvider>);`, {
      '@/stores/auth-store': 'export const useAuthStore = selector => selector({ logout: async () => {} });',
      '@sentry/nextjs': 'export const captureException = error => { throw error; };',
      '@/components/ui/sheet': "export { Sheet, useSheetHost } from './__tests__/support/sheet-double';",
      '@/hooks/use-habit-search': "export const useHabitSearch = () => ({ text: '', query: '', changeText: () => {} });",
      'next/navigation': 'export const useRouter = () => ({ push() {}, back() { document.documentElement.dataset.searchBack = "true"; } });',
    })
  })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it.each([1024, 1352].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale =>
    ['pointer', 'Enter'].map(input => ({ width, locale, input })))))
    ('retains the account trigger on Search after $input and Escape at $width pixels in $locale', async configuration => {
      const page = await browser.newPage({ viewport: { width: configuration.width, height: 915 }, reducedMotion: 'reduce' })
      try {
        await page.setContent(`<html class="dark"><style>${stylesheet} .orbit-menu-panel[data-state="closed"] { animation-play-state: paused !important; }</style><div id="root"></div></html>`)
        await page.evaluate(({ configuration, account, email, variables }) => {
          document.getElementById('root')!.dataset.configuration = JSON.stringify({ ...configuration, account, email, collapsed: false, search: true })
          for (const [key, value] of Object.entries(variables)) document.documentElement.style.setProperty(key, value)
        }, { configuration, account, email, variables: resolveWebThemeVariables('orange', 'dark') })
        await page.addScriptTag({ content: script })
        const trigger = page.locator('[data-shell-account]:not([data-loading])')
        const input = configuration.input
        if (input === 'pointer') {
          await trigger.hover()
          await page.mouse.down()
        } else {
          await trigger.focus()
          await page.keyboard.press(input)
        }
        await page.getByRole('menu').waitFor({ state: 'visible' })
        if (input === 'pointer') {
          await page.mouse.move(0, 0)
          await page.mouse.up()
        }
        await page.keyboard.press('Escape')
        await expect.poll(() => page.getByRole('menu').count()).toBe(0)
        expect(await page.locator('[role="menu"][data-state="closed"][inert]').count()).toBe(1)
        expect(await page.locator('html').getAttribute('data-search-back')).toBeNull()
        await trigger.scrollIntoViewIfNeeded({ timeout: 2000 })
        expect(await trigger.evaluate(element => element === document.activeElement)).toBe(true)
        await trigger.blur()
        await page.keyboard.press('Shift')
        await trigger.focus()
        expect(await trigger.evaluate(element => element.matches(':focus-visible'))).toBe(true)
        await page.keyboard.press('Escape')
        expect(await page.locator('html').getAttribute('data-search-back')).toBe('true')
      } finally { await page.close() }
    })

  it.each(cases)('anchors a readable menu with one focus ring in $locale, $theme, collapsed=$collapsed', async configuration => {
    const words = configuration.locale === 'en' ? en : ptBR
    const page = await browser.newPage({ viewport: { width: 1024, height: 600 } })
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setContent(`<html class="${configuration.theme}"><style>${stylesheet}</style><div id="root"></div></html>`)
      await page.evaluate(({ configuration, account, email, variables }) => {
        document.getElementById('root')!.dataset.configuration = JSON.stringify({ ...configuration, account, email })
        for (const [key, value] of Object.entries(variables)) document.documentElement.style.setProperty(key, value)
      }, { configuration, account, email, variables: resolveWebThemeVariables('orange', configuration.theme) })
      await page.addScriptTag({ content: script })
      const trigger = page.locator('[data-shell-account]:not([data-loading])')
      await trigger.waitFor({ state: 'visible' })
      const focusPaint = () => page.evaluate(() => {
        const painted = (element: Element, pseudo?: string) => {
          const style = getComputedStyle(element, pseudo)
          return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 && style.outlineColor !== 'rgba(0, 0, 0, 0)'
        }
        const controls = [...document.querySelectorAll('button, [role="menu"], [role="region"]')]
        return controls.reduce((count, element) => count + Number(painted(element)) + Number(painted(element, '::before')) + Number(painted(element, '::after')), 0)
      })
      await page.keyboard.press('Tab')
      await trigger.focus()
      expect(await focusPaint()).toBe(1)
      expect(await trigger.evaluate(element => getComputedStyle(element).boxShadow)).toBe('none')
      const resting = await trigger.evaluate(element => getComputedStyle(element).backgroundColor)
      await trigger.hover()
      await page.waitForFunction(() => {
        const element = document.querySelector('[data-shell-account]')!
        return getComputedStyle(element).backgroundColor !== 'rgba(0, 0, 0, 0)'
      })
      const hover = await trigger.evaluate(element => ({ fill: getComputedStyle(element).backgroundColor, radius: getComputedStyle(element).borderRadius }))
      expect(hover.fill).not.toBe(resting)
      expect(hover.radius).toBe('12px')
      await page.mouse.down()
      expect(await trigger.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(hover.fill)
      await page.mouse.up()
      const menu = page.getByRole('menu', { name: `${account}, ${email}` })
      await menu.waitFor({ state: 'visible' })
      await page.waitForFunction(() => {
        const menu = document.querySelector('[role="menu"]')
        return menu?.getAttribute('data-side') === 'top' && menu.getBoundingClientRect().top > 0
      })
      const geometry = await menu.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        const anchor = document.querySelector('[data-shell-account]')!.getBoundingClientRect()
        const header = element.querySelector('[data-shell-account-menu-header]')!
        const name = header.querySelector('[data-personal-text]')!
        const email = header.querySelector('[data-personal-text-expanded]')!
        const label = element.querySelector('.orbit-menu-label')!
        const labelBounds = label.getBoundingClientRect()
        const labelStyle = getComputedStyle(label)
        return { top: bounds.top, left: bounds.left, right: bounds.right, bottom: bounds.bottom,
          width: bounds.width, anchorTop: anchor.top,
          nameHeight: name.getBoundingClientRect().height, nameLineHeight: parseFloat(getComputedStyle(name).lineHeight),
          email: email.textContent, emailOverflow: getComputedStyle(email).overflowX,
          label: { overflow: label.scrollWidth > label.clientWidth, ellipsis: labelStyle.textOverflow === 'ellipsis',
            height: labelBounds.height, lineHeight: parseFloat(labelStyle.lineHeight) } }
      })
      expect(geometry.width).toBeGreaterThanOrEqual(240)
      expect(geometry.width).toBeLessThanOrEqual(320)
      expect(geometry.top).toBeGreaterThanOrEqual(8)
      expect(geometry.left).toBeGreaterThanOrEqual(8)
      expect(geometry.right).toBeLessThanOrEqual(1016)
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.anchorTop - 7)
      expect(geometry.nameHeight).toBeLessThanOrEqual(2 * geometry.nameLineHeight + 1)
      expect(geometry.email).toBe(email)
      expect(geometry.emailOverflow).toBe('auto')
      expect(geometry.label.overflow).toBe(false)
      expect(geometry.label.ellipsis).toBe(false)
      expect(geometry.label.height).toBeLessThanOrEqual(geometry.label.lineHeight + 1)
      const signOut = menu.getByRole('menuitem', { name: words.profile.settingsRows.signOut })
      await signOut.focus()
      expect(await focusPaint()).toBe(1)
      expect(await signOut.evaluate(element => getComputedStyle(element).boxShadow)).toBe('none')
      await page.keyboard.press('Escape')
      await menu.waitFor({ state: 'detached' })
      expect(await trigger.evaluate(element => document.activeElement === element)).toBe(true)
      expect(await focusPaint()).toBe(1)
      await page.keyboard.press('Enter')
      await menu.waitFor({ state: 'visible' })
      await page.getByRole('heading', { name: 'Orbit', exact: true }).click()
      await menu.waitFor({ state: 'detached' })
      expect(await trigger.evaluate(element => document.activeElement === element)).toBe(true)
    } finally { await page.close() }
  })
})
