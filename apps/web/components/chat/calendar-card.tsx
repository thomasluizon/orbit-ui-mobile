'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { CalendarCard as CalendarCardData } from '@orbit/shared/types/chat'
import type { BlockFrameItem } from '@orbit/shared/contracts/blocks'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'

export function CalendarCard({ calendarCard }: Readonly<{ calendarCard: CalendarCardData }>) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' })
  const items: BlockFrameItem[] = calendarCard.events.map((event, index) => ({
    id: `event-${index}`,
    label: event.title,
    wrapLabel: true,
    meta: event.isAllDay ? t('chat.calendarCard.allDay') : time.format(new Date(event.start)),
  }))
  if (calendarCard.sync) {
    const failed = calendarCard.sync.enabled && calendarCard.sync.status !== 'Idle'
    items.push({
      id: 'sync', label: t('chat.calendarCard.sync'),
      meta: failed ? undefined : t(calendarCard.sync.enabled ? `chat.calendarCard.syncState.${calendarCard.sync.status}` : 'chat.calendarCard.syncState.disabled'),
      ...(failed ? { status: 'failed' as const, statusLabel: t(`chat.calendarCard.syncState.${calendarCard.sync.status}`) } : {}),
    })
  }
  return <div className="mt-2 w-full md:max-w-[65ch]">
    <BlockFrame state="resting" title={t('chat.calendarCard.title')} count={calendarCard.events.length} items={items}
      body={calendarCard.events.length === 0 ? <p className="text-sm text-[var(--fg-3)]">{t('chat.calendarCard.empty')}</p> : undefined}
      actions={<Button variant="ghost" size="sm" onClick={() => router.push('/calendar')}>{t('chat.calendarCard.open')}</Button>} />
  </div>
}
