import React from 'react'
import { act, create } from 'react-test-renderer'
import { Text, View } from 'react-native'
import { __setMeasureInWindowImpl, __resetTestHostConfig } from '@/test-mocks/react-native'
import * as Reanimated from 'react-native-reanimated'
import { beforeEach, expect, it, vi } from 'vitest'
import { motionDurations } from '@orbit/shared/theme'
import { ConversationComposerMotion, ConversationComposerMotionProvider } from '@/components/shell/conversation-composer-motion'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => preference.reduced }))
vi.mock('react-native-reanimated', async original => {
  const actual = await original<typeof import('react-native-reanimated')>()
  return { ...actual, default: { ...actual.default, View: (await import('react-native')).View } }
})
beforeEach(() => { vi.clearAllMocks(); __resetTestHostConfig(); preference.reduced = false })

function Composer({ source }: Readonly<{ source: boolean }>) {
  return <ConversationComposerMotion testID={source ? "source-composer" : "target-composer"} source={source} destination={!source} style={{ minHeight: 56 }}><Text>Draft</Text></ConversationComposerMotion>
}

it('measures the Hoje composer and moves its destination without losing the draft', () => {
  let y = 700
  const measure = vi.fn((callback: (x: number, y: number, width: number, height: number) => void) => callback(16, y, 300, 56))
  __setMeasureInWindowImpl(measure)
  const timing = vi.spyOn(Reanimated, 'withTiming')
  let tree!: ReturnType<typeof create>
  void act(() => { tree = create(<ConversationComposerMotionProvider><Composer source /></ConversationComposerMotionProvider>) })
  const layout = () => (tree.root.findAll(node => node.type === View && node.props.testID === (y === 700 ? 'source-composer' : 'target-composer'))[0]!.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { width: 300, height: 56 } } })
  void act(layout)
  y = 640
  void act(() => tree.update(<ConversationComposerMotionProvider><Composer source /><Composer source={false} /></ConversationComposerMotionProvider>))
  void act(layout)
  expect(measure).toHaveBeenCalledTimes(2)
  expect(timing).toHaveBeenCalledWith(0, expect.objectContaining({ duration: motionDurations.conversation }))
  expect(tree.root.findAll(node => node.type === Text && node.props.children === 'Draft')).toHaveLength(2)
  preference.reduced = true
  const cancel = vi.spyOn(Reanimated, 'cancelAnimation')
  void act(() => tree.update(<ConversationComposerMotionProvider><Composer source /><Composer source={false} /></ConversationComposerMotionProvider>))
  expect(cancel).toHaveBeenCalled()
  void act(() => tree.update(<></>))
})

it('opens from a measured source instantly under reduced motion', () => {
  preference.reduced = true
  const timing = vi.spyOn(Reanimated, 'withTiming')
  let tree!: ReturnType<typeof create>
  void act(() => { tree = create(<ConversationComposerMotionProvider><Composer source /><Composer source={false} /></ConversationComposerMotionProvider>) })
  expect(timing).not.toHaveBeenCalled()
  void act(() => tree.update(<></>))
})
