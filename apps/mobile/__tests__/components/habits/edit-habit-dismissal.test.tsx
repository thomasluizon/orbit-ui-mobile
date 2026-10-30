import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { goalKeys } from '@orbit/shared/query'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { TrueSheet } from '@/__tests__/support/native-sheet-double'
import { PillButton } from '@/components/ui/pill-button'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { Input } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'

vi.unmock('@/components/ui/sheet')
vi.mock('@lodev09/react-native-true-sheet', async () => import('@/__tests__/support/native-sheet-double'))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-push-notifications', () => ({ usePushNotifications: () => ({ permission: 'granted' }) }))
vi.mock('@/hooks/use-push-subscriptions', () => ({ usePushSubscriptions: () => ({ count: 0, max: 5, isCurrentDeviceRegistered: false, isLoading: false, isError: false }) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => ({ data: undefined, isSuccess: false, isFetching: false, isError: false }) }))
vi.mock('@/hooks/use-habits', () => ({
  useUpdateHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useHabitDetail: () => ({ data: undefined, isPending: false, error: null, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }), useHasProAccess: () => false }))
vi.mock('@/hooks/use-config', async () => {
  const { DEFAULT_CONFIG } = await import('@orbit/shared/types/config')
  return { useConfig: () => ({ config: DEFAULT_CONFIG }) }
})
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ data: [], isPending: false }),
  useCreateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSuggestTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: [] }),
  useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-goals', () => ({ useGoals: () => ({ data: [], isLoading: false }), useCreateGoal: () => ({ mutateAsync: vi.fn(), isPending: false }) }))

let tree: ReactTestRenderer
afterEach(async () => { await act(() => tree.update(<></>)) })

function allByType<T extends React.ElementType>(type: T) {
  return tree.root.findAll(node => node.type === type) as unknown as { props: React.ComponentProps<T>; instance: TrueSheet }[]
}

async function renderEditor() {
  const onClose = vi.fn()
  const client = new QueryClient()
  client.setQueryData(goalKeys.lists(), [])
  await act(() => {
    tree = create(<QueryClientProvider client={client}><EditHabitModal open onClose={onClose}
      habit={createMockHabit({ title: 'Exercise', frequencyUnit: 'Day', checklistItems: [] })} /></QueryClientProvider>)
  })
  return onClose
}

async function addChecklistItem() {
  const add = allByType(Input).find(node => node.props.name === 'checklistItem')!
  await act(() => add.props.onChange('Shoes'))
  await act(() => add.props.onSubmit!())
  expect(allByType(BottomSheetAppTextInput).some(node => node.props.value === 'Shoes')).toBe(true)
}

const paths = ['hardware back', 'back gesture', 'swipe down', 'close icon', 'cancel'] as const
async function attempt(path: typeof paths[number]) {
  await act(() => {
    if (path === 'close icon') (tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'common.close')[0]!.props.onPress as () => void)()
    else if (path === 'cancel') allByType(PillButton).find(node => node.props.children === 'common.cancel')!.props.onClick!()
    else allByType(TrueSheet)[0]!.instance.attempt(path)
  })
}

describe('Edit habit dismissal through the native sheet', () => {
  it.each(paths)('asks before discarding an added checklist item through %s', async path => {
    const onClose = await renderEditor()
    await addChecklistItem()
    await attempt(path)
    expect(allByType(Sheet).map(node => node.props.title)).toContain('common.discardChangesTitle')
    expect(onClose).not.toHaveBeenCalled()
    await act(() => allByType(PillButton).find(node => node.props.children === 'common.keepEditing')!.props.onClick!())
    expect(allByType(TrueSheet)).toHaveLength(1)
    expect(allByType(BottomSheetAppTextInput).some(node => node.props.value === 'Shoes')).toBe(true)
    await attempt(path)
    await act(() => allByType(PillButton).find(node => node.props.children === 'common.discardChangesAction')!.props.onClick!())
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps an added checklist item when the dirty backdrop is tapped', async () => {
    const onClose = await renderEditor()
    await addChecklistItem()
    await act(() => allByType(TrueSheet)[0]!.instance.attempt('backdrop'))
    expect(onClose).not.toHaveBeenCalled()
    expect(allByType(TrueSheet)).toHaveLength(1)
  })

  it.each([...paths, 'backdrop'] as const)('closes an unchanged editor through %s', async path => {
    const onClose = await renderEditor()
    if (path === 'backdrop') await act(() => allByType(TrueSheet)[0]!.instance.attempt(path))
    else await attempt(path)
    expect(onClose).toHaveBeenCalledOnce()
    expect(allByType(TrueSheet)).toHaveLength(1)
  })
})
