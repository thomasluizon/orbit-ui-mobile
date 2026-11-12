import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { ReduceMotion } from 'react-native-reanimated'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useTagSelection } from '@/hooks/use-tag-selection'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { ListRow } from '@/components/ui/list-row'

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

const motionOverride = vi.hoisted(() => ({
  base: 223,
  routeExit: 167,
  enter: [0.11, 0.92, 0.33, 0.97] as const,
  exit: [0.42, 0.03, 0.96, 0.98] as const,
}))

vi.mock('@orbit/shared/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/theme')>()
  return {
    ...actual,
    motionDurations: { ...actual.motionDurations, base: motionOverride.base, routeExit: motionOverride.routeExit },
    motionEasings: { ...actual.motionEasings, enter: motionOverride.enter, exit: motionOverride.exit },
  }
})

vi.mock('react-native-reanimated', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native-reanimated')>()
  return {
    ...actual,
    Easing: { ...actual.Easing, bezier: (...curve: number[]) => Object.assign((progress: number) => progress, { curve }) },
  }
})

vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: (_enabled: boolean, onToggle: () => void) => ({ toggleReminder: onToggle, showNotice: false, openSettings: vi.fn() }) }))
vi.mock('@/hooks/use-date-interpretation', () => ({ useDateInterpretation: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => false,
  useProfile: () => ({ profile: { timeZone: 'UTC', hasProAccess: false, aiMessagesUsed: 0, aiMessagesLimit: 5 } }),
}))
vi.mock('@/hooks/use-tags', () => ({
  useSuggestTags: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useTags: () => ({ tags: [] }),
  useCreateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => null }))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => null }))

interface DisclosureKeyframe {
  durationMs?: number
  reduceMotionModes: unknown[]
  definitions: Record<number, Record<string, unknown>>
}

function animatedLayers(tree: ReactTestRenderer) {
  return tree.root.findAll((node) => node.props.entering !== undefined && node.props.exiting !== undefined)
}

function DisclosureForm() {
  const helpers = useHabitForm({ initialData: { itemType: 'habit', title: 'Read', dueDate: '2026-09-02' } })
  const tags = useTagSelection()
  return <HabitFormFields formHelpers={helpers} tags={tags} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={vi.fn()} readPhraseLocally />
}

describe('habit form details disclosure motion', () => {
  it('takes the disclosure durations and curves from the shared motion tokens with an explicit system reduced-motion setting', async () => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<DisclosureForm />) })
    expect(animatedLayers(tree)).toHaveLength(0)
    const moreDetails = tree.root.findAllByType(ListRow).find((node) => node.props.title === 'habits.form.moreDetails')!
    await act(() => (moreDetails.props.onClick as () => void)())
    const [disclosure] = animatedLayers(tree)
    const entering = disclosure!.props.entering as DisclosureKeyframe
    const exiting = disclosure!.props.exiting as DisclosureKeyframe
    expect(entering).toMatchObject({ durationMs: motionOverride.base, reduceMotionModes: [ReduceMotion.System] })
    expect(entering.definitions[100]!.easing).toHaveProperty('curve', [...motionOverride.enter])
    expect(exiting).toMatchObject({ durationMs: motionOverride.routeExit, reduceMotionModes: [ReduceMotion.System] })
    expect(exiting.definitions[100]!.easing).toHaveProperty('curve', [...motionOverride.exit])
    await act(() => tree.unmount())
  })
})
