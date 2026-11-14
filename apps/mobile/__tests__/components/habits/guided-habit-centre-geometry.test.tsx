import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { testI18n } from '@/__tests__/support/i18n'
import { GuidedHabitFlow } from '@/components/habits/guided/guided-habit-flow'
import { ResultDialog } from '@/components/ui/result-dialog'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useTagSelection } from '@/hooks/use-tag-selection'

const mocks = vi.hoisted(() => ({ language: 'pt-BR' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC', uses24HourClock: true, weekStartDay: 0 } }), useHasProAccess: () => true }))
vi.mock('@/hooks/use-habit-phrase-read', () => ({ useHabitPhraseRead: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: (_enabled: boolean, onToggle: () => void) => ({ toggleReminder: onToggle, showNotice: false }) }))
vi.mock('@/components/habits/goal-linking-field', () => ({ useLinkableGoals: () => ({ data: [], isSuccess: true, isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [] }), useSuggestTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateTag: () => ({ mutateAsync: vi.fn(), isPending: false }), useUpdateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => ({ data: undefined }) }))

const HEIGHT = 780
let tree: GeometryTree | null = null
afterEach(async () => { if (tree) await act(() => tree!.unmount()); tree = null })

function Flow({ mode }: Readonly<{ mode: 'create' | 'edit' }>) {
  const formHelpers = useHabitForm({ initialData: { dueDate: '', title: mode === 'edit' ? 'Correr' : '' } })
  const tags = useTagSelection()
  return <GuidedHabitFlow mode={mode} formHelpers={formHelpers} lockedGeneral={null} fromConversation={false} pending={false} saveError={null} createLabel="Criar"
    fields={{ tags, selectedGoalIds: [], atGoalLimit: false, onToggleGoal: () => {}, reminderTimes: [0, 15], onReminderTimesChange: () => {}, onUpgrade: () => {} }}
    onSubmit={() => {}} onClose={() => {}} />
}

const blocks: Record<string, { stepKey: string; element: React.ReactElement }> = {
  'the phrase step': { stepKey: 'what', element: <Flow mode="create" /> },
  'the summary of an edit': { stepKey: 'summary', element: <Flow mode="edit" /> },
}

describe.each(['pt-BR', 'en'])('the guided habit flow block in %s', (language) => {
  describe.each([320, 360, 384, 412])('at %i px', (width) => {
    it.each(Object.keys(blocks))('centres %s in the space between the header and the primary action', async (name) => {
      mocks.language = language
      const { stepKey, element } = blocks[name]!
      __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
      await act(() => { tree = create(<View style={{ width, height: HEIGHT }}>{element}</View>) as GeometryTree })
      const boxes = measureSafeArea(tree!.toJSON(), (host) => host.type === 'ScrollView' ? 'free-area' : host.props.testID === `question-flow-step-${stepKey}` ? 'block' : undefined, { width, height: HEIGHT })
      const free = boxes.get('free-area')!
      const block = boxes.get('block')!
      expect(free.bottom - free.top).toBeGreaterThan(block.bottom - block.top)
      expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
    })

    it('centres the result dialog panel in the window', async () => {
      mocks.language = language
      __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
      await act(() => { tree = create(<View style={{ width, height: HEIGHT }}><ResultDialog title="Pronto!" sentence="A tarefa foi criada para amanhã às 8:00." primaryLabel="Ver no Calendário" onPrimary={() => {}} secondaryLabel="Criar outro" onSecondary={() => {}} onClose={() => {}} /></View>) as GeometryTree })
      const boxes = measureSafeArea(tree!.toJSON(), (host) => host.props.testID === 'result-dialog-centre' ? 'free-area' : host.props.testID === 'result-dialog' ? 'block' : undefined, { width, height: HEIGHT })
      const free = boxes.get('free-area')!
      const block = boxes.get('block')!
      expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
    })
  })
})
