import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { StyleSheet } from 'react-native'
import { HabitRow } from '@/components/habits/habit-row'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))

const TestRenderer = require('react-test-renderer')

let renderer: ReturnType<typeof TestRenderer.create>
afterEach(() => { TestRenderer.act(() => renderer.unmount()) })

const rows = [
  { name: 'leaf', hasChildren: false, isCompleted: false, completionStatusUnavailable: false },
  { name: 'done leaf', hasChildren: false, isCompleted: true, completionStatusUnavailable: false },
  { name: 'parent', hasChildren: true, isCompleted: false, completionStatusUnavailable: false },
  { name: 'unavailable', hasChildren: false, isCompleted: false, completionStatusUnavailable: true },
] as const

describe.each(rows)('native habit row log control in select mode, $name', ({ hasChildren, isCompleted, completionStatusUnavailable }) => {
  function element(isSelectMode: boolean) {
    return <HabitRow habit={createMockHabit({ title: 'Read', isCompleted })} isSelectMode={isSelectMode}
      hasChildren={hasChildren} childrenDone={hasChildren ? 1 : 0} childrenTotal={hasChildren ? 3 : 0}
      completionStatusUnavailable={completionStatusUnavailable} structuralColumn
      actions={{ onLog: vi.fn(), onUnlog: vi.fn(), onEdit: vi.fn(), onToggleSelection: vi.fn(), onEnterSelectMode: vi.fn() }} />
  }
  const statusGlyphs = () => renderer.root.findAll((node: { props: Record<string, unknown> }) =>
    node.props.testID === 'habit-check' || node.props.testID === 'unavailable-status-dot')
  const logButtons = () => renderer.root.findAll((node: { props: Record<string, unknown> }) =>
    typeof node.props.accessibilityLabel === 'string' && /habits\.(logHabit|actions\.unlog)/.test(node.props.accessibilityLabel))

  it('renders no log control or status glyph while select mode is on', () => {
    TestRenderer.act(() => { renderer = TestRenderer.create(element(true)) })
    expect(statusGlyphs()).toHaveLength(0)
    expect(logButtons()).toHaveLength(0)
  })

  const slots = () => renderer.root.findAll((node: { type: unknown; props: Record<string, unknown> }) =>
    typeof node.type === 'string' && node.props.testID === 'habit-row-trailing-slot')

  it('keeps an inert, empty, hidden 52px spacer so the strip keeps its 104px trailing width', () => {
    TestRenderer.act(() => { renderer = TestRenderer.create(element(true)) })
    expect(slots()).toHaveLength(1)
    const slot = slots()[0]
    expect(slot.props.accessibilityElementsHidden).toBe(true)
    expect(slot.props.importantForAccessibility).toBe('no-hide-descendants')
    expect(slot.props.pointerEvents).toBe('none')
    expect(slot.props.accessible).not.toBe(true)
    expect(slot.props.accessibilityRole).toBeUndefined()
    expect(StyleSheet.flatten(slot.props.style)).toMatchObject({ width: 52, minHeight: 48 })
    expect(slot.children).toHaveLength(0)
    TestRenderer.act(() => renderer.update(element(false)))
    expect(slots()).toHaveLength(0)
  })

  it('restores the log control after select mode ends', () => {
    TestRenderer.act(() => { renderer = TestRenderer.create(element(true)) })
    TestRenderer.act(() => renderer.update(element(false)))
    expect(statusGlyphs().length).toBeGreaterThan(0)
    TestRenderer.act(() => renderer.update(element(true)))
    expect(statusGlyphs()).toHaveLength(0)
  })
})

const menuActions = { onLog: vi.fn(), onEdit: vi.fn(), onToggleSelection: vi.fn() }
const plainActions = { onLog: vi.fn(), onToggleSelection: vi.fn() }
const spacerCases = [
  { name: 'selection button and menu', structuralColumn: true, actions: menuActions, spacer: 52, normalMenu: 1 },
  { name: 'selection button, no menu', structuralColumn: true, actions: plainActions, spacer: null, normalMenu: 0 },
  { name: 'no selection button, menu', structuralColumn: false, actions: menuActions, spacer: 104, normalMenu: 1 },
  { name: 'no selection button, no menu', structuralColumn: false, actions: plainActions, spacer: 48, normalMenu: 0 },
] as const

describe.each(spacerCases)('native habit row selection spacer, $name', ({ structuralColumn, actions, spacer, normalMenu }) => {
  type HostNode = { type: unknown; props: Record<string, unknown> }
  const hostNodes = (match: (props: Record<string, unknown>) => boolean) =>
    renderer.root.findAll((node: HostNode) => typeof node.type === 'string' && match(node.props))

  it('replaces exactly the width of the trailing group it hides', () => {
    const element = (isSelectMode: boolean) => <HabitRow habit={createMockHabit({ title: 'Read' })} hasChildren
      childrenDone={1} childrenTotal={3} structuralColumn={structuralColumn} isSelectMode={isSelectMode} actions={actions} />
    TestRenderer.act(() => { renderer = TestRenderer.create(element(false)) })
    expect(hostNodes((props) => props.accessibilityLabel === 'habits.actions.more')).toHaveLength(normalMenu)
    TestRenderer.act(() => renderer.update(element(true)))
    const slots = hostNodes((props) => props.testID === 'habit-row-trailing-slot')
    expect(slots).toHaveLength(spacer ? 1 : 0)
    if (spacer) expect(StyleSheet.flatten(slots[0]!.props.style)).toMatchObject({ width: spacer, minHeight: 48 })
    expect(hostNodes((props) => props.accessibilityRole === 'checkbox')).toHaveLength(structuralColumn ? 1 : 0)
  })
})
