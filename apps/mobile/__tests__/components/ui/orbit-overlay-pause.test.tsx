import React, { type ReactElement } from 'react'
import { View } from 'react-native'
import { setOrbitMotionEnabled } from '@orbit/shared/utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Shell412 } from '@/components/shell/shell-412'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { Sheet } from '@/components/ui/sheet'
import { useUIStore } from '@/stores/ui-store'

vi.unmock('@/components/ui/sheet')
vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class extends React.Component<{ children: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }, { presented: boolean }> {
    state = { presented: false }
    present = vi.fn(() => { this.setState({ presented: true }); return Promise.resolve() })
    dismiss = vi.fn(() => { this.setState({ presented: false }); return Promise.resolve() })
    render() { return this.state.presented ? <>{this.props.header}{this.props.children}{this.props.footer}</> : null }
  },
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaView: ({ children }: Readonly<{ children: React.ReactNode }>) => children,
}))

const TestRenderer = require('react-test-renderer')

interface TestNode {
  readonly type: unknown
  readonly props: Readonly<Record<string, unknown>>
}

interface ReactTestRenderer {
  readonly root: { findAll(predicate: (node: TestNode) => boolean): TestNode[] }
  update(element: ReactElement): void
  unmount(): void
}

let tree: ReactTestRenderer | undefined

/** Mounts the tree and lets the sheet finish presenting. */
async function render(element: ReactElement): Promise<ReactTestRenderer> {
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(element)
    await Promise.resolve()
  })
  return tree!
}

/** The loop of each Orbit by its state, so a test reads the page Orbit and the overlay Orbit apart. */
function loops(rendered: ReactTestRenderer) {
  return Object.fromEntries(rendered.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'orbit-mascot')
    .map((node) => [String(node.props['data-orbit-state']), node.props['data-orbit-loop']]))
}

afterEach(() => {
  if (tree) TestRenderer.act(() => tree!.unmount())
  tree = undefined
  setOrbitMotionEnabled(undefined)
  useUIStore.setState({ openOverlayIds: [] })
})

describe('an overlay over a live Orbit on Android', () => {
  it('pauses the page Orbit under a real Sheet, runs the Orbit inside it, and resumes on close', async () => {
    const page = (open: boolean) => <View><OrbitMascot size={96} />{open ? <Sheet title="Options" onClose={() => {}}><OrbitMascot size={96} state="feliz" /></Sheet> : null}</View>
    const rendered = await render(page(true))
    expect(loops(rendered)).toEqual({ parado: 'still', feliz: 'running' })
    TestRenderer.act(() => rendered.update(page(false)))
    expect(loops(rendered)).toEqual({ parado: 'running' })
  })

  it('pauses the destination Orbit behind the open conversation and runs the Orbit inside the conversation', async () => {
    const shell = (open: boolean) => (
      <Shell412 nav={false} conversation={<OrbitMascot size={48} state="descansando" />} conversationOpen={open} conversationLabel="Conversation">
        <OrbitMascot size={96} state="feliz" />
      </Shell412>
    )
    const rendered = await render(shell(true))
    expect(loops(rendered)).toEqual({ feliz: 'still', descansando: 'running' })
    TestRenderer.act(() => rendered.update(shell(false)))
    expect(loops(rendered)).toEqual({ feliz: 'running' })
  })
})
