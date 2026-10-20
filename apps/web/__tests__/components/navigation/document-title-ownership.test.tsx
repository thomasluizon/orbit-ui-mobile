import { Suspense, use } from 'react'
import { renderToString } from 'react-dom/server'
import type { Metadata } from 'next'
import { act, render } from '@testing-library/react'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { generateMetadata } from '@/app/layout'
import { RouteContext } from '@/components/navigation/route-context'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { getRouteMetadata } from '@/lib/route-metadata'

const request = vi.hoisted(() => ({ pathname: '/about', locale: 'en' }))
vi.mock('next/navigation', () => ({ usePathname: () => request.pathname }))
vi.mock('@/app/fonts', () => ({ geist: {}, geistMono: {}, spaceGrotesk: {} }))
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace?: 'meta') => createTranslator({ locale: request.locale, messages: request.locale === 'en' ? en : ptBR, namespace }),
}))

function DeferredMetadata({ pending }: Readonly<{ pending: Promise<Metadata> }>) {
  const metadata = use(pending)
  return typeof metadata.title === 'string' ? <title>{metadata.title}</title> : null
}

function SpecificTitle({ surface }: Readonly<{ surface: string | null }>) {
  useDocumentTitle(surface)
  return null
}

beforeEach(() => {
  document.head.querySelectorAll('title').forEach((title) => title.remove())
})

describe.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('deferred metadata in $locale', ({ locale, messages }) => {
  it.each([
    { pathname: '/about', surface: messages.about.title },
    { pathname: '/privacy', surface: messages.privacy.title },
    { pathname: '/terms', surface: messages.terms.title },
  ])('preserves the localized $pathname title after metadata settles on direct load', async ({ pathname, surface }) => {
    request.pathname = pathname
    request.locale = locale
    let settle!: (metadata: Metadata) => void
    const pending = new Promise<Metadata>((resolve) => { settle = resolve })
    await act(async () => { render(<NextIntlClientProvider locale={locale} messages={messages}>
      <RouteContext />
      <div hidden><Suspense fallback={null}><DeferredMetadata pending={pending} /></Suspense></div>
    </NextIntlClientProvider>) })
    expect(document.title).toBe(`${surface} · Orbit`)
    await act(async () => { settle(await generateMetadata()) })
    expect(document.title).toBe(`${surface} · Orbit`)
    expect(document.head.querySelectorAll('title')).toHaveLength(1)
  })

  it('keeps the server-rendered localized title through hydration', async () => {
    request.pathname = '/privacy/'
    request.locale = locale
    const tree = <NextIntlClientProvider locale={locale} messages={messages}><RouteContext /><main><h1>{messages.privacy.title}</h1></main></NextIntlClientProvider>
    const container = document.createElement('div')
    container.innerHTML = renderToString(tree)
    const title = container.querySelector('title')!
    document.head.append(title)
    document.body.append(container)
    expect(document.title).toBe(`${messages.privacy.title} · Orbit`)
    await act(async () => { render(tree, { container, hydrate: true }) })
    expect(document.title).toBe(`${messages.privacy.title} · Orbit`)
    expect(document.head.querySelectorAll('title')).toHaveLength(1)
  })

  it('preserves the Privacy title through client navigation and deferred reconciliation', async () => {
    request.pathname = '/about'
    request.locale = locale
    let settle!: (metadata: Metadata) => void
    const pending = new Promise<Metadata>((resolve) => { settle = resolve })
    const tree = (metadata?: Promise<Metadata>) => <NextIntlClientProvider locale={locale} messages={messages}>
      <RouteContext />
      {metadata && <div hidden><Suspense fallback={null}><DeferredMetadata pending={metadata} /></Suspense></div>}
    </NextIntlClientProvider>
    const view = render(tree())
    expect(document.title).toBe(`${messages.about.title} · Orbit`)
    request.pathname = '/privacy/'
    await act(async () => { view.rerender(tree(pending)) })
    expect(document.title).toBe(`${messages.privacy.title} · Orbit`)
    await act(async () => { settle(await generateMetadata()) })
    expect(document.title).toBe(`${messages.privacy.title} · Orbit`)
    expect(document.head.querySelectorAll('title')).toHaveLength(1)
  })

  it.each([
    { pathname: '/habits/habit-1/', surface: 'Read', fallback: messages.habits.detail.screenTitle },
    { pathname: '/upgrade/', surface: messages.upgrade.title, fallback: messages.upgrade.pitchTitle },
  ])('preserves specific overrides on $pathname and clears them when the screen leaves', async ({ pathname, surface, fallback }) => {
    request.pathname = pathname
    request.locale = locale
    let settle!: (metadata: Metadata) => void
    const pending = new Promise<Metadata>((resolve) => { settle = resolve })
    const tree = (specific: string | null) => <NextIntlClientProvider locale={locale} messages={messages}>
      <RouteContext><SpecificTitle surface={specific} /></RouteContext>
      <div hidden><Suspense fallback={null}><DeferredMetadata pending={pending} /></Suspense></div>
    </NextIntlClientProvider>
    let view!: ReturnType<typeof render>
    await act(async () => { view = render(tree(surface)) })
    expect(document.title).toBe(`${surface} · Orbit`)
    await act(async () => { settle(await generateMetadata()) })
    expect(document.title).toBe(`${surface} · Orbit`)
    view.rerender(tree(null))
    expect(document.title).toBe(`${fallback} · Orbit`)
    expect(document.head.querySelectorAll('title')).toHaveLength(1)
  })

  it('leaves server route titles under the metadata owner during navigation', async () => {
    request.pathname = '/privacy'
    request.locale = locale
    const tree = (metadata?: Promise<Metadata>) => <NextIntlClientProvider locale={locale} messages={messages}>
      <RouteContext />
      {metadata && <div hidden><Suspense fallback={null}><DeferredMetadata pending={metadata} /></Suspense></div>}
    </NextIntlClientProvider>
    const view = render(tree())
    expect(document.title).toBe(`${messages.privacy.title} · Orbit`)
    request.pathname = '/notifications/'
    await act(async () => { view.rerender(tree(getRouteMetadata('/notifications'))) })
    expect(document.title).toBe(`${messages.notifications.title} · Orbit`)
    expect(document.head.querySelectorAll('title')).toHaveLength(1)
    request.pathname = '/about'
    view.rerender(tree())
    expect(document.title).toBe(`${messages.about.title} · Orbit`)
    expect(document.head.querySelectorAll('title')).toHaveLength(1)
  })
})
