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
import { useFlag } from '@/hooks/use-flag'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { NotificationRow } from './notification-row'

interface NotificationListProps {
  items: NotificationItem[]
  /** The ids the inbox holds, pending deletes included. It changes only when the inbox itself changes. */
  scope: string
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  onOpen: (item: NotificationItem) => void
  onDelete: (item: NotificationItem) => void
}

type Tokens = ReturnType<typeof createTokensV2>

/** The scope wrapper skips the entrance of the rows it mounts with, so the row motion holds no snapshot of its own. */
const NO_SNAPSHOT: readonly string[] = []

interface ScopeMotion {
  scope: string
  ids: readonly string[]
  /** The rows that a change of the inbox brought. They mount with no entrance. */
  quiet: ReadonlySet<string>
  /** Grows when a change of the inbox takes a shown row away. The wrapper then mounts again, which skips that exit. */
  generation: number
}

/**
 * Only a row the person deletes or restores moves. A change of `scope` (the inbox itself changed) brings its new rows
 * with no entrance. It mounts the rows again only when it takes a shown row away, so that row leaves with no exit;
 * the commit of a pending delete and a new notification keep every mounted row.
 */
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

/**
 * The rows on the Orbit logic. A row the person deletes leaves with `list-exit` and the gap closes; undo returns it with
 * `list-enter`. A change of the inbox itself moves no row.
 */
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

function SkeletonRows({ tokens }: Readonly<{ tokens: Tokens }>) {
  return Array.from({ length: 5 }, (_, index) => (
    <View key={index} accessible={false} style={styles.skeletonRow}>
      <View style={styles.dotColumn} />
      <View style={styles.skeletonContent}>
        <View testID="notification-skeleton-line" style={[styles.skeletonTitle, { backgroundColor: tokens.bgElev }]} />
        <View testID="notification-skeleton-line" style={[styles.skeletonBody, { backgroundColor: tokens.bgElev }]} />
        <View testID="notification-skeleton-line" style={[styles.skeletonTarget, { backgroundColor: tokens.bgElev }]} />
      </View>
    </View>
  ))
}

/** The empty inbox and the failed inbox. On the Orbit logic both show Orbit in Parado at the state size; the failed inbox keeps its message and retry. */
function InboxState({ failed, guided, tokens, onRetry }: Readonly<{ failed: boolean; guided: boolean; tokens: Tokens; onRetry: () => void }>) {
  const { t } = useTranslation()
  const stateMascotSize = useStateMascotSize()
  const mascot = guided ? <OrbitMascot size={stateMascotSize} /> : null
  return (
    <ShellCentredRegion><View testID="notification-empty" style={styles.empty}>
      {failed ? <>
        {mascot}
        <Text style={[styles.copy, { color: tokens.fg3 }]}>{t('notifications.loadError')}</Text>
        <IconButton label={t('common.retry')} onPress={onRetry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>
      </> : <>
        {mascot ?? <OrbitMascot size={96} />}
        <Text style={[styles.copy, { color: tokens.fg3 }]}>{t('notifications.empty')}</Text>
      </>}
    </View></ShellCentredRegion>
  )
}

export function NotificationList({ items, scope, isLoading, isError, onRetry, onOpen, onDelete }: Readonly<NotificationListProps>) {
  const contentFrameStyle = useContentFrameStyle()
  const { t } = useTranslation()
  const guided = useFlag('orbit_guided_flows')
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const loading = guided ? <View testID="notification-skeletons" style={styles.rows}><SkeletonRows tokens={tokens} /></View> : <SkeletonRows tokens={tokens} />
  const rest = isLoading ? loading : <InboxState failed={isError} guided={guided} tokens={tokens} onRetry={onRetry} />
  return (
    <View accessibilityLabel={t('notifications.title')} accessibilityState={{ busy: isLoading }} style={[contentFrameStyle, styles.list, guided ? styles.guidedList : null]}>
      {guided ? <GuidedRows items={items} scope={scope} onOpen={onOpen} onDelete={onDelete} /> : items.map((item) => <NotificationRow key={item.id} item={item} onOpen={onOpen} onDelete={onDelete} />)}
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
  skeletonTitle: { width: '80%', height: 22, borderRadius: 999 },
  skeletonBody: { width: '100%', height: 21, borderRadius: 999 },
  skeletonTarget: { width: '32%', height: 16, borderRadius: 999 },
  empty: { padding: SPACING.s32, gap: 16, borderRadius: 20, alignItems: 'center' },
  copy: { fontFamily: 'Geist_400Regular', fontSize: 14, textAlign: 'center' },
})
