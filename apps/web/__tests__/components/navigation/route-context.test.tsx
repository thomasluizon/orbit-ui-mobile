import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { RouteContext } from '@/components/navigation/route-context'
import AppError from '@/app/(app)/error'
import { formatRouteTitle, resolveTitledRoute, ROUTE_TITLE_KEYS } from '@/lib/route-titles'

const navigation = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

function pageRoutes(directory: string, segments: string[] = []): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && entry.name !== 'api' && !entry.name.startsWith('_')) {
      return pageRoutes(resolve(directory, entry.name), entry.name.startsWith('(') ? segments : [...segments, entry.name])
    }
    return entry.name === 'page.tsx' ? [`/${segments.join('/')}`] : []
  })
}

function messageAt(messages: typeof en, key: string): string {
  const message = key.split('.').reduce<unknown>((value, segment) => {
    expect(value).toHaveProperty(segment)
    return (value as Record<string, unknown>)[segment]
  }, messages)
  expect(typeof message).toBe('string')
  return message as string
}

beforeEach(() => {
  navigation.pathname = '/'
  document.title = en.meta.title
})

it('covers every page in the web route table with a surface name in both locales', () => {
  const routes = pageRoutes(resolve(process.cwd(), 'app'))
  const alphabetically = (first: string, second: string) => first.localeCompare(second)
  expect(Object.keys(ROUTE_TITLE_KEYS).sort(alphabetically)).toEqual(routes.sort(alphabetically))
  for (const key of Object.values(ROUTE_TITLE_KEYS)) {
    for (const messages of [en, ptBR]) {
      expect(messageAt(messages, key).trim()).not.toBe('')
      expect(messageAt(messages, key)).not.toContain('{')
    }
  }
  expect(readFileSync(resolve(process.cwd(), 'app/layout.tsx'), 'utf8')).toContain('<RouteContext />')
})

describe.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('route titles in $locale', ({ locale, messages }) => {
  it.each(Object.entries(ROUTE_TITLE_KEYS))('names %s before Orbit', (route, key) => {
    navigation.pathname = route === '/[...missing]' ? '/unknown/page' : route === '/r/[code]' ? '/r/invitation' : route === '/habits/[id]' ? '/habits/habit-1' : route
    render(<NextIntlClientProvider locale={locale} messages={messages}><RouteContext /></NextIntlClientProvider>)
    expect(document.title).toBe(`${messageAt(messages, key)} · Orbit`)
  })

  it('updates the title through consecutive client navigations', () => {
    const view = render(<NextIntlClientProvider locale={locale} messages={messages}><RouteContext /></NextIntlClientProvider>)
    for (const route of ['/calendar', '/about', '/support', '/']) {
      navigation.pathname = route
      view.rerender(<NextIntlClientProvider locale={locale} messages={messages}><RouteContext /></NextIntlClientProvider>)
      expect(document.title).toBe(formatRouteTitle(messageAt(messages, ROUTE_TITLE_KEYS[resolveTitledRoute(route)])))
    }
  })
})

it('updates the title when the locale changes without navigation', () => {
  navigation.pathname = '/about'
  const view = render(<NextIntlClientProvider locale="en" messages={en}><RouteContext /></NextIntlClientProvider>)
  view.rerender(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><RouteContext /></NextIntlClientProvider>)
  expect(document.title).toBe(`${ptBR.about.title} · Orbit`)
})

it('installs a generic habit title before the screen mounts', () => {
  navigation.pathname = '/habits/habit-1'
  document.title = 'Read · Orbit'
  render(<NextIntlClientProvider locale="en" messages={en}><RouteContext /></NextIntlClientProvider>)
  expect(document.title).toBe(`${en.habits.detail.screenTitle} · Orbit`)
  expect(resolveTitledRoute('/habits/new')).toBe('/habits/new')
  expect(resolveTitledRoute('/habits/habit-1/invalid')).toBe('/[...missing]')
})

it.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('names a habit route reaching the error boundary in $locale', ({ locale, messages }) => {
  navigation.pathname = '/habits/habit-2'
  document.title = 'Previous habit · Orbit'
  render(<NextIntlClientProvider locale={locale} messages={messages}><RouteContext /><main><AppError error={new Error('Route load failed')} reset={() => {}} /></main></NextIntlClientProvider>)
  expect(document.title).toBe(`${messages.habits.detail.screenTitle} · Orbit`)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(messages.errorScreen.title)
})

describe('client navigation focus', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function view(content: React.ReactNode) {
    return <NextIntlClientProvider locale="en" messages={en}><RouteContext />{content}</NextIntlClientProvider>
  }

  function finishNavigation() {
    void act(() => vi.advanceTimersByTime(40))
  }

  it('leaves focus alone on direct load and focuses the new heading after navigation', () => {
    const rendered = render(view(<main><h1>Today</h1></main>))
    expect(screen.getByRole('heading')).not.toHaveFocus()
    navigation.pathname = '/privacy'
    rendered.rerender(view(<main><h1>Privacy</h1></main>))
    finishNavigation()
    expect(screen.getByRole('heading', { name: 'Privacy' })).toHaveFocus()
    expect(screen.getByRole('heading')).toHaveAttribute('tabindex', '-1')
  })

  it('focuses main when the new view has no heading', () => {
    const rendered = render(view(<main><h1>Today</h1></main>))
    navigation.pathname = '/login'
    rendered.rerender(view(<main>Sign in</main>))
    finishNavigation()
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('waits for a suspended view to mount', async () => {
    const rendered = render(view(<main><h1>Today</h1></main>))
    navigation.pathname = '/terms'
    rendered.rerender(view(null))
    finishNavigation()
    rendered.rerender(view(<main><h1>Terms</h1></main>))
    await act(async () => {})
    finishNavigation()
    expect(screen.getByRole('heading', { name: 'Terms' })).toHaveFocus()
  })

  it('preserves focus already placed by the owning shell or form', () => {
    const rendered = render(view(<main><h1>Today</h1></main>))
    navigation.pathname = '/habits/new'
    rendered.rerender(view(<main><h1>New habit</h1><input autoFocus aria-label="Name" /></main>))
    finishNavigation()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
    navigation.pathname = '/calendar'
    rendered.rerender(view(<main><h1 tabIndex={-1}>Calendar</h1></main>))
    screen.getByRole('heading').focus()
    finishNavigation()
    expect(screen.getByRole('heading')).toHaveFocus()
  })

  it('does not move focus on locale updates or after unmount', () => {
    const rendered = render(view(<main><h1>Today</h1></main>))
    rendered.rerender(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><RouteContext /><main><h1>Hoje</h1></main></NextIntlClientProvider>)
    finishNavigation()
    expect(screen.getByRole('heading')).not.toHaveFocus()
    navigation.pathname = '/about'
    rendered.rerender(view(null))
    rendered.unmount()
    const unrelated = render(<main><h1>Another view</h1></main>)
    finishNavigation()
    expect(screen.getByRole('heading')).not.toHaveFocus()
    unrelated.unmount()
  })
})
