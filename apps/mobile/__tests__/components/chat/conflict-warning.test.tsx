import React from 'react'
import { StyleSheet, Text } from 'react-native'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { ConflictWarning as ConflictWarningType } from '@orbit/shared/types/chat'
import { ConflictWarning } from '@/components/chat/conflict-warning'
import { renderedText } from '../../support/react-test-renderer'

const TestRenderer = require('react-test-renderer')

vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return {
    ...actual,
    createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
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
  })
})
