import { createElement, useEffect, useState } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUseDelayedLoading } from '../hooks/delayed-loading-core'

const useDelayedLoading = createUseDelayedLoading({ useState, useEffect })
let tree: ReactTestRenderer | undefined
let visible: boolean

function Loading({ busy, day }: { busy: boolean; day: string }) {
  visible = useDelayedLoading(busy, day)
  return null
}

function render(busy: boolean, day = 'selected') {
  void act(() => {
    const content = createElement(Loading, { busy, day })
    if (tree) tree.update(content)
    else tree = create(content)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})

afterEach(() => {
  void act(() => tree?.unmount())
  tree = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('delayed loading', () => {
  it('shows loading at 300 ms and clears it when the request settles', () => {
    render(true)
    expect(visible).toBe(false)
    void act(() => { vi.advanceTimersByTime(299) })
    expect(visible).toBe(false)
    void act(() => { vi.advanceTimersByTime(1) })
    expect(visible).toBe(true)
    render(false)
    expect(visible).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restarts the full delay when the selected key changes', () => {
    render(true)
    void act(() => { vi.advanceTimersByTime(250) })
    render(true, 'next')
    void act(() => { vi.advanceTimersByTime(50) })
    expect(visible).toBe(false)
    void act(() => { vi.advanceTimersByTime(249) })
    expect(visible).toBe(false)
    void act(() => { vi.advanceTimersByTime(1) })
    expect(visible).toBe(true)
    render(true, 'newest')
    expect(visible).toBe(false)
  })

  it('never flashes for a quick request and releases an unmounted timer', () => {
    render(false)
    expect(vi.getTimerCount()).toBe(0)
    render(true)
    void act(() => { vi.advanceTimersByTime(299) })
    render(false)
    void act(() => { vi.advanceTimersByTime(1) })
    expect(visible).toBe(false)
    render(true)
    void act(() => tree?.unmount())
    tree = undefined
    expect(vi.getTimerCount()).toBe(0)
  })
})
