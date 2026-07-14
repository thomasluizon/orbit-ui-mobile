import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StatusDot } from '@/components/ui/status-dot'

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}
interface TestTree {
  root: TestNode
  update(element: React.ReactNode): void
  unmount(): void
}
interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => void): void
}
const TestRenderer: TestRendererApi = require('react-test-renderer')

function render(element: React.ReactNode): TestTree {
  let tree!: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

function nodeWithRole(tree: TestTree, role: string): TestNode | undefined {
  return tree.root.findAll((node) => node.props?.accessibilityRole === role)[0]
}

describe('StatusDot', () => {
  it('renders a non-interactive image dot labelled by its state', () => {
    const tree = render(<StatusDot state="empty" />)
    const image = nodeWithRole(tree, 'image')
    expect(image).toBeTruthy()
    expect(image!.props.accessibilityLabel).toBe('empty')
  })

  it('prefers an explicit accessibility label over the state name', () => {
    const tree = render(<StatusDot state="done" accessibilityLabel="Completed" />)
    expect(nodeWithRole(tree, 'image')!.props.accessibilityLabel).toBe('Completed')
  })

  it('dims a disabled non-interactive dot', () => {
    const tree = render(<StatusDot state="bad" disabled />)
    const image = nodeWithRole(tree, 'image')
    expect((image!.props.style as { opacity?: number }).opacity).toBe(0.4)
  })

  it('renders an interactive button that toggles on press', () => {
    const onToggle = vi.fn()
    const tree = render(<StatusDot state="overdue" onToggle={onToggle} />)
    const button = nodeWithRole(tree, 'button')
    expect(button!.props.accessibilityLabel).toBe('overdue')
    TestRenderer.act(() => {
      ;(button!.props as { onPress: () => void }).onPress()
    })
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('marks the button disabled instead of firing when disabled', () => {
    const onToggle = vi.fn()
    const tree = render(<StatusDot state="skip" onToggle={onToggle} disabled />)
    const button = nodeWithRole(tree, 'button')
    expect((button!.props.accessibilityState as { disabled: boolean }).disabled).toBe(true)
    expect(button!.props.disabled).toBe(true)
  })
})

describe('StatusDot completion sweep', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('plays the arc sweep when an interactive dot transitions into done', () => {
    const tree = render(<StatusDot state="empty" onToggle={vi.fn()} />)
    TestRenderer.act(() => {
      tree.update(<StatusDot state="done" onToggle={vi.fn()} />)
    })
    expect(nodeWithRole(tree, 'button')!.props.accessibilityLabel).toBe('done')
    TestRenderer.act(() => {
      vi.advanceTimersByTime(500)
    })
    tree.unmount()
  })
})
