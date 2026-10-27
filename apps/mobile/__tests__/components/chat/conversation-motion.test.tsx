import React from 'react'
import { act, create } from 'react-test-renderer'
import * as Reanimated from 'react-native-reanimated'
import { Text, Pressable } from 'react-native'
import { beforeEach, expect, it, vi } from 'vitest'
import { motionDurations, motionLayerTiming } from '@orbit/shared/theme'
import { ConversationChange, ConversationReveal } from '@/components/chat/conversation-motion'

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
