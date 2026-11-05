import { afterEach, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import type { TFunction } from 'i18next'
import { createMockCalendarSyncEvent } from '@orbit/shared/__tests__/factories'
import { PickerRow } from '@/components/ui/picker-row'
import { ListRow } from '@/components/ui/list-row'
import { HabitBlockRow } from '@/components/chat/habit-block-row'
import { CalendarSyncEventRow } from '@/components/calendar-sync/calendar-sync-event-row'
import { createStyles } from '@/components/calendar-sync/calendar-import-styles'
import { createTokensV2 } from '@/lib/theme'

const theme = vi.hoisted((): { mode: 'light' | 'dark' } => ({ mode: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: theme.mode }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string) => time }) }))
let tree: ReactTestRenderer

afterEach(async () => { await act(() => tree.unmount()) })

it.each((['dark', 'light'] as const).flatMap((mode) => (['list', 'habit block', 'calendar import', 'picker'] as const).map((surface) => ({ mode, surface }))))('fills the whole $surface row in $mode', async ({ mode, surface }) => {
  theme.mode = mode
  const tokens = createTokensV2('orange', mode)
  const action = { icon: 'trash', label: 'Delete', onPress: vi.fn() }
  const rows = {
    picker: <PickerRow name="Picker" selected={false} disabled={false} onToggle={vi.fn()} value="Value" valueStyle={{}} />,
    list: <ListRow title="Row" description="Description" onClick={vi.fn()} action={action} />,
    'habit block': <HabitBlockRow title="Row" control={<ListRow title="Trailing" readOnly />} onOpen={vi.fn()} />,
    'calendar import': <CalendarSyncEventRow event={createMockCalendarSyncEvent()} weekStartDay={1} selected={false} isReviewMode suggestionId="suggestion" dismissPending={false} styles={createStyles()} tokens={tokens} t={((key: string) => key) as TFunction} onToggle={vi.fn()} onDismiss={vi.fn()} />,
  }
  await act(() => { tree = create(rows[surface]) })
  const body = tree.root.findAll((node) => String(node.type) === 'Pressable')[0]!
  const press = body.props.onPressIn
  if (typeof press !== 'function') throw new Error('Row press feedback missing')
  await act(() => press())
  const fills = tree.root.findAll((node) => {
    if (String(node.type) !== 'View') return false
    const style = StyleSheet.flatten((node.props.style as StyleProp<ViewStyle>) ?? {})
    return style.backgroundColor === tokens.bgHover && style.position === 'absolute'
      && style.top === 0 && style.bottom === 0 && style.left === 0 && style.right === 0
  })
  expect(fills).toHaveLength(1)
  expect(StyleSheet.flatten(fills[0]!.props.style as StyleProp<ViewStyle>).borderRadius).toBe(surface === 'habit block' ? 20 : 12)
})
