import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
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

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

interface TestNode {
  type: unknown
  props: Record<string, unknown>
}

interface TestTree {
  update(element: React.ReactNode): void
  root: { findAll(predicate: (node: TestNode) => boolean): TestNode[] }
}

interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => Promise<void> | void): Promise<void>
}

const TestRenderer: TestRendererApi = require('react-test-renderer')

interface ModalCallbacks {
  onClose?: () => void
  onDidDismiss?: () => void
}

async function renderModal(open: boolean, callbacks: ModalCallbacks = {}) {
  let tree!: TestTree
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <BottomSheetModal
        open={open}
        onClose={callbacks.onClose ?? (() => {})}
        onDidDismiss={callbacks.onDidDismiss}
      >
        <></>
      </BottomSheetModal>,
    )
  })
  return tree
}

async function setOpen(tree: TestTree, open: boolean, callbacks: ModalCallbacks = {}) {
  await TestRenderer.act(async () => {
    tree.update(
      <BottomSheetModal
        open={open}
        onClose={callbacks.onClose ?? (() => {})}
        onDidDismiss={callbacks.onDidDismiss}
      >
        <></>
      </BottomSheetModal>,
    )
  })
}

async function fireNativeDidDismiss(tree: TestTree) {
  const sheet = tree.root.findAll((node) => node.type === TrueSheet)[0]
  if (!sheet) throw new Error('TrueSheet not rendered')
  await TestRenderer.act(async () => {
    ;(sheet.props.onDidDismiss as () => void)()
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

  it('wraps sheet content in a scroll container by default', async () => {
    let tree!: TestTree
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <BottomSheetModal open onClose={() => {}}>
          <></>
        </BottomSheetModal>,
      )
    })

    expect(tree.root.findAll((node) => node.type === 'ScrollView')).toHaveLength(1)
  })

  it('renders children without a scroll container when the content manages scrolling', async () => {
    let tree!: TestTree
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <BottomSheetModal open onClose={() => {}} contentManagesScroll>
          <></>
        </BottomSheetModal>,
      )
    })

    expect(tree.root.findAll((node) => node.type === 'ScrollView')).toHaveLength(0)
  })

  it('does not dismiss after a present that failed, since the sheet was never shown', async () => {
    present.mockImplementationOnce(() =>
      Promise.reject(new Error('present failed')),
    )
    const tree = await renderModal(true)

    await setOpen(tree, false)

    expect(present).toHaveBeenCalledTimes(1)
    expect(dismiss).not.toHaveBeenCalled()
  })

  it('fires onDidDismiss only after the NATIVE dismissal completes on a programmatic close', async () => {
    const onClose = vi.fn()
    const onDidDismiss = vi.fn()
    const tree = await renderModal(true, { onClose, onDidDismiss })

    await setOpen(tree, false, { onClose, onDidDismiss })

    expect(dismiss).toHaveBeenCalledTimes(1)
    expect(onDidDismiss).not.toHaveBeenCalled()

    await fireNativeDidDismiss(tree)

    expect(onDidDismiss).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('fires onDidDismiss once on an interactive dismissal, after syncing state through onClose', async () => {
    const onClose = vi.fn()
    const onDidDismiss = vi.fn()
    const tree = await renderModal(true, { onClose, onDidDismiss })

    await fireNativeDidDismiss(tree)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onDidDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not fire onDidDismiss when the sheet never presented', async () => {
    const onDidDismiss = vi.fn()
    const tree = await renderModal(false, { onDidDismiss })

    await setOpen(tree, false, { onDidDismiss })

    expect(present).not.toHaveBeenCalled()
    expect(dismiss).not.toHaveBeenCalled()
    expect(onDidDismiss).not.toHaveBeenCalled()
  })
})
