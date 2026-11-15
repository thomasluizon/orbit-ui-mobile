import React, { useState } from 'react'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import * as Reanimated from 'react-native-reanimated'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { motionDurations } from '@orbit/shared/theme'
import type { PendingOperationMessageState } from '@orbit/shared/chat'
import type { RevisePendingOperation } from '@orbit/shared/hooks'
import { makePendingAgentOperation } from '@orbit/shared/test-support/chat-fixtures'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { controlName } from '../../support/react-test-renderer'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

type SharedValue = { value: unknown; assigned: unknown[] }
const motion = vi.hoisted(() => ({ reduced: false, reading: undefined as SharedValue[] | undefined }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => motion.reduced }))
/**
 * Each shared value is stable and remembers what it was set to, and each animated style names the shared values it read,
 * so the test reads the opacity of the card's own change and not that of the block frame inside it.
 */
vi.mock('react-native-reanimated', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native-reanimated')>()
  const { useState: useStable } = await import('react')
  return {
    ...actual,
    useSharedValue: (initial: unknown) => useStable(() => {
      let current = initial
      const shared: SharedValue = {
        assigned: [],
        get value() { motion.reading?.push(shared); return current },
        set value(next) { shared.assigned.push(next); current = next },
      }
      return shared
    })[0],
    useAnimatedStyle: (updater: () => object) => {
      motion.reading = []
      const style = updater()
      const sharedValues = motion.reading
      motion.reading = undefined
      return { ...style, sharedValues }
    },
  }
})
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/ui/sheet', async () => await import('../../support/sheet-double'))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: false, timeZone: 'UTC' } }) }))

const items = ['Run', 'Read'].map((name, index) => ({
  itemId: `habit-${index}`, entityId: `habit-${index}`, entityName: name, stateFingerprint: `state-${index}`,
  fields: [{ entityId: `habit-${index}`, entityName: name, field: 'date', oldValue: null, newValue: '2026-09-26', valueType: 'date' }],
}))
const preview = makePendingAgentOperation({ riskClass: 'Low', confirmationRequirement: 'None', previewFingerprint: 'preview-1', items, changeTargetCount: 2 })
const confirm = vi.fn()

/** The card as the conversation holds it: each settled patch returns as the saved state of the message. */
function ConversationCard({ onRevise }: Readonly<{ onRevise?: RevisePendingOperation }>) {
  const [savedState, setSavedState] = useState<PendingOperationMessageState>()
  return <PendingOperationCard pendingOperation={preview} savedState={savedState} onStateChange={(patch) => setSavedState((current) => ({ ...current, ...patch }))}
    onRevise={onRevise} onConfirmExecute={confirm} onPrepareStepUp={vi.fn()} onVerifyStepUp={vi.fn()} />
}

function control(tree: ReactTestRenderer, label: string): ReactTestInstance | undefined {
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && controlName(node) === label)[0]
}

function rejection(tree: ReactTestRenderer): ReactTestInstance {
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'preview-rejection-status')[0]!
}

async function press(tree: ReactTestRenderer, label: string) {
  await TestRenderer.act(async () => { (control(tree, label)!.props.onPress as () => void)(); await Promise.resolve() })
  await TestRenderer.act(async () => { await Promise.resolve() })
}

async function mount(onRevise?: RevisePendingOperation) {
  let tree!: ReactTestRenderer
  await TestRenderer.act(() => { tree = TestRenderer.create(<ConversationCard onRevise={onRevise} />) })
  return tree
}

const flows = {
  approve: async () => {
    const tree = await mount()
    await press(tree, 'chat.operation.approve')
    expect(confirm).toHaveBeenCalledExactlyOnceWith(preview.id)
    return tree
  },
  'reject through a revision': async () => {
    const tree = await mount(vi.fn().mockResolvedValue({ ok: true, result: { cancelled: true, preview: null } }))
    await press(tree, 'chat.operation.reject')
    expect(rejection(tree).props.children).toBe('chat.operation.rejected')
    return tree
  },
  'reject with no revision': async () => {
    const tree = await mount()
    await press(tree, 'chat.operation.reject')
    expect(rejection(tree).props.children).toBe('chat.operation.rejected')
    return tree
  },
}
const outcomes = Object.keys(flows) as (keyof typeof flows)[]

/** The presentation of the card's own change, the outermost one, with the shared values it reads. */
function cardChange(tree: ReactTestRenderer) {
  const host = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'conversation-change')[0]!
  const presentation = (host.props.style as unknown[]).find((layer) => typeof layer === 'object' && layer !== null && 'sharedValues' in layer) as { opacity: number; sharedValues: SharedValue[] }
  return { presentation, opacity: presentation.sharedValues[0]! }
}

beforeEach(() => {
  vi.clearAllMocks()
  motion.reduced = false
  confirm.mockResolvedValue({ ok: true, response: { operation: { status: 'Succeeded' } } })
})

describe('Android preview approve and reject motion', () => {
  it.each(outcomes)('settles the row once the %s outcome replaces the preview in the same render', async (outcome) => {
    const timing = vi.spyOn(Reanimated, 'withTiming')
    const tree = await flows[outcome]()
    expect(control(tree, 'chat.operation.approve')).toBeUndefined()
    const { presentation, opacity } = cardChange(tree)
    expect(opacity.assigned).toContain(0.6)
    expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: motionDurations.micro }))
    expect(Object.keys(presentation).sort((first, second) => first.localeCompare(second)), 'the settle moves and scales nothing').toEqual(['opacity', 'sharedValues'])
    void TestRenderer.act(() => tree.unmount())
  })

  it.each(outcomes)('shows the %s outcome at once with no settle under reduced motion', async (outcome) => {
    motion.reduced = true
    const timing = vi.spyOn(Reanimated, 'withTiming')
    const tree = await flows[outcome]()
    expect(control(tree, 'chat.operation.approve')).toBeUndefined()
    const { opacity } = cardChange(tree)
    expect(opacity.assigned).not.toContain(0.6)
    expect(opacity.value).toBe(1)
    expect(timing, 'no change of the card or its block frame animates').not.toHaveBeenCalledWith(1, expect.objectContaining({ duration: motionDurations.micro }))
    void TestRenderer.act(() => tree.unmount())
  })
})
