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
    const targetStyle = StyleSheet.flatten(selectedCell.props.style({ pressed: false })) as {
      height: number
      marginBottom: number
    }
    const renderedRowHeight = targetStyle.height + targetStyle.marginBottom

    expect(scrollTo).toHaveBeenCalledWith({ y: 3 * renderedRowHeight, animated: false })
    expect(targetStyle.height).toBe(44)

    expect(StyleSheet.flatten(selectedCell.props.style({ pressed: false }))).toMatchObject({
      height: 44,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: tokens.primary,
    })

    expect(StyleSheet.flatten(selectedCell.props.style({ pressed: true }))).toMatchObject({
      backgroundColor: tokens.primaryPressed,
      transform: [{ scale: 0.96 }],
    })

    const unselectedCell = tree!.root.findByProps({ accessibilityLabel: '2025' })
    expect(StyleSheet.flatten(unselectedCell.props.style({ pressed: true }))).toMatchObject({
      backgroundColor: tokens.bgHover,
      transform: [{ scale: 0.96 }],
    })
  })
})
