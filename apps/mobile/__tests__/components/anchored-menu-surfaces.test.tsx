import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { GoalsView } from '@/components/goals/goals-view'
import { TodayHabitsHeader } from '@/components/today/today-habits-header'
import { useAnchoredMenu } from '@/components/ui/anchored-menu'
import { Animated } from 'react-native'
import { Animated as TestAnimated } from '@/test-mocks/react-native'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))
vi.mock('@/hooks/use-goals', () => ({ useGoals: () => ({ data: { allGoals: [] }, isFetched: true }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/components/goals/goal-list', () => ({
  GoalList: ({ ListHeaderComponent }: { ListHeaderComponent: React.ReactNode }) => ListHeaderComponent,
}))
vi.mock('@/app/(tabs)/today-shell', () => ({ TodayDateNavigation: () => null }))
vi.mock('@/components/habits/today-ai-summary', () => ({ TodayAISummary: () => null }))

vi.mock('lucide-react-native', async () => ({
  ...await import('@/test-mocks/lucide-react-native'),
  Filter: (props: Record<string, unknown>) => React.createElement('Filter', props),
}))

afterEach(() => vi.restoreAllMocks())

function HeaderMenus() {
  const controls = useAnchoredMenu()
  const frequency = useAnchoredMenu()
  return <TodayHabitsHeader
    header={null} showSummary={false} dateStr="2026-01-01" currentActiveView="today"
    dateLabel="Today" selectedDate={new Date('2026-01-01')} slideDirection="left"
    dateLabelAnim={new Animated.Value(1)} isSearchFocused={false} showDayProgress={false}
    dayProgress={{ done: 0, total: 0 }} isSearchOpen={false} searchQuery="" selectedFrequency={null}
    selectedTagIds={[]} tags={[]} frequencyOptions={[{ key: 'Day', label: 'Daily' }]}
    isSelectMode={false} showCompleted={false} isFetching={false} allCollapsed={false}
    showControlsMenu={controls.visible} isControlsMenuClosing={controls.isClosing}
    controlsMenuOpenRevision={controls.openRevision} controlsMenuAnchorRect={controls.anchorRect}
    showFreqMenu={frequency.visible} isFreqMenuClosing={frequency.isClosing}
    freqMenuOpenRevision={frequency.openRevision} freqMenuAnchorRect={frequency.anchorRect}
    controlsButtonRef={controls.anchorRef} freqMenuButtonRef={frequency.anchorRef} filtersAnimatedStyle={{}}
    onGoToPreviousDay={vi.fn()} onGoToToday={vi.fn()} onGoToNextDay={vi.fn()}
    onSearchToggle={vi.fn()} onSearchChange={vi.fn()} onSearchFocusChange={vi.fn()} onTagToggle={vi.fn()}
    onToggleFreqMenu={frequency.toggle} onToggleControlsMenu={controls.toggle}
    onCloseControlsMenu={controls.close} onFinishControlsMenuClose={controls.finishClose}
    onCloseFreqMenu={frequency.close} onFinishFreqMenuClose={frequency.finishClose}
    onToggleSelect={vi.fn()} onToggleCollapse={vi.fn()} onRefresh={vi.fn()}
    onToggleCompleted={vi.fn()} onSelectFrequency={vi.fn()}
  />
}

const surfaces = [
  { name: 'Today controls', trigger: 'habits.actions.more', content: 'common.select' },
  { name: 'Today frequency', trigger: 'habits.frequencyFilter', content: 'common.all' },
  { name: 'goal filters', trigger: 'goals.filters.statusFilter', content: 'goals.filters.all' },
]

interface RenderedNode {
  props: { accessibilityLabel?: string; onPress: () => void; onRequestClose: () => void }
  children: unknown[]
  findAllByType: (type: string) => RenderedNode[]
  findByType: (type: string) => RenderedNode
}

interface RenderedTree {
  root: RenderedNode
  unmount: () => void
}

function textContents(root: RenderedNode): string {
  return root.findAllByType('Text').map((node) => node.children.join('')).join(' ')
}

describe.each(surfaces)('$name menu ownership', ({ trigger, content }) => {
  it.each(['open', 'exiting', 'reopened'])('replaces the %s surface menu with a habit menu and back', (phase) => {
    const completions: ((result: { finished: boolean }) => void)[] = []
    vi.spyOn(TestAnimated, 'timing').mockImplementation(() => ({
      start: (callback?: (result: { finished: boolean }) => void) => {
        if (callback) completions.push(callback)
      },
      stop: () => {},
    }))
    let renderer: RenderedTree
    void TestRenderer.act(() => {
      renderer = TestRenderer.create(<>
        <HeaderMenus />
        <GoalsView />
        <HabitRow habit={createMockHabit({ title: 'Read' })} actions={{ onEdit: vi.fn() }} />
      </>) as unknown as RenderedTree
    })
    const buttons = renderer!.root.findAllByType('Pressable')
    const rowTrigger = buttons.filter((node) => node.props.accessibilityLabel === 'habits.actions.more').at(-1)!
    const surfaceTrigger = buttons.find((node) => node.props.accessibilityLabel === trigger)!
    try {
      void TestRenderer.act(() => surfaceTrigger.props.onPress())
      expect(renderer!.root.findAllByType('Modal')).toHaveLength(1)
      expect(textContents(renderer!.root)).toContain(content)
      if (phase !== 'open') {
        void TestRenderer.act(() => renderer!.root.findByType('Modal').props.onRequestClose())
        expect(renderer!.root.findAllByType('Modal')).toHaveLength(1)
      }
      if (phase === 'reopened') {
        void TestRenderer.act(() => {
          surfaceTrigger.props.onPress()
          completions.at(-1)!({ finished: true })
        })
      }
      void TestRenderer.act(() => rowTrigger.props.onPress())
      expect(renderer!.root.findAllByType('Modal')).toHaveLength(1)
      expect(textContents(renderer!.root)).toContain('common.edit')
      expect(textContents(renderer!.root)).not.toContain(content)
      if (phase !== 'open') {
        void TestRenderer.act(() => renderer!.root.findByType('Modal').props.onRequestClose())
      }
      if (phase === 'reopened') {
        void TestRenderer.act(() => {
          rowTrigger.props.onPress()
          completions.at(-1)!({ finished: true })
        })
      }
      void TestRenderer.act(() => surfaceTrigger.props.onPress())
      expect(renderer!.root.findAllByType('Modal')).toHaveLength(1)
      expect(textContents(renderer!.root)).toContain(content)
      expect(textContents(renderer!.root)).not.toContain('common.edit')
      void TestRenderer.act(() => {
        for (const complete of completions) complete({ finished: true })
      })
      expect(renderer!.root.findAllByType('Modal')).toHaveLength(1)
    } finally {
      void TestRenderer.act(() => renderer!.unmount())
    }
  })
})
