import React, { StrictMode, type ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildHabitCreateHref } from '@orbit/shared/utils'
import { TodayModals } from '@/components/today/today-modals'
import { useUIStore } from '@/stores/ui-store'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
const navigation = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: navigation.push }), usePathname: () => '/' }))
vi.mock('@/components/habits/edit-habit-modal', () => ({ EditHabitModal: () => null }))
vi.mock('@/components/referral/referral-drawer', () => ({ ReferralDrawer: () => null }))
vi.mock('@/components/ui/confirm-sheet', () => ({ ConfirmSheet: () => null }))

beforeEach(() => { vi.clearAllMocks(); useUIStore.setState(useUIStore.getInitialState()) })

const props: ComponentProps<typeof TodayModals> = {
  showCreateModal: true,
  createInitialDate: '2026-09-05',
  onCloseCreateModal: () => useUIStore.getState().setShowCreateModal(false),
  editHabit: null,
  editHabitParentIsGeneral: null,
  onCloseEdit: () => {},
  editHabitOnSaved: null,
  showBulkDeleteConfirm: false,
  onBulkDeleteOpenChange: () => {},
  onConfirmBulkDelete: () => {},
  selectedCount: 0,
  showReferral: false,
  onCloseReferral: () => {},
}

describe('Today creation entry', () => {
  it.each([false, true])('pushes once with the selected date and conversation origin %s', async (conversation) => {
    useUIStore.setState({ showCreateModal: true, astraConversationOpen: conversation })
    let tree!: import('react-test-renderer').ReactTestRenderer
    await TestRenderer.act(() => { tree = TestRenderer.create(<StrictMode><TodayModals {...props} /></StrictMode>) })
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(buildHabitCreateHref({ from: '/', date: props.createInitialDate, conversation }))
    expect(useUIStore.getState().showCreateModal).toBe(false)
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
    await TestRenderer.act(() => tree.update(<></>))
  })
})
