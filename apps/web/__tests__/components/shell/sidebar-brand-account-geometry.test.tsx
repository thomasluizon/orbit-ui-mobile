import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { DESTINATION_ICONS, SHELL_DESTINATION_IDS } from '@orbit/shared/utils'
import { ShellWide } from '@/components/shell/shell-wide'
import { NotificationBellDisplay } from '@/components/navigation/notification-bell'
import { useShellStore } from '@/stores/shell-store'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => true }))

const cases = [1024, 1352, 1920].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale =>
  [false, true].map(collapsed => ({ width, locale, collapsed })),
))
const email = 'a.very.long.account.address@example.test'
const longName = 'Alexandra Beatriz Carolina Daniela Emilia Fernanda Gabriela'

function sidebarFixture(locale: 'en' | 'pt-BR', account?: string) {
  const messages = locale === 'en' ? en : ptBR
  return <NextIntlClientProvider locale={locale} messages={messages}>
    <ShellWide items={SHELL_DESTINATION_IDS.map(id => ({ id, href: '/', label: messages.nav[DESTINATION_ICONS[id].labelKey.split('.')[1] as keyof typeof messages.nav], icon: id }))}
      activeId="hoje" navLabel={messages.nav.mainNavigation} astraRow={{ label: messages.chat.title, onOpen: vi.fn() }}
      paletteLabel={messages.nav.search} paletteHint="Ctrl K" onPalette={vi.fn()}
      onCreate={vi.fn()} createLabel={messages.nav.createHabit} account={account} accountEmail={email}
      notifications={<NotificationBellDisplay count={12} countPlacement="corner" onClick={vi.fn()} />} />
  </NextIntlClientProvider>
}

describe('sidebar brand and account geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    for (const [weight, directory] of [[400, '400Regular'], [500, '500Medium']] as const) {
      const font = readFileSync(require.resolve(`@expo-google-fonts/geist/${directory}/Geist_${directory}.ttf`)).toString('base64')
      stylesheet += `\n@font-face { font-family: 'Geist'; font-weight: ${weight}; src: url(data:font/ttf;base64,${font}); }`
    }
    stylesheet += '\n:root { --font-geist: Geist; }'
  })
  beforeEach(() => {
    localStorage.clear()
    useShellStore.setState(useShellStore.getInitialState())
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('groups the brand controls and account at $width in $locale, collapsed=$collapsed', async ({ width, locale, collapsed }) => {
    useShellStore.setState({ sidebarCollapsed: collapsed })
    const view = render(sidebarFixture(locale, 'Alex'))
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    try {
      await page.setContent(`<html lang="${locale}" class="dark"><head><style>${stylesheet}</style></head><body>${view.container.innerHTML}</body></html>`)
      await page.evaluate(() => document.fonts.ready)
      const header = await page.evaluate(() => {
        const sidebar = document.querySelector<HTMLElement>('[data-shell-sidebar]')!
        const toggle = sidebar.querySelector<HTMLElement>('[data-shell-sidebar-toggle]')!
        const brand = sidebar.querySelector<HTMLElement>('[data-asset="orbit-lockup"]')!.parentElement!.parentElement!
        const bell = sidebar.querySelector<HTMLElement>('button:has(.tabler-icon-bell)')!
        const bounds = (element: Element) => {
          const rect = element.getBoundingClientRect()
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, centerX: rect.left + rect.width / 2 }
        }
        const controls = [...sidebar.querySelectorAll<HTMLElement>('button, a[href]')]
        const navigationEnd = sidebar.querySelector('nav')!.lastElementChild as HTMLElement
        const create = sidebar.querySelector<HTMLElement>('.orbit-pill-action')!
        return {
          sidebar: bounds(sidebar), brand: bounds(brand), bell: bounds(bell), toggle: bounds(toggle),
          lockup: bounds(sidebar.querySelector('[data-asset="orbit-lockup"]')!),
          firstControlIsToggle: controls[0] === toggle,
          afterNavigation: controls.slice(controls.indexOf(navigationEnd) + 1).map(element => element === create ? 'create' : element.hasAttribute('data-shell-account') ? 'account' : 'unexpected'),
          icons: [bell, toggle].map(element => bounds(element.querySelector('svg')!)),
          overflow: sidebar.scrollWidth > sidebar.clientWidth,
        }
      })
      expect(header.sidebar.width).toBe(collapsed ? 96 : 232)
      expect(header.overflow).toBe(false)
      expect(header.afterNavigation).toEqual(['create', 'account'])
      for (const control of [header.bell, header.toggle]) {
        expect(control.width).toBeGreaterThanOrEqual(44)
        expect(control.height).toBeGreaterThanOrEqual(44)
        expect(control.left).toBeGreaterThanOrEqual(header.brand.left)
        expect(control.right).toBeLessThanOrEqual(header.brand.right)
        expect(control.top).toBeGreaterThanOrEqual(header.brand.top)
        expect(control.bottom).toBeLessThanOrEqual(header.brand.bottom)
      }
      for (const icon of header.icons) expect([icon.width, icon.height]).toEqual([20, 20])
      if (collapsed) {
        expect(header.firstControlIsToggle).toBe(true)
        expect(header.bell.top - header.toggle.bottom).toBe(12)
        expect(header.toggle.centerX).toBe(header.sidebar.centerX)
        expect(header.bell.centerX).toBe(header.sidebar.centerX)
      } else {
        expect(header.brand.height).toBe(48)
        expect(header.toggle.left - header.bell.right).toBe(12)
        expect(header.lockup.right).toBeLessThanOrEqual(header.bell.left)
      }
      const shortAccount = await measureAccount(page)
      if (collapsed) {
        expect(shortAccount.avatar.centerX).toBe(header.sidebar.centerX)
        expect(shortAccount.textHidden).toBe(true)
        expect(view.container.querySelector('[data-shell-account]')).toHaveAttribute('title', `Alex, ${email}`)
      } else {
        expect(shortAccount.gap).toBeGreaterThanOrEqual(0)
        expect(shortAccount.gap).toBeLessThanOrEqual(2)
        expect(shortAccount.avatarGap).toBe(12)
        expect(Math.abs(shortAccount.avatar.centerY - shortAccount.stack.centerY)).toBeLessThanOrEqual(1)
        expect(shortAccount.avatar.height).toBe(28)
        expect(shortAccount.name.fontSize).toBe('14px')
        expect(shortAccount.name.weight).toBe('500')
        expect(shortAccount.email.fontSize).toBe('12px')
        expect(shortAccount.email.whiteSpace).toBe('nowrap')
        expect(shortAccount.email.ellipsis).toBe('ellipsis')
        expect(shortAccount.email.overflows).toBe(true)
      }
      view.rerender(sidebarFixture(locale))
      await page.evaluate(markup => { document.body.innerHTML = markup }, view.container.innerHTML)
      const loadingHeight = await page.locator('[data-shell-account]').evaluate(element => element.getBoundingClientRect().height)
      expect(Math.abs(loadingHeight - shortAccount.rowHeight)).toBeLessThanOrEqual(0.1)
      for (const name of [longName, 'Alexandrasupercalifragilisticexpialidocious']) {
        view.rerender(sidebarFixture(locale, name))
        expect(within(view.container).getByRole('link', { name: `${name}, ${email}` })).toHaveAttribute('href', '/profile')
        await page.evaluate(markup => { document.body.innerHTML = markup }, view.container.innerHTML)
        const account = await measureAccount(page)
        if (collapsed) {
          expect(account.textHidden).toBe(true)
          expect(account.avatar.centerX).toBe(header.sidebar.centerX)
        } else {
          expectNameTruncation(account, name)
        }
      }
    } finally { await page.close() }
  })
})

