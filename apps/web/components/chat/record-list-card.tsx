'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { API } from '@orbit/shared/api'
import { recordListCardSchema, type RecordListCard as RecordListCardData } from '@orbit/shared/types/chat'
import type { BlockFrameItem } from '@orbit/shared/contracts/blocks'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { Check } from '@/components/ui/icons'
import { fetchJson } from '@/lib/api-fetch'
import { useMarkNotificationRead } from '@/hooks/use-notifications'
import { getAccountGeneration, subscribeToAccountGeneration } from '@/lib/session-epoch'

export function RecordListCard({ recordList }: Readonly<{ recordList: RecordListCardData }>) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const markRead = useMarkNotificationRead()
  const [items, setItems] = useState(recordList.items)
  const [nextCursor, setNextCursor] = useState(recordList.nextCursor)
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [failure, setFailure] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  useEffect(() => subscribeToAccountGeneration(() => {
    setItems(recordList.items)
    setNextCursor(recordList.nextCursor)
    setReadIds(new Set())
    setFailure(null)
  }), [recordList])

  async function markNotification(id: string) {
    const generation = getAccountGeneration()
    setReadIds((current) => new Set(current).add(id))
    setFailure(null)
    try {
      await markRead.mutateAsync(id)
    } catch {
      if (generation !== getAccountGeneration()) return
      setReadIds((current) => { const next = new Set(current); next.delete(id); return next })
      setFailure(t('chat.recordList.markReadError'))
    }
  }

  async function showMore() {
    if (!nextCursor || loadingMore) return
    const generation = getAccountGeneration()
    setLoadingMore(true)
    setFailure(null)
    try {
      const page = await fetchJson(`${API.chat.records}/${recordList.kind}?cursor=${encodeURIComponent(nextCursor)}`, recordListCardSchema, { handlesError: true })
      if (generation !== getAccountGeneration()) return
      setItems((current) => [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch {
      if (generation === getAccountGeneration()) setFailure(t('chat.recordList.moreError'))
    } finally {
      if (generation === getAccountGeneration()) setLoadingMore(false)
    }
  }

  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })
  const rows: BlockFrameItem[] = items.map((item) => {
    const unread = recordList.kind === 'notifications' && item.isRead === false && !readIds.has(item.id)
    const keyState = recordList.kind === 'keys' && item.state ? t(`chat.recordList.keyState.${item.state}`) : null
    const itemCount = recordList.kind === 'templates' && item.count != null
      ? t('chat.recordList.templateCount', { count: item.count }) : null
    const details = [unread ? t('chat.recordList.unread') : null, item.detail, item.date ? date.format(new Date(item.date)) : null, itemCount, keyState].filter(Boolean)
    return {
      id: item.id,
      label: <span className={unread ? 'font-semibold text-[var(--fg-1)]' : 'font-normal text-[var(--fg-2)]'}>{item.title}</span>,
      meta: details.join(' · '),
      control: unread ? <button type="button" aria-label={t('notifications.markRead', { title: item.title })} className="grid size-11 place-items-center rounded-[8px] text-[var(--fg-2)] hover:bg-[var(--bg-hover)]" onClick={() => void markNotification(item.id)}><Check size={20} strokeWidth={1.8} aria-hidden="true" /></button> : undefined,
    }
  })
  const destination = recordList.surfaceId === 'profile' ? '/profile' : recordList.surfaceId === 'notifications' ? '/notifications' : null
  return <div className="mt-2 w-full md:max-w-[65ch]">
    <BlockFrame state={failure ? 'partiallyFailed' : 'resting'} title={t(`chat.recordList.title.${recordList.kind}`)}
      count={t('chat.recordList.count', { shown: items.length, total: recordList.totalCount })} items={rows}
      body={<>{items.length === 0 ? <p className="text-sm text-[var(--fg-3)]">{t('chat.recordList.empty')}</p> : null}{recordList.kind === 'templates' && items.some((item) => (item.count ?? 0) > 20) ? <p className="text-sm text-[var(--fg-3)]">{t('chat.recordList.templateLimit')}</p> : null}{failure ? <p role="status" className="text-sm text-[var(--status-bad-text)]">{failure}</p> : null}</>}
      actions={<div className="flex flex-wrap gap-2">{nextCursor ? <Button variant="ghost" size="sm" loading={loadingMore} onClick={() => void showMore()}>{t('chat.recordList.more')}</Button> : null}{destination ? <Button variant="ghost" size="sm" onClick={() => router.push(destination)}>{t(`chat.recordList.open.${recordList.kind}`)}</Button> : null}</div>} />
  </div>
}
