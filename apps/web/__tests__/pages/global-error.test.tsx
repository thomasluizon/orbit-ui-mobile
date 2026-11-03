import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import GlobalError from '@/app/global-error'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/app/fonts', () => ({
  spaceGrotesk: { variable: 'font-display' },
  geistMono: { variable: 'font-mono' },
  geist: { variable: 'font-geist' },
}))

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
  document.cookie = 'orbit_theme_mode=;max-age=0;path=/'
  document.cookie = 'i18n_locale=;max-age=0;path=/'
})

describe('standalone global error screen', () => {
  it.each([
    ['en', 'light'], ['en', 'dark'], ['pt-BR', 'light'], ['pt-BR', 'dark'],
  ] as const)('renders and retries without app providers in %s with %s tokens', (locale, themeMode) => {
    document.cookie = `i18n_locale=${locale};path=/`
    document.cookie = `orbit_theme_mode=${themeMode};path=/`
    const retry = vi.fn()
    const messages = locale === 'en' ? en : pt

    render(<GlobalError error={new Error('private startup failure')} reset={retry} />)

    const heading = screen.getByRole('heading', { name: messages.errorScreen.title })
    expect(screen.getByText(messages.errorScreen.body)).toBeInTheDocument()
    expect(screen.queryByText('private startup failure')).not.toBeInTheDocument()
    expect(heading.closest('html')?.style.getPropertyValue('--bg')).toBe(resolveWebThemeVariables('orange', themeMode)['--bg'])
    fireEvent.click(screen.getByRole('button', { name: messages.errorScreen.retry }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it.each(['light', 'dark'] as const)('uses system %s tokens when no cookie exists', (mode) => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: mode === 'light' } as MediaQueryList)
    render(<GlobalError error={new Error('startup failure')} reset={vi.fn()} />)
    const root = screen.getByRole('heading', { name: en.errorScreen.title }).closest('html')!
    expect(root.style.getPropertyValue('--bg')).toBe(resolveWebThemeVariables('orange', mode)['--bg'])
    expect(root.style.colorScheme).toBe(mode)
    expect(document.cookie).not.toContain('orbit_theme_mode')
  })

  it.each([
    ['%', true], ['%6cight', false],
  ] as const)('handles theme cookie %s with the same decoding rule as the app', (value, systemLight) => {
    document.cookie = `orbit_theme_mode=${value};path=/`
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: systemLight } as MediaQueryList)
    render(<GlobalError error={new Error('startup failure')} reset={vi.fn()} />)
    const root = screen.getByRole('heading', { name: en.errorScreen.title }).closest('html')!
    expect(root.style.colorScheme).toBe('light')
    expect(root.style.getPropertyValue('--bg')).toBe(resolveWebThemeVariables('orange', 'light')['--bg'])
    expect(document.cookie).toContain(`orbit_theme_mode=${value}`)
  })

  it('renders with default tokens when theme preferences are missing', () => {
    render(<GlobalError error={new Error('private startup failure')} reset={vi.fn()} />)

    const heading = screen.getByRole('heading', { name: en.errorScreen.title })
    expect(heading.closest('html')?.style.getPropertyValue('--bg')).toBe(resolveWebThemeVariables('orange', 'dark')['--bg'])
    expect(screen.getByRole('button', { name: en.errorScreen.retry })).toBeEnabled()
  })
})
