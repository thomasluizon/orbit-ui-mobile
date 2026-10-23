import { describe, expect, it } from 'vitest'
import { filterRecordListItems, isUnreadRecord } from '../chat/record-list-core'
import type { RecordListCard } from '../types/chat'

const items: RecordListCard['items'] = [
  { id: 'reading', title: 'Leitura', detail: 'Ficção', isRead: false },
  { id: 'walk', title: 'Morning walk', detail: null, isRead: true },
  { id: 'water', title: 'Water' },
]

describe('record list filtering', () => {
  it('retains the complete server order for an empty or whitespace-only query', () => {
    expect(filterRecordListItems(items, '', 'en')).toEqual(items)
    expect(filterRecordListItems(items, '  ', 'pt-BR')).toEqual(items)
  })
  it('matches titles and optional details with trimmed locale-aware casing', () => {
    expect(filterRecordListItems(items, '  LEITURA  ', 'pt-BR')).toEqual([items[0]])
    expect(filterRecordListItems(items, 'FICÇÃO', 'pt-BR')).toEqual([items[0]])
    expect(filterRecordListItems(items, 'W', 'en')).toEqual([items[1], items[2]])
    expect(filterRecordListItems([{ id: 'istanbul', title: 'İstanbul' }], 'istanbul', 'tr')).toHaveLength(1)
  })
  it('returns no rows for an unmatched query or an empty list', () => {
    expect(filterRecordListItems(items, 'missing', 'en')).toEqual([])
    expect(filterRecordListItems([], 'walk', 'en')).toEqual([])
  })
})

describe('record list unread state', () => {
  it('clears the unread state as soon as a notification is marked read locally', () => {
    expect(isUnreadRecord('notifications', items[0]!, new Set())).toBe(true)
    expect(isUnreadRecord('notifications', items[0]!, new Set(['reading']))).toBe(false)
    expect(isUnreadRecord('notifications', items[0]!, new Set(['walk']))).toBe(true)
  })
  it('requires an explicit unread flag from the notification', () => {
    for (const isRead of [true, null, undefined]) {
      expect(isUnreadRecord('notifications', { ...items[0]!, isRead }, new Set())).toBe(false)
    }
  })
  it.each(['tags', 'templates', 'keys'] as const)('does not mark %s records unread', kind => {
    expect(isUnreadRecord(kind, items[0]!, new Set())).toBe(false)
  })
})
