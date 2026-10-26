import { referralCopyCases } from '@orbit/shared/__tests__/referral-copy-fixtures'
import { createInstance } from 'i18next'
import ICUCommonJs from 'i18next-icu/cjs'
import React from 'react'
import { StyleSheet, type ViewStyle } from 'react-native'
import type { ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile, createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { buildWrappedSlides, formatClosedWrappedMonth } from '@orbit/shared/utils'
import { WrappedPlayer } from '@/components/wrapped/wrapped-player'
import { expectPressFill } from '@/__tests__/support/press-feedback'
import { createTokensV2 } from '@/lib/theme'

const profileState = vi.hoisted(() => ({ available: true }))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: profileState.available ? createMockProfile({ weekStartDay: 1 }) : undefined }),
}))

const translationMock = vi.hoisted<{ labels: Record<string, string>; locale: string }>(() => ({ labels: {}, locale: '' }))
const rewardState = vi.hoisted<{ stats: { rewardType?: string; proDaysPerReferral?: number; discountPercent?: number } | null; isError: boolean }>(() => ({ stats: { rewardType: 'pro_days', proDaysPerReferral: 7, discountPercent: 23 }, isError: false }))
vi.mock('@/hooks/use-referral', () => ({ useReferral: () => rewardState }))

const testI18n = createInstance()
const ICU = typeof ICUCommonJs === 'function' ? ICUCommonJs : ICUCommonJs.default
void testI18n.use(ICU).init({ resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } }, lng: 'en', fallbackLng: 'en', initAsync: false })
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => translationMock.locale ? testI18n.getFixedT(translationMock.locale)(key, params) : translationMock.labels[key] ?? key, i18n: { language: translationMock.locale || 'en' } }) }))

vi.mock('react-native-gesture-handler', () => {
  const GestureDetector = ({ children }: Readonly<{ children?: React.ReactNode }>) => children
  function Pan() {
    const gesture = {
      activeOffsetY: () => gesture,
      failOffsetY: () => gesture,
      onEnd: () => gesture,
    }
    return gesture
  }
  return { Gesture: { Pan }, GestureDetector }
})

vi.mock('@/components/wrapped/wrapped-slide', () => ({
  WrappedSlide: ({ slide }: Readonly<{ slide: { id: string } }>) =>
    React.createElement('WrappedSlide', { testID: `wrapped-slide-${slide.id}` }),
}))

const shareCardMock = vi.hoisted(() => ({
  isSharing: false,
  hasError: false,
  canShareFiles: true,
  share: vi.fn(),
  download: vi.fn(),
}))

vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({
    shareRef: { current: null },
    ...shareCardMock,
  }),
}))

vi.mock('@/hooks/use-wrapped', () => ({
  useWrappedStory: (count: number) => {
    const [index, setIndex] = React.useState(0)
    return {
      index,
      isFirst: index === 0,
      isLast: index === count - 1,
      next: () => setIndex((current) => Math.min(current + 1, count - 1)),
      prev: () => setIndex((current) => Math.max(current - 1, 0)),
    }
  },
}))

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')

const tokens = createTokensV2('purple', 'dark')

function renderPlayer(recap = createMockRecap()) {
  const slides = buildWrappedSlides(recap)
  let tree!: ReactTestRenderer
  void renderer.act(() => {
    tree = renderer.create(
      <WrappedPlayer
        slides={slides}
        recap={recap}
        period="week"
        tokens={tokens}
        onClose={vi.fn()}
      />,
    )
  })
  return { slides, tree }
}

function hosts(tree: ReactTestRenderer) {
  return tree.root.findAll((node) => typeof node.type === 'string')
}

describe('Wrapped close target', () => {
  it('paints the complete 44px target without invisible hit slop', () => {
    const { tree } = renderPlayer()
    expectPressFill(tree, 'wrapped.close', tokens.bgHover, 999)
  })
})

function byTestId(tree: ReactTestRenderer, testID: string) {
  return hosts(tree).find((node) => node.props.testID === testID)
}

function allByTestId(tree: ReactTestRenderer, testID: string) {
  return hosts(tree).filter((node) => node.props.testID === testID)
}

function press(node: ReturnType<typeof byTestId>) {
  if (!node) throw new Error('Expected button')
  void renderer.act(() => (node.props as { onPress?: () => void }).onPress?.())
}

function hasText(tree: ReactTestRenderer, text: string) {
  return hosts(tree).some((node) => String(node.type) === 'Text' && node.props.children === text)
}

