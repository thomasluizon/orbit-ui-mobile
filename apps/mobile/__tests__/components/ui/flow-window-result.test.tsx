import { Animated, Keyboard, Text } from 'react-native'
import { motionPresets } from '@orbit/shared/theme'
import { describe, expect, it, vi } from 'vitest'
import { FlowScreen } from '@/components/ui/flow-screen'
import { ResultDialog } from '@/components/ui/result-dialog'
import { nativeWindows, press, renderNavigation } from './navigation-render'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => motion.reduced }))

type Tree = ReturnType<typeof renderNavigation>

const byTestId = (tree: Tree, testID: string) => tree.hosts().find((node) => node.props.testID === testID)

function result(overrides: Partial<Parameters<typeof ResultDialog>[0]> = {}) {
  return <ResultDialog title="Pronto!" sentence="A tarefa foi criada para amanhã às 8:00." primaryLabel="Ver no Hoje" orbitState="parado" onPrimary={vi.fn()} onClose={vi.fn()} {...overrides} />
}

function flow(resultNode?: React.ReactNode, onDismiss = vi.fn()) {
  return <FlowScreen label="Criar" onDismiss={onDismiss} result={resultNode}><Text>Quando?</Text></FlowScreen>
}

describe('the result dialog of a flow on Android and iOS', () => {
  it('draws inside the window of the flow, so no second Modal presents over the one that is presented', () => {
    const tree = renderNavigation(flow())
    expect(nativeWindows(tree)).toHaveLength(1)
    expect(byTestId(tree, 'result-dialog')).toBeUndefined()
    tree.update(flow(result()))
    expect(nativeWindows(tree)).toHaveLength(1)
    expect(byTestId(tree, 'result-dialog')).toBeDefined()
    expect(byTestId(tree, 'result-dialog-scrim')).toBeDefined()
    tree.unmount()
  })

  it('keeps its own Modal when no flow window holds it', () => {
    const tree = renderNavigation(result())
    expect(nativeWindows(tree)).toHaveLength(1)
    expect(byTestId(tree, 'result-dialog')).toBeDefined()
    tree.unmount()
  })

  it('sends the Android back press to the result while it shows, and to the flow after it closes', () => {
    const onDismiss = vi.fn()
    const onClose = vi.fn()
    const tree = renderNavigation(flow(result({ onClose }), onDismiss))
    expect(nativeWindows(tree)).toHaveLength(1)
    const back = () => nativeWindows(tree)[0]!.props.onRequestClose?.()
    back()
    expect([onClose.mock.calls.length, onDismiss.mock.calls.length]).toEqual([1, 0])
    tree.update(flow(undefined, onDismiss))
    back()
    expect([onClose.mock.calls.length, onDismiss.mock.calls.length]).toEqual([1, 1])
    tree.unmount()
  })

  it('closes on the scrim and hides the flow from assistive technology while it shows', () => {
    const onClose = vi.fn()
    const tree = renderNavigation(flow())
    expect(byTestId(tree, 'flow-screen')!.props.accessibilityViewIsModal).toBe(true)
    tree.update(flow(result({ onClose })))
    expect(byTestId(tree, 'flow-screen')!.props.accessibilityViewIsModal).toBe(false)
    press(byTestId(tree, 'result-dialog-scrim')!)
    expect(onClose).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('puts the keyboard away when the result opens, because the field it belonged to is under the scrim', () => {
    const dismiss = vi.spyOn(Keyboard, 'dismiss').mockImplementation(() => {})
    const tree = renderNavigation(flow())
    expect(dismiss).not.toHaveBeenCalled()
    tree.update(flow(result()))
    expect(dismiss).toHaveBeenCalledTimes(1)
    tree.unmount()
    dismiss.mockRestore()
  })

  it.each([false, true])('fades in with the dialog preset, and not under reduced motion %s', (reduced) => {
    motion.reduced = reduced
    const timing = vi.spyOn(Animated, 'timing')
    const tree = renderNavigation(flow(result()))
    const fades = timing.mock.calls.filter(([, config]) => config.duration === motionPresets.dialog.enterDuration)
    expect(fades).toHaveLength(reduced ? 0 : 1)
    tree.unmount()
    timing.mockRestore()
    motion.reduced = false
  })
})
