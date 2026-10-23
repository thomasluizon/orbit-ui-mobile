import type { RecordListCard } from '../types/chat'

type RecordItem = RecordListCard['items'][number]

export function filterRecordListItems(items: RecordItem[], query: string, locale: string): RecordItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase(locale)
  return normalizedQuery
    ? items.filter((item) => `${item.title} ${item.detail ?? ''}`.toLocaleLowerCase(locale).includes(normalizedQuery))
    : items
}

export function isUnreadRecord(kind: RecordListCard['kind'], item: RecordItem, readIds: ReadonlySet<string>): boolean {
  return kind === 'notifications' && item.isRead === false && !readIds.has(item.id)
}

export function recordListDestination(card: RecordListCard): '/profile' | '/notifications' | null {
  if (card.kind === 'habitHistory') return null
  if (card.surfaceId === 'profile') return '/profile'
  return card.surfaceId === 'notifications' ? '/notifications' : null
}
