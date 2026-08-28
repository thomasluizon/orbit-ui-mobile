import type {
  BlockFrameItem,
  BlockFrameItemStatus,
  BlockFrameProps,
} from '@orbit/shared/contracts/blocks'
import {
  findMissingBlockFrameLabels,
  PROPOSED_RADIUS,
} from '@orbit/shared/contracts/blocks'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  CheckCircle2,
  Pencil,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from '@/components/ui/icons'
import { Proposed } from '@/components/ui/proposed'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type FrameRowProps = Readonly<{
  item: BlockFrameItem
  frameState: BlockFrameProps['state']
  statusLabel?: string
  irreversibleLabel?: string
  proposedLabel?: string
  editLabel?: string
  onEditItem?: (itemId: string) => void
  tokens: AppTokensV2
}>

type StatusLabels = Readonly<Record<BlockFrameItemStatus, string>>

function resolveStatus(item: BlockFrameItem, frameState: BlockFrameProps['state']): BlockFrameItemStatus | undefined {
  return frameState === 'acting' ? 'acting' : item.status
}

function resolveStatusLabel(
  item: BlockFrameItem,
  status: BlockFrameItemStatus | undefined,
  frameState: BlockFrameProps['state'],
  labels: StatusLabels,
): string | undefined {
  if (status == null) return undefined
  if (frameState === 'acting') return labels.acting
  return item.statusLabel ?? labels[status]
}

function StatusView({ status, label, tokens }: Readonly<{
  status: BlockFrameItemStatus
  label: string
  tokens: AppTokensV2
}>) {
  const Glyph = status === 'done' ? CheckCircle2 : status === 'failed' ? XCircle : RefreshCw
  const color = status === 'failed' ? tokens.statusBad : status === 'done' ? tokens.fg1 : tokens.fg2

  return (
    <View style={styles.status}>
      <Glyph accessible={false} color={color} size={20} strokeWidth={1.5} />
      <Text style={[styles.statusLabel, { color }]}>{label}</Text>
    </View>
  )
}

function IrreversibleMark({ label, tokens }: Readonly<{ label: string; tokens: AppTokensV2 }>) {
  return (
    <View style={styles.irreversibleMark}>
      <ShieldAlert accessible={false} color={tokens.fg3} size={20} strokeWidth={1.5} />
      <Text style={[styles.irreversibleLabel, { color: tokens.fg3 }]}>{label}</Text>
    </View>
  )
}

function FrameRow(props: FrameRowProps) {
  const { item, frameState, statusLabel, onEditItem, tokens } = props
  const status = frameState === 'acting' ? 'acting' : item.status
  const isEditable = status == null && frameState !== 'stale'
  const row = (
    <View
      style={styles.row}
      testID={`block-frame-item-${item.id}-${status ?? 'pending'}${item.proposed ? '-proposed' : ''}`}
    >
      <View style={styles.rowWords}>
        <Text numberOfLines={1} style={[styles.rowLabel, { color: item.proposed ? tokens.fg3 : tokens.fg1 }]}>
          {item.label}
        </Text>
        {item.meta ? <Text numberOfLines={1} style={[styles.meta, { color: tokens.fg3 }]}>{item.meta}</Text> : null}
        {item.irreversible && props.irreversibleLabel ? (
          <IrreversibleMark label={props.irreversibleLabel} tokens={tokens} />
        ) : null}
      </View>
      <View style={styles.trailing}>
        {item.control}
        {isEditable && onEditItem && props.editLabel ? (
          <Pressable
            accessibilityLabel={props.editLabel}
            accessibilityRole="button"
            onPress={() => onEditItem(item.id)}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: pressed ? tokens.bgElevPressed : 'transparent' },
            ]}
          >
            <Pencil accessible={false} color={tokens.fg2} size={20} strokeWidth={1.5} />
          </Pressable>
        ) : null}
        {status && statusLabel ? <StatusView status={status} label={statusLabel} tokens={tokens} /> : null}
      </View>
    </View>
  )

  return (
    <Proposed proposed={item.proposed === true} scope="row" label={props.proposedLabel ?? ''}>
      {row}
    </Proposed>
  )
}

function LoadingBody({ rows, tokens, hasActions }: Readonly<{
  rows: number
  tokens: AppTokensV2
  hasActions: boolean
}>) {
  return (
    <>
      <View style={styles.loadingBody} testID="block-frame-loading-skeleton">
        {Array.from({ length: rows }, (_, index) => (
          <View key={index} style={styles.row}>
            <View style={[styles.rowSkeleton, { backgroundColor: tokens.bgElev2 }]} />
            <View style={[styles.iconSkeleton, { backgroundColor: tokens.bgElev2 }]} />
          </View>
        ))}
      </View>
      {hasActions ? <View style={[styles.actionSkeleton, { backgroundColor: tokens.bgElev2 }]} /> : null}
    </>
  )
}

function ActionRow({ children, disabled }: Readonly<{ children: ReactNode; disabled: boolean }>) {
  return (
    <View
      accessibilityState={{ disabled }}
      importantForAccessibility={disabled ? 'no-hide-descendants' : 'auto'}
      pointerEvents={disabled ? 'none' : 'auto'}
      style={styles.actionContent}
    >
      {children}
    </View>
  )
}

