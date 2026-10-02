import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { getRouteMetadata } from '@/lib/route-metadata'
import { ROUTE_TITLE_KEYS, SERVER_TITLED_ROUTES, type TitledRoute } from '@/lib/route-titles'

const request = vi.hoisted(() => ({ locale: 'en' }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => createTranslator({ locale: request.locale, messages: request.locale === 'en' ? en : ptBR }),
}))

const serverRoutes: { file: string; route: TitledRoute }[] = [
  { file: '(app)/page.tsx', route: '/' },
  { file: '(app)/notifications/page.tsx', route: '/notifications' },
  { file: '(app)/[...missing]/page.tsx', route: '/[...missing]' },
  { file: 'chat/page.tsx', route: '/chat' },
  { file: 'r/[code]/page.tsx', route: '/r/[code]' },
  { file: 'step-up/page.tsx', route: '/step-up' },
  { file: 'turnstile-bridge/page.tsx', route: '/turnstile-bridge' },
]

it('assigns the metadata owner to exactly the routes exporting server titles', () => {
  expect(SERVER_TITLED_ROUTES).toEqual(serverRoutes.map(({ route }) => route))
})

describe.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('server route metadata in $locale', ({ locale, messages }) => {
  it.each(serverRoutes)('exports translated metadata for $route', async ({ file, route }) => {
    request.locale = locale
    const translate = createTranslator({ locale, messages })
    expect(await getRouteMetadata(route)).toEqual({ title: `${translate(ROUTE_TITLE_KEYS[route])} · Orbit` })
    const source = readFileSync(resolve(process.cwd(), 'app', file), 'utf8')
    expect(source).toContain('export function generateMetadata()')
    expect(source).toContain(`getRouteMetadata('${route}')`)
  })
})
