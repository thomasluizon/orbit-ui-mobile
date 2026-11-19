import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { testI18n } from '@/__tests__/support/i18n'
import { QuestionFlow } from '@/components/ui/question-flow'
import { useChecklistStepView } from '@/components/habits/flow-steps/checklist-step'
import { useGoalLinkStepView } from '@/components/habits/flow-steps/goal-link-step'

const mocks = vi.hoisted(() => ({ language: 'pt-BR' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: [], isLoading: false }),
  useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/components/habits/goal-linking-field', () => ({ useLinkableGoals: () => ({ data: [createMockGoal({ id: 'g1', title: 'Ler 12 livros' }), createMockGoal({ id: 'g2', title: 'Correr 100 km' })] }) }))
vi.mock('@/components/goals/create-goal-sheet', () => ({ CreateGoalSheet: () => null }))

const HEIGHT = 780
const noop = () => {}
let tree: GeometryTree | null = null
afterEach(async () => { if (tree) await act(() => tree!.unmount()); tree = null })

function StepFlow({ view, stepKey }: Readonly<{ view: FlowStepView; stepKey: string }>) {
  return <QuestionFlow flow="habit_create" stepKey={stepKey} question={view.question} line={view.line} options={view.options}
    primary={view.primary} position={5} total={5} progressLabel="Passo 5 de 5" backLabel="Voltar" closeLabel="Fechar" direction={1}
    onBack={noop} onClose={noop}>{view.free}</QuestionFlow>
}

function ChecklistStep() {
  return <StepFlow stepKey="checklist" view={useChecklistStepView({ items: [], onItemsChange: noop, onContinue: noop })} />
}

function GoalStep() {
  return <StepFlow stepKey="goals" view={useGoalLinkStepView({ habitTitle: 'Ler', selectedGoalIds: [], atGoalLimit: false, onToggleGoal: noop, onContinue: noop })} />
}

const steps: Record<string, { stepKey: string; Step: () => React.ReactElement }> = {
  checklist: { stepKey: 'checklist', Step: ChecklistStep },
  goals: { stepKey: 'goals', Step: GoalStep },
}

describe.each(['pt-BR', 'en'])('checklist and goal steps in %s', (language) => {
  describe.each([320, 360, 384, 412])('at %i px', (width) => {
    it.each(Object.keys(steps))('centres the %s block in the space between the header and the primary action', async (name) => {
      mocks.language = language
      const { stepKey, Step } = steps[name]!
      __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
      await act(() => { tree = create(<View style={{ width, height: HEIGHT }}><Step /></View>) as GeometryTree })
      const boxes = measureSafeArea(tree!.toJSON(), (host) => host.type === 'ScrollView' ? 'free-area' : host.props.testID === `question-flow-step-${stepKey}` ? 'block' : undefined, { width, height: HEIGHT })
      const free = boxes.get('free-area')!
      const block = boxes.get('block')!
      expect(free.bottom - free.top).toBeGreaterThan(block.bottom - block.top)
      expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
    })
  })
})
