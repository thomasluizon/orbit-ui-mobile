import { expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import NotFoundScreen from '@/app/+not-found'
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ replace }) }))
it('returns a missing page to Today', async () => {
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<NotFoundScreen />) })
  const links = tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'link')
  expect(links).toHaveLength(1)
  expect(links[0].findByType('Text').props.children).toBe('notFoundPage.action')
  const press = links[0]?.props.onPress as () => void
  await act(() => { press() })
  expect(replace).toHaveBeenCalledWith('/')
})
