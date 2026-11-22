import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { ShellCentredRegion } from '@/components/shell/shell-centred-region'
import { useContentFrameStyle } from '@/hooks/use-content-frame-style'
import { SPACING } from '@orbit/shared/theme'
import { useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { useListRowMotion } from '@/components/habits/flow-steps/list-row-motion'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { Skeleton } from '@/components/ui/skeleton'
import { NotificationRow } from './notification-row'

interface NotificationListProps {
  items: NotificationItem[]
  scope: string
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  onOpen: (item: NotificationItem) => void
  onDelete: (item: NotificationItem) => void
}

type Tokens = ReturnType<typeof createTokensV2>

const NO_SNAPSHOT: readonly string[] = []

interface ScopeMotion {
  scope: string
  ids: readonly string[]
  quiet: ReadonlySet<string>
  generation: number
}

function useScopeMotion(scope: string, ids: readonly string[]): ScopeMotion {
  const [previous, setPrevious] = useState<ScopeMotion>(() => ({ scope, ids, quiet: new Set(), generation: 0 }))
  if (previous.scope === scope && previous.ids.join(' ') === ids.join(' ')) return previous
  const scopeChanged = previous.scope !== scope
  const next: ScopeMotion = {
    scope,
    ids,
    quiet: scopeChanged ? new Set(ids.filter((id) => !previous.ids.includes(id))) : new Set(),
    generation: previous.generation + (scopeChanged && previous.ids.some((id) => !ids.includes(id)) ? 1 : 0),
  }
  setPrevious(next)
  return next
}

function GuidedRows({ items, scope, onOpen, onDelete }: Readonly<Pick<NotificationListProps, 'items' | 'scope' | 'onOpen' | 'onDelete'>>) {
  const motion = useListRowMotion(NO_SNAPSHOT)
  const { quiet, generation } = useScopeMotion(scope, items.map((item) => item.id))
  return (
    <LayoutAnimationConfig key={generation} skipEntering skipExiting>
      <View testID="notification-rows" style={styles.rows}>
        {items.map((item) => (
          <Animated.View key={item.id} testID="notification-row-motion" entering={quiet.has(item.id) ? undefined : motion.enteringFor(item.id)} exiting={motion.exiting} layout={motion.layout}>
            <NotificationRow item={item} onOpen={onOpen} onDelete={onDelete} />
          </Animated.View>
        ))}
      </View>
    </LayoutAnimationConfig>
  )
}

function SkeletonRows() {
  return Array.from({ length: 5 }, (_, index) => (
    <View key={index} accessible={false} style={styles.skeletonRow}>
      <View style={styles.dotColumn} />
      <View style={styles.skeletonContent}>
        {NOTIFICATION_SKELETON_LINES.map((line, index) => <View key={index} testID="notification-skeleton-line" style={line}><Skeleton variant="fill" grouped /></View>)}
      </View>
    </View>
  ))
}

function InboxState({ failed, tokens, onRetry }: Readonly<{ failed: boolean; tokens: Tokens; onRetry: () => void }>) {
  const { t } = useTranslation()
  const stateMascotSize = useStateMascotSize()
  const mascot = <OrbitMascot size={stateMascotSize} />
  return (
    <ShellCentredRegion><View testID="notification-empty" style={styles.empty}>
      {failed ? <>
        {mascot}
        <Text style={[styles.copy, { color: tokens.fg3 }]}>{t('notifications.loadError')}</Text>
        <IconButton label={t('common.retry')} onPress={onRetry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>
      </> : <>
        {mascot}
        <Text style={[styles.copy, { color: tokens.fg3 }]}>{t('notifications.empty')}</Text>
      </>}
    </View></ShellCentredRegion>
  )
}

export function NotificationList({ items, scope, isLoading, isError, onRetry, onOpen, onDelete }: Readonly<NotificationListProps>) {
  const contentFrameStyle = useContentFrameStyle()
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const loading = <View testID="notification-skeletons" style={styles.rows}><SkeletonRows /></View>
  const rest = isLoading ? loading : <InboxState failed={isError} tokens={tokens} onRetry={onRetry} />
  return (
    <View accessibilityLabel={t('notifications.title')} accessibilityState={{ busy: isLoading }} style={[contentFrameStyle, styles.list, styles.guidedList]}>
      <GuidedRows items={items} scope={scope} onOpen={onOpen} onDelete={onDelete} />
      {items.length > 0 ? null : rest}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, paddingVertical: SPACING.s16, gap: 8 },
  guidedList: { gap: 0 },
  rows: { gap: 8 },
  skeletonRow: { flexDirection: 'row', gap: 12, padding: SPACING.s16, borderRadius: 12 },
  dotColumn: { width: 8 },
  skeletonContent: { flex: 1, gap: 8 },
  skeletonTitle: { width: '80%', height: 22 },
  skeletonBody: { width: '100%', height: 21 },
  skeletonTarget: { width: '32%', height: 16 },
  empty: { padding: SPACING.s32, gap: 16, borderRadius: 20, alignItems: 'center' },
  copy: { fontFamily: 'Geist_400Regular', fontSize: 14, textAlign: 'center' },
})

const NOTIFICATION_SKELETON_LINES = [styles.skeletonTitle, styles.skeletonBody, styles.skeletonTarget]
