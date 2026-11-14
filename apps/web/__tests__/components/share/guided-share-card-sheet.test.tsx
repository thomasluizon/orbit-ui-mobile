import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { motionDurations, motionPresets } from '@orbit/shared/theme'
import type { RecapSharePeriod } from '@orbit/shared/utils'

const mocks = vi.hoisted(() => ({
  share: vi.fn(), download: vi.fn(), resetFeedback: vi.fn(), refetch: vi.fn(),
  isLoading: false, isError: false, isEmpty: false, isSharing: false, hasError: false,
  canShareFiles: true, savedFileName: null as string | null,
}))
vi.mock('@/hooks/use-referral', () => ({ useReferral: () => ({ stats: null, isError: false }) }))
vi.mock('@/hooks/use-wrapped', () => ({ useWrapped: (period: RecapSharePeriod) => ({
  recap: createMockRecap({ period, metrics: createMockRetrospectiveMetrics({ activeDays: mocks.isEmpty ? 0 : 5, totalCompletions: mocks.isEmpty ? 0 : 40, completionRate: mocks.isEmpty ? 0 : 73.5 }) }),
  isLoading: mocks.isLoading, isError: mocks.isError, refetch: mocks.refetch,
}) }))
vi.mock('@/hooks/use-share-card', () => ({ useShareCard: () => ({ captureRef: { current: null }, ...mocks }) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

import { ShareCardSheet } from '@/components/share/share-card-sheet'

const LOCALES = [{ locale: 'pt-BR', messages: ptBR }, { locale: 'en', messages: en }] as const
const PERIODS = ['week', 'month', 'year'] as const

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('prefers-reduced-motion'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}

function renderSheet(locale: (typeof LOCALES)[number] = LOCALES[0]) {
  const view = render(
    <NextIntlClientProvider locale={locale.locale} messages={locale.messages}>
      <ShareCardSheet onClose={vi.fn()} />
    </NextIntlClientProvider>,
  )
  return { ...view, copy: locale.messages.shareCard }
}

const options = (question: string) => within(screen.getByRole('group', { name: question })).getAllByRole('button')
const mascots = (container: HTMLElement) => [...container.querySelectorAll('svg[data-asset="orbit-mascot"][data-orbit-face="rig"]')]

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(mocks, { isLoading: false, isError: false, isEmpty: false, isSharing: false, hasError: false, canShareFiles: true, savedFileName: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the guided share card sheet on web', () => {
  it.each(LOCALES)('uses the period question as the heading and offers exactly three periods that change the preview in $locale', (locale) => {
    enableTestFlags('orbit_guided_flows')
    const { copy } = renderSheet(locale)

    expect(screen.getByRole('dialog', { name: copy.periodQuestion })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: copy.periodQuestion })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(options(copy.periodQuestion).map((option) => option.textContent)).toEqual(PERIODS.map((period) => copy.periods[period]))
    expect(options(copy.periodQuestion)[0]).toHaveAttribute('aria-pressed', 'true')

    for (const [index, period] of PERIODS.entries()) {
      fireEvent.click(options(copy.periodQuestion)[index]!)
      expect(options(copy.periodQuestion)[index]).toHaveAttribute('aria-pressed', 'true')
      expect(within(screen.getByTestId('share-card')).getByText(copy.periods[period])).toBeInTheDocument()
    }
    expect(mocks.resetFeedback).toHaveBeenCalledTimes(PERIODS.length)
  })

  it.each([
    { reduced: false, duration: motionPresets.selection.enterDuration, scale: motionPresets.selection.scaleFrom },
    { reduced: true, duration: motionPresets.selection.reducedMotion.enterDuration, scale: 1 },
  ])('brings the new preview in with the selection preset from scale $scale when reduced motion is $reduced', ({ reduced, duration, scale }) => {
    enableTestFlags('orbit_guided_flows')
    stubReducedMotion(reduced)
    const { container, copy } = renderSheet()
    const preview = () => container.querySelector('[data-share-preview]')

    expect(preview()).toHaveAttribute('data-preview-duration', String(motionDurations.instant))
    fireEvent.click(options(copy.periodQuestion)[1]!)
    expect(preview()).toHaveAttribute('data-preview-duration', String(duration))
    expect(preview()).toHaveAttribute('data-preview-scale', String(scale))
  })

  it('keeps preview, share and download, and the saved feedback', () => {
    enableTestFlags('orbit_guided_flows')
    mocks.savedFileName = 'orbit-recap.png'
    const { copy } = renderSheet()

    expect(screen.getByTestId('share-card')).toHaveTextContent('74%')
    fireEvent.click(screen.getByRole('button', { name: copy.share }))
    expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ shareTitle: copy.shareTitle, url: createMockRecap().shareDeepLink }))
    fireEvent.click(screen.getByRole('button', { name: copy.download }))
    expect(mocks.download).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent(copy.saved.replace('{file}', 'orbit-recap.png'))
  })

  it('shows no error text after a share that the person cancels', () => {
    enableTestFlags('orbit_guided_flows')
    const { copy } = renderSheet()

    fireEvent.click(screen.getByRole('button', { name: copy.share }))
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    expect(screen.queryByText(copy.shareError)).not.toBeInTheDocument()
  })

  it('shows the current failure message after a share that fails', () => {
    enableTestFlags('orbit_guided_flows')
    mocks.hasError = true
    const { copy } = renderSheet()

    expect(screen.getByRole('alert')).toHaveTextContent(copy.shareError)
  })

  it.each(LOCALES)('keeps the title and shows the empty sentence with Orbit in Parado in $locale', (locale) => {
    enableTestFlags('orbit_guided_flows')
    mocks.isEmpty = true
    const { container, copy } = renderSheet(locale)

    expect(screen.getByRole('heading', { name: copy.periodQuestion })).toBeInTheDocument()
    expect(screen.getByText(copy.empty)).toBeInTheDocument()
    expect(mascots(container)).toHaveLength(1)
    expect(mascots(container)[0]).toHaveAttribute('data-orbit-state', 'parado')
    expect(mascots(container)[0]).toHaveAttribute('width', '96')
    expect(screen.queryByTestId('share-card')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: copy.download })).toBeDisabled()
  })

  it('shows Orbit in Parado on the load error, and retry reads the recap again', () => {
    enableTestFlags('orbit_guided_flows')
    mocks.isError = true
    const { container, copy } = renderSheet()

    const error = container.querySelector('[data-share-error]')!
    expect(error).toHaveAttribute('role', 'alert')
    expect(error).toHaveTextContent(copy.error)
    expect(mascots(container)).toHaveLength(1)
    expect(mascots(container)[0]).toHaveAttribute('data-orbit-state', 'parado')
    fireEvent.click(screen.getByRole('button', { name: ptBR.common.retry }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })

  it('keeps the loading skeleton and stops the period options during a capture', () => {
    enableTestFlags('orbit_guided_flows')
    mocks.isLoading = true
    const loading = renderSheet()
    expect(screen.getByRole('progressbar', { name: loading.copy.loading })).toBeInTheDocument()
    loading.unmount()

    Object.assign(mocks, { isLoading: false, isSharing: true })
    const { copy } = renderSheet()
    for (const option of options(copy.periodQuestion)) expect(option).toBeDisabled()
  })

  it('renders the current sheet with the flag off', () => {
    const { copy } = renderSheet()

    expect(screen.getByRole('dialog', { name: copy.title })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: copy.share })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: copy.periodQuestion })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: copy.periodQuestion })).not.toBeInTheDocument()
    expect(document.querySelector('[data-share-preview]')).toBeNull()
  })
})
