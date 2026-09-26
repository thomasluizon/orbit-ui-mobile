import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { API } from '@orbit/shared/api'
import { recordListCardSchema, type RecordListCard as RecordListCardData } from '@orbit/shared/types/chat'
import type { BlockFrameItem } from '@orbit/shared/contracts/blocks'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { Check } from '@/components/ui/icons'
import { apiClient } from '@/lib/api-client'
import { useMarkNotificationRead } from '@/hooks/use-notifications'
import { getAccountGeneration, subscribeToAccountGeneration } from '@/lib/session-epoch'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function RecordListCard({ recordList }: Readonly<{ recordList: RecordListCardData }>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const markRead = useMarkNotificationRead()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
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
      const page = await apiClient(`${API.chat.records}/${recordList.kind}?cursor=${encodeURIComponent(nextCursor)}`, undefined, recordListCardSchema)
      if (generation !== getAccountGeneration()) return
      setItems((current) => [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch {
      if (generation === getAccountGeneration()) setFailure(t('chat.recordList.moreError'))
    } finally {
      if (generation === getAccountGeneration()) setLoadingMore(false)
    }
  }

  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' })
  const rows: BlockFrameItem[] = items.map((item) => {
    const unread = recordList.kind === 'notifications' && item.isRead === false && !readIds.has(item.id)
    const keyState = recordList.kind === 'keys' && item.state ? t(`chat.recordList.keyState.${item.state}`) : null
    const itemCount = recordList.kind === 'templates' && item.count != null
      ? t('chat.recordList.templateCount', { count: item.count }) : null
    const details = [unread ? t('chat.recordList.unread') : null, item.detail, item.date ? date.format(new Date(item.date)) : null, itemCount, keyState].filter(Boolean)
    return {
      id: item.id,
      label: <Text style={{ color: unread ? tokens.fg1 : tokens.fg2, fontFamily: unread ? 'Geist_600SemiBold' : 'Geist_400Regular', fontSize: 14 }}>{item.title}</Text>,
      meta: details.join(' · '),
      control: unread ? <Pressable accessibilityRole="button" accessibilityLabel={t('notifications.markRead', { title: item.title })} onPress={() => void markNotification(item.id)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Check size={20} strokeWidth={1.8} color={tokens.fg2} /></Pressable> : undefined,
    }
  })
  const destination = recordList.surfaceId === 'profile' ? '/profile' : recordList.surfaceId === 'notifications' ? '/notifications' : null
  return <View style={{ width: '100%', marginTop: 8 }}>
    <BlockFrame state={failure ? 'partiallyFailed' : 'resting'} title={t(`chat.recordList.title.${recordList.kind}`)}
      count={t('chat.recordList.count', { shown: items.length, total: recordList.totalCount })} items={rows}
      body={<View style={{ gap: 8 }}>{items.length === 0 ? <Text style={{ color: tokens.fg3, fontSize: 14 }}>{t('chat.recordList.empty')}</Text> : null}{recordList.kind === 'templates' && items.some((item) => (item.count ?? 0) > 20) ? <Text style={{ color: tokens.fg3, fontSize: 14 }}>{t('chat.recordList.templateLimit')}</Text> : null}{failure ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: tokens.statusBadText, fontSize: 14 }}>{failure}</Text> : null}</View>}
      actions={<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{nextCursor ? <Button variant="ghost" size="sm" loading={loadingMore} onClick={() => void showMore()}>{t('chat.recordList.more')}</Button> : null}{destination ? <Button variant="ghost" size="sm" onClick={() => router.push(destination)}>{t(`chat.recordList.open.${recordList.kind}`)}</Button> : null}</View>} />
  </View>
}
