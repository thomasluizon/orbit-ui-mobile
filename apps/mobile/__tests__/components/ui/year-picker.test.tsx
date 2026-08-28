import React from 'react'
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
    let tree: ReturnType<typeof TestRenderer.create>

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <YearPicker
          selectedYear={2026}
          onSelectYear={vi.fn()}
          tokens={createTokensV2('orange', 'dark')}
        />,
      )
    })

    expect(tree!.root.findByProps({ testID: 'year-picker-scroll' }).props.nestedScrollEnabled).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith({ y: 144, animated: false })
  })
})