async function measureAccount(page: Awaited<ReturnType<Browser['newPage']>>) {
  return page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('[data-shell-account]')!
    const avatar = row.querySelector<HTMLElement>('[aria-hidden="true"]')!
    const name = row.querySelector<HTMLElement>('[data-shell-account-name]')!
    const email = row.querySelector<HTMLElement>('[data-shell-account-email]')!
    const stack = name.parentElement!
    const bounds = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height, centerY: rect.top + rect.height / 2, centerX: rect.left + rect.width / 2 }
    }
    const text = (element: HTMLElement) => {
      const style = getComputedStyle(element)
      return { ...bounds(element), lineHeight: parseFloat(style.lineHeight), fontSize: style.fontSize, weight: style.fontWeight,
        whiteSpace: style.whiteSpace, ellipsis: style.textOverflow, overflow: style.overflow, clamp: style.webkitLineClamp,
        overflows: element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight }
    }
    return { rowHeight: row.getBoundingClientRect().height, rowRight: row.getBoundingClientRect().right,
      avatar: bounds(avatar), stack: bounds(stack), name: text(name), email: text(email),
      gap: bounds(email).top - bounds(name).bottom, avatarGap: bounds(stack).left - bounds(avatar).right,
      textHidden: stack.getBoundingClientRect().width <= 1 && getComputedStyle(stack).overflow === 'hidden' }
  })
}

function expectNameTruncation(account: Awaited<ReturnType<typeof measureAccount>>, name: string) {
  expect(account.name.height).toBeLessThanOrEqual(account.name.lineHeight * 2 + 0.5)
  expect(account.email.height).toBeCloseTo(account.email.lineHeight, 0)
  expect(account.name.left).toBe(account.email.left)
  expect(account.name.right).toBe(account.email.right)
  expect(account.name.right).toBeLessThanOrEqual(account.rowRight)
  expect(account.email.right).toBeLessThanOrEqual(account.rowRight)
  expect(account.name.whiteSpace).toBe(name === longName ? 'normal' : 'nowrap')
  expect(account.name.overflow).toBe('hidden')
  if (name === longName) {
    expect(account.name.height).toBeCloseTo(account.name.lineHeight * 2, 0)
    expect(account.name.clamp).toBe('2')
    expect(account.name.overflows).toBe(true)
  } else {
    expect(account.name.ellipsis).toBe('ellipsis')
    expect(account.name.overflows).toBe(true)
  }
}
