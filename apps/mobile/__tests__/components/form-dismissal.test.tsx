import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditNameSheet } from '@/app/(tabs)/profile/_components/edit-name-sheet'
import { TrueSheet } from '@/__tests__/support/native-sheet-double'
import { Sheet } from '@/components/ui/sheet'
import { AppTextInput } from '@/components/ui/app-text-input'
import { PillButton } from '@/components/ui/pill-button'

vi.unmock('@/components/ui/sheet')
vi.mock('@lodev09/react-native-true-sheet', async () => import('@/__tests__/support/native-sheet-double'))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Alex' }, patchProfile: vi.fn() }) }))

let tree: ReactTestRenderer
afterEach(async () => { await act(() => tree.update(<></>)) })

function allByType<T extends React.ElementType>(type: T) {
  return tree.root.findAll(node => node.type === type) as unknown as { props: React.ComponentProps<T>; instance: TrueSheet }[]
}

async function openForm(dirty: boolean) {
  const onClose = vi.fn()
  await act(() => {
    tree = create(<QueryClientProvider client={new QueryClient()}><EditNameSheet open onClose={onClose} /></QueryClientProvider>)
  })
  if (dirty) await act(() => allByType(AppTextInput).find(node => node.props.testID === 'edit-name-input')!.props.onChangeText!('Alex edited'))
  return onClose
}

const paths = ['hardware back', 'back gesture', 'swipe down', 'close icon', 'cancel'] as const
async function attempt(path: typeof paths[number]) {
  await act(() => {
    if (path === 'close icon') {
      const controls = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'common.close')
      ;(controls[0]!.props.onPress as () => void)()
    } else if (path === 'cancel') allByType(PillButton).find(node => node.props.children === 'common.cancel')!.props.onClick!()
    else allByType(TrueSheet)[0]!.instance.attempt(path)
  })
}

describe('name form dismissal', () => {
  it.each(paths)('confirms unsaved input through %s', async path => {
    const onClose = await openForm(true)
    await attempt(path)
    expect(allByType(Sheet).map(node => node.props.title)).toContain('common.discardChangesTitle')
    expect(onClose).not.toHaveBeenCalled()
    await act(() => allByType(PillButton).find(node => node.props.children === 'common.keepEditing')!.props.onClick!())
    expect(allByType(Sheet)).toHaveLength(1)
    expect(allByType(AppTextInput).some(node => node.props.value === 'Alex edited')).toBe(true)
    await attempt(path)
    await act(() => allByType(PillButton).find(node => node.props.children === 'common.discardChangesAction')!.props.onClick!())
    expect(onClose).toHaveBeenCalledOnce()
  })

  it.each([...paths, 'backdrop'] as const)('closes clean input through %s', async path => {
    const onClose = await openForm(false)
    if (path === 'backdrop') await act(() => allByType(TrueSheet)[0]!.instance.attempt(path))
    else await attempt(path)
    expect(allByType(Sheet).map(node => node.props.title)).not.toContain('common.discardChangesTitle')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps dirty input on a backdrop tap', async () => {
    const onClose = await openForm(true)
    await act(() => allByType(TrueSheet)[0]!.instance.attempt('backdrop'))
    expect(onClose).not.toHaveBeenCalled()
    expect(allByType(Sheet)).toHaveLength(1)
  })
})
