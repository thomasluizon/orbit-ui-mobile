import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { motionDurations } from '@orbit/shared/theme'
import { RECAP_SHARE_PERIODS } from '@orbit/shared/utils'
import { WrappedCover } from '@/app/(app)/wrapped/_components/wrapped-cover'

const LOCALES = [{ locale: 'pt-BR', messages: ptBR }, { locale: 'en', messages: en }] as const
type CoverState = Parameters<typeof WrappedCover>[0]['state']

function stubMedia(matches: (query: string) => boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: matches(query), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}

function renderCover(locale: (typeof LOCALES)[number], state: CoverState = 'ready', handlers = { onSelectPeriod: vi.fn(), onStart: vi.fn(), onRetry: vi.fn() }) {
  const cover = (period: (typeof RECAP_SHARE_PERIODS)[number]) => (
    <NextIntlClientProvider locale={locale.locale} messages={locale.messages}>
      <WrappedCover period={period} state={state} {...handlers} />
    </NextIntlClientProvider>
  )
  const view = render(cover('week'))
  return { ...view, handlers, showPeriod: (period: (typeof RECAP_SHARE_PERIODS)[number]) => view.rerender(cover(period)) }
}

const mascot = (container: HTMLElement) => container.querySelector('svg[data-asset="orbit-mascot"]')

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the guided Wrapped cover on web', () => {
  it.each(LOCALES)('shows Orbit in Parado, the period question, three quick options and the start action in $locale', (locale) => {
    enableTestFlags('orbit_guided_flows')
    const { container, handlers } = renderCover(locale)
    const copy = locale.messages.wrapped

    expect(container.querySelectorAll('svg[data-asset="orbit-mascot"]')).toHaveLength(1)
    expect(mascot(container)).toHaveAttribute('data-orbit-state', 'parado')
    expect(mascot(container)).toHaveAttribute('width', '96')
    expect(screen.getByRole('heading', { level: 1, name: copy.coverTitles.week })).toHaveAccessibleDescription(copy.coverSubtitle)
    expect(screen.getByRole('heading', { level: 2, name: copy.periodQuestion })).toBeInTheDocument()

    const options = within(screen.getByRole('group', { name: copy.periodQuestion })).getAllByRole('button')
    expect(options.map((option) => option.textContent)).toEqual(RECAP_SHARE_PERIODS.map((period) => copy.periods[period]))
    expect(options[0]).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(options[2]!)
    expect(handlers.onSelectPeriod).toHaveBeenCalledWith('year')
    expect(screen.queryByRole('group', { name: copy.periodGroup })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: copy.start }))
    expect(handlers.onStart).toHaveBeenCalledTimes(1)
  })

  it.each(LOCALES)('names the empty period in the Orbit line and leaves the period control as the one action in $locale', (locale) => {
    enableTestFlags('orbit_guided_flows')
    const { container } = renderCover(locale, 'empty')
    const copy = locale.messages.wrapped

    expect(container.querySelector('[data-wrapped-orbit-line]')).toHaveTextContent(copy.empty)
    expect(mascot(container)).toHaveAttribute('data-orbit-state', 'parado')
    expect(container.querySelector('[data-orbit-state="feliz"]')).toBeNull()
    expect(screen.queryByRole('button', { name: copy.start })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(RECAP_SHARE_PERIODS.map((period) => copy.periods[period]))
  })

  it('states the error in the Orbit line with Orbit in Parado, and retry reads the recap again', () => {
    enableTestFlags('orbit_guided_flows')
    const { container, handlers } = renderCover(LOCALES[0], 'failed')

    expect(screen.getByRole('alert')).toHaveTextContent(ptBR.wrapped.error)
    expect(mascot(container)).toHaveAttribute('data-orbit-state', 'parado')
    fireEvent.click(screen.getByRole('button', { name: ptBR.wrapped.retry }))
    expect(handlers.onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: ptBR.wrapped.start })).not.toBeInTheDocument()
  })

  it('keeps the start label on a waiting action while the recap loads, and announces the load', () => {
    enableTestFlags('orbit_guided_flows')
    const { handlers } = renderCover(LOCALES[0], 'loading')

    const start = screen.getByRole('button', { name: ptBR.wrapped.start })
    expect(start).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(start)
    expect(handlers.onStart).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(ptBR.wrapped.loading)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('draws Orbit at 128 and puts the start action inside the block at 1024 and above', () => {
    enableTestFlags('orbit_guided_flows')
    stubMedia((query) => query.includes('min-width: 1024px'))
    const { container } = renderCover(LOCALES[0])

    expect(mascot(container)).toHaveAttribute('width', '128')
    expect(container.querySelector('[data-wrapped-cover-block] [data-wrapped-cover-primary]')).not.toBeNull()
  })

  it.each([
    { reduced: false, duration: motionDurations.micro },
    { reduced: true, duration: motionDurations.instant },
  ])('fades the title and the line for $duration ms on a period change when reduced motion is $reduced', ({ reduced, duration }) => {
    enableTestFlags('orbit_guided_flows')
    stubMedia((query) => reduced && query.includes('prefers-reduced-motion'))
    const { container, showPeriod } = renderCover(LOCALES[0])

    showPeriod('month')
    expect(container.querySelector('[data-period-fade]')).toHaveAttribute('data-period-fade', String(duration))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ptBR.wrapped.coverTitles.month)
    expect(mascot(container)).toHaveAttribute('data-orbit-loop', reduced ? 'still' : 'running')
  })

  it('renders the current cover with the flag off', () => {
    const { container } = renderCover(LOCALES[0])

    expect(container.querySelector('[data-wrapped-cover="guided"]')).toBeNull()
    expect(screen.getByRole('group', { name: ptBR.wrapped.periodGroup })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: ptBR.wrapped.periodQuestion })).not.toBeInTheDocument()
    expect(screen.getByText(ptBR.wrapped.coverSubtitle)).toBeInTheDocument()
  })
})
