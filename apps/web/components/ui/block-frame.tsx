'use client'

import { IconButton } from '@/components/ui/icon-button'

import { SPACING } from '@orbit/shared/theme'


import { ActionRow } from './action-row'

import { useEffect, useRef, useState } from 'react'
import type {
  BlockFrameItemStatus,
  BlockFrameProps,
  ResolvedBlockFrameRow,
} from '@orbit/shared/contracts/blocks'
import {
  resolveBlockFrameState,
  PROPOSED_RADIUS,
  resolveBlockFrameRows,
} from '@orbit/shared/contracts/blocks'
import { useTranslations } from 'next-intl'
import {
  CheckCircle2,
  Pencil,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { Proposed } from '@/components/ui/proposed'

type StatusViewProps = Readonly<{
  status: BlockFrameItemStatus
  label: string
}>

type StatusLabels = Readonly<Record<BlockFrameItemStatus, string>>

function StatusView({ status, label }: StatusViewProps) {
  const Glyph = status === 'done' ? CheckCircle2 : status === 'failed' ? XCircle : RefreshCw
  const statusColors = {
    iconColor: status === 'failed' ? 'var(--status-bad)' : status === 'done' ? 'var(--fg-1)' : 'var(--fg-2)',
  }
  const labelColor = status === 'failed' ? 'var(--status-bad-text)' : status === 'done' ? 'var(--fg-1)' : 'var(--fg-2)'

  return (
    <span className="flex max-w-full shrink-0 flex-wrap items-center gap-[4px] text-xs" style={{ color: labelColor }}>
      <Glyph aria-hidden="true" size={20} strokeWidth={1.5} color={statusColors.iconColor} className="shrink-0" />
      <span className="max-w-full">{label}</span>
    </span>
  )
}

function getRowInset(indented: boolean | undefined) {
  return indented ? { paddingInlineStart: SPACING.s24 } : undefined
}

function FrameRowContent(props: ResolvedBlockFrameRow) {
  const { item, frameState, statusLabel, onEditItem } = props
  const status = frameState === 'acting' ? 'acting' : item.status
  const isEditable = status == null && frameState !== 'stale' && item.editable !== false
  const row = (
    <div
      className={`flex min-h-[52px] gap-[12px] p-3 ${item.wrapLabel ? 'items-start' : 'items-center'}`}
      data-proposed={item.proposed ? '' : undefined}
      data-status={status}
      data-indented={item.indented}
      style={getRowInset(item.indented)}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className={`${item.wrapLabel ? 'break-words' : 'truncate'} text-sm font-medium ${item.proposed ? 'text-[var(--fg-3)]' : 'text-[var(--fg-1)]'}`}>{item.label}</div>
        {item.meta ? <div className={`${item.wrapMeta ? 'break-words leading-[1.4]' : 'truncate'} text-xs text-[var(--fg-3)]`}>{item.meta}</div> : null}
        {item.irreversible && props.irreversibleLabel ? (
          <div className="flex items-center gap-1 text-xs text-[var(--fg-3)] uppercase">
            <ShieldAlert aria-hidden="true" size={20} strokeWidth={1.5} />
            <span>{props.irreversibleLabel}</span>
          </div>
        ) : null}
      </div>
      <div className="flex max-w-[60%] shrink-0 flex-wrap items-center gap-[8px]">
        {item.control}
        {isEditable && onEditItem && props.editLabel ? (
          <button
            aria-label={props.editLabel}
            className="flex size-[var(--touch-min)] items-center justify-center rounded-full text-[var(--fg-2)] hover:bg-[var(--bg-hover)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]"
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

  return row
}

function FrameRow(props: ResolvedBlockFrameRow) {
  return <Proposed proposed={props.item.proposed === true} scope="row" label={props.proposedLabel ?? ''} keepMounted>
    <FrameRowContent {...props} />
    {props.item.body ? <div className="px-3 pb-3">{props.item.body}</div> : null}
  </Proposed>
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
      {hasActions ? <div className="h-[var(--touch-min)] rounded-[8px] bg-[var(--bg-elev-2)]" /> : null}
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

  return resolveBlockFrameRows(frameProps, labels).map((rowProps) => (
    <FrameRow key={rowProps.item.id} {...rowProps} />
  ))
}

function FrameFooter({ frameProps, canRenderActions, hasIrreversibleItem }: Readonly<{
  frameProps: Readonly<BlockFrameProps>
  canRenderActions: boolean
  hasIrreversibleItem: boolean
}>) {
  const t = useTranslations('blockFrame')

  if (frameProps.state === 'stale') {
    return (
      <ActionRow>
        {frameProps.onRefresh ? <IconButton label={frameProps.refreshLabel ?? t('refresh')} onClick={frameProps.onRefresh}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton> : null}
        {frameProps.staleActions}
      </ActionRow>
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
          <ActionRow>{frameProps.actions}</ActionRow>
        </fieldset>
      ) : null}
    </div>
  )
}

export function BlockFrame(props: Readonly<BlockFrameProps>) {
  const [clamped, setClamped] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (props.focusTitleOnMount) titleRef.current?.focus({ preventScroll: true })
  }, [props.focusTitleOnMount])
  const { missingLabels, hasIrreversibleItem, canRenderActions } = resolveBlockFrameState(props)
  if (process.env.NODE_ENV !== 'production' && missingLabels.length > 0) {
    throw new Error(`Missing BlockFrame props: ${missingLabels.join(', ')}`)
  }


  return (
    <section
      className="flex max-h-full min-h-0 flex-col gap-6 bg-[var(--bg-card)] text-[var(--fg-1)]"
      data-state={props.state}
      aria-busy={props.state === 'acting' || undefined}
      style={{
        borderRadius: PROPOSED_RADIUS.block,
        padding: SPACING.s24,
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <header className={`flex shrink-0 gap-3 ${props.titleMode === 'typed' ? 'min-w-0 flex-col' : 'items-center'}`}>
        <h3 ref={titleRef} tabIndex={props.focusTitleOnMount ? -1 : undefined} className={props.titleMode === 'typed' ? 'min-w-0 text-base font-medium' : props.wrapTitle ? 'min-w-0 flex-1 break-words text-base font-medium' : 'min-w-0 flex-1 truncate text-base font-medium'}>{props.titleMode === 'typed' ? <PersonalText onClampedChange={setClamped}>{props.title}</PersonalText> : props.title}</h3>
        <div className="flex shrink-0 items-center justify-end gap-3">
          {props.count !== null && (props.count !== undefined || props.items.length > 0) ? (
            <span className="font-sans text-xs tabular-nums text-[var(--fg-3)]">{props.count ?? props.items.length}</span>
          ) : null}
          {props.titleMode === 'typed' ? <PersonalTextDetails iconOnly clamped={clamped}>{props.title}</PersonalTextDetails> : null}
        </div>
      </header>
      <FrameStaleMessage frameProps={props} />
      {props.state === 'loading' ? (
        <LoadingBody rows={props.items.length} hasActions={canRenderActions && props.actions != null} />
      ) : (
        <>
          {props.body}
          <FrameBody frameProps={props} />
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

function FrameStaleMessage({ frameProps }: Readonly<{ frameProps: BlockFrameProps }>) {
  const live = frameProps.items.length > 0 || frameProps.state === 'stale'
  return <p role={live ? 'status' : undefined} aria-live={live ? 'polite' : undefined} className={frameProps.state === 'stale' ? 'text-sm text-[var(--fg-2)]' : 'sr-only'}>
    {frameProps.state === 'stale' ? frameProps.staleMessage : ''}
  </p>
}

function FrameBody({ frameProps }: Readonly<{ frameProps: BlockFrameProps }>) {
  if (frameProps.items.length === 0) return null
  return <div aria-live="polite" className="flex min-h-0 shrink flex-col gap-2 overflow-y-auto">
    <FrameRows frameProps={frameProps} />
  </div>
}
