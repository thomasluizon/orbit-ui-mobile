import { describe, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { desktopAuthPage } from '@/lib/desktop-auth-page'

const state = 'a'.repeat(64)
const code = 'c'.repeat(64)

describe('isolated desktop completion document', () => {
  it.each(['en', 'pt-BR'] as const)('contains only the native destination and localized copy in %s', async locale => {
    for (const failed of [false, true]) {
      const destination = new URL(`org.useorbit.desktop://auth/callback?state=${state}&${failed ? 'error=authentication_failed' : `code=${code}`}`)
      const result = await desktopAuthPage(destination, locale, 'light')
      const page = new DOMParser().parseFromString(await new Response(result.body).text(), 'text/html')
      const copy = (locale === 'en' ? en : ptBR).auth.desktopCallback
      expect(page.documentElement.lang).toBe(locale)
      expect(page.documentElement.className).toBe('light')
      expect(page.title).toBe(`${failed ? copy.failureTitle : copy.successTitle} | Orbit`)
      expect(page.querySelector('h1')?.textContent).toBe(failed ? copy.failureTitle : copy.successTitle)
      expect(page.querySelector('p')?.textContent).toBe(failed ? copy.failureBody : copy.successBody)
      expect(page.querySelector('a')?.textContent).toBe(copy.openApp)
      expect(page.querySelector('a')?.href).toBe(destination.toString())
      const scripts = page.querySelectorAll('script')
      expect(scripts).toHaveLength(1)
      const script = scripts[0]!
      expect(script.src).toBe('')
      expect(result.headers['Content-Security-Policy']).toContain(`script-src 'nonce-${script.nonce}'`)
      expect(result.headers['Content-Security-Policy']).toContain("default-src 'none'")
      expect(page.querySelectorAll('link, iframe, img, form')).toHaveLength(0)
      page.querySelector('a')!.remove()
      expect(page.documentElement.outerHTML).not.toContain(code)
      expect(page.documentElement.outerHTML).not.toContain(state)
    }
  })
})
