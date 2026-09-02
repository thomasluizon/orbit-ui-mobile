import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { HabitLogButton } from '@/components/habits/habit-log-button'

const TestRenderer = require('react-test-renderer')

vi.mock('@/components/ui/progress-ring', () => ({
  ProgressRing: ({ value }: { value: number }) => React.createElement('ProgressRing', { value }),
}))

vi.mock('@/components/ui/status-ring', () => ({
  StatusRing: ({ status }: { status: string }) => React.createElement('StatusRing', { status }),
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => ({ bgElevPressed: '#222222' }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

describe('HabitLogButton (mobile)', () => {
  it('announces the log action, shows the empty state, and accepts the action', () => {
    const onPress = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitLogButton label="Log Read" logged={false} onPress={onPress} />,
      )
    })

    const button = tree!.root.findByProps({ accessibilityLabel: 'Log Read' })
    TestRenderer.act(() => {
      button.props.onPress()
    })

    expect(tree!.root.findByType('StatusRing').props.status).toBe('empty')
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('shows visible partial progress until the habit is complete', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitLogButton label="Log Read" logged={false} completed={false} progress={0.5} onPress={vi.fn()} />,
      )
    })

    expect(tree!.root.findByType('ProgressRing').props.value).toBe(0.5)

    TestRenderer.act(() => {
      tree!.update(
        <HabitLogButton label="Unlog Read" logged completed progress={1} onPress={vi.fn()} />,
      )
    })
    expect(tree!.root.findByProps({ accessibilityLabel: 'Unlog Read' })).toBeDefined()
    expect(tree!.root.findByType('StatusRing').props.status).toBe('done')
  })
})
