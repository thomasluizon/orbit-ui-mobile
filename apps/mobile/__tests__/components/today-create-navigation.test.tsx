import React, { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HABIT_CREATE_OVERLAY_ID, buildHabitCreateHref } from '@orbit/shared/utils'
import { PushHabitCreate } from '@/components/shell/push-habit-create'
import { useUIStore } from '@/stores/ui-store'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
const navigation = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: navigation.push }) }))

beforeEach(() => {
  vi.clearAllMocks()
  useUIStore.setState(useUIStore.getInitialState())
})

async function mount(element: React.ReactElement) {
  let tree!: import('react-test-renderer').ReactTestRenderer
  await TestRenderer.act(() => { tree = TestRenderer.create(<StrictMode>{element}</StrictMode>) })
  return tree
}

describe('Create navigation owned by the root layout', () => {
  it.each([false, true])('pushes once with the selected date and conversation origin %s', async (conversation) => {
    const tree = await mount(<PushHabitCreate pathname="/" date="2026-09-05" />)
    expect(navigation.push).not.toHaveBeenCalled()
    await TestRenderer.act(() => { useUIStore.setState({ showCreateModal: true, orbitConversationOpen: conversation }) })
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(buildHabitCreateHref({ from: '/', date: '2026-09-05', conversation }))
    expect(useUIStore.getState().showCreateModal).toBe(false)
    expect(useUIStore.getState().orbitConversationOpen).toBe(false)
    expect(useUIStore.getState().openOverlayIds).toContain(HABIT_CREATE_OVERLAY_ID)
    await TestRenderer.act(() => tree.update(<></>))
  })

  it('pushes on a flag that was already raised when it mounts', async () => {
    useUIStore.setState({ showCreateModal: true })
    const tree = await mount(<PushHabitCreate pathname="/" date="2026-09-05" />)
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(buildHabitCreateHref({ from: '/', date: '2026-09-05' }))
    await TestRenderer.act(() => tree.update(<></>))
  })

  it('leaves an unseeded entry without a date', async () => {
    useUIStore.setState({ showCreateModal: true })
    const tree = await mount(<PushHabitCreate pathname="/" date={null} />)
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/habits/new?from=%2F')
    await TestRenderer.act(() => tree.update(<></>))
  })
})
