import { renderToStaticMarkup } from 'react-dom/server'
import { createTranslator } from 'next-intl'
import { createDefaultMetadata } from 'next/dist/lib/metadata/default-metadata'
import { createMetadataElements } from 'next/dist/lib/metadata/metadata-elements'
import { RequestCookies } from 'next/dist/server/web/spec-extension/cookies'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import RootLayout, { generateMetadata } from '@/app/layout'
import { GET } from '@/app/manifest.webmanifest/route'
import getRequestConfig from '@/i18n/request'

const request = vi.hoisted(() => ({ cookie: 'i18n_locale=pt-BR', acceptLanguage: 'en' }))
vi.mock('next/headers', () => ({
  cookies: async () => new RequestCookies(new Headers({ cookie: request.cookie })),
  headers: async () => new Headers({ 'accept-language': request.acceptLanguage }),
}))
vi.mock('next-intl/server', () => ({
  getRequestConfig: (factory: () => Promise<unknown>) => factory,
  getTranslations: async (namespace: 'meta') => {
    const config = await getRequestConfig({ requestLocale: Promise.resolve(undefined) })
    return createTranslator({ locale: config.locale, messages: config.messages ?? undefined, namespace })
  },
  getLocale: async () => (await getRequestConfig({ requestLocale: Promise.resolve(undefined) })).locale,
  getMessages: async () => (await getRequestConfig({ requestLocale: Promise.resolve(undefined) })).messages,
}))
vi.mock('@/app/fonts', () => ({ geist: {}, geistMono: {}, spaceGrotesk: {} }))
vi.mock('@/components/posthog-provider', () => ({ PostHogProvider: () => null }))

async function renderedManifestLink() {
  const metadata = await generateMetadata()
  const elements = createMetadataElements({
    ...createDefaultMetadata(),
    title: null,
    openGraph: null,
    twitter: null,
    manifest: metadata.manifest?.toString() ?? null,
  })
  const markup = renderToStaticMarkup(<>{await RootLayout({ children: null })}{elements}</>)
  const page = new DOMParser().parseFromString(markup, 'text/html')
  const links = page.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]')
  expect(links).toHaveLength(1)
  return links[0]!
}

beforeEach(() => {
  request.cookie = 'i18n_locale=pt-BR'
  request.acceptLanguage = 'en'
})

describe('root manifest locale delivery', () => {
  it('renders one public manifest link that includes the selected locale cookie', async () => {
    const link = await renderedManifestLink()
    expect(link.getAttribute('href')).toBe('/manifest.webmanifest')
    expect(link.crossOrigin).toBe('use-credentials')
  })

  it.each([
    { cookie: 'i18n_locale=pt-BR', acceptLanguage: 'en', messages: ptBR },
    { cookie: 'i18n_locale=en', acceptLanguage: 'pt-BR', messages: en },
    { cookie: '', acceptLanguage: 'pt-BR', messages: ptBR },
    { cookie: 'i18n_locale=unsupported', acceptLanguage: 'en', messages: en },
  ])('serves the localized manifest for $cookie with Accept-Language $acceptLanguage', async ({ cookie, acceptLanguage, messages }) => {
    request.cookie = cookie
    request.acceptLanguage = acceptLanguage
    const link = await renderedManifestLink()
    if (link.crossOrigin !== 'use-credentials') request.cookie = ''
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/manifest+json')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({
      description: messages.meta.description,
      id: '/',
      scope: '/',
      start_url: '/',
    })
  })
})
