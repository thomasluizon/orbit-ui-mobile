import { Animated } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { motionDurations } from '@orbit/shared/theme'
import { QuestionFlow } from '@/components/ui/question-flow'
import { renderNavigation } from './navigation-render'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => motion.reduced }))

function flow({ stepKey = 'tags', line, lineKey }: Readonly<{ stepKey?: string; line: string; lineKey?: string }>) {
  return <QuestionFlow flow="habit_create" question="Quer juntar com coisas parecidas?" line={line} lineKey={lineKey} stepKey={stepKey}
    position={1} total={2} progressLabel="Passo 1 de 2" backLabel="Voltar" closeLabel="Fechar" direction={1} onClose={vi.fn()} />
}

type Tree = ReturnType<typeof renderNavigation>
const lineHost = (tree: Tree) => tree.hosts().find((node) => node.props.testID === 'question-flow-line')
const lineOpacity = (tree: Tree) => (lineHost(tree)?.props.style as { opacity?: { value: number } }[] | undefined)?.find((style) => style.opacity)?.opacity?.value

afterEach(() => { motion.reduced = false; vi.restoreAllMocks() })

describe('the Orbit line of the flow frame on Android', () => {
  it('swaps the line with no motion when the caller gives no line key', () => {
    const timing = vi.spyOn(Animated, 'timing')
    const tree = renderNavigation(flow({ line: 'Primeira' }))
    tree.update(flow({ line: 'Segunda' }))
    expect(lineHost(tree)).toBeUndefined()
    expect(tree.hosts().some((node) => node.type === 'Text' && node.props.children === 'Segunda')).toBe(true)
    expect(timing.mock.calls.some(([, config]) => (config as { duration?: number }).duration === motionDurations.micro)).toBe(false)
    tree.unmount()
  })

  it('fades a new line in when only the line key changes, and not on the first line of a step', () => {
    const timing = vi.spyOn(Animated, 'timing')
    const tree = renderNavigation(flow({ line: 'Uma tag junta itens parecidos.', lineKey: 'intro' }))
    expect(lineOpacity(tree)).toBe(1)
    tree.update(flow({ line: 'Saúde ainda está vazia.', lineKey: 'tag-1' }))
    expect(lineOpacity(tree)).toBe(0)
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, duration: motionDurations.micro }))
    tree.update(flow({ stepKey: 'goals', line: 'Uma meta soma o progresso.', lineKey: 'goals-intro' }))
    expect(lineOpacity(tree)).toBe(1)
    tree.unmount()
  })

  it('swaps the line at once under reduced motion', () => {
    motion.reduced = true
    const timing = vi.spyOn(Animated, 'timing')
    const tree = renderNavigation(flow({ line: 'Uma tag junta itens parecidos.', lineKey: 'intro' }))
    tree.update(flow({ line: 'Saúde ainda está vazia.', lineKey: 'tag-1' }))
    expect(lineOpacity(tree)).toBe(1)
    expect(timing.mock.calls.some(([, config]) => (config as { duration?: number }).duration === motionDurations.micro)).toBe(false)
    tree.unmount()
  })
})
