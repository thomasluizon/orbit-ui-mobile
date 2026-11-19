import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { measureSafeArea, type GeometryHost, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { testI18n } from '@/__tests__/support/i18n'
import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'
import { EditGoalModal } from '@/components/goals/edit-goal-modal'
import { GoalResultDialog } from '@/components/goals/guided/goal-result-dialog'

const mocks = vi.hoisted(() => ({ language: 'pt-BR', habits: { data: { habitsById: new Map<string, unknown>() }, isLoading: false, isError: false, refetch: () => Promise.resolve() } }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => true }))
vi.mock('@/hooks/use-goals', () => ({ useCreateGoal: () => ({ mutateAsync: vi.fn(), isPending: false }), useUpdateGoal: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => mocks.habits }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC' } }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/components/ui/flow-screen', async () => {
  const { View: HostView } = await import('react-native')
  return { FlowScreen: ({ children }: { children: React.ReactNode }) => <HostView style={{ flex: 1 }}>{children}</HostView> }
})

const HEIGHT = 780
const STEPS = ['what', 'track', 'amount', 'deadline', 'habits', 'summary'] as const
let tree: GeometryTree | null = null
afterEach(async () => { if (tree) await act(() => tree!.unmount()); tree = null })

type Host = GeometryHost & { props: Record<string, unknown> }
function hosts(): Host[] {
  return tree!.root.findAll((node) => typeof node.type === 'string') as unknown as Host[]
}
function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  const children = (node as { props?: { children?: unknown } } | null)?.props?.children
  return children === undefined ? '' : textOf(children)
}
async function tap(name: string) {
  const target = hosts().find((node) => (node.props.accessibilityLabel ?? (node.props.accessibilityRole === 'button' ? textOf(node) : '')) === name && node.props.onPress)
  await act(async () => { (target!.props.onPress as () => void)(); await Promise.resolve() })
}
async function type(label: string, value: string) {
  const input = hosts().find((node) => node.props.accessibilityLabel === label && node.props.onChangeText)
  await act(async () => { (input!.props.onChangeText as (text: string) => void)(value); await Promise.resolve() })
}

async function reach(step: (typeof STEPS)[number]) {
  const t = testI18n.getFixedT(mocks.language)
  if (step === 'what') return
  await type(t('goals.form.title'), 'Ler 12 livros')
  await tap(t('habits.flow.continue'))
  if (step === 'track') return
  await tap(t('goals.form.typeStandard'))
  if (step === 'amount') return
  await type(t('goals.form.targetValueQuestion'), '12')
  await type(t('goals.form.unitQuestion'), 'livros')
  await tap(t('habits.flow.continue'))
  if (step === 'deadline') return
  await tap(t('goals.flow.deadline.yearEnd'))
  if (step === 'habits') return
  await tap(t('habits.flow.continue'))
}

function expectCentred(width: number, stepKey: string) {
  const boxes = measureSafeArea(tree!.toJSON(), (host) => host.type === 'ScrollView' ? 'free-area' : host.props.testID === `question-flow-step-${stepKey}` ? 'block' : undefined, { width, height: HEIGHT })
  const free = boxes.get('free-area')!
  const block = boxes.get('block')!
  if (block.bottom - block.top >= free.bottom - free.top) { expect(block.top).toBeGreaterThanOrEqual(free.top); return }
  expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
}

describe.each([320, 360, 384, 412])('guided goal flow block at %i px', (width) => {
  describe.each(['pt-BR', 'en'])('in %s', (language) => {
    it.each(STEPS)('centres the %s block in the space between the header and the primary action', async (step) => {
      mocks.language = language
      mocks.habits.data.habitsById = new Map([1, 2, 3].map((index) => [`h${index}`, createMockHabit({ id: `h${index}`, title: `Habit ${index}` })]))
      __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
      await act(() => { tree = create(<View style={{ width, height: HEIGHT }}><CreateGoalSheet open onClose={vi.fn()} /></View>) as GeometryTree })
      await reach(step)
      expectCentred(width, step)
    })

    it('centres the edit summary', async () => {
      mocks.language = language
      __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
      const goal = { id: 'g1', title: 'Correr 100 km', targetValue: 100, unit: 'km', deadline: '2026-12-31', type: 'Standard' }
      await act(() => { tree = create(<View style={{ width, height: HEIGHT }}><EditGoalModal open onClose={vi.fn()} goal={goal} /></View>) as GeometryTree })
      expectCentred(width, 'summary')
    })

    it('centres the result dialog panel', async () => {
      mocks.language = language
      __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
      await act(() => { tree = create(<View style={{ width, height: HEIGHT }}><GoalResultDialog title="Ler 12 livros" deadline="2026-12-31" change="created" opensGoal onPrimary={vi.fn()} onCreateAnother={vi.fn()} onClose={vi.fn()} /></View>) as GeometryTree })
      const boxes = measureSafeArea(tree!.toJSON(), (host) => host.props.testID === 'result-dialog-centre' ? 'free-area' : host.props.testID === 'result-dialog' ? 'block' : undefined, { width, height: HEIGHT })
      const free = boxes.get('free-area')!
      const block = boxes.get('block')!
      expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
      expect(Math.abs((block.left + block.width / 2) - (free.left + free.width / 2))).toBeLessThanOrEqual(1)
    })
  })
})
