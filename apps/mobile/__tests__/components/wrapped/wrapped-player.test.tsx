import React from 'react'
import type { ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { buildWrappedSlides } from '@orbit/shared/utils'
import { WrappedPlayer } from '@/components/wrapped/wrapped-player'

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

vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({
    shareRef: { current: null },
    isSharing: false,
    hasError: false,
    share: vi.fn(),
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

function press(node: ReturnType<typeof byTestId>) {
  if (!node) throw new Error('Expected button')
  void renderer.act(() => (node.props as { onPress?: () => void }).onPress?.())
}

function hasText(tree: ReactTestRenderer, text: string) {
  return hosts(tree).some((node) => String(node.type) === 'Text' && node.props.children === text)
}

describe('WrappedPlayer', () => {
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
    for (let index = 1; index < slides.length; index += 1) {
      press(byTestId(tree, 'wrapped-next-zone'))
    }
    expect(hasText(tree, 'wrapped.next')).toBe(false)
    expect(hasText(tree, 'shareCard.share')).toBe(true)
    expect(byTestId(tree, 'wrapped-next-zone')).toBeUndefined()
  })
})
