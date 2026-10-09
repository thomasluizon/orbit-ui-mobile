import { describe, expect, it } from 'vitest'
import { createChatThreadScroll } from '../hooks/chat-thread-scroll-core'

describe('chat thread scroll', () => {
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
