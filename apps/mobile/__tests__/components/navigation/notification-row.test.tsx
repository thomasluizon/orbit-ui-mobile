import { afterEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { NotificationRow } from '@/components/navigation/notification-row'
import { expectPersonalTextLayout } from '@/__tests__/support/personal-text'

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
let tree: ReactTestRenderer

afterEach(async () => { await act(() => tree.update(<></>)) })

it.each(['W'.repeat(60), 'Extraordinarily comprehensive internationalization responsibilities'])('keeps the complete title accessible and opens it without breaking words: %s', async (title) => {
  const item = createMockNotification({ title })
  const onOpen = vi.fn()
  const onDelete = vi.fn()
  await act(() => { tree = create(<NotificationRow item={item} onOpen={onOpen} onDelete={onDelete} />) })
  await expectPersonalTextLayout(tree.root, title)
  const buttons = tree.root.findAll((node) => String(node.type) === 'Pressable')
  expect(buttons[0]!.props.accessibilityLabel).toContain(title)
  const press = buttons[0]!.props.onPress
  if (typeof press !== 'function') throw new Error('Notification open action missing')
  await act(() => press())
  expect(onOpen).toHaveBeenCalledExactlyOnceWith(item)
  expect(onDelete).not.toHaveBeenCalled()
})
