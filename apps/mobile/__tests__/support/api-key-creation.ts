import { act } from 'react-test-renderer'
import { renderedText } from './react-test-renderer'

type MenuHost = { type: unknown; props: Record<string, unknown>; children?: unknown[] }
type MenuTree = { root: { findAll: (predicate: (node: MenuHost) => boolean) => MenuHost[] } }

export async function chooseApiKeyCreation(tree: MenuTree, label: string, createLabel = 'profile.apiKeys.create') {
  const trigger = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === createLabel)[0]!
  await act(() => { (trigger.props.onPress as () => void)() })
  const choice = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'menuitem' && renderedText(node) === label)[0]!
  await act(() => { (choice.props.onPress as () => void)() })
}

type FieldTree = { root: { findAll: (predicate: (node: MenuHost) => boolean) => MenuHost[] } }

export function revealApiKeyExpiry(tree: FieldTree, question = 'profile.apiKeys.setExpiry', label = 'orbitMcp.expiresAtLabel') {
  if (tree.root.findAll((node) => node.props.label === label).length > 0) return
  const row = tree.root.findAll((node) => node.props.title === question && typeof node.props.onClick === 'function')[0]!
  void act(() => { (row.props.onClick as () => void)() })
}
