import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  buildGoalTitle,
  isGoalDeadlinePast,
  parseGoalTargetValue,
} from '@orbit/shared/utils/goal-form'
import { CreateGoalFromHabitSheet } from '@/components/habits/create-goal-from-habit-sheet'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  showError: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/components/ui/date-field', () => ({
  DateField: () => React.createElement('DateField'),
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({
  BottomSheetAppTextInput: (props: Record<string, unknown>) =>
    React.createElement('BottomSheetAppTextInput', props),
}))
vi.mock('@/hooks/use-goals', () => ({
  useCreateGoal: () => ({ mutateAsync: mocks.mutateAsync, isPending: false, error: null }),
}))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: mocks.showError }),
}))

function flattenText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && 'props' in node) return flattenText((node as { props: { children?: unknown } }).props.children)
  return ''
}

describe('create goal from habit helpers', () => {
  it('parses numeric target values and rejects invalid input', () => {
    expect(parseGoalTargetValue('10')).toBe(10)
    expect(parseGoalTargetValue(' 10.5 ')).toBe(10.5)
    expect(parseGoalTargetValue('')).toBeNull()
    expect(parseGoalTargetValue('abc')).toBeNull()
  })

  it('builds a fallback title when description is empty', () => {
    expect(buildGoalTitle('', '10', 'km')).toBe('10 km')
    expect(buildGoalTitle('Run daily', '10', 'km')).toBe('Run daily')
  })

  it('detects deadlines in the past', () => {
    expect(isGoalDeadlinePast('2025-06-14', '2025-06-15')).toBe(true)
    expect(isGoalDeadlinePast('2025-06-15', '2025-06-15')).toBe(false)
  })
})

describe('CreateGoalFromHabitSheet (mobile)', () => {
  it('pins Cancel and Create in the sheet footer, never in the scrolling body', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CreateGoalFromHabitSheet open onClose={vi.fn()} />)
    })
    const slotText = (slot: string) => tree.root.findAll((node: any) => node.type === slot)[0]
      .findAll((node: any) => node.type === 'Text')
      .map(flattenText)

    expect(slotText('SheetActions')).toEqual(['common.cancel', 'goals.create'])
    expect(slotText('SheetBody')).not.toContain('common.cancel')
    expect(slotText('SheetBody')).not.toContain('goals.create')
  })
})
