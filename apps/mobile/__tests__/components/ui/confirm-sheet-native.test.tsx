import React from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrueSheet, nativeSheetTestControls } from '@/__tests__/support/native-sheet-double'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { PillButton } from '@/components/ui/pill-button'

vi.unmock('@/components/ui/sheet')
vi.mock('@lodev09/react-native-true-sheet', async () => import('@/__tests__/support/native-sheet-double'))

let tree: ReactTestRenderer
afterEach(async () => {
  nativeSheetTestControls.deferMount = false
  await act(() => tree.update(<></>))
})

function nativeSheets() {
  return tree.root.findAll(node => node.type === TrueSheet) as (ReactTestInstance & { instance: TrueSheet })[]
}

describe('ConfirmSheet native close completion', () => {
  it.each(['during close', 'after close'])('reopens a usable confirmation %s when dismissal cancels a pending mount', async reopen => {
    nativeSheetTestControls.deferMount = true
    const onCloseComplete = vi.fn()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const confirmation = (open: boolean) => <ConfirmSheet open={open} title="Delete habit" message="Permanent action"
      confirmLabel="Delete" onCloseComplete={onCloseComplete} onCancel={onCancel} onConfirm={onConfirm} />

    await act(() => { tree = create(confirmation(true)) })
    const previousSheet = nativeSheets()[0]!.instance
    expect(previousSheet.isMountPending).toBe(true)
    void act(() => tree.update(confirmation(false)))
    if (reopen === 'during close') void act(() => tree.update(confirmation(true)))
    await act(async () => { await Promise.resolve() })

    expect(onCloseComplete).toHaveBeenCalledOnce()
    expect(previousSheet.isMountPending).toBe(false)
    expect(onCancel).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
    if (reopen === 'after close') {
      expect(nativeSheets()).toHaveLength(0)
      await act(() => tree.update(confirmation(true)))
    }
    const freshSheet = nativeSheets()[0]!.instance
    expect(freshSheet).not.toBe(previousSheet)
    expect(freshSheet.isMountPending).toBe(true)
    await act(() => freshSheet.completeMount())
    const confirm = tree.root.findAll(node => node.type === PillButton && node.props.children === 'Delete')[0]!
    expect(confirm.props.disabled).toBe(false)
    await act(() => (confirm.props.onClick as () => void)())
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCloseComplete).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
    expect(nativeSheets()).toHaveLength(0)
  })
})
