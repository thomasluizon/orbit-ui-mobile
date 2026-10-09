import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

import { ListRow } from '@/components/ui/list-row'
import AboutPage from '@/app/(app)/about/page'
import { useAuthStore } from '@/stores/auth-store'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const mocks = vi.hoisted(() => ({
  email: 'profile-account-with-a-long-address@example.com',
  push: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key.split('.').reduce<unknown>(
    (value, part) => (value as Record<string, unknown>)[part],
    ptBR,
  ) as string,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { email: mocks.email } }),
}))

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, title, titleTranslate, children }: { open: boolean; title: string; titleTranslate?: 'no'; children: React.ReactNode }) =>
    open ? <section role="dialog" aria-label={title} translate={titleTranslate}>{children}</section> : null,
}))

describe('AboutPage', () => {
  beforeEach(() => {
    mocks.push.mockClear()
    vi.stubEnv('NEXT_PUBLIC_WEB_COMMIT_SHA', '3f9c2ab5d1e0')
    useAuthStore.setState({ isAuthenticated: true })
  })

  afterEach(() => { vi.unstubAllEnvs() })

  it('shows the short commit of the served build as the version', () => {
    render(<AboutPage />)
    expect(screen.getByTestId('about-fact-version-value')).toHaveTextContent('3f9c2ab')
    expect(screen.queryByText(/0\.0\.1/)).not.toBeInTheDocument()
  })

  it('renders no version row when the build carries no commit', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_COMMIT_SHA', undefined)
    render(<AboutPage />)
    expect(screen.getByText('Orbit')).toBeInTheDocument()
    expect(screen.queryByTestId('about-fact-version')).not.toBeInTheDocument()
  })

  it('renders the About identity, real facts, and four destinations in order', () => {
    const { container } = render(<AboutPage />)

    expect(container.querySelector('[data-asset="orbit-mark-accent"]')).toBeInTheDocument()
    expect(screen.getByText('Orbit')).toBeInTheDocument()
    expect(screen.getByText(ptBR.about.tagline)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sobre' })).toBeInTheDocument()
    expect(screen.getByText('3f9c2ab')).toBeInTheDocument()
    expect(screen.getByText(mocks.email)).toBeInTheDocument()
    expect(screen.queryByTestId('about-credit')).not.toBeInTheDocument()

    const destinations = within(screen.getByTestId('about-destinations'))
    const destinationLabels = destinations
      .getAllByRole('button')
      .map((row) => row.getAttribute('aria-label'))
    expect(destinationLabels).toEqual([
      'Guia do Orbit',
      'Falar com o suporte',
      'Termos de uso',
      'Política de privacidade',
    ])

    fireEvent.click(destinations.getByRole('button', { name: 'Guia do Orbit' }))
    expect(screen.getByRole('dialog', { name: 'Guia do Orbit' })).toHaveAttribute('translate', 'no')
    expect(destinations.getByText('Guia do Orbit')).toHaveAttribute('translate', 'no')

    fireEvent.click(destinations.getByRole('button', { name: 'Falar com o suporte' }))
    fireEvent.click(destinations.getByRole('button', { name: 'Termos de uso' }))
    fireEvent.click(destinations.getByRole('button', { name: 'Política de privacidade' }))
    expect(mocks.push.mock.calls).toEqual([['/support'], ['/terms'], ['/privacy']])
  })

  it('keeps every 412px column shrinkable and lets fact values wrap', () => {
    render(<AboutPage />)

    expect(screen.getByTestId('about-content')).toHaveClass('min-w-0')
    expect(screen.getByTestId('about-identity')).toHaveClass('min-w-0')
    expect(screen.getByTestId('about-destinations')).toHaveClass('min-w-0')
    expect(screen.getByTestId('about-facts')).toHaveClass('min-w-0')

    for (const fact of ['version', 'account']) {
      const row = screen.getByTestId(`about-fact-${fact}`)
      const label = screen.getByTestId(`about-fact-${fact}-label`)
      const value = screen.getByTestId(`about-fact-${fact}-value`)
      expect(row).toHaveClass('flex-wrap', 'min-w-0')
      expect(label).toHaveStyle({ minWidth: '0px', flexGrow: '1', flexShrink: '1' })
      expect(value).toHaveStyle({ minWidth: '0px', overflowWrap: fact === 'account' ? 'normal' : 'anywhere' })
      if (fact === 'account') expect(row).toHaveAttribute('aria-expanded', 'false')
    }
  })
})


describe('About destination geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([412, 1280])('renders four 52px destinations with reachable targets at %ipx', async (width) => {
    render(<AboutPage />)
    const content = screen.getByTestId('about-content')
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${content.outerHTML}`)
      await loadAppFonts(page)
      const rows = await page.locator('[data-testid="about-destinations"] button').evaluateAll((buttons) => buttons.map((button) => {
        const bounds = button.getBoundingClientRect()
        const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
        return { height: bounds.height, width: bounds.width, reachable: button.contains(hit), clipped: button.scrollWidth > button.clientWidth }
      }))
      expect(rows).toHaveLength(4)
      for (const row of rows) {
        expect(row.height).toBe(52)
        expect(row.width).toBeGreaterThanOrEqual(48)
        expect(row.reachable).toBe(true)
        expect(row.clipped).toBe(false)
      }
    } finally { await page.close() }
  })

  it.each([
    ['regular', <ListRow key="regular" title="Habit" compact={false} onClick={() => {}} />, 52],
    ['plain', <ListRow key="plain" title="Habit" onClick={() => {}} />, 52],
    ['compact read only', <ListRow key="compact read only" title="Calendar habit" compact readOnly />, 52],
    ['read only', <ListRow key="read only" title="Habit" readOnly />, 52],
    ['described', <ListRow key="described" title="Account" description="account@example.com" onClick={() => {}} />, 68],
    ['compact with action', <ListRow key="compact with action" title="Key" compact onClick={() => {}} action={{ icon: 'trash', label: 'Revoke', onPress: () => {} }} />, 56],
    ['plain with action', <ListRow key="plain with action" title="Key" onClick={() => {}} action={{ icon: 'trash', label: 'Revoke', onPress: () => {} }} />, 56],
    ['described with action', <ListRow key="described with action" title="Invoice" description="Paid" action={{ icon: 'download', label: 'Download', onPress: () => {} }} />, 68],
    ['bare', <ListRow key="bare" title="Schedule" placement="column" onClick={() => {}} />, 52],
    ['compact in form', <ListRow key="compact in form" title="Template" compact onClick={() => {}} />, 52],
  ] as const)('keeps the %s row at its drawn height and its action at 48px', async (_name, element, height) => {
    const { container } = render(element)
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const measured = await page.locator('.orbit-list-row-shell').evaluate((row) => {
        const action = row.querySelector('.orbit-list-row-action')
        const body = row.firstElementChild!
        const bounds = body.getBoundingClientRect()
        return {
          height: row.getBoundingClientRect().height,
          bodyHeight: bounds.height,
          actionHeight: action?.getBoundingClientRect().height,
          actionWidth: action?.getBoundingClientRect().width,
          overlap: action ? bounds.right > action.getBoundingClientRect().left : false,
        }
      })
      if (element.props.description) expect(Math.abs(measured.height - height)).toBeLessThanOrEqual(1)
      else expect(measured.height).toBe(height)
      expect(measured.bodyHeight).toBe(measured.height)
      expect(measured.overlap).toBe(false)
      if (measured.actionHeight !== undefined) {
        expect(measured.actionHeight).toBe(48)
        expect(measured.actionWidth).toBe(48)
      }
    } finally { await page.close() }
  })

})
