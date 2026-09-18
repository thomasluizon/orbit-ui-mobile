import React from 'react'
import { StyleSheet } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetTestHostConfig,
  __setScrollToImpl,
} from '../../../test-mocks/react-native'
import { YearPicker } from '@/components/ui/year-picker'
import { createTokensV2 } from '@/lib/theme'

const TestRenderer = require('react-test-renderer')

describe('YearPicker (mobile)', () => {
  beforeEach(() => {
    __resetTestHostConfig()
  })

  it('enables nested scrolling and reveals the selected year beyond the first rows', () => {
    const scrollTo = vi.fn()
    __setScrollToImpl(scrollTo)
    const tokens = createTokensV2('orange', 'dark')
    let tree: ReturnType<typeof TestRenderer.create>

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <YearPicker
          selectedYear={2026}
          onSelectYear={vi.fn()}
          tokens={tokens}
        />,
      )
    })

    expect(tree!.root.findByProps({ testID: 'year-picker-scroll' }).props.nestedScrollEnabled).toBe(true)

    const selectedCell = tree!.root.findByProps({ accessibilityLabel: '2026' })
    const targetStyle = StyleSheet.flatten(selectedCell.props.style) as {
      height: number
      marginBottom: number
    }
    const renderedRowHeight = targetStyle.height + targetStyle.marginBottom

    expect(scrollTo).toHaveBeenCalledWith({ y: 3 * renderedRowHeight, animated: false })
    expect(targetStyle.height).toBe(44)

    const renderPill = selectedCell.props.children
    expect(renderPill).toBeTypeOf('function')

    const pill = renderPill({ pressed: false }) as React.ReactElement<{ style: unknown }>
    expect(StyleSheet.flatten(pill.props.style)).toMatchObject({
      height: 32,
      borderRadius: 16,
    })

    const pressedPill = renderPill({ pressed: true }) as React.ReactElement<{ style: unknown }>
    expect(StyleSheet.flatten(pressedPill.props.style)).toMatchObject({
      transform: [{ scale: 0.96 }],
    })

    const unselectedCell = tree!.root.findByProps({ accessibilityLabel: '2025' })
    const renderUnselectedPill = unselectedCell.props.children
    const pressedUnselectedPill = renderUnselectedPill({ pressed: true }) as React.ReactElement<{
      style: unknown
    }>
    expect(StyleSheet.flatten(pressedUnselectedPill.props.style)).toMatchObject({
      backgroundColor: tokens.bgHover,
      transform: [{ scale: 0.96 }],
    })
  })
})
