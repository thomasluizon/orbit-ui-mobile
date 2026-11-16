import React from 'react'
import { StyleSheet, Text } from 'react-native'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { ConflictWarning as ConflictWarningType } from '@orbit/shared/types/chat'
import { ConflictWarning } from '@/components/chat/conflict-warning'
import { renderedText } from '../../support/react-test-renderer'
import { expectInsetHairlineRing } from '@/__tests__/support/inset-hairline-ring'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'

const TestRenderer = require('react-test-renderer')

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createTokensV2: () => new Proxy({}, {
      get: (_target, property) => property === 'statusBad' ? '#222222' : '#111111',
    }),
  }
})

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

function renderWarning(warning: ConflictWarningType): ReactTestRenderer {
  let tree: ReactTestRenderer | undefined
  TestRenderer.act(() => {
    tree = TestRenderer.create(<ConflictWarning warning={warning} />)
  })
  if (!tree) throw new Error('Conflict warning was not rendered')
  return tree
}

describe('ConflictWarning (mobile)', () => {
  it('keeps high-severity recommendation text at full-opacity readable size', () => {
    const warning: ConflictWarningType = {
      hasConflict: true,
      conflictingHabits: [],
      recommendation: 'Move this habit to Tuesday',
      severity: 'HIGH',
    }
    const tree = renderWarning(warning)
    const recommendation = tree.root
      .findAll((node: ReactTestInstance) => node.type === Text)
      .find((node) => renderedText(node.props.children) === warning.recommendation)
    if (!recommendation) throw new Error('Recommendation text was not rendered')

    expect(StyleSheet.flatten(recommendation.props.style)).toMatchObject({
      color: '#111111',
      fontSize: 12,
    })
    expect(StyleSheet.flatten(recommendation.props.style)).not.toHaveProperty('opacity')
    expect(tree.root.findAll((node) => node.props.size === 16 && node.props.color === '#222222'))
      .not.toHaveLength(0)
  })

  it('draws its hairline inside the edge, so the copy starts at the 16 by 12 padding of its web twin', () => {
    const warning: ConflictWarningType = {
      hasConflict: true,
      conflictingHabits: [],
      recommendation: 'Move this habit to Tuesday',
      severity: 'HIGH',
    }
    const tree = renderWarning(warning)
    const container = tree.root.findAll((node: ReactTestInstance) => String(node.type) === 'View')[0]!
    expectInsetHairlineRing(container.props.style as never, '#2222224D')
    const measured = measureProfileRow((tree as ReactTestRenderer & { toJSON: () => never }).toJSON(), 360, 1)
    const recommendation = measured.texts.find((text) => text.label === warning.recommendation)!
    expect({ left: recommendation.left, right: recommendation.right }).toEqual({ left: 16, right: 360 - 16 })
    const title = measured.texts.find((text) => text.label === 'chat.conflict.title')!
    expect(title.top, 'the title starts 12 dp below the top edge, under the 8 dp margin').toBe(8 + 12)
    expect(8 + measured.height - recommendation.bottom, 'the copy ends 12 dp above the bottom edge').toBeCloseTo(12, 5)
  })
})
