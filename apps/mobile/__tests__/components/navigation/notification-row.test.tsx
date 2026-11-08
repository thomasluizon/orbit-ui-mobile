import { afterEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { createMockNotification } from '@orbit/shared/__tests__/factories'
import { NotificationRow } from '@/components/navigation/notification-row'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { contrastOnSurface, controlContrast } from '@orbit/shared/__tests__/contrast'
import { createTokensV2 } from '@/lib/theme'
import { expectPersonalTextLayout } from '@/__tests__/support/personal-text'

const theme = vi.hoisted((): { mode: 'dark' | 'light' } => ({ mode: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: theme.mode }) }))
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
let tree: ReactTestRenderer

function feedbackEvent(control: ReactTestInstance, name: string) {
  const handler = control.props[name]
  if (typeof handler !== 'function') throw new Error(`Missing feedback event: ${name}`)
  return handler()
}

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


it.each((['dark', 'light'] as const).flatMap((mode) => [false, true].map((isRead) => ({ mode, isRead }))))('paints the complete row from the body and only the delete circle under delete, read=$isRead in $mode', async ({ mode, isRead }) => {
  theme.mode = mode
  const tokens = createTokensV2('orange', mode)
  const item = createMockNotification({ isRead, habitId: 'notification-fill', url: '/habits/notification-fill' })
  const onOpen = vi.fn()
  const onDelete = vi.fn()
  await act(() => { tree = create(<NotificationRow item={item} onOpen={onOpen} onDelete={onDelete} />) })
  const buttons = () => tree.root.findAll((node) => String(node.type) === 'Pressable')
  const wrapper = () => tree.root.findAll((node) => String(node.type) === 'View' && node.props.testID === (isRead ? 'notification-read' : 'notification-unread'))[0]!
  for (const index of [0, 1]) {
    await act(() => feedbackEvent(buttons()[index]!, 'onPressIn'))
    const fills = wrapper().findAll((node) => String(node.type) === 'View' && StyleSheet.flatten((node.props.style as StyleProp<ViewStyle>) ?? {}).backgroundColor === tokens.bgHover)
    expect(fills).toHaveLength(1)
    expect(StyleSheet.flatten(fills[0]!.props.style)).toMatchObject(index === 0
      ? { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 12 }
      : { position: 'absolute', width: 44, height: 44, borderRadius: 999 })
    await act(() => feedbackEvent(buttons()[index]!, 'onFocus'))
    await act(() => feedbackEvent(buttons()[index]!, 'onPressOut'))
    const heldFill = wrapper().findAll((node) => String(node.type) === 'View' && StyleSheet.flatten((node.props.style as StyleProp<ViewStyle>) ?? {}).backgroundColor === tokens.bgHover)
    expect(heldFill).toHaveLength(1)
    expect(StyleSheet.flatten(heldFill[0]!.props.style)).toMatchObject({ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 12 })
    await act(() => feedbackEvent(buttons()[index]!, 'onBlur'))
    const clearedFill = wrapper().findAll((node) => String(node.type) === 'View' && StyleSheet.flatten((node.props.style as StyleProp<ViewStyle>) ?? {}).backgroundColor === tokens.bgHover)
    expect(clearedFill).toHaveLength(0)
    expect(onOpen).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  }
  const layers = [tokens.bg, ...(isRead ? [] : [tokens.bgCard]), tokens.bgHover]
  for (const color of [tokens.fg1, tokens.fg2]) expect(contrastOnSurface(color, layers)).toBeGreaterThanOrEqual(4.5)
  for (const color of [tokens.fg3, tokens.statusBad]) expect(contrastOnSurface(color, layers)).toBeGreaterThanOrEqual(3)
  const action = controlContrast(tokens.statusBad, tokens.bgRowAction, layers)
  expect(action.graphic).toBeGreaterThanOrEqual(3)
  expect(action.step).toBeGreaterThanOrEqual(1.25)
  const restingAction = controlContrast(tokens.statusBad, tokens.bgHover, [tokens.bg, ...(isRead ? [] : [tokens.bgCard])])
  expect(restingAction.graphic).toBeGreaterThanOrEqual(3)
  expect(restingAction.step).toBeGreaterThanOrEqual(1.25)
  await act(() => feedbackEvent(buttons()[1]!, 'onPress'))
  expect(onDelete).toHaveBeenCalledExactlyOnceWith(item)
  expect(onOpen).not.toHaveBeenCalled()
})
