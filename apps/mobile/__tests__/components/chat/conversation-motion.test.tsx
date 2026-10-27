import React from 'react'
import { act, create } from 'react-test-renderer'
import * as Reanimated from 'react-native-reanimated'
import { Text, Pressable, View } from 'react-native'
import { beforeEach, expect, it, vi } from 'vitest'
import { motionDurations, motionLayerTiming } from '@orbit/shared/theme'
import { ConversationChange, ConversationReveal, ConversationCrossfade } from '@/components/chat/conversation-motion'
import { measureInteractionFills } from '../../support/interaction-fill-geometry'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => preference.reduced }))
beforeEach(() => { vi.clearAllMocks(); preference.reduced = false })

it('uses the conversation tokens without delaying an action', () => {
  const timing = vi.spyOn(Reanimated, 'withTiming')
  const delay = vi.spyOn(Reanimated, 'withDelay')
  const press = vi.fn()
  let tree!: ReturnType<typeof create> & { unmount(): void }
  void act(() => { tree = create(<ConversationReveal animate index={2}><Pressable onPress={press}><Text>Approve</Text></Pressable></ConversationReveal>) as typeof tree })
  expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: motionDurations.conversation }))
  expect(delay).toHaveBeenCalledWith(2 * motionLayerTiming.contentStagger, 1)
  const button = tree.root.findAll(node => node.type === Pressable)[0]!
  void act(() => (button.props.onPress as () => void)())
  expect(press).toHaveBeenCalledOnce()
  void act(() => tree.unmount())
})

it('settles entry and replacement when reduced motion changes live', () => {
  const timing = vi.spyOn(Reanimated, 'withTiming')
  const cancel = vi.spyOn(Reanimated, 'cancelAnimation')
  let tree!: ReturnType<typeof create> & { unmount(): void }
  void act(() => { tree = create(<ConversationReveal animate><ConversationChange changeKey="preview"><Text>Preview</Text></ConversationChange></ConversationReveal>) as typeof tree })
  void act(() => tree.update(<ConversationReveal animate><ConversationChange changeKey="done"><Text>Saved</Text></ConversationChange></ConversationReveal>))
  expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: motionDurations.micro }))
  preference.reduced = true
  timing.mockClear()
  void act(() => tree.update(<ConversationReveal animate><ConversationChange changeKey="done"><Text>Saved</Text></ConversationChange></ConversationReveal>))
  expect(timing).not.toHaveBeenCalled()
  expect(cancel).toHaveBeenCalled()
  expect(tree.root.findAll(node => node.type === Text)[0]!.props.children).toBe('Saved')
  void act(() => tree.unmount())
})

it('starts reduced motion without translation or a delayed reveal', () => {
  preference.reduced = true
  const delay = vi.spyOn(Reanimated, 'withDelay')
  let tree!: ReturnType<typeof create> & { unmount(): void }
  void act(() => { tree = create(<ConversationReveal animate index={100}><Text>Reply</Text></ConversationReveal>) as typeof tree })
  expect(delay).not.toHaveBeenCalled()
  const host = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'conversation-reveal')[0]!
  expect(host.props.style).toEqual(expect.arrayContaining([{ opacity: 1, transform: [{ translateY: 0 }] }]))
  void act(() => tree.unmount())
})

it('makes an outgoing refresh inaccessible and removes it immediately for reduced motion', () => {
  let tree!: ReturnType<typeof create>
  void act(() => { tree = create(<ConversationCrossfade changeKey="first"><Text>Old result</Text></ConversationCrossfade>) })
  void act(() => tree.update(<ConversationCrossfade changeKey="second"><Text>New result</Text></ConversationCrossfade>))
  expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.importantForAccessibility === 'no-hide-descendants' && node.props.pointerEvents === 'none')).toHaveLength(1)
  preference.reduced = true
  void act(() => tree.update(<ConversationCrossfade changeKey="second"><Text>New result</Text></ConversationCrossfade>))
  expect(tree.root.findAll(node => node.type === Text && node.props.children === 'Old result')).toHaveLength(0)
  expect(tree.root.findAll(node => node.type === Text && node.props.children === 'New result')).toHaveLength(1)
  void act(() => tree.update(<></>))
})

it.each([412, 1352].flatMap(width => [false, true].map(growing => ({ width, growing }))))('keeps outgoing Android paint before the next item at $width, growing $growing', ({ width, growing }) => {
  vi.useFakeTimers()
  let tree!: ReturnType<typeof create> & { toJSON: () => Parameters<typeof measureInteractionFills>[0]; unmount(): void }
  const content = (revision: string, height: number) => <View style={{ gap: 16 }}>
    <ConversationCrossfade changeKey={revision}><View testID={revision} style={{ height }}><Text>{revision}</Text></View></ConversationCrossfade>
    <View testID="next" style={{ height: 48 }}><Text>Next message</Text></View>
  </View>
  try {
    void act(() => { tree = create(content('previous', growing ? 48 : 240)) as typeof tree })
    void act(() => tree.update(content('current', growing ? 240 : 48)))
    void act(() => { vi.advanceTimersByTime(motionDurations.micro / 2) })
    const geometry = measureInteractionFills(tree.toJSON(), width, false)
    const outgoing = geometry.find(box => box.style.position === 'absolute')!
    const snapshot = geometry.find(box => box.host.props.testID === 'previous')!
    const current = geometry.find(box => box.host.props.testID === 'current')!
    const next = geometry.find(box => box.host.props.testID === 'next')!
    const paintedBottom = outgoing.style.overflow === 'hidden' ? Math.min(snapshot.bottom, outgoing.bottom) : snapshot.bottom
    expect(paintedBottom).toBeLessThanOrEqual(current.bottom)
    expect(paintedBottom).toBeLessThan(next.top)
    expect(next.top - current.bottom).toBe(16)
    expect(outgoing.bottom).toBe(current.bottom)
    void act(() => { vi.advanceTimersByTime(motionDurations.micro / 2) })
    expect(tree.root.findAll(node => node.props.testID === 'previous')).toHaveLength(0)
  } finally { void act(() => tree.unmount()); vi.useRealTimers() }
})
