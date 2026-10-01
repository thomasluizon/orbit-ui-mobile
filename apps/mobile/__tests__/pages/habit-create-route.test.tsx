import React, { type ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildHabitCreateHref } from '@orbit/shared/utils'
import HabitCreateRoute from '@/app/habits/new'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { useUIStore } from '@/stores/ui-store'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
const route = vi.hoisted(() => {
  const params: Record<string, string | string[]> = {}
  return ({ params, back: vi.fn(), replace: vi.fn(), canGoBack: true, guard: vi.fn(), form: null as ComponentProps<typeof CreateHabitModal> | null })
})
vi.mock('expo-router', () => ({ useLocalSearchParams: () => route.params, useRouter: () => ({ back: route.back, replace: route.replace, canGoBack: () => route.canGoBack }) }))
vi.mock('expo-router/react-navigation', () => ({ usePreventRemove: route.guard }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: (props: ComponentProps<typeof CreateHabitModal>) => {
  route.form = props
  const Guard = props.leaveGuard
  return Guard ? <Guard leaving={false} requestLeave={props.onClose} /> : null
} }))
vi.mock('@/stores/offline-sync-store', () => ({ useOfflineSyncStore: () => undefined }))

beforeEach(() => { vi.clearAllMocks(); route.params = {}; route.canGoBack = true; useUIStore.getState().setAstraConversationOpen(false) })
async function mount() {
  let tree: import('react-test-renderer').ReactTestRenderer & { unmount: () => void }
  await TestRenderer.act(() => { tree = TestRenderer.create(<HabitCreateRoute />) as typeof tree })
  return async () => await TestRenderer.act(() => tree.unmount())
}
describe('native habit creation route', () => {
  it('uses the first value of repeated deep-link parameters', async () => {
    route.params = { title: ['Walk', 'Read'], from: ['/search', '/calendar'], origin: ['conversation', 'other'] }
    route.canGoBack = false
    const unmount = await mount()
    expect(route.form).toMatchObject({ initialTitle: 'Walk', fromConversation: true })
    await TestRenderer.act(() => route.form?.onClose())
    expect(route.replace).toHaveBeenCalledWith('/search')
    await unmount()
  })


  it.each(['/', '/calendar', '/search', '/profile'])('preserves prefills and returns from %s', async (from) => {
    route.params = Object.fromEntries(new URL(buildHabitCreateHref({ from, title: 'Walk & read', date: '2026-09-05' }), 'https://example.test').searchParams)
    const unmount = await mount()
    expect(route.form).toMatchObject({ open: true, presentation: 'screen', initialTitle: 'Walk & read', initialDate: '2026-09-05' })
    await TestRenderer.act(() => route.form?.onClose())
    expect(route.back).toHaveBeenCalledOnce()
    await unmount()
  })
  it('restores the conversation and connects native removal to Back', async () => {
    route.params = Object.fromEntries(new URL(buildHabitCreateHref({ from: '/', conversation: true }), 'https://example.test').searchParams)
    const unmount = await mount()
    expect(route.form?.fromConversation).toBe(true)
    expect(route.guard).toHaveBeenCalledWith(true, expect.any(Function))
    const dismiss = route.guard.mock.calls.at(0)?.[1] as (() => void) | undefined
    if (!dismiss) throw new Error('Native removal guard was not registered')
    await TestRenderer.act(dismiss)
    expect(route.back).toHaveBeenCalledOnce()
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    await unmount()
  })
  it('returns a direct link to Today without a back stack', async () => {
    route.canGoBack = false
    const unmount = await mount()
    await TestRenderer.act(() => route.form?.onClose())
    expect(route.replace).toHaveBeenCalledWith('/')
    expect(route.back).not.toHaveBeenCalled()
    await unmount()
  })
})
