import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockProfile, createMockRecap } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { motionDurations } from '@orbit/shared/theme'
import { buildWrappedSlides } from '@orbit/shared/utils'

vi.mock('@/hooks/use-referral', () => ({ useReferral: () => ({ stats: { rewardType: 'pro_days', proDaysPerReferral: 7, discountPercent: 23 } }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ weekStartDay: 1 }), isError: false, refetch: vi.fn() }) }))
vi.mock('@/components/share/share-card-qr', () => ({ ShareCardQr: () => null }))

const motionPreference = vi.hoisted(() => ({ reduced: false }))
vi.mock('motion/react', async (original) => ({ ...await original<typeof import('motion/react')>(), useReducedMotion: () => motionPreference.reduced }))

const shareCard = vi.hoisted(() => ({ isSharing: false, hasError: false, savedFileName: null, canShareFiles: true, share: vi.fn(), download: vi.fn(), resetFeedback: vi.fn() }))
vi.mock('@/hooks/use-share-card', () => ({ useShareCard: () => ({ captureRef: { current: null }, ...shareCard }) }))

import { WrappedPlayer } from '@/app/(app)/wrapped/_components/wrapped-player'

const LOCALES = [{ locale: 'pt-BR', messages: ptBR }, { locale: 'en', messages: en }] as const
const SLIDE_KINDS = ['intro', 'completions', 'activeDays', 'consistency', 'streak', 'topHabit', 'goals', 'share'] as const
const recap = createMockRecap()
const slides = buildWrappedSlides(recap)

function stubReducedMotion(reduced: boolean) {
  motionPreference.reduced = reduced
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('prefers-reduced-motion'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}

function renderPlayer(locale: (typeof LOCALES)[number] = LOCALES[0]) {
  const view = render(
    <NextIntlClientProvider locale={locale.locale} messages={locale.messages}>
      <WrappedPlayer slides={slides} recap={recap} period="week" onClose={vi.fn()} />
    </NextIntlClientProvider>,
  )
  const copy = locale.messages.wrapped
  const progress = (current: number) => copy.progressLabel.replace('{current}', String(current)).replace('{total}', String(slides.length))
  return { ...view, copy, progress }
}

const next = (copy: typeof ptBR.wrapped | typeof en.wrapped) => fireEvent.click(screen.getByRole('button', { name: copy.next }))
const travelDuration = () => screen.getByTestId('wrapped-slide-travel').getAttribute('data-slide-duration')

function slideTexts(copy: typeof ptBR.wrapped) {
  const texts: Record<string, string | null> = {}
  for (const kind of SLIDE_KINDS) {
    texts[kind] = screen.getByTestId(`wrapped-slide-${kind}`).textContent
    if (kind !== 'share') next(copy)
  }
  return texts
}

beforeEach(() => {
  motionPreference.reduced = false
  shareCard.share.mockReset()
  shareCard.download.mockReset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the guided Wrapped player on web', () => {
  it('builds the eight slide kinds from the fixed recap', () => {
    expect(slides.map((slide) => slide.id)).toEqual([...SLIDE_KINDS])
  })

  it.each(LOCALES)('moves one slide for next and previous, and the progress label follows in $locale', (locale) => {
    enableTestFlags('orbit_guided_flows')
    const { copy, progress } = renderPlayer(locale)

    expect(screen.getByLabelText(progress(1))).toBeInTheDocument()
    expect(screen.getByTestId('wrapped-slide-intro')).toBeInTheDocument()
    next(copy)
    expect(screen.getByLabelText(progress(2))).toBeInTheDocument()
    expect(screen.getByTestId('wrapped-slide-completions')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: copy.previous }))
    expect(screen.getByLabelText(progress(1))).toBeInTheDocument()
    expect(screen.getByTestId('wrapped-slide-intro')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: copy.close })).toBeInTheDocument()
  })

  it('keeps the first slide still, then shifts and fades each slide change for the route duration', () => {
    enableTestFlags('orbit_guided_flows')
    stubReducedMotion(false)
    const { copy } = renderPlayer()

    expect(travelDuration()).toBe(String(motionDurations.instant))
    next(copy)
    expect(travelDuration()).toBe(String(motionDurations.route))
    fireEvent.click(screen.getByRole('button', { name: copy.previous }))
    expect(travelDuration()).toBe(String(motionDurations.route))
  })

  it('keeps every slide still under reduced motion: no slide travel, no part rise and no running Orbit loop', () => {
    enableTestFlags('orbit_guided_flows')
    stubReducedMotion(true)
    const { copy, container } = renderPlayer()

    for (const kind of SLIDE_KINDS) {
      expect(screen.getByTestId(`wrapped-slide-${kind}`)).toBeInTheDocument()
      expect(travelDuration()).toBe(String(motionDurations.instant))
      for (const part of screen.getAllByTestId('wrapped-motion-part')) expect(part.style.transform).not.toContain('translate')
      for (const orbit of container.querySelectorAll('svg[data-asset="orbit-mascot"]')) expect(orbit).toHaveAttribute('data-orbit-loop', 'still')
      if (kind !== 'share') next(copy)
    }
  })

  it('renders the same text and figures on each of the eight slides as the current player', () => {
    const current = renderPlayer()
    const currentTexts = slideTexts(current.copy)
    expect(currentTexts.completions).toContain(String(recap.metrics.totalCompletions))
    current.unmount()

    enableTestFlags('orbit_guided_flows')
    const guided = renderPlayer()
    expect(slideTexts(guided.copy)).toEqual(currentTexts)
  })

  it.each(LOCALES)('shows Orbit in Feliz on the last slide, and share and download call the current adapters in $locale', (locale) => {
    enableTestFlags('orbit_guided_flows')
    const { copy, container } = renderPlayer(locale)
    for (let step = 1; step < slides.length; step += 1) next(copy)

    const slide = screen.getByTestId('wrapped-slide-share')
    const rigs = slide.querySelectorAll('svg[data-asset="orbit-mascot"][data-orbit-face="rig"]')
    expect(rigs).toHaveLength(1)
    expect(rigs[0]).toHaveAttribute('data-orbit-state', 'feliz')
    expect(rigs[0]).toHaveAttribute('width', '96')
    expect(container.querySelectorAll('svg[data-orbit-loop="running"]').length).toBeLessThanOrEqual(1)

    const card = screen.getByTestId('share-card')
    expect(card.querySelectorAll('svg[data-asset="orbit-mascot"]')).toHaveLength(1)
    expect(card.querySelector('svg[data-asset="orbit-mascot"]')).toHaveAttribute('data-orbit-face', 'small')
    expect(card.querySelector('svg[data-asset="orbit-mascot"]')).toHaveAttribute('data-orbit-loop', 'still')

    fireEvent.click(screen.getByRole('button', { name: locale.messages.shareCard.share }))
    expect(shareCard.share).toHaveBeenCalledWith(expect.objectContaining({ shareTitle: locale.messages.shareCard.shareTitle, url: recap.shareDeepLink }))
    fireEvent.click(screen.getByRole('button', { name: locale.messages.shareCard.download }))
    expect(shareCard.download).toHaveBeenCalledTimes(1)
  })

  it('renders the current player with the flag off: no slide travel and no Orbit in Feliz on the last slide', () => {
    const { copy, container } = renderPlayer()

    expect(screen.queryByTestId('wrapped-slide-travel')).not.toBeInTheDocument()
    for (let step = 1; step < slides.length; step += 1) next(copy)
    expect(screen.getByTestId('wrapped-slide-share')).toBeInTheDocument()
    expect(container.querySelector('[data-orbit-state="feliz"]')).toBeNull()
  })
})
