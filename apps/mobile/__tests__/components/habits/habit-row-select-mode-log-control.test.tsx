import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
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

  it('restores the log control after select mode ends', () => {
    TestRenderer.act(() => { renderer = TestRenderer.create(element(true)) })
    TestRenderer.act(() => renderer.update(element(false)))
    expect(statusGlyphs().length).toBeGreaterThan(0)
    TestRenderer.act(() => renderer.update(element(true)))
    expect(statusGlyphs()).toHaveLength(0)
  })
})
