import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { RouteContext } from '@/components/navigation/route-context'
import { formatRouteTitle, resolveTitledRoute, ROUTE_TITLE_KEYS } from '@/lib/route-titles'

const navigation = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))

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
  it.each(Object.entries(ROUTE_TITLE_KEYS).filter(([route]) => route !== '/habits/[id]'))('names %s before Orbit', (route, key) => {
    navigation.pathname = route === '/[...missing]' ? '/unknown/page' : route === '/r/[code]' ? '/r/invitation' : route
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

it('leaves habit detail titles to the loaded screen', () => {
  navigation.pathname = '/habits/habit-1'
  document.title = 'Read · Orbit'
  render(<NextIntlClientProvider locale="en" messages={en}><RouteContext /></NextIntlClientProvider>)
  expect(document.title).toBe('Read · Orbit')
  expect(resolveTitledRoute('/habits/new')).toBe('/habits/new')
  expect(resolveTitledRoute('/habits/habit-1/invalid')).toBe('/[...missing]')
})
