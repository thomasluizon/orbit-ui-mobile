import { expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import NotFoundScreen from '@/app/+not-found'
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ replace }) }))
it('returns a missing page to Today', async () => {
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<NotFoundScreen />) })
  const links = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'link')
  expect(links).toHaveLength(1)
  expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'notFoundPage.action')).toHaveLength(1)
  const press = links[0]?.props.onPress as () => void
  await act(() => { press() })
  expect(replace).toHaveBeenCalledWith('/')
})
