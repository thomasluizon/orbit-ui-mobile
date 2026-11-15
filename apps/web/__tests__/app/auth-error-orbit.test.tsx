import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import AuthError from '@/app/(auth)/error'

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }))
vi.mock('@sentry/nextjs', () => sentry)

function stubWidth(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? Number.POSITIVE_INFINITY), media: query,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
  }))
}

afterEach(() => vi.unstubAllGlobals())

describe.each([['en', en], ['pt-BR', ptBR]] as const)('auth error surface in %s', (locale, messages) => {
  it.each([[412, 96], [1352, 128]])('shows Orbit in Parado at %i px wide with the message and the retry action', (width, size) => {
    stubWidth(width)
    const reset = vi.fn()
    const failure = new Error('render failed')
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><AuthError error={failure} reset={reset} /></NextIntlClientProvider>)
    const surface = container.querySelector('[data-error-state]')!
    const mascots = surface.querySelectorAll('[data-orbit-state]')
    expect(mascots).toHaveLength(1)
    expect(mascots[0]).toHaveAttribute('data-orbit-state', 'parado')
    expect(mascots[0]).toHaveAttribute('width', String(size))
    expect(surface).toHaveTextContent(messages.auth.genericError)
    expect(surface.textContent).not.toMatch(/astra/i)
    fireEvent.click(screen.getByRole('button', { name: messages.common.retry }))
    expect(reset).toHaveBeenCalledOnce()
    expect(sentry.captureException).toHaveBeenCalledWith(failure)
  })
})
