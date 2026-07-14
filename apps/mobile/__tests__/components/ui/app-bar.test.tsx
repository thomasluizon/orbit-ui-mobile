import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AppBar, resolveAppBarRightActionLabel } from '@/components/ui/app-bar'

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}
interface TestTree {
  root: TestNode
  toJSON(): unknown
}
interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => void): void
}
const TestRenderer: TestRendererApi = require('react-test-renderer')

const translate = (key: string) => key

function render(element: React.ReactElement) {
  let tree!: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

function buttons(tree: TestTree): TestNode[] {
  return tree.root.findAll((node) => node.props?.accessibilityRole === 'button')
}

function texts(tree: TestTree): unknown[] {
  return tree.root.findAll((node) => node.type === 'Text').map((node) => node.props.children)
}

describe('resolveAppBarRightActionLabel', () => {
  it('returns undefined when there is no right action', () => {
    expect(resolveAppBarRightActionLabel(undefined, undefined, translate)).toBeUndefined()
  })

  it('prefers an explicit rightLabel over the variant default', () => {
    expect(resolveAppBarRightActionLabel('help', 'Custom', translate)).toBe('Custom')
  })

  it('maps each variant to its default common key', () => {
    expect(resolveAppBarRightActionLabel('help', undefined, translate)).toBe('common.help')
    expect(resolveAppBarRightActionLabel('close', undefined, translate)).toBe('common.close')
    expect(resolveAppBarRightActionLabel('share', undefined, translate)).toBe('common.share')
  })
})

describe('AppBar', () => {
  it('renders no leading slot content without back or a leading icon', () => {
    const tree = render(<AppBar title="Settings" />)
    expect(buttons(tree)).toHaveLength(0)
    expect(texts(tree)).toContain('Settings')
  })

  it('renders a pressable back chevron that invokes onBack', () => {
    const onBack = vi.fn()
    const tree = render(<AppBar back onBack={onBack} backLabel="Go back" />)
    const backButton = buttons(tree).find((node) => node.props.accessibilityLabel === 'Go back')
    expect(backButton).toBeTruthy()
    TestRenderer.act(() => {
      ;(backButton!.props as { onPress: () => void }).onPress()
    })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('falls back to the common.back label and marks the leading button non-interactive without onBack', () => {
    const tree = render(<AppBar back />)
    const leading = tree.root.findAll(
      (node) => node.props?.accessibilityLabel === 'common.back',
    )[0]
    expect(leading).toBeTruthy()
    expect(leading!.props.accessibilityRole).toBe('none')
    expect(leading!.props.disabled).toBe(true)
  })

  it('renders a custom leading icon when back is false', () => {
    const LeadingIcon = () => React.createElement('LeadingGlyph')
    const tree = render(<AppBar LeadingIcon={LeadingIcon} onBack={vi.fn()} />)
    expect(tree.root.findAll((node) => node.type === 'LeadingGlyph')).toHaveLength(1)
  })

  it('renders the title, subtitle, and title icon cluster', () => {
    const tree = render(
      <AppBar title="Astra" subtitle="online" titleIcon={<React.Fragment />} />,
    )
    const rendered = texts(tree)
    expect(rendered).toContain('Astra')
    expect(rendered).toContain('online')
  })

  it('renders the help right action with a ringed border and invokes onRight', () => {
    const onRight = vi.fn()
    const tree = render(<AppBar right="help" onRight={onRight} />)
    const rightButton = buttons(tree).find(
      (node) => node.props.accessibilityLabel === 'common.help',
    )
    expect(rightButton).toBeTruthy()
    TestRenderer.act(() => {
      ;(rightButton!.props as { onPress: () => void }).onPress()
    })
    expect(onRight).toHaveBeenCalledTimes(1)
  })

  it('prefers a trailing cluster over the standard right action', () => {
    const tree = render(
      <AppBar right="close" trailing={<React.Fragment />} onRight={vi.fn()} />,
    )
    expect(
      buttons(tree).some((node) => node.props.accessibilityLabel === 'common.close'),
    ).toBe(false)
  })
})
