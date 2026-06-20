import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'

vi.unmock('@/components/bottom-sheet-modal')

const { present, dismiss } = vi.hoisted(() => ({
  present: vi.fn(() => Promise.resolve()),
  dismiss: vi.fn(() => Promise.resolve()),
}))

vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class TrueSheet extends React.Component<{
    children?: React.ReactNode
  }> {
    present = present
    dismiss = dismiss
    render() {
      return this.props.children ?? null
    }
  },
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
}))

interface TestTree {
  update(element: React.ReactNode): void
}

interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => Promise<void> | void): Promise<void>
}

const TestRenderer: TestRendererApi = require('react-test-renderer')

async function renderModal(open: boolean) {
  let tree!: TestTree
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <BottomSheetModal open={open} onClose={() => {}}>
        <></>
      </BottomSheetModal>,
    )
  })
  return tree
}

async function setOpen(tree: TestTree, open: boolean) {
  await TestRenderer.act(async () => {
    tree.update(
      <BottomSheetModal open={open} onClose={() => {}}>
        <></>
      </BottomSheetModal>,
    )
  })
}

describe('BottomSheetModal', () => {
  beforeEach(() => {
    present.mockReset()
    dismiss.mockReset()
    present.mockImplementation(() => Promise.resolve())
    dismiss.mockImplementation(() => Promise.resolve())
  })

  it('does not dismiss the native sheet on initial mount when it was never presented', async () => {
    await renderModal(false)

    expect(present).not.toHaveBeenCalled()
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('presents the native sheet when opened', async () => {
    await renderModal(true)

    expect(present).toHaveBeenCalledTimes(1)
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('dismisses the native sheet when closed after being presented', async () => {
    const tree = await renderModal(true)

    await setOpen(tree, false)

    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('does not surface an unhandled rejection when a native teardown race rejects dismiss', async () => {
    dismiss.mockImplementationOnce(() =>
      Promise.reject(new Error('TrueSheetView with tag 1 not found')),
    )
    const tree = await renderModal(true)

    await setOpen(tree, false)

    expect(dismiss).toHaveBeenCalledTimes(1)
  })
})
