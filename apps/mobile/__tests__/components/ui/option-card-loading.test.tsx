import { describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance } from 'react-test-renderer'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { OptionCard } from '@/components/ui/option-card'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/components/ui/flow-look', () => ({ useFlowLook: () => ({ lookAtControl: vi.fn(), lookAway: vi.fn() }) }))
vi.mock('@/components/ui/sheet', async () => await import('../../support/sheet-double'))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
const TestRenderer = require('react-test-renderer')

function mount(element: React.ReactElement) {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return tree
}
const cards = (tree: ReturnType<typeof TestRenderer.create>): ReactTestInstance[] => tree.root.findAll((node: ReactTestInstance) => typeof node.type === 'string' && node.props.testID === 'option-card')
const faces = (node: ReactTestInstance) => node.findAll((child) => typeof child.type === 'string' && child.props.testID === 'skeleton-face')
const labelOf = (node: ReactTestInstance) => node.findAll((child) => String(child.type) === 'Text').map((child) => child.props.children)

describe('a quick option that waits for its own request on Android', () => {
  it('keeps its label and takes the skeleton face, busy and not pressable, with no spinner', () => {
    const tree = mount(<OptionCard label="Registrar hábito" loading onSelect={vi.fn()} />)
    const card = cards(tree)[0]!
    expect(labelOf(card)).toEqual(['Registrar hábito'])
    expect(card.props.accessibilityState).toMatchObject({ busy: true, disabled: true })
    expect(card.props.disabled).toBe(true)
    expect(faces(card)).toHaveLength(1)
    expect(tree.root.findAll((node: ReactTestInstance) => String(node.type) === 'ActivityIndicator')).toHaveLength(0)
  })

  it('draws no skeleton face and reports no wait when it does not wait', () => {
    const card = cards(mount(<OptionCard label="Agora não" onSelect={vi.fn()} />))[0]!
    expect(card.props.accessibilityState).toMatchObject({ busy: false, disabled: false })
    expect(faces(card)).toHaveLength(0)
  })

  it('shows the wait on the confirm action of a question sheet, and disables the other action', () => {
    const tree = mount(<ConfirmSheet open quickOptions loading confirmImmediately title="Quer registrar este hábito?" message="" confirmLabel="Registrar hábito" onCancel={vi.fn()} onConfirm={vi.fn()} />)
    const [cancel, confirm] = tree.root.findAll((node: ReactTestInstance) => typeof node.type === 'string' && /^button-(ghost|primary)-sm$/.test(String(node.props.testID)))
    expect(cards(tree)).toHaveLength(0)
    expect(labelOf(confirm)).toContain('Registrar hábito')
    expect(confirm.props.accessibilityState).toMatchObject({ busy: true })
    expect(cancel.props.accessibilityState).toMatchObject({ disabled: true })
  })
})
