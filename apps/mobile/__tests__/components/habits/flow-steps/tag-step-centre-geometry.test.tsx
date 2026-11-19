import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { buildTags, resetTagStepState, tagStepState, TagStepHarness } from './tag-step-harness'

const HEIGHT = 915
let tree: GeometryTree | null = null
afterEach(async () => { if (tree) await act(() => tree!.unmount()); tree = null })

const cases = [320, 360, 384, 412].flatMap((width) => (['en', 'pt-BR'] as const).flatMap((locale) => [0, 2].map((tagCount) => ({ width, locale, tagCount }))))

describe('tag step block on Android', () => {
  it.each(cases)('centres the block between the header and the primary action at $width px in $locale with $tagCount tags', async ({ width, locale, tagCount }) => {
    resetTagStepState()
    tagStepState.locale = locale
    tagStepState.tags = buildTags(['Saúde', 'Casa'].slice(0, tagCount))
    __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
    await act(() => { tree = create(<View style={{ width, height: HEIGHT }}><TagStepHarness onContinue={vi.fn()} /></View>) as GeometryTree })
    const boxes = measureSafeArea(tree!.toJSON(), (host) => host.type === 'ScrollView' ? 'free-area' : host.props.testID === 'question-flow-step-optional:tags' ? 'block' : undefined, { width, height: HEIGHT })
    const free = boxes.get('free-area')!
    const block = boxes.get('block')!
    expect(free.bottom - free.top).toBeGreaterThan(block.bottom - block.top)
    expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
  })
})
