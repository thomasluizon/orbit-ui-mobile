import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createManifest } from '@/lib/manifest'

const request = vi.hoisted(() => ({ locale: 'en' }))
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: 'meta') => createTranslator({
    locale: request.locale,
    messages: request.locale === 'en' ? en : ptBR,
    namespace,
  }),
}))

describe('web app manifest', () => {
  it.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])(
    'publishes desktop installation metadata in $locale', async ({ locale, messages }) => {
      request.locale = locale
      expect(await createManifest()).toEqual({
        id: '/',
        scope: '/',
        name: 'Orbit',
        short_name: 'Orbit',
        description: messages.meta.description,
        categories: ['productivity', 'lifestyle'],
        start_url: '/',
        display: 'standalone',
        launch_handler: { client_mode: 'focus-existing' },
        background_color: '#09090B',
        theme_color: '#09090B',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      })
    },
  )

  it('ships the canonical platform icon as the maskable asset', () => {
    const icon = readFileSync(resolve(process.cwd(), 'public/pwa-maskable-512x512.png'))
    expect(icon).toEqual(readFileSync(resolve(process.cwd(), '../../design/brand/png/orbit-platform-icon-512.png')))
  })
})
