import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { sheetTestControls } from '../../support/sheet-double'

const TestRenderer = require('react-test-renderer')

vi.mock('@/components/ui/sheet', async () => await import('../../support/sheet-double'))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))

afterEach(() => sheetTestControls.defer(false))

describe('ConfirmSheet controlled close', () => {
  it('finishes native dismissal before unmounting when open becomes false', () => {
    sheetTestControls.defer(true)
    const props = {
      title: 'Delete habit', message: 'Permanent action', confirmLabel: 'Delete',
      onCancel: vi.fn(), onConfirm: vi.fn(),
    }
    let tree: any
    TestRenderer.act(() => { tree = TestRenderer.create(<ConfirmSheet open {...props} />) })

    TestRenderer.act(() => tree.update(<ConfirmSheet open={false} {...props} />))

    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(tree.root.findAll((node: any) => node.type === 'Sheet')).toHaveLength(1)
    TestRenderer.act(() => sheetTestControls.completeDismissal())
    expect(tree.root.findAll((node: any) => node.type === 'Sheet')).toHaveLength(0)
    expect(props.onConfirm).not.toHaveBeenCalled()

    TestRenderer.act(() => tree.update(<ConfirmSheet open {...props} />))
    expect(tree.root.findAll((node: any) => node.type === 'Sheet')).toHaveLength(1)
  })

  it('finishes a controlled close whose native dismissal rejects, so the revised confirmation is usable', () => {
    sheetTestControls.defer(true)
    const onNewConfirm = vi.fn()
    const props = {
      message: 'Permanent action', confirmLabel: 'Delete', destructive: true,
      onCancel: vi.fn(),
    }
    let tree: any
    TestRenderer.act(() => { tree = TestRenderer.create(<ConfirmSheet open title="Old preview" onConfirm={vi.fn()} {...props} />) })

    TestRenderer.act(() => tree.update(<ConfirmSheet open={false} title="New preview" onConfirm={onNewConfirm} {...props} />))
    TestRenderer.act(() => tree.update(<ConfirmSheet open title="New preview" onConfirm={onNewConfirm} {...props} />))
    TestRenderer.act(() => sheetTestControls.rejectDismissal())

    expect(tree.root.findAll((node: any) => node.type === 'Sheet')).toHaveLength(1)
    const confirm = tree.root.find((node: any) => node.type === 'Pressable' && node.props.testID === 'button-destructive-md')
    TestRenderer.act(() => confirm.props.onPress())
    TestRenderer.act(() => sheetTestControls.completeDismissal())
    expect(onNewConfirm).toHaveBeenCalledTimes(1)
  })

  it('ignores exit actions and reopens the revised confirmation after dismissal', () => {
    sheetTestControls.defer(true)
    const onOldConfirm = vi.fn()
    const onNewConfirm = vi.fn()
    const props = {
      message: 'Permanent action', confirmLabel: 'Delete', destructive: true,
      onCancel: vi.fn(),
    }
    let tree: any
    TestRenderer.act(() => { tree = TestRenderer.create(<ConfirmSheet open title="Old preview" onConfirm={onOldConfirm} {...props} />) })

    TestRenderer.act(() => tree.update(<ConfirmSheet open={false} title="New preview" onConfirm={onNewConfirm} {...props} />))
    TestRenderer.act(() => tree.update(<ConfirmSheet open title="New preview" onConfirm={onNewConfirm} {...props} />))
    const confirm = tree.root.find((node: any) => node.type === 'Pressable' && node.props.testID === 'button-destructive-md')
    TestRenderer.act(() => confirm.props.onPress())
    TestRenderer.act(() => sheetTestControls.completeDismissal())

    expect(onOldConfirm).not.toHaveBeenCalled()
    expect(onNewConfirm).not.toHaveBeenCalled()
    expect(tree.root.findAll((node: any) => node.type === 'Sheet' && node.props.open)).toHaveLength(1)

    TestRenderer.act(() => tree.update(<ConfirmSheet open={false} title="New preview" onConfirm={onNewConfirm} {...props} />))
    TestRenderer.act(() => tree.update(<ConfirmSheet open title="New preview" onConfirm={onNewConfirm} {...props} />))
    const dismiss = tree.root.find((node: any) => node.type === 'Pressable' && node.props.accessibilityLabel === 'attempt-dismiss')
    TestRenderer.act(() => dismiss.props.onPress())
    TestRenderer.act(() => sheetTestControls.completeDismissal())
    expect(tree.root.findAll((node: any) => node.type === 'Sheet' && node.props.open)).toHaveLength(1)
    expect(props.onCancel).not.toHaveBeenCalled()
  })
})
