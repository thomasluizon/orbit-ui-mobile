import { StyleSheet } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { OptionCard } from '@/components/ui/option-card'
import { QuestionFlow } from '@/components/ui/question-flow'
import { controlStyle, pressableStyle } from '@/__tests__/support/press-feedback'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn() }))

let tree: ReactTestRenderer | null = null
afterEach(async () => { if (tree) await act(() => tree!.unmount()); tree = null })

async function mount(width: number) {
  __setWindowDimensions({ width, height: 900, scale: 1, fontScale: 1 })
  await act(() => {
    tree = create(
      <QuestionFlow flow="habit_create" stepKey="when" direction={1} question="Quando?" position={2} total={4}
        progressLabel="Passo 2 de 4" backLabel="Voltar" closeLabel="Fechar" onBack={() => {}} onClose={() => {}}
        options={<OptionCard label="Hoje" onSelect={() => {}} />} primary={{ label: 'Continuar', onPress: () => {} }} />,
    )
  })
  return tree!
}

const byLabel = (root: ReactTestRenderer, label: string) => root.root.findAll((node) => typeof node.type !== 'string' && node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').at(-1)!
const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>

describe('the one-question flow at 1024 and above on Android', () => {
  it.each(['Voltar', 'Fechar'])('draws the %s control at 40 with a 48 hit target', async (label) => {
    const control = byLabel(await mount(1024), label)
    expect(pressableStyle(control as never, false)).toMatchObject({ width: 40, height: 40 })
    expect(control.props.hitSlop).toBe(4)
  })

  it('draws both header slots at 40, so each control sits on an edge of the column', async () => {
    const root = await mount(1024)
    const column = root.root.findAll((node) => node.props.testID === 'question-flow-column' && typeof node.type === 'string').at(0)!
    const parts = column.props.children as { props: { style: unknown } }[]
    for (const slot of [parts.at(0)!, parts.at(-1)!]) expect(flat(slot.props.style)).toMatchObject({ width: 40, height: 40 })
  })

  it('sets the question at 28 and the option card at the compact control height', async () => {
    const root = await mount(1024)
    const heading = root.root.findAll((node) => node.props.accessibilityRole === 'header' && typeof node.type === 'string').at(0)!
    expect(flat(heading.props.style)).toMatchObject({ fontSize: 28, lineHeight: 33 })
    const card = root.root.findAll((node) => node.props.testID === 'option-card' && typeof node.type !== 'string').at(-1)!
    expect(controlStyle(card as never)).toMatchObject({ minHeight: 44, paddingVertical: 8 })
  })
})

describe('the one-question flow on a phone width on Android', () => {
  it.each(['Voltar', 'Fechar'])('keeps the %s control at 48 with no hit extension', async (label) => {
    const control = byLabel(await mount(375), label)
    expect(pressableStyle(control as never, false)).toMatchObject({ width: 48, height: 48 })
    expect(control.props.hitSlop).toBeUndefined()
  })

  it('keeps the question at 28 and the option card at 56', async () => {
    const root = await mount(375)
    const heading = root.root.findAll((node) => node.props.accessibilityRole === 'header' && typeof node.type === 'string').at(0)!
    expect(flat(heading.props.style)).toMatchObject({ fontSize: 28, lineHeight: 33 })
    const card = root.root.findAll((node) => node.props.testID === 'option-card' && typeof node.type !== 'string').at(-1)!
    expect(controlStyle(card as never)).toMatchObject({ minHeight: 56, paddingVertical: 12 })
  })
})
