import type { ReactElement, ReactNode } from 'react'
import type { ReactTestRenderer } from 'react-test-renderer'
const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
type NavigationHost = {
  type: unknown
  props: {
    children?: ReactNode
    disabled?: boolean
    onPress?: () => void
    accessibilityRole?: string
    accessibilityLabel?: string
    accessibilityState?: { selected?: boolean; checked?: boolean; disabled?: boolean }
    testID?: string
    style?: unknown
  }
}
export function renderNavigation(element: ReactElement) {
  let tree!: ReactTestRenderer
  void renderer.act(() => { tree = renderer.create(element) })
  return {
    hosts: (): NavigationHost[] => tree.root.findAll((node) => typeof node.type === 'string'),
    update: (next: ReactElement) => { void renderer.act(() => tree.update(next)) },
    unmount: () => { void renderer.act(() => tree.update(<></>)) },
  }
}
export function press(node: NavigationHost) {
  void renderer.act(() => { if (!node.props.disabled) node.props.onPress?.() })
}
