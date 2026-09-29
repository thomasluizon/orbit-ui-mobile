import { expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { StyleSheet } from 'react-native'
import NotFoundScreen from '@/app/+not-found'
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
const authState = vi.hoisted(() => ({ isAuthenticated: true }))
vi.mock('expo-router', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState) }))
it('returns a missing page to Today', async () => {
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<NotFoundScreen />) })
  const links = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'link')
  expect(links).toHaveLength(1)
  expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'notFoundPage.title')).toHaveLength(1)
  expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'notFoundPage.description')).toHaveLength(1)
  expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'notFoundPage.action')).toHaveLength(1)
  const surface = tree.root.findAll((node) => String(node.type) === 'ScrollView')[0]
  expect(StyleSheet.flatten(surface?.props.contentContainerStyle)).toMatchObject({ paddingTop: 48 })
  const press = links[0]?.props.onPress as () => void
  await act(() => { press() })
  expect(replace).toHaveBeenCalledWith('/')
})

it('keeps the bare signed-out page at its original top inset', async () => {
  authState.isAuthenticated = false
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<NotFoundScreen />) })
  const surface = tree.root.findAll((node) => String(node.type) === 'ScrollView')[0]
  expect(StyleSheet.flatten(surface?.props.contentContainerStyle)).toMatchObject({ paddingTop: 64 })
  authState.isAuthenticated = true
})
