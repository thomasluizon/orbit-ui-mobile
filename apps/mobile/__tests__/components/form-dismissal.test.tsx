import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditNameSheet } from '@/app/(tabs)/profile/_components/edit-name-sheet'
import { ChecklistTemplates } from '@/components/habits/checklist-templates'
import { TrueSheet } from '@/__tests__/support/native-sheet-double'
import { renderedText } from '@/__tests__/support/react-test-renderer'
import { Sheet } from '@/components/ui/sheet'
import { ListRow } from '@/components/ui/list-row'
import { AppTextInput } from '@/components/ui/app-text-input'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { PillButton } from '@/components/ui/pill-button'

vi.unmock('@/components/ui/sheet')
vi.mock('@lodev09/react-native-true-sheet', async () => import('@/__tests__/support/native-sheet-double'))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Alex' }, patchProfile: vi.fn() }) }))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: [] }),
  useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: vi.fn() }),
}))

let tree: ReactTestRenderer
afterEach(async () => { await act(() => tree.update(<></>)) })

function allByType<T extends React.ElementType>(type: T) {
  return tree.root.findAll(node => node.type === type) as unknown as { props: React.ComponentProps<T>; instance: TrueSheet }[]
}

async function openForm(form: 'name' | 'template', dirty: boolean) {
  const onClose = vi.fn()
  await act(() => {
    tree = create(<QueryClientProvider client={new QueryClient()}>{form === 'name'
      ? <EditNameSheet open onClose={onClose} />
      : <ChecklistTemplates items={[{ text: 'Shoes', isChecked: false }]} onLoad={vi.fn()} />}</QueryClientProvider>)
  })
  if (form === 'name') {
    if (dirty) await act(() => allByType(AppTextInput).find(node => node.props.testID === 'edit-name-input')!.props.onChangeText!('Alex edited'))
  } else {
    await act(() => allByType(ListRow).find(node => node.props.title === 'habits.form.useTemplate')!.props.onClick!())
    const save = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && renderedText(node) === 'habits.form.saveCurrentList')[0]
    await act(() => (save!.props.onPress as () => void)())
    if (dirty) await act(() => allByType(BottomSheetAppTextInput)[0]!.props.onChangeText!('Workout'))
  }
  return onClose
}

const paths = ['hardware back', 'back gesture', 'swipe down', 'close icon', 'cancel'] as const
async function attempt(path: typeof paths[number], form: 'name' | 'template') {
  await act(() => {
    if (path === 'close icon' || (path === 'cancel' && form === 'template')) {
      const controls = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'common.close')
      ;(controls[path === 'cancel' ? controls.length - 1 : 0]!.props.onPress as () => void)()
    } else if (path === 'cancel') allByType(PillButton).find(node => node.props.children === 'common.cancel')!.props.onClick!()
    else allByType(TrueSheet)[0]!.instance.attempt(path)
  })
}

describe.each(['name', 'template'] as const)('%s form dismissal', form => {
  it.each(paths)('confirms unsaved input through %s', async path => {
    const onClose = await openForm(form, true)
    await attempt(path, form)
    expect(allByType(Sheet).map(node => node.props.title)).toContain('common.discardChangesTitle')
    expect(onClose).not.toHaveBeenCalled()
    await act(() => allByType(PillButton).find(node => node.props.children === 'common.keepEditing')!.props.onClick!())
    expect(allByType(Sheet)).toHaveLength(1)
    expect(allByType(AppTextInput).some(node => node.props.value === 'Alex edited') || allByType(BottomSheetAppTextInput).some(node => node.props.value === 'Workout')).toBe(true)
    await attempt(path, form)
    await act(() => allByType(PillButton).find(node => node.props.children === 'common.discardChangesAction')!.props.onClick!())
    if (form === 'name') expect(onClose).toHaveBeenCalledOnce()
    else expect(allByType(Sheet)).toHaveLength(path === 'cancel' ? 1 : 0)
  })

  it.each([...paths, 'backdrop'] as const)('closes clean input through %s', async path => {
    const onClose = await openForm(form, false)
    if (path === 'backdrop') await act(() => allByType(TrueSheet)[0]!.instance.attempt(path))
    else await attempt(path, form)
    expect(allByType(Sheet).map(node => node.props.title)).not.toContain('common.discardChangesTitle')
    if (form === 'name') expect(onClose).toHaveBeenCalledOnce()
    else expect(allByType(Sheet)).toHaveLength(path === 'cancel' ? 1 : 0)
  })

  it('keeps dirty input on a backdrop tap', async () => {
    const onClose = await openForm(form, true)
    await act(() => allByType(TrueSheet)[0]!.instance.attempt('backdrop'))
    expect(onClose).not.toHaveBeenCalled()
    expect(allByType(Sheet)).toHaveLength(1)
  })
})
