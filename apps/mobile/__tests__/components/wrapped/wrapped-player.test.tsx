import React from 'react'
import { StyleSheet } from 'react-native'
import type { ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { buildWrappedSlides } from '@orbit/shared/utils'
import { WrappedPlayer } from '@/components/wrapped/wrapped-player'

const translationMock = vi.hoisted<{ labels: Record<string, string> }>(() => ({ labels: {} }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => translationMock.labels[key] ?? key,
  }),
}))

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

const tokens = {
  bg: '#111111',
  fg1: '#ffffff',
} as Parameters<typeof WrappedPlayer>[0]['tokens']

function renderPlayer() {
  const recap = createMockRecap()
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
    translationMock.labels = {}
    shareCardMock.isSharing = false
    shareCardMock.hasError = false
    shareCardMock.canShareFiles = true
    shareCardMock.share.mockReset()
    shareCardMock.download.mockReset()
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
    press(byTestId(tree, 'button-primary-md'))
    expect(byTestId(tree, 'wrapped-slide-completions')).toBeTruthy()
    press(byTestId(tree, 'button-ghost-md'))
    expect(byTestId(tree, 'wrapped-slide-intro')).toBeTruthy()
  })

  it('pages through the transparent tap zones', () => {
    const { tree } = renderPlayer()
    expect(byTestId(tree, 'wrapped-previous-zone')?.props.disabled).toBe(true)
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
    expect(byTestId(tree, 'button-primary-md')).toBeTruthy()
    expect(byTestId(tree, 'button-ghost-md')).toBeTruthy()
    expect(byTestId(tree, 'wrapped-next-zone')).toBeUndefined()
  })

  it.each([
    ['en', en],
    ['pt-BR', ptBR],
  ] as const)('keeps localized closing actions stacked beside Back in %s', (_locale, messages) => {
    translationMock.labels = {
      'wrapped.previous': messages.wrapped.previous,
      'shareCard.share': messages.shareCard.share,
      'shareCard.download': messages.shareCard.download,
    }
    const { slides, tree } = renderPlayer()
    advanceToLastSlide(tree, slides.length)

    const actions = byTestId(tree, 'wrapped-share-actions')
    expect(hasText(tree, messages.wrapped.previous)).toBe(true)
    expect(hasText(tree, messages.shareCard.share)).toBe(true)
    expect(hasText(tree, messages.shareCard.download)).toBe(true)
    expect(StyleSheet.flatten(actions?.props.style)).toMatchObject({
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: 8,
    })
    expect(
      hosts(tree).some((node) => {
        const style = StyleSheet.flatten(node.props.style) as Record<string, unknown> | undefined
        return style?.flexDirection === 'row'
          && style.justifyContent === 'space-between'
          && node.findAll((child) => child === actions).length > 0
          && node.findAll((child) => child.props.children === messages.wrapped.previous).length > 0
      }),
    ).toBe(true)
  })

  it('shows both final actions as busy while the card renders', () => {
    shareCardMock.isSharing = true
    const { slides, tree } = renderPlayer()
    advanceToLastSlide(tree, slides.length)

    expect(
      allByTestId(tree, 'button-primary-md').some(
        (node) => (node.props.accessibilityState as { busy?: boolean }).busy,
      ),
    ).toBe(true)
    expect(
      allByTestId(tree, 'button-ghost-md').some(
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
    expect(byTestId(tree, 'button-primary-md')).toBeTruthy()
    expect(allByTestId(tree, 'button-ghost-md')).toHaveLength(1)
  })

  it('hands the composed image to the platform share sheet', () => {
    const { slides, tree } = renderPlayer()
    advanceToLastSlide(tree, slides.length)
    press(byTestId(tree, 'button-primary-md'))

    expect(shareCardMock.share).toHaveBeenCalledWith({
      shareTitle: 'shareCard.shareTitle',
      shareText: 'shareCard.shareText',
      url: createMockRecap().shareDeepLink,
    })
  })
})
