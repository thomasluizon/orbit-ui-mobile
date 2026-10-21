import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { referralCopyCases } from '@orbit/shared/__tests__/referral-copy-cases'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'

const rewardState = vi.hoisted(() => ({ locale: '', stats: null as { rewardType?: string; proDaysPerReferral?: number; discountPercent?: number } | null, isError: false }))
vi.mock('@/hooks/use-referral', () => ({ useReferral: () => rewardState }))
const mocks = vi.hoisted(() => ({
  wrapped: vi.fn(), share: vi.fn(), download: vi.fn(), resetFeedback: vi.fn(), refetch: vi.fn(),
  isLoading: false, isError: false, isEmpty: false, isSharing: false, hasError: false,
  canShareFiles: true, savedFileName: null as string | null,
}))
vi.mock('next-intl', async (importActual) => {
  const actual = await importActual<typeof import('next-intl')>()
  return { ...actual, useTranslations: () => (key: string, values?: Record<string, string | number>) => rewardState.locale ? (() => { const translate = actual.createTranslator({ locale: rewardState.locale, messages: rewardState.locale === 'en' ? en : ptBR }); return translate(key as Parameters<typeof translate>[0], values) })() : values?.file ? `${key}:${values.file}` : key }
})
vi.mock('@/hooks/use-wrapped', () => ({ useWrapped: (period: string, options: unknown) => {
  mocks.wrapped(period, options)
  return { recap: createMockRecap({ metrics: createMockRetrospectiveMetrics({ activeDays: mocks.isEmpty ? 0 : 5, totalCompletions: mocks.isEmpty ? 0 : 40, completionRate: mocks.isEmpty ? 0 : 73.5 }) }), ...mocks }
} }))
vi.mock('@/hooks/use-share-card', () => ({ useShareCard: () => ({ captureRef: { current: null }, ...mocks }) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

import { ShareCardEntryButton } from '@/components/share/share-card-entry-button'

function openSheet() {
  fireEvent.click(screen.getByRole('button', { name: 'shareCard.entry' }))
}

describe('Share progress sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks(); rewardState.locale = ''; rewardState.stats = null; rewardState.isError = false
    Object.assign(mocks, { isLoading: false, isError: false, isEmpty: false, isSharing: false, hasError: false, canShareFiles: true, savedFileName: null })
  })

  it('fetches only after opening and restores the figures in the capture target', () => {
    render(<ShareCardEntryButton />)
    expect(mocks.wrapped).not.toHaveBeenCalled()
    openSheet()
    expect(screen.getByRole('dialog', { name: 'shareCard.title' })).toBeInTheDocument()
    expect(screen.getByTestId('share-card')).toHaveTextContent('shareCard.stats.activeDays')
    expect(screen.getByTestId('share-card')).toHaveTextContent('74%')
    expect(mocks.wrapped).toHaveBeenLastCalledWith('week', { enabled: true })
    fireEvent.click(screen.getByRole('radio', { name: 'shareCard.periods.month' }))
    expect(mocks.wrapped).toHaveBeenLastCalledWith('month', { enabled: true })
    expect(mocks.resetFeedback).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'close-overlay' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shares the current recap and downloads its image', () => {
    render(<ShareCardEntryButton />)
    openSheet()
    fireEvent.click(screen.getByRole('button', { name: 'shareCard.share' }))
    expect(mocks.share).toHaveBeenCalledWith({ shareTitle: 'shareCard.shareTitle', shareText: 'referral.share.neutral', url: createMockRecap().shareDeepLink })
    fireEvent.click(screen.getByRole('button', { name: 'shareCard.download' }))
    expect(mocks.download).toHaveBeenCalledOnce()
  })

  it.each(['isLoading', 'isError', 'isEmpty'] as const)('withholds export during %s', (state) => {
    mocks[state] = true
    render(<ShareCardEntryButton />)
    openSheet()
    expect(screen.queryByTestId('share-card')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'shareCard.download' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'shareCard.share' })).toBeDisabled()
    if (state === 'isError') {
      fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
      expect(mocks.refetch).toHaveBeenCalledOnce()
    }
    if (state === 'isEmpty') expect(screen.getByText('shareCard.empty')).toBeInTheDocument()
    if (state === 'isLoading') expect(screen.getByRole('progressbar', { name: 'shareCard.loading' })).toBeInTheDocument()
  })

  it('disables both exports and period changes while capturing', () => {
    mocks.isSharing = true
    render(<ShareCardEntryButton />)
    openSheet()
    for (const label of ['shareCard.download', 'shareCard.share']) {
      const button = screen.getByRole('button', { name: label })
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    expect(mocks.share).not.toHaveBeenCalled()
    expect(mocks.download).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: 'shareCard.periods.month' })).toBeDisabled()
  })

  it('keeps download available without native file sharing', () => {
    mocks.canShareFiles = false
    render(<ShareCardEntryButton />)
    openSheet()
    expect(screen.queryByRole('button', { name: 'shareCard.share' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'shareCard.download' })).toBeEnabled()
  })

  it('announces export errors and saved files persistently', () => {
    const view = render(<ShareCardEntryButton />)
    openSheet()
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    mocks.hasError = true
    view.rerender(<ShareCardEntryButton />)
    expect(screen.getByRole('alert')).toHaveTextContent('shareCard.shareError')
    mocks.hasError = false
    mocks.savedFileName = 'orbit-recap.png'
    view.rerender(<ShareCardEntryButton />)
    expect(screen.getByRole('status')).toHaveTextContent('shareCard.saved:orbit-recap.png')
  })
  it.each(referralCopyCases)('sends the exact approved $locale invitation for $stats.rewardType', ({ locale, stats, invitation }) => {
    rewardState.locale = locale
    rewardState.stats = stats
    render(<ShareCardEntryButton />)
    fireEvent.click(screen.getByRole('button', { name: (locale === 'en' ? en : ptBR).shareCard.entry }))
    expect(document.body.textContent).not.toContain(invitation)
    fireEvent.click(screen.getByRole('button', { name: (locale === 'en' ? en : ptBR).shareCard.share }))
    expect(mocks.share).toHaveBeenLastCalledWith({ shareTitle: (locale === 'en' ? en : ptBR).shareCard.shareTitle, shareText: invitation, url: createMockRecap().shareDeepLink })
  })

  it.each([false, true])('shares a neutral invitation while optional reward data is unavailable, error %s', (isError) => {
    rewardState.locale = 'en'
    rewardState.isError = isError
    render(<ShareCardEntryButton />)
    fireEvent.click(screen.getByRole('button', { name: en.shareCard.entry }))
    fireEvent.click(screen.getByRole('button', { name: en.shareCard.share }))
    expect(mocks.share).toHaveBeenLastCalledWith({ shareTitle: en.shareCard.shareTitle, shareText: 'Join me on Orbit.', url: createMockRecap().shareDeepLink })
    expect(screen.getByRole('button', { name: en.shareCard.download })).toBeEnabled()
  })

})
