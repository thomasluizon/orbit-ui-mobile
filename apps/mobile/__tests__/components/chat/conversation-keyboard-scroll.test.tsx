import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { __emitKeyboardEvent } from '../../../test-mocks/react-native'
import { useConversationKeyboardScroll } from '@/components/chat/use-conversation-keyboard-scroll'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

async function renderScrollOwner() {
  const scrollToEnd = vi.fn()
  const scrollToOffset = vi.fn()
  const listRef = { current: { scrollToEnd, scrollToOffset } }
  let controls!: ReturnType<typeof useConversationKeyboardScroll>
  function ScrollOwner() {
    controls = useConversationKeyboardScroll(listRef)
    return null
  }
  let tree!: import('react-test-renderer').ReactTestRenderer
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<ScrollOwner />)
    await Promise.resolve()
  })
  return { controls: () => controls, scrollToEnd, scrollToOffset, tree }
}

describe('conversation keyboard scroll', () => {
  it('shows the last message above the keyboard and restores the previous offset', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
      callback(0)
      return 0
    })
    const owner = await renderScrollOwner()
    await TestRenderer.act(async () => {
      owner.controls().onScroll({ nativeEvent: { contentOffset: { y: 180 } } })
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400, height: 400 } })
      owner.controls().onLayout()
      await Promise.resolve()
    })
    expect(owner.scrollToEnd).toHaveBeenCalledWith({ animated: false })
    await TestRenderer.act(async () => {
      owner.controls().onScroll({ nativeEvent: { contentOffset: { y: 420 } } })
      __emitKeyboardEvent('keyboardDidHide')
      owner.controls().onLayout()
      await Promise.resolve()
    })
    expect(owner.scrollToOffset).toHaveBeenCalledWith({ offset: 180, animated: false })
    await TestRenderer.act(async () => {
      owner.tree.update(<></>)
      await Promise.resolve()
    })
    vi.unstubAllGlobals()
  })

  it('does not restore an old offset on an unrelated layout after dismissal', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
      callback(0)
      return 0
    })
    const owner = await renderScrollOwner()
    await TestRenderer.act(async () => {
      owner.controls().onScroll({ nativeEvent: { contentOffset: { y: 180 } } })
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400, height: 400 } })
      __emitKeyboardEvent('keyboardDidHide')
      await Promise.resolve()
    })
    expect(owner.scrollToOffset).toHaveBeenCalledTimes(1)
    await TestRenderer.act(async () => {
      owner.controls().onLayout()
      await Promise.resolve()
    })
    expect(owner.scrollToOffset).toHaveBeenCalledTimes(1)
    await TestRenderer.act(async () => {
      owner.tree.update(<></>)
      await Promise.resolve()
    })
    vi.unstubAllGlobals()
  })

  it('keeps the pre-keyboard offset during a resize scroll before restoration', async () => {
    const frames: (() => void)[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      frames.push(callback)
      return frames.length
    })
    const owner = await renderScrollOwner()
    await TestRenderer.act(async () => {
      owner.controls().onScroll({ nativeEvent: { contentOffset: { y: 180 } } })
      __emitKeyboardEvent('keyboardDidShow', { endCoordinates: { screenY: 400, height: 400 } })
      frames.shift()?.()
      __emitKeyboardEvent('keyboardDidHide')
      owner.controls().onScroll({ nativeEvent: { contentOffset: { y: 80 } } })
      frames.shift()?.()
      await Promise.resolve()
    })
    expect(owner.scrollToOffset).toHaveBeenCalledWith({ offset: 180, animated: false })
    await TestRenderer.act(async () => {
      owner.tree.update(<></>)
      await Promise.resolve()
    })
    vi.unstubAllGlobals()
  })
})