function advanceToLastSlide(tree: ReactTestRenderer, slideCount: number) {
  for (let index = 1; index < slideCount; index += 1) {
    press(byTestId(tree, 'wrapped-next-zone'))
  }
}

describe('WrappedPlayer', () => {
  beforeEach(() => {
    profileState.available = true
    translationMock.labels = {}; translationMock.locale = ''; rewardState.stats = { rewardType: 'pro_days', proDaysPerReferral: 7, discountPercent: 23 }; rewardState.isError = false
    shareCardMock.isSharing = false
    shareCardMock.hasError = false
    shareCardMock.canShareFiles = true
    shareCardMock.share.mockReset()
    shareCardMock.download.mockReset()
  })

  it('keeps pending weekday content reachable without page tap zones and retains the pager', () => {
    profileState.available = false
    const { tree } = renderPlayer()
    for (let index = 0; index < 3; index += 1) {
      const next = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'wrapped-next-zone')[0]!
      void renderer.act(() => (next.props.onPress as () => void)())
    }
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'wrapped-slide-consistency')).toHaveLength(1)
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'wrapped-next-zone')).toHaveLength(0)
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'wrapped-previous-zone')).toHaveLength(0)
    const next = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'wrapped.next')[0]!
    void renderer.act(() => (next.props.onPress as () => void)())
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'wrapped-slide-streak')).toHaveLength(1)
    void renderer.act(() => tree.update(<></>))
  })

  it('shows the month header before close and formats a closed month', () => {
    const recap = createMockRecap()
    const slides = buildWrappedSlides(recap)
    let tree!: ReactTestRenderer
    void renderer.act(() => {
      tree = renderer.create(<WrappedPlayer slides={slides} recap={recap} period="month" tokens={tokens} onClose={vi.fn()} />)
    })
    const pageHosts = hosts(tree)
    const eyebrowIndex = pageHosts.findIndex((node) => node.props.children === 'wrapped.player.eyebrow.month')
    const windowIndex = pageHosts.findIndex((node) => node.props.children === 'wrapped.player.window.month')
    const closeIndex = pageHosts.findIndex((node) => node.props.accessibilityLabel === 'wrapped.close')
    expect(eyebrowIndex).toBeGreaterThanOrEqual(0)
    expect(windowIndex).toBeGreaterThan(eyebrowIndex)
    expect(closeIndex).toBeGreaterThan(windowIndex)
    void renderer.act(() => {
      tree.update(<WrappedPlayer slides={slides} recap={recap} period="month" closedMonth={{ year: 2026, month: 8 }} tokens={tokens} onClose={vi.fn()} />)
    })
    expect(hasText(tree, formatClosedWrappedMonth({ year: 2026, month: 8 }, 'en'))).toBe(true)
  })

  it('keeps the header and pager outside the scrolling page through the share slide', () => {
    const { slides, tree } = renderPlayer()
    for (let index = 0; index < slides.length; index += 1) {
      const scroller = byTestId(tree, 'wrapped-page-scroll')!
      expect(scroller.findAll((node) => node.props.testID === 'wrapped-header')).toHaveLength(0)
      expect(scroller.findAll((node) => node.props.testID === 'wrapped-pager')).toHaveLength(0)
      expect(byTestId(tree, 'wrapped-header')).toBeTruthy()
      expect(byTestId(tree, 'wrapped-pager')).toBeTruthy()
      if (index < slides.length - 1) press(byTestId(tree, 'wrapped-next-zone'))
    }
  })

  it('puts one segment per slide in the foot Pager', () => {
    const { slides, tree } = renderPlayer()
    const playerHosts = hosts(tree)
    expect(playerHosts.filter((node) => String(node.props.testID).startsWith('pager-segment-'))).toHaveLength(slides.length)
    expect(playerHosts.filter((node) => String(node.props.testID).startsWith('pager-segment-'))).toHaveLength(8)
    expect(playerHosts.indexOf(byTestId(tree, 'wrapped-slide-intro')!)).toBeLessThan(
      playerHosts.indexOf(byTestId(tree, 'wrapped-pager')!),
    )
  })

  it('reports seven pages when the period has no top habit', () => {
    const recap = createMockRecap({
      metrics: createMockRetrospectiveMetrics({ topHabits: [] }),
    })
    const slides = buildWrappedSlides(recap)
    let tree!: ReactTestRenderer
    void renderer.act(() => {
      tree = renderer.create(
        <WrappedPlayer
          slides={slides}
          recap={recap}
          period="month"
          tokens={tokens}
          onClose={vi.fn()}
        />,
      )
    })

    expect(hosts(tree).filter((node) => String(node.props.testID).startsWith('pager-segment-'))).toHaveLength(7)
  })

  it('pages forward and back through the Pager controls', () => {
    const { tree } = renderPlayer()
    press(hosts(tree).find((node) => node.props.accessibilityLabel === 'wrapped.next'))
    expect(byTestId(tree, 'wrapped-slide-completions')).toBeTruthy()
    press(hosts(tree).find((node) => node.props.accessibilityLabel === (translationMock.labels['wrapped.previous'] ?? 'wrapped.previous')))
    expect(byTestId(tree, 'wrapped-slide-intro')).toBeTruthy()
  })

  it.each([
    ['en', en, 'Back', 'Continue'],
    ['pt-BR', ptBR, 'Voltar', 'Continuar'],
  ] as const)('uses the drawn accessible Pager labels in %s', (_locale, messages, back, forward) => {
    translationMock.labels = {
      'wrapped.previous': messages.wrapped.previous,
      'wrapped.next': messages.wrapped.next,
    }
    const { tree } = renderPlayer()
    expect(hosts(tree).some((node) => node.props.accessibilityLabel === back)).toBe(true)
    expect(hosts(tree).some((node) => node.props.accessibilityLabel === forward)).toBe(true)
    expect(byTestId(tree, 'button-ghost-sm')?.props.accessibilityState).toMatchObject({ disabled: true })
    press(hosts(tree).find((node) => node.props.accessibilityLabel === forward))
    expect(byTestId(tree, 'wrapped-slide-completions')).toBeTruthy()
    press(hosts(tree).find((node) => node.props.accessibilityLabel === (translationMock.labels['wrapped.previous'] ?? 'wrapped.previous')))
    expect(byTestId(tree, 'wrapped-slide-intro')).toBeTruthy()
  })

  it('pages through the transparent tap zones', () => {
    const { tree } = renderPlayer()
    expect(byTestId(tree, 'wrapped-previous-zone')?.props.disabled).toBe(true)
    for (const id of ['wrapped-previous-zone', 'wrapped-next-zone']) {
      const zone = byTestId(tree, id)!
      expect(zone.props.accessible).toBe(false)
      expect(zone.props.focusable).toBe(false)
      expect(hosts(tree).some((node) =>
        node.props.importantForAccessibility === 'no-hide-descendants'
        && node.findAll((child) => child === zone).length > 0,
      )).toBe(true)
    }
    press(byTestId(tree, 'wrapped-next-zone'))
    expect(byTestId(tree, 'wrapped-slide-completions')).toBeTruthy()
    press(byTestId(tree, 'wrapped-previous-zone'))
    expect(byTestId(tree, 'wrapped-slide-intro')).toBeTruthy()
  })

  it('replaces the Pager forward control with share on the final slide', () => {
    const { slides, tree } = renderPlayer()
    advanceToLastSlide(tree, slides.length)
    expect(hasText(tree, 'wrapped.next')).toBe(false)
    expect(hasText(tree, 'shareCard.share')).toBe(true)
    expect(hasText(tree, 'shareCard.download')).toBe(true)
    expect(byTestId(tree, 'button-primary-sm')).toBeTruthy()
    expect(byTestId(tree, 'button-ghost-sm')).toBeTruthy()
    expect(byTestId(tree, 'wrapped-next-zone')).toBeUndefined()
  })

  it.each([
    ['en', en],
    ['pt-BR', ptBR],
  ] as const)('keeps localized closing actions in one trailing row in %s', (_locale, messages) => {
    translationMock.labels = {
      'wrapped.previous': messages.wrapped.previous,
      'shareCard.share': messages.shareCard.share,
      'shareCard.download': messages.shareCard.download,
    }
    const { slides, tree } = renderPlayer()
    advanceToLastSlide(tree, slides.length)
    const actions = byTestId(tree, 'action-row')!
    expect(StyleSheet.flatten(actions.props.style)).toMatchObject({
      flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 12,
    })
    const buttons = actions.findAll((node) => String(node.type) === 'Pressable')
    expect(buttons.map((button) => button.props.accessibilityLabel ?? button.findAll((node) => String(node.type) === 'Text')[0]?.props.children)).toEqual([
      messages.wrapped.previous, messages.shareCard.download, messages.shareCard.share,
    ])
    expect(buttons.map((button) => button.props.testID)).toEqual(['button-ghost-sm', 'button-ghost-sm', 'button-primary-sm'])
    expect(buttons.map((button) => button.findAll((node) => String(node.type) === 'Text')[0]?.props.children)).toEqual([
      messages.wrapped.previous, messages.shareCard.download, messages.shareCard.share,
    ])
    expect(buttons.map((button) => StyleSheet.flatten((button.props.style as (state: { pressed: boolean }) => ViewStyle[])({ pressed: false })).height)).toEqual([44, 44, 44])
  })

  it('shows both final actions as busy while the card renders', () => {
    shareCardMock.isSharing = true
    const { slides, tree } = renderPlayer()
    advanceToLastSlide(tree, slides.length)

    expect(
      allByTestId(tree, 'button-primary-sm').some(
        (node) => (node.props.accessibilityState as { busy?: boolean }).busy,
      ),
    ).toBe(true)
    expect(
      allByTestId(tree, 'button-ghost-sm').some(
        (node) => (node.props.accessibilityState as { busy?: boolean }).busy,
      ),
    ).toBe(true)
  })

  it('makes download the primary action when native sharing is unsupported', () => {
    shareCardMock.canShareFiles = false
    const { slides, tree } = renderPlayer()
    advanceToLastSlide(tree, slides.length)

    expect(hasText(tree, 'shareCard.share')).toBe(false)
    expect(hasText(tree, 'shareCard.download')).toBe(true)
    expect(byTestId(tree, 'button-primary-sm')).toBeTruthy()
    expect(allByTestId(tree, 'button-ghost-sm')).toHaveLength(1)
  })

  it('hands the composed image to the platform share sheet', () => {
    const { slides, tree } = renderPlayer()
    advanceToLastSlide(tree, slides.length)
    press(byTestId(tree, 'button-primary-sm'))

    expect(shareCardMock.share).toHaveBeenCalledWith({
      shareTitle: 'shareCard.shareTitle',
      shareText: 'referral.share.proDays',
      url: createMockRecap().shareDeepLink,
    })
  })
  it.each(['en', 'pt-BR'])('sends the approved invitation with the original recap link in %s', (locale) => {
    translationMock.locale = locale
    const { slides, tree } = renderPlayer()
    advanceToLastSlide(tree, slides.length)
    press(byTestId(tree, 'button-primary-sm'))
    expect(shareCardMock.share).toHaveBeenCalledWith(expect.objectContaining({ shareText: expect.stringContaining(locale === 'en' ? 'I can earn 7 days of Pro.' : 'Eu posso ganhar 7 dias de Pro.'), url: createMockRecap().shareDeepLink }))
  })

  it.each(referralCopyCases)('shares exact $locale $stats.rewardType copy using the matching amount', ({ locale, stats, invitation }) => {
    translationMock.locale = locale
    rewardState.stats = stats
    const recap = createMockRecap({ shareDeepLink: 'https://app.useorbit.org/r/RECAP?recap=month&year=2025&month=4' })
    const { slides, tree } = renderPlayer(recap)
    advanceToLastSlide(tree, slides.length)
    expect(hasText(tree, invitation)).toBe(false)
    press(byTestId(tree, 'button-primary-sm'))
    expect(shareCardMock.share).toHaveBeenLastCalledWith({ shareTitle: (locale === 'en' ? en : ptBR).shareCard.shareTitle, shareText: invitation, url: recap.shareDeepLink })
    void renderer.act(() => tree.update(<></>))
  })

  it.each([null, { rewardType: 'future_reward', proDaysPerReferral: 11, discountPercent: 23 }, { rewardType: 'pro_days', discountPercent: 23 }, { discountPercent: 23 }])('keeps a valid recap share usable with neutral optional reward data %s', (stats) => {
    translationMock.locale = 'en'
    rewardState.stats = stats
    const { slides, tree } = renderPlayer()
    advanceToLastSlide(tree, slides.length)
    press(byTestId(tree, 'button-primary-sm'))
    expect(shareCardMock.share).toHaveBeenLastCalledWith({ shareTitle: en.shareCard.shareTitle, shareText: 'Join me on Orbit.', url: createMockRecap().shareDeepLink })
    expect(hasText(tree, en.shareCard.download)).toBe(true)
    void renderer.act(() => tree.update(<></>))
  })

  it('uses the neutral invitation after an optional reward request fails', () => {
    translationMock.locale = 'en'
    rewardState.isError = true
    const { slides, tree } = renderPlayer()
    advanceToLastSlide(tree, slides.length)
    press(byTestId(tree, 'button-primary-sm'))
    expect(shareCardMock.share).toHaveBeenLastCalledWith(expect.objectContaining({ shareText: 'Join me on Orbit.' }))
    void renderer.act(() => tree.update(<></>))
  })

})