function FrameRows({ frameProps, tokens }: Readonly<{
  frameProps: Readonly<BlockFrameProps>
  tokens: AppTokensV2
}>) {
  const { t } = useTranslation()
  const labels: StatusLabels = {
    done: t('blockFrame.status.done'),
    acting: t('blockFrame.status.acting'),
    failed: t('blockFrame.status.failed'),
  }

  return frameProps.items.map((item) => {
    const status = resolveStatus(item, frameProps.state)
    return (
      <FrameRow
        editLabel={frameProps.editLabel}
        frameState={frameProps.state}
        irreversibleLabel={frameProps.irreversibleLabel}
        item={item}
        key={item.id}
        onEditItem={frameProps.onEditItem}
        proposedLabel={frameProps.proposedLabel}
        statusLabel={resolveStatusLabel(item, status, frameProps.state, labels)}
        tokens={tokens}
      />
    )
  })
}

function FrameFooter({ frameProps, canRenderActions, hasIrreversibleItem, tokens }: Readonly<{
  frameProps: Readonly<BlockFrameProps>
  canRenderActions: boolean
  hasIrreversibleItem: boolean
  tokens: AppTokensV2
}>) {
  const { t } = useTranslation()

  if (frameProps.state === 'stale') {
    return (
      <View style={styles.staleRow}>
        <Text style={[styles.staleMessage, { color: tokens.fg2 }]}>{frameProps.staleMessage}</Text>
        <Pressable
          accessibilityLabel={t('blockFrame.refresh')}
          accessibilityRole="button"
          onPress={frameProps.onRefresh}
          style={({ pressed }) => [
            styles.refreshButton,
            { backgroundColor: pressed ? tokens.bgElevPressed : 'transparent' },
          ]}
        >
          <RefreshCw accessible={false} color={tokens.fg1} size={20} strokeWidth={1.5} />
          <Text style={[styles.refreshLabel, { color: tokens.fg1 }]}>{t('blockFrame.refresh')}</Text>
        </Pressable>
      </View>
    )
  }

  if (!hasIrreversibleItem && (!canRenderActions || frameProps.actions == null)) return null

  return (
    <View style={styles.actionRow} testID="block-frame-action-row">
      {hasIrreversibleItem && frameProps.confirmNote ? (
        <Text style={[styles.confirmNote, { color: tokens.fg2 }]}>{frameProps.confirmNote}</Text>
      ) : null}
      {canRenderActions && frameProps.actions != null ? (
        <ActionRow disabled={frameProps.state === 'acting'}>{frameProps.actions}</ActionRow>
      ) : null}
    </View>
  )
}

export function BlockFrame(props: Readonly<BlockFrameProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const missingLabels = findMissingBlockFrameLabels(props)
  if (__DEV__ && missingLabels.length > 0) {
    throw new Error(`Missing BlockFrame props: ${missingLabels.join(', ')}`)
  }

  const isBusy = props.state === 'loading' || props.state === 'acting'
  const hasIrreversibleItem = props.items.some((item) => item.irreversible === true)
  // WHY: An unsafe batch must not remain one tap from running when consequence labels are missing. https://github.com/thomasluizon/orbit-tickets/issues/349
  const canRenderActions = missingLabels.length === 0 && props.state !== 'stale'

  return (
    <View
      accessibilityState={{ busy: isBusy }}
      style={[
        styles.frame,
        { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
      ]}
      testID={`block-frame-${props.state}`}
    >
      <View style={styles.header}>
        <Text numberOfLines={1} style={[styles.title, { color: tokens.fg1 }]}>{props.title}</Text>
        <Text style={[styles.count, { color: tokens.fg3 }]}>{props.items.length}</Text>
        {props.risk}
      </View>
      {props.state === 'loading' ? (
        <LoadingBody
          hasActions={canRenderActions && props.actions != null}
          rows={props.items.length}
          tokens={tokens}
        />
      ) : (
        <>
          <ScrollView
            accessibilityLiveRegion="polite"
            contentContainerStyle={styles.rows}
            style={styles.body}
            testID="block-frame-body"
          >
            <FrameRows frameProps={props} tokens={tokens} />
          </ScrollView>
          <FrameFooter
            canRenderActions={canRenderActions}
            frameProps={props}
            hasIrreversibleItem={hasIrreversibleItem}
            tokens={tokens}
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  frame: {
    maxHeight: '100%',
    minHeight: 0,
    gap: 24,
    borderRadius: PROPOSED_RADIUS.block,
    borderWidth: 1,
    padding: 24,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontFamily: 'Geist_500Medium', fontSize: 16 },
  count: { fontFamily: 'RobotoMono_500Medium', fontSize: 12, fontVariant: ['tabular-nums'] },
  body: { flex: 1, minHeight: 0 },
  rows: { gap: 8 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  rowWords: { flex: 1, minWidth: 0 },
  rowLabel: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  meta: { fontFamily: 'Geist_400Regular', fontSize: 12 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusLabel: { fontFamily: 'Geist_400Regular', fontSize: 12 },
  irreversibleMark: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  irreversibleLabel: { fontFamily: 'RobotoMono_500Medium', fontSize: 12, textTransform: 'uppercase' },
  loadingBody: { flex: 1, minHeight: 0, gap: 8 },
  rowSkeleton: { height: 16, flex: 1, borderRadius: 8 },
  iconSkeleton: { height: 20, width: 20, borderRadius: 8 },
  actionSkeleton: { height: 44, borderRadius: 8 },
  staleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  staleMessage: { flex: 1, fontFamily: 'Geist_400Regular', fontSize: 14 },
  refreshButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, paddingHorizontal: 12 },
  refreshLabel: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  actionRow: { gap: 12 },
  actionContent: { gap: 12 },
  confirmNote: { fontFamily: 'Geist_400Regular', fontSize: 14 },
})
