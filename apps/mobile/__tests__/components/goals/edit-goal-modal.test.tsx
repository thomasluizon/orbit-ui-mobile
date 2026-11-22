import { createApiClientError } from '@orbit/shared/utils'
import { sheetTestControls } from '@/__tests__/support/sheet-double'
import React, { useImperativeHandle } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import {
  buildGoalTitle,
  isGoalDeadlinePast,
  parseGoalTargetValue,
} from '@orbit/shared/utils/goal-form'
import { EditGoalModal } from '@/components/goals/edit-goal-modal'
import { createTokensV2 } from '@/lib/theme'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

const TestRenderer = require('react-test-renderer')

const mocks = vi.hoisted(() => ({
  focus: vi.fn(),
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
  BottomSheetAppTextInput: React.forwardRef(function Input(props: Record<string, unknown>, ref) {
    useImperativeHandle(ref, () => ({ focus: () => mocks.focus(props.accessibilityLabel, props.accessibilityHint) }))
    return React.createElement('BottomSheetAppTextInput', props)
  }),
}))
vi.mock('@/hooks/use-goals', () => ({
  useUpdateGoal: () => ({ mutateAsync: mocks.mutateAsync, isPending: false, error: null }),
}))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: mocks.showError }),
}))

const goal = {
  id: 'g1',
  title: 'Run 100km',
  targetValue: 100,
  unit: 'km',
  deadline: '2026-12-31',
  type: 'Standard',
}

function flattenText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && 'props' in node) return flattenText((node as { props: { children?: unknown } }).props.children)
  return ''
}

function renderModal(onClose = vi.fn()) {
  let tree: any
  TestRenderer.act(() => { tree = TestRenderer.create(<EditGoalModal open onClose={onClose} goal={goal} />) })
  const input = (label: string) => tree.root.findAll((node: any) => node.type === 'BottomSheetAppTextInput' && node.props.accessibilityLabel === label)[0]
  const save = () => tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityRole === 'button' && flattenText(node) === 'common.save')[0]
  return { tree, input, save }
}

beforeEach(() => {
  mocks.focus.mockReset()
  mocks.mutateAsync.mockReset()
  mocks.showError.mockReset()
})

describe('EditGoalModal helpers', () => {

  it('keeps the written description when editing a goal', () => {
    expect(buildGoalTitle('Run daily', '12', 'km')).toBe('Run daily')
  })

  it('normalizes edited numeric values', () => {
    expect(parseGoalTargetValue('12')).toBe(12)
    expect(parseGoalTargetValue(' 12 ')).toBe(12)
  })

  it('treats future deadlines as valid', () => {
    expect(isGoalDeadlinePast('2025-06-16', '2025-06-15')).toBe(false)
  })
})
