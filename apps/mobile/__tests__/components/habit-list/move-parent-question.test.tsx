import React from 'react'
import type { ReactTestInstance } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { MoveParentDialog, type MoveParentOption } from '@/components/habit-list/move-parent-dialog'
import { sheetSlotButtons } from '@/__tests__/support/sheet-slots'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))

const option = (overrides: Partial<MoveParentOption>): MoveParentOption => ({ id: 'option', label: 'Option', emoji: null, depth: 0, childCount: 0, disabled: false, reason: null, ...overrides })
const destinations = [option({ id: null, label: 'habits.moveParent.toRoot' }), option({ id: 'parent', label: 'Parent' }), option({ id: 'other', label: 'Other' })]

function renderDialog(overrides: Partial<Parameters<typeof MoveParentDialog>[0]> = {}) {
  const props = {
    t: (key: string) => key, visible: true, isPending: false, movingHabitTitle: 'Exercise' as string | null, movingHabitParentId: 'parent',
    options: destinations, selectedMoveParentId: null, canSubmit: true, onClose: vi.fn(), onConfirm: vi.fn(), onSelectOption: vi.fn(), ...overrides,
  }
  let tree!: ReturnType<typeof TestRenderer.create>
  void TestRenderer.act(() => { tree = TestRenderer.create(<MoveParentDialog {...props} />) })
  return { tree, props }
}
const sheetTitle = (tree: ReturnType<typeof TestRenderer.create>) => tree.root.findAll((node) => String(node.type) === 'Sheet')[0]!.props.title as string
const questionLabels = (tree: ReturnType<typeof TestRenderer.create>) => tree.root.findAll((node) => String(node.type) === 'Text' && node.props.importantForAccessibility === 'no-hide-descendants' && node.props.children === 'habits.moveParent.destinations')
const radios = (tree: ReturnType<typeof TestRenderer.create>): ReactTestInstance[] => tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio')

describe('Android move-parent dialog as one question', () => {
  it('asks where the habit goes as the sheet title, once, with the destinations as the options', () => {
    enableTestFlags('orbit_guided_flows')
    const { tree, props } = renderDialog()
    expect(sheetTitle(tree)).toBe('habits.moveParent.destinations')
    expect(questionLabels(tree)).toHaveLength(0)
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'radiogroup' && node.props.accessibilityLabel === 'habits.moveParent.destinations').length).toBeGreaterThan(0)
    expect(radios(tree)).toHaveLength(3)
    void TestRenderer.act(() => { (radios(tree)[2]!.props.onPress as () => void)() })
    expect(props.onSelectOption).toHaveBeenCalledWith('other')
    expect(tree.root.findAll((node) => node.props.testID === 'orbit-mascot')).toHaveLength(0)
  })

  it('keeps the confirm action and the cancel action', () => {
    enableTestFlags('orbit_guided_flows')
    const { tree } = renderDialog({ selectedMoveParentId: 'other' })
    expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual(['common.cancel', 'habits.moveParent.confirm'])
  })

  it('names the group of habits under the question for a bulk move', () => {
    enableTestFlags('orbit_guided_flows')
    const { tree } = renderDialog({ movingHabitTitle: null, movingHabitCount: 3 })
    expect(sheetTitle(tree)).toBe('habits.moveParent.destinations')
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'move-parent-subject')[0]!.props.children).toBe('habits.moveParent.titleMany')
  })

  it('keeps the parent picker of the editor as it is', () => {
    enableTestFlags('orbit_guided_flows')
    const { tree } = renderDialog({ selectionOnly: true })
    expect(sheetTitle(tree)).toBe('habits.form.parentHabit')
    expect(questionLabels(tree).length).toBeGreaterThan(0)
  })

  it('renders the current dialog with the flag off', () => {
    const { tree } = renderDialog()
    expect(sheetTitle(tree)).toBe('habits.moveParent.title')
    expect(questionLabels(tree).length).toBeGreaterThan(0)
  })
})
