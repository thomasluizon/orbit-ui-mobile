import { expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { StyleSheet } from 'react-native'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import NotFoundScreen from '@/app/+not-found'
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ replace }) }))
it('returns a missing page to Today', async () => {
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<NotFoundScreen />) })
  const links = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'link')
  expect(links).toHaveLength(1)
  expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'notFoundPage.title')).toHaveLength(1)
  expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'notFoundPage.description')).toHaveLength(1)
  expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'notFoundPage.action')).toHaveLength(1)
  const surface = tree.root.findAll((node) => String(node.type) === 'ScrollView')[0]
  expect(StyleSheet.flatten(surface?.props.contentContainerStyle)).toMatchObject({ paddingTop: 64 })
  const press = links[0]?.props.onPress as () => void
  await act(() => { press() })
  expect(replace).toHaveBeenCalledWith('/')
})

it.each([412, 1024])('renders the drawn missing-page title size at %ipx', async (width) => {
  __setWindowDimensions({ width, height: 900, scale: 1, fontScale: 1 })
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<NotFoundScreen />) })
  const title = tree.root.findAll((node) => String(node.type) === 'Text' && node.props.accessibilityRole === 'header')[0]!
  expect(StyleSheet.flatten(title.props.style)).toMatchObject({ fontSize: width >= 1024 ? 28 : 22 })
})
