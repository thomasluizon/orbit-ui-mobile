import { describe, expect, it } from 'vitest'
import { createChatThreadScroll } from '../hooks/chat-thread-scroll-core'

describe('chat thread scroll', () => {
  it.each([587, undefined])('starts a new baseline when following resumes at offset %s', currentOffset => {
    const scroll = createChatThreadScroll()
    scroll.recordScroll(627, 627)
    scroll.followLatest(currentOffset)
    scroll.recordScroll(587, 627)
    expect(scroll.isFollowing()).toBe(true)
    scroll.recordScroll(560, 722)
    expect(scroll.isFollowing()).toBe(false)
  })

  it('stops following when small fractional upward steps leave the bottom', () => {
    const scroll = createChatThreadScroll()
    scroll.recordScroll(900, 900)
    scroll.recordScroll(899.4, 900)
    scroll.recordScroll(898.8, 900)
    expect(scroll.isFollowing()).toBe(false)
  })

  it('follows on opening and stops when the person scrolls toward earlier messages', () => {
    const scroll = createChatThreadScroll()
    expect(scroll.isFollowing()).toBe(true)
    scroll.recordScroll(800, 800)
    scroll.recordScroll(400, 800)
    expect(scroll.isFollowing()).toBe(false)
    scroll.recordScroll(500, 1000)
    expect(scroll.isFollowing()).toBe(false)
    scroll.recordScroll(1000, 1000)
    expect(scroll.isFollowing()).toBe(true)
  })

  it('resumes after a deliberate action and still detects an immediate upward scroll', () => {
    const scroll = createChatThreadScroll()
    scroll.recordScroll(800, 800)
    scroll.recordScroll(400, 800)
    scroll.followLatest()
    scroll.recordScroll(450, 1000)
    expect(scroll.isFollowing()).toBe(true)
    scroll.recordScroll(180, 1000)
    expect(scroll.isFollowing()).toBe(false)
  })
})
