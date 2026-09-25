import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { i18n } from '@/lib/i18n'
import { HabitRow } from '@/components/habits/habit-row'

vi.unmock('react-i18next')

const TestRenderer = require('react-test-renderer')

type TestNode = { props: Record<string, unknown>; findByType(type: string): TestNode }

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (value: string) => value }),
}))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/lib/motion', () => ({
  usePrefersReducedMotion: () => true,
  useResolvedMotionPreset: () => ({ enterDuration: 0, exitDuration: 0, scaleFrom: 0.96, scaleTo: 1, shift: 8 }),
  toAnimatedEasing: (value: unknown) => value,
}))

describe('mobile habit row on an old day', () => {
  beforeEach(async () => {
    vi.setSystemTime(new Date('2026-04-11T12:00:00Z'))
    await i18n.changeLanguage('en')
  })

  it('opens management actions ten days back while disabling completion', () => {
    const actions = {
      onEdit: vi.fn(), onDuplicate: vi.fn(), onMoveParent: vi.fn(),
      onAddSubHabit: vi.fn(), onEnterSelectMode: vi.fn(), onDrillInto: vi.fn(),
      onDelete: vi.fn(), onDetail: vi.fn(), onToggleExpand: vi.fn(),
      onLog: vi.fn(), onSkip: vi.fn(), onReschedule: vi.fn(),
    }
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <I18nextProvider i18n={i18n}>
          <HabitRow habit={createMockHabit({ title: 'Read' })}
            selectedDate={new Date('2026-04-01T12:00:00Z')}
            hasChildren childrenTotal={1} actions={actions} />
        </I18nextProvider>,
      )
    })

    const more = tree!.root.findByProps({ accessibilityLabel: i18n.t('habits.actions.more') })
    expect(more.props.disabled).not.toBe(true)
    TestRenderer.act(() => more.props.onPress())
    const items = tree!.root.findAllByProps({ accessibilityRole: 'menuitem' })
    const labels = items.map((item: TestNode) => item.findByType('Text').props.children)
    for (const label of [i18n.t('habits.form.addSubHabit'), i18n.t('habits.moveParent.button'),
      i18n.t('common.edit'), i18n.t('habits.actions.duplicate'), i18n.t('common.select'),
      i18n.t('habits.actions.openSubHabits'), i18n.t('habits.deleteHabit')]) {
      expect(labels).toContain(label)
    }
    expect(labels).not.toContain(i18n.t('habits.actions.skip'))
    expect(labels).not.toContain(i18n.t('habits.actions.reschedule'))
    const edit = items.find((item: TestNode) => item.findByType('Text').props.children === i18n.t('common.edit'))!
    TestRenderer.act(() => edit.props.onPress())
    expect(actions.onEdit).toHaveBeenCalledOnce()
    const body = tree!.root.findAll((node: TestNode) => node.props.delayLongPress === 500)[0]!
    TestRenderer.act(() => body.props.onPress())
    expect(actions.onDetail).toHaveBeenCalledOnce()
    const disclosure = tree!.root.findByProps({ accessibilityLabel: i18n.t('common.expand') })
    TestRenderer.act(() => disclosure.props.onPress())
    expect(actions.onToggleExpand).toHaveBeenCalledOnce()
    const ring = tree!.root.findByProps({
      accessibilityLabel: `${i18n.t('habits.statusDot.empty')}, ${i18n.t('habits.logHabit')}: Read, 0/1`,
    })
    expect(ring.props.disabled).toBe(true)
    expect(actions.onLog).not.toHaveBeenCalled()
    TestRenderer.act(() => tree!.update(
      <I18nextProvider i18n={i18n}>
        <HabitRow habit={createMockHabit({ title: 'Read' })}
          selectedDate={new Date('2026-04-01T12:00:00Z')}
          hasChildren isExpanded childrenTotal={1} actions={actions} />
      </I18nextProvider>,
    ))
    const collapse = tree!.root.findByProps({ accessibilityLabel: i18n.t('common.collapse') })
    TestRenderer.act(() => collapse.props.onPress())
    expect(actions.onToggleExpand).toHaveBeenCalledTimes(2)
    TestRenderer.act(() => tree!.update(
      <I18nextProvider i18n={i18n}>
        <HabitRow habit={createMockHabit({ title: 'Write' })}
          selectedDate={new Date('2026-04-01T12:00:00Z')} />
      </I18nextProvider>,
    ))
    const checkmark = tree!.root.findByProps({
      accessibilityLabel: `${i18n.t('habits.statusDot.empty')}, ${i18n.t('habits.logHabit')}: Write`,
    })
    expect(checkmark.props.disabled).toBe(true)
  })

  it('announces the account-day reason on a disabled child ring during timezone rollover', () => {
    vi.setSystemTime(new Date('2026-08-30T10:00:01Z'))
    const completionReason = i18n.t('habits.todayBoundary.readOnly')
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <I18nextProvider i18n={i18n}>
          <HabitRow habit={createMockHabit({ title: 'Read' })}
            selectedDate={new Date('2026-08-23T12:00:00Z')}
            depth={1} completionReadOnly completionReason={completionReason} actions={{ onLog: vi.fn() }} />
        </I18nextProvider>,
      )
    })

    const ring = tree!.root.findAllByProps({
      accessibilityLabel: `${i18n.t('habits.statusDot.empty')}, ${i18n.t('habits.logHabit')}: Read`,
    }).find((node: TestNode) => node.props.accessibilityRole === 'button')!
    expect(ring.props.disabled).toBe(true)
    expect(ring.props.accessibilityHint).toBe(completionReason)
  })
})
