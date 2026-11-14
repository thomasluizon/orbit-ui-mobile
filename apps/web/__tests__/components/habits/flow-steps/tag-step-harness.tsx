import { vi } from 'vitest'
import type { HabitTag } from '@orbit/shared/types/habit'
import { QuestionFlow } from '@/components/ui/question-flow'
import { useTagStepView } from '@/components/habits/flow-steps/tag-step'
import { useTagSelection } from '@/hooks/use-tag-selection'

/** The state every tag step test drives through the mocked hooks. */
const tagStepState = vi.hoisted(() => ({
  locale: 'en' as 'en' | 'pt-BR',
  tags: [] as HabitTag[],
  habits: undefined as { title: string; tags: { id: string }[] }[] | undefined,
  habitFilters: [] as unknown[],
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  suggest: vi.fn(),
}))

vi.mock('next-intl', async () => {
  const { createTranslator } = await import('use-intl/core')
  const en = (await import('@orbit/shared/i18n/en.json')).default
  const ptBR = (await import('@orbit/shared/i18n/pt-BR.json')).default
  const translators = {
    en: createTranslator({ locale: 'en', messages: en }) as unknown as (key: string, values?: Record<string, unknown>) => string,
    'pt-BR': createTranslator({ locale: 'pt-BR', messages: ptBR }) as unknown as (key: string, values?: Record<string, unknown>) => string,
  }
  return { useTranslations: () => translators[tagStepState.locale], useLocale: () => tagStepState.locale }
})
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn() }))
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
  tagStepState.tags = []
  tagStepState.habits = undefined
  tagStepState.habitFilters = []
  for (const mock of [tagStepState.create, tagStepState.update, tagStepState.remove, tagStepState.suggest]) mock.mockReset()
}

export function stubMedia(matching: readonly string[]) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matching.some((feature) => query.includes(feature)),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

/** The habit flow host in small: the real frame, with the view of the tag step. */
export function TagStepHarness({ initialIds = [], title = 'Run', onContinue }: Readonly<{ initialIds?: string[]; title?: string; onContinue: () => void }>) {
  const tags = useTagSelection(initialIds)
  const view = useTagStepView({ tags, title, description: '', onContinue })
  return (
    <>
      <output aria-label="Selected tags">{tags.selectedTagIds.join(',')}</output>
      <QuestionFlow flow="habit_create" stepKey="optional:tags" direction={1} position={5} total={5}
        progressLabel="Step 5 of 5" backLabel="Back" closeLabel="Close" onBack={vi.fn()} onClose={vi.fn()}
        question={view.question} line={view.line} lineKey={view.lineKey} orbitState={view.orbitState} statusText={view.statusText}
        options={view.options} primary={view.primary}>
        {view.free}
      </QuestionFlow>
    </>
  )
}

export { tagStepState }
