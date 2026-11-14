import React from 'react'
import { Text, View } from 'react-native'
import { vi } from 'vitest'
import type { HabitTag } from '@orbit/shared/types/habit'
import { testI18n } from '@/__tests__/support/i18n'
import { QuestionFlow } from '@/components/ui/question-flow'
import { useTagStepView } from '@/components/habits/flow-steps/tag-step'
import { useTagSelection } from '@/hooks/use-tag-selection'

/** The state every tag step test drives through the mocked hooks. */
const tagStepState = vi.hoisted(() => ({
  locale: 'en',
  reducedMotion: false,
  tags: [] as HabitTag[],
  habits: undefined as { title: string; tags: { id: string }[] }[] | undefined,
  habitFilters: [] as unknown[],
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  suggest: vi.fn(),
  captureError: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: testI18n.getFixedT(tagStepState.locale), i18n: { language: tagStepState.locale } }),
}))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/lib/sentry', () => ({ captureError: tagStepState.captureError }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => tagStepState.reducedMotion }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/hooks/use-astra-allowance-copy', () => ({ useAstraAllowanceCopy: () => (key: string) => key }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: tagStepState.tags }),
  useCreateTag: () => ({ isPending: false, mutateAsync: tagStepState.create }),
  useUpdateTag: () => ({ isPending: false, mutateAsync: tagStepState.update }),
  useDeleteTag: () => ({ isPending: false, mutateAsync: tagStepState.remove }),
  useSuggestTags: () => ({ isPending: false, mutateAsync: tagStepState.suggest }),
}))
vi.mock('@/hooks/use-habit-queries', () => ({
  useHabits: (filters: unknown) => {
    tagStepState.habitFilters.push(filters)
    const habits = tagStepState.habits
    return { data: habits ? { habitsById: new Map(habits.map((habit, index) => [`habit-${index}`, habit])) } : undefined }
  },
}))

export function buildTags(names: readonly string[]): HabitTag[] {
  return names.map((name, index) => ({ id: `tag-${index}`, name, color: '#7c3aed' }))
}

export function resetTagStepState() {
  tagStepState.locale = 'en'
  tagStepState.reducedMotion = false
  tagStepState.tags = []
  tagStepState.habits = undefined
  tagStepState.habitFilters = []
  for (const mock of [tagStepState.create, tagStepState.update, tagStepState.remove, tagStepState.suggest, tagStepState.captureError]) mock.mockReset()
}

/** The habit flow host in small: the real frame, with the view of the tag step. */
export function TagStepHarness({ initialIds = [], title = 'Run', onContinue }: Readonly<{ initialIds?: string[]; title?: string; onContinue: () => void }>) {
  const tags = useTagSelection(initialIds)
  const view = useTagStepView({ tags, title, description: '', onContinue })
  return (
    <View style={{ flex: 1 }}>
      <Text testID="selected-tags">{tags.selectedTagIds.join(',')}</Text>
      <QuestionFlow flow="habit_create" stepKey="optional:tags" direction={1} position={5} total={5}
        progressLabel="Step 5 of 5" backLabel="Back" closeLabel="Close" onBack={vi.fn()} onClose={vi.fn()}
        question={view.question} line={view.line} lineKey={view.lineKey} orbitState={view.orbitState} statusText={view.statusText}
        options={view.options} primary={view.primary}>
        {view.free}
      </QuestionFlow>
    </View>
  )
}

export { tagStepState }
