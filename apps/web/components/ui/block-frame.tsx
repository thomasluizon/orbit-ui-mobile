'use client'

import type {
  BlockFrameItem,
  BlockFrameItemStatus,
  BlockFrameProps,
} from '@orbit/shared/contracts/blocks'
import {
  findMissingBlockFrameLabels,
  PROPOSED_RADIUS,
} from '@orbit/shared/contracts/blocks'
import { useTranslations } from 'next-intl'
import {
  CheckCircle2,
  Pencil,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from '@/components/ui/icons'
import { Proposed } from '@/components/ui/proposed'

type StatusViewProps = Readonly<{
  status: BlockFrameItemStatus
  label: string
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

function StatusView({ status, label }: StatusViewProps) {
  const Glyph = status === 'done' ? CheckCircle2 : status === 'failed' ? XCircle : RefreshCw
  const color = status === 'failed' ? 'var(--status-bad)' : status === 'done' ? 'var(--fg-1)' : 'var(--fg-2)'

  return (
    <span className="flex shrink-0 items-center gap-1 text-xs" style={{ color }}>
      <Glyph aria-hidden="true" size={20} strokeWidth={1.5} />
      <span>{label}</span>
    </span>
  )
}

type FrameRowProps = Readonly<{
  item: BlockFrameItem
  frameState: BlockFrameProps['state']
  statusLabel?: string
  irreversibleLabel?: string
  proposedLabel?: string
  editLabel?: string
  onEditItem?: (itemId: string) => void
}>

function FrameRow(props: FrameRowProps) {
  const { item, frameState, statusLabel, onEditItem } = props
  const status = frameState === 'acting' ? 'acting' : item.status
  const isEditable = status == null && frameState !== 'stale'
  const row = (
    <div
      className="flex min-h-[52px] items-center gap-3 p-3"
      data-proposed={item.proposed ? '' : undefined}
      data-status={status}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="truncate text-sm font-medium">{item.label}</div>
        {item.meta ? <div className="truncate text-xs text-[var(--fg-3)]">{item.meta}</div> : null}
        {item.irreversible && props.irreversibleLabel ? (
          <div className="flex items-center gap-1 text-xs text-[var(--fg-3)] uppercase">
            <ShieldAlert aria-hidden="true" size={20} strokeWidth={1.5} />
            <span>{props.irreversibleLabel}</span>
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.control}
        {isEditable && onEditItem && props.editLabel ? (
          <button
            aria-label={props.editLabel}
            className="flex size-11 items-center justify-center rounded-[8px] text-[var(--fg-2)] hover:bg-[var(--bg-hover)]"
            onClick={() => onEditItem(item.id)}
            type="button"
          >
            <Pencil aria-hidden="true" size={20} strokeWidth={1.5} />
          </button>
        ) : null}
        {status && statusLabel ? <StatusView status={status} label={statusLabel} /> : null}
      </div>
    </div>
  )

  return (
    <Proposed proposed={item.proposed === true} scope="row" label={props.proposedLabel ?? ''}>
      {row}
    </Proposed>
  )
}

function LoadingBody({ rows, hasActions }: Readonly<{ rows: number; hasActions: boolean }>) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-2" data-loading-skeleton="">
        {Array.from({ length: rows }, (_, index) => (
          <div className="flex min-h-[52px] items-center gap-3 p-3" key={index}>
            <span className="h-4 flex-1 rounded-[8px] bg-[var(--bg-elev-2)]" />
            <span className="size-5 rounded-[8px] bg-[var(--bg-elev-2)]" />
          </div>
        ))}
      </div>
      {hasActions ? <div className="h-11 rounded-[8px] bg-[var(--bg-elev-2)]" /> : null}
    </>
  )
}

function FrameRows({ frameProps }: Readonly<{ frameProps: Readonly<BlockFrameProps> }>) {
  const t = useTranslations('blockFrame')
  const labels: StatusLabels = {
    done: t('status.done'),
    acting: t('status.acting'),
    failed: t('status.failed'),
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
      />
    )
  })
}

function FrameFooter({ frameProps, canRenderActions, hasIrreversibleItem }: Readonly<{
  frameProps: Readonly<BlockFrameProps>
  canRenderActions: boolean
  hasIrreversibleItem: boolean
}>) {
  const t = useTranslations('blockFrame')

  if (frameProps.state === 'stale') {
    return (
      <div className="flex shrink-0 items-center gap-3 text-sm text-[var(--fg-2)]">
        <span className="min-w-0 flex-1">{frameProps.staleMessage}</span>
        <button
          className="flex min-h-11 items-center gap-2 rounded-[8px] px-3 text-[var(--fg-1)] hover:bg-[var(--bg-hover)]"
          onClick={frameProps.onRefresh}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={20} strokeWidth={1.5} />
          <span>{t('refresh')}</span>
        </button>
      </div>
    )
  }

  if (!hasIrreversibleItem && (!canRenderActions || frameProps.actions == null)) return null

  return (
    <div className="flex shrink-0 flex-col gap-3" data-action-row="">
      {hasIrreversibleItem && frameProps.confirmNote ? (
        <p className="text-sm text-[var(--fg-2)]">{frameProps.confirmNote}</p>
      ) : null}
      {canRenderActions && frameProps.actions != null ? (
        <fieldset className="contents" disabled={frameProps.state === 'acting'}>
          {frameProps.actions}
        </fieldset>
      ) : null}
    </div>
  )
}

export function BlockFrame(props: Readonly<BlockFrameProps>) {
  const missingLabels = findMissingBlockFrameLabels(props)
  if (process.env.NODE_ENV !== 'production' && missingLabels.length > 0) {
    throw new Error(`Missing BlockFrame props: ${missingLabels.join(', ')}`)
  }

  const isBusy = props.state === 'loading' || props.state === 'acting'
  const hasIrreversibleItem = props.items.some((item) => item.irreversible === true)
  // WHY: An unsafe batch must not remain one tap from running when consequence labels are missing. https://github.com/thomasluizon/orbit-tickets/issues/349
  const canRenderActions = missingLabels.length === 0 && props.state !== 'stale'

  return (
    <section
      aria-busy={isBusy || undefined}
      className="flex max-h-full min-h-0 flex-col gap-6 bg-[var(--bg-card)] p-6 text-[var(--fg-1)]"
      data-state={props.state}
      style={{
        borderRadius: PROPOSED_RADIUS.block,
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <header className="flex shrink-0 items-center gap-3">
        <h3 className="min-w-0 flex-1 truncate text-base font-medium">{props.title}</h3>
        <span className="font-mono text-xs tabular-nums text-[var(--fg-3)]">{props.items.length}</span>
        {props.risk}
      </header>
      {props.state === 'loading' ? (
        <LoadingBody rows={props.items.length} hasActions={canRenderActions && props.actions != null} />
      ) : (
        <>
          <div aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            <FrameRows frameProps={props} />
          </div>
          <FrameFooter
            canRenderActions={canRenderActions}
            frameProps={props}
            hasIrreversibleItem={hasIrreversibleItem}
          />
        </>
      )}
    </section>
  )
}
