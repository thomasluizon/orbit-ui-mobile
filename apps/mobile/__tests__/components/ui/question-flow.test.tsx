import { Modal } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { OptionCard } from '@/components/ui/option-card'
import { QuestionFlow } from '@/components/ui/question-flow'
import { ResultDialog } from '@/components/ui/result-dialog'
import { press, renderNavigation } from './navigation-render'

const baseProps = {
  question: 'Quando?', line: 'Pode ser qualquer dia, ou uma repetição.', stepKey: 'when', position: 2, total: 4,
  progressLabel: 'Passo 2 de 4', backLabel: 'Voltar', closeLabel: 'Fechar', direction: 1 as const,
}

function flow(overrides: Partial<Parameters<typeof QuestionFlow>[0]> = {}) {
  return <QuestionFlow {...baseProps} onBack={vi.fn()} onClose={vi.fn()}
    options={<><OptionCard label="Hoje" onSelect={vi.fn()} /><OptionCard label="Amanhã" onSelect={vi.fn()} /></>}
    primary={{ label: 'Continuar', onPress: vi.fn() }} {...overrides} />
}

const textOf = (tree: ReturnType<typeof renderNavigation>) => tree.hosts().filter((node) => node.type === 'Text').map((node) => node.props.children)

describe('QuestionFlow on Android', () => {
  it('names the progress and keeps the slot when there is no back step', () => {
    const tree = renderNavigation(flow())
    expect(tree.hosts().some((node) => node.props.accessibilityLabel === 'Passo 2 de 4')).toBe(true)
    expect(tree.hosts().some((node) => node.props.accessibilityLabel === 'Voltar')).toBe(true)
    tree.update(flow({ onBack: undefined, position: 1, progressLabel: 'Passo 1 de 4' }))
    expect(tree.hosts().some((node) => node.props.accessibilityLabel === 'Voltar')).toBe(false)
    expect(tree.hosts().some((node) => node.props.accessibilityLabel === 'Fechar')).toBe(true)
    tree.unmount()
  })

  it('makes the question the header and carries the Orbit line as its hint', () => {
    const tree = renderNavigation(flow())
    const heading = tree.hosts().find((node) => node.props.accessibilityRole === 'header')
    expect(heading?.props.children).toBe('Quando?')
    expect((heading?.props as { accessibilityHint?: string }).accessibilityHint).toBe('Pode ser qualquer dia, ou uma repetição.')
    tree.unmount()
  })

  it('closes the block up when no line applies', () => {
    const tree = renderNavigation(flow({ line: null }))
    expect(textOf(tree)).not.toContain('Pode ser qualquer dia, ou uma repetição.')
    tree.unmount()
  })

  it('keeps the primary action enabled', () => {
    const onPress = vi.fn()
    const tree = renderNavigation(flow({ primary: { label: 'Continuar', onPress } }))
    const primary = tree.hosts().find((node) => node.props.testID === 'button-primary-sm')
    expect(primary?.props.disabled).toBeFalsy()
    press(primary!)
    expect(onPress).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('exposes Pensando and the text status', () => {
    const tree = renderNavigation(flow({ orbitState: 'pensando', statusText: 'Orbit está lendo o que você escreveu.' }))
    expect(tree.hosts().some((node) => (node.props as Record<string, unknown>)['data-orbit-state'] === 'pensando')).toBe(true)
    expect(textOf(tree)).toContain('Orbit está lendo o que você escreveu.')
    tree.unmount()
  })
})

describe('OptionCard on Android', () => {
  it('selects on a press and reports the selected state', () => {
    const onSelect = vi.fn()
    const tree = renderNavigation(<OptionCard label="Hoje" selected onSelect={onSelect} />)
    const option = tree.hosts().find((node) => node.props.testID === 'option-card')!
    expect(option.props.accessibilityState).toEqual({ selected: true, disabled: false })
    press(option)
    expect(onSelect).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('does not select when disabled and shows the reason', () => {
    const onSelect = vi.fn()
    const tree = renderNavigation(<OptionCard label="Maio" disabled disabledReason="Escolha até 5" onSelect={onSelect} />)
    press(tree.hosts().find((node) => node.props.testID === 'option-card')!)
    expect(onSelect).not.toHaveBeenCalled()
    expect(textOf(tree)).toContain('Escolha até 5')
    tree.unmount()
  })
})

describe('ResultDialog on Android', () => {
  const dialog = (overrides = {}) => <ResultDialog title="Pronto!" sentence="A tarefa foi criada para amanhã às 8:00." primaryLabel="Ver no Calendário"
    secondaryLabel="Criar outro" onPrimary={vi.fn()} onSecondary={vi.fn()} onClose={vi.fn()} {...overrides} />

  it('is a modal named by its title and described by its sentence', () => {
    const tree = renderNavigation(dialog())
    const panel = tree.hosts().find((node) => node.props.testID === 'result-dialog')!
    expect(panel.props).toMatchObject({ accessibilityLabel: 'Pronto!', accessibilityHint: 'A tarefa foi criada para amanhã às 8:00.', accessibilityViewIsModal: true })
    tree.unmount()
  })

  it('closes on the scrim, on Android back and never by itself', () => {
    const onClose = vi.fn()
    const tree = renderNavigation(dialog({ onClose }))
    expect(onClose).not.toHaveBeenCalled()
    press(tree.hosts().find((node) => node.props.testID === 'result-dialog-scrim')!)
    expect(onClose).toHaveBeenCalledTimes(1)
    const modal = (tree as unknown as { hosts: () => { props: { onRequestClose?: () => void } }[] }).hosts().find((node) => typeof node.props.onRequestClose === 'function')
    modal?.props.onRequestClose?.()
    expect(onClose).toHaveBeenCalledTimes(2)
    tree.unmount()
  })

  it('runs the two actions and draws Orbit at 128 in Feliz or Parado', () => {
    const onPrimary = vi.fn()
    const onSecondary = vi.fn()
    const tree = renderNavigation(dialog({ onPrimary, onSecondary }))
    press(tree.hosts().find((node) => node.props.testID === 'button-primary-sm')!)
    press(tree.hosts().find((node) => node.props.testID === 'button-ghost-sm')!)
    expect([onPrimary.mock.calls.length, onSecondary.mock.calls.length]).toEqual([1, 1])
    const orbit = tree.hosts().find((node) => (node.props as Record<string, unknown>)['data-orbit-state'] !== undefined)!
    expect((orbit.props as Record<string, unknown>)['data-orbit-state']).toBe('feliz')
    expect((orbit.props as Record<string, unknown>).width).toBe(128)
    tree.update(dialog({ orbitState: 'parado' }))
    expect((tree.hosts().find((node) => (node.props as Record<string, unknown>)['data-orbit-state'] !== undefined)!.props as Record<string, unknown>)['data-orbit-state']).toBe('parado')
    tree.unmount()
  })

  it('mounts a Modal so the panel centres at every width', () => {
    expect(Modal).toBeDefined()
  })
})
