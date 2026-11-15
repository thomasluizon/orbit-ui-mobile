import type { ReactElement } from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { QuestionBlockController } from '@orbit/shared/chat'
import { questionBlockFixture } from '@orbit/shared/test-support/chat-fixtures'
import { formatLocaleDate } from '@orbit/shared/utils'
import { QuestionControls } from '@/components/chat/question-controls'
import { HabitEmojiSelector } from '@/components/habits/habit-form-fields/habit-emoji-selector'
import { HabitMonthDaysField } from '@/components/habits/habit-form-fields/habit-month-days-field'
import { ScheduledReminderSection } from '@/components/habits/habit-form-fields/scheduled-reminder-section'
import { createStyles } from '@/components/habits/habit-form-fields/styles'
import { Chip } from '@/components/ui/chip'
import { DateField } from '@/components/ui/date-field'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { RadioRow } from '@/components/ui/select-check'
import { TimeField } from '@/components/ui/time-field'
import { WeekdayPicker } from '@/components/ui/weekday-picker'
import { createTokensV2 } from '@/lib/theme'

vi.unmock('@/components/ui/date-field')
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: true, weekStartDay: 1 } }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/hooks/use-push-notifications', () => ({ usePushNotifications: () => ({ isSupported: true, permissionStatus: 'granted', permissionCanAskAgain: true, requestPermissionOutcome: vi.fn() }) }))

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

interface TestNode { type: unknown; props: Record<string, unknown>; findAll: (predicate: (node: TestNode) => boolean) => TestNode[] }
interface TestTree { root: TestNode; unmount: () => void }
const TestRenderer = require('react-test-renderer') as { create: (element: ReactElement) => TestTree; act: (callback: () => void) => void }
const tokens = createTokensV2('orange', 'dark')
const scaleQuestion = questionBlockFixture.questions.find((question) => question.id === 'energy')!
const questionWords = { yes: 'yes', no: 'no', recommended: 'recommended', freeText: 'free text', required: 'required' }
const todayLabel = formatLocaleDate(new Date(), 'en', { month: 'long', day: 'numeric', year: 'numeric' })

function nodes(tree: TestTree, matches: (props: Record<string, unknown>) => boolean) {
  return tree.root.findAll((node) => typeof node.type === 'string' && matches(node.props))
}

function selectedState(props: Record<string, unknown>) {
  const state = props.accessibilityState as { selected?: boolean; checked?: boolean } | undefined
  return Boolean(state?.selected || state?.checked)
}

function press(tree: TestTree, matches: (props: Record<string, unknown>) => boolean) {
  TestRenderer.act(() => (nodes(tree, matches)[0]!.props.onPress as () => void)())
}

/** Opens a picker through its trigger, the first press target. */
function openPicker(tree: TestTree) {
  TestRenderer.act(() => (tree.root.findAll((node) => node.type === 'Pressable')[0]!.props.onPress as () => void)())
}

const smileys = (props: Record<string, unknown>) => props.accessibilityRole === 'button' && props.accessibilityLabel === 'habits.form.emojiCategorySmileys'

/** Each ringed control, rendered with its selection ring shown, and the ring width it has on the base branch. */
const controls: readonly { name: string; width: number; render: () => ReactElement; open?: (tree: TestTree) => void; control: (props: Record<string, unknown>) => boolean }[] = [
  { name: 'non-period chip', width: 1, render: () => <Chip active>Chip</Chip>, control: selectedState },
  { name: 'period chip', width: 1.5, render: () => <Chip variant="period" active>Chip</Chip>, control: selectedState },
  { name: 'segment', width: 2, render: () => <SegmentedControl label="View" value="one" options={[{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }]} onChange={vi.fn()} />, control: selectedState },
  { name: 'time option', width: 2, render: () => <TimeField label="Time" value="09:00" hourCycle="h23" onChange={vi.fn()} />, open: openPicker, control: (props) => props.accessibilityRole === 'radio' && selectedState(props) },
  { name: 'emoji category tab', width: 1, render: () => <HabitEmojiSelector selectedEmoji="😀" tokens={tokens} styles={createStyles(tokens)} onSelect={vi.fn()} />,
    open: (tree) => { openPicker(tree); press(tree, smileys) }, control: smileys },
  { name: 'emoji option', width: 2, render: () => <HabitEmojiSelector selectedEmoji="😀" tokens={tokens} styles={createStyles(tokens)} onSelect={vi.fn()} />,
    open: openPicker, control: (props) => props.accessibilityLabel === 'habits.form.emoji: 😀' },
  { name: 'reminder option', width: 1, render: () => <ScheduledReminderSection tokens={tokens} reminderEnabled scheduledReminders={[]} onSetScheduledReminders={vi.fn()} onValidationError={vi.fn()} />,
    control: (props) => props.accessibilityLabel === 'habits.form.scheduledReminderSameDay' && props.accessibilityRole === 'radio' },
  { name: 'weekday', width: 1.5, render: () => <WeekdayPicker label="Days" days={['Monday']} dayOptions={[{ value: 'Monday', label: 'Mon', accessibleLabel: 'Monday' }]} onToggleDay={vi.fn()} />, control: (props) => props.accessibilityLabel === 'Monday' },
  { name: 'month day', width: 1.5, render: () => <HabitMonthDaysField visible monthDays={[1]} anchorDay={1} quantity={1} onToggle={vi.fn()} />, control: (props) => props.accessibilityLabel === '1' && props.accessibilityRole === 'button' },
  { name: 'radio row', width: 1.5, render: () => <RadioRow label="Radio" selected onSelect={vi.fn()} />, control: (props) => props.accessibilityRole === 'radio' },
  { name: 'disabled radio row', width: 1.5, render: () => <RadioRow label="Radio" selected disabled reason="Sending" />, control: (props) => props.accessibilityRole === 'radio' },
  { name: 'question scale option', width: 2, render: () => <QuestionControls question={scaleQuestion} answer={{ questionId: 'energy', number: 3 }} disabled={false} controller={new QuestionBlockController()} words={questionWords} />,
    control: (props) => props.accessibilityRole === 'radio' && props.accessibilityLabel === '3' },
  { name: 'date field today', width: 1, render: () => <DateField value="" onChange={vi.fn()} />, open: openPicker, control: (props) => props.accessibilityLabel === todayLabel },
]

describe('Android selection ring width', () => {
  it.each(controls)('draws the $name ring at $width', ({ width, render, open, control }) => {
    let tree!: TestTree
    TestRenderer.act(() => { tree = TestRenderer.create(render()) })
    open?.(tree)
    const owner = nodes(tree, control)
    expect(owner.length, 'the control renders').toBeGreaterThan(0)
    const ring = owner[0]!.findAll((node) => typeof node.type === 'string' && node.props.testID === 'selection-ring')[0]
    expect(ring, 'the control draws its selection ring').toBeDefined()
    expect(StyleSheet.flatten(ring!.props.style as StyleProp<ViewStyle>).borderWidth).toBe(width)
    TestRenderer.act(() => tree.unmount())
  })
})
