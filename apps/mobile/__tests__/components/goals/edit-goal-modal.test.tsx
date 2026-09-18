import React, { useImperativeHandle } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import {
  buildGoalTitle,
  isGoalDeadlinePast,
  parseGoalTargetValue,
} from '@orbit/shared/utils/goal-form'
import { EditGoalDeadlineField } from '@/components/goals/edit-goal-modal/edit-goal-deadline-field'
import { EditGoalModal } from '@/components/goals/edit-goal-modal'
import { createStyles } from '@/components/goals/edit-goal-modal/styles'
import { createTokensV2 } from '@/lib/theme'

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

function renderModal() {
  let tree: any
  TestRenderer.act(() => { tree = TestRenderer.create(<EditGoalModal open onClose={vi.fn()} goal={goal} />) })
  const input = (label: string) => tree.root.findAll((node: any) => node.type === 'BottomSheetAppTextInput' && node.props.accessibilityLabel === label)[0]
  const save = () => tree.root.findAll((node: any) => typeof node.props.onPress === 'function' && flattenText(node) === 'common.save')[0]
  return { tree, input, save }
}

describe('EditGoalModal helpers', () => {
  beforeEach(() => {
    mocks.focus.mockReset()
    mocks.mutateAsync.mockReset()
    mocks.showError.mockReset()
  })

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

  it.each(['dark', 'light'] as const)('keeps the remove-deadline graphic visible on the sheet in %s', (mode) => {
    const tokens = createTokensV2('purple', mode)
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <EditGoalDeadlineField
          tokens={tokens}
          styles={createStyles(tokens, 0)}
          deadline="2026-10-01"
          onChangeDeadline={vi.fn()}
        />,
      )
    })
    const removeIcon = tree!.root.findByType('X')

    expect(contrastOnSurface(removeIcon.props.color as string, [tokens.bgElev]))
      .toBeGreaterThanOrEqual(3)
  })

  it('announces required fields without marking the optional description required', () => {
    const { input } = renderModal()

    expect(input('goals.form.description').props.accessibilityHint).toBeUndefined()
    expect(input('goals.form.targetValue').props.accessibilityHint).toBe('common.required')
    expect(input('goals.form.unit').props.accessibilityHint).toBe('common.required')
  })

  it('associates every inline error and focuses each first remaining invalid field', async () => {
    const { tree, input, save } = renderModal()
    await TestRenderer.act(() => {
      input('goals.form.description').props.onChangeText('')
      input('goals.form.targetValue').props.onChangeText('')
      input('goals.form.unit').props.onChangeText('')
    })

    await TestRenderer.act(() => save().props.onPress())

    expect(mocks.focus).toHaveBeenLastCalledWith('goals.form.targetValue', 'common.required. goals.form.targetValueRequired')
    expect(mocks.showError).toHaveBeenLastCalledWith('goals.form.targetValueRequired')
    expect(input('goals.form.description').props.accessibilityHint).toBeUndefined()
    expect(input('goals.form.targetValue').props.accessibilityHint).toContain('goals.form.targetValueRequired')
    expect(input('goals.form.unit').props.accessibilityHint).toContain('goals.form.unitRequired')
    expect(tree.root.findAll((node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'alert')).toHaveLength(0)

    await TestRenderer.act(() => {
      input('goals.form.targetValue').props.onChangeText('10')
    })
    await TestRenderer.act(() => save().props.onPress())

    expect(mocks.focus).toHaveBeenLastCalledWith('goals.form.unit', 'common.required. goals.form.unitRequired')
    mocks.mutateAsync.mockResolvedValueOnce(undefined)
    await TestRenderer.act(() => {
      input('goals.form.unit').props.onChangeText('km')
    })
    await TestRenderer.act(async () => {
      save().props.onPress()
      await Promise.resolve()
    })
    expect(mocks.mutateAsync).toHaveBeenCalledOnce()
  })
})
