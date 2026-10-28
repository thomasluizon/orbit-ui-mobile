'use client'

import { ConversationCrossfade } from './conversation-motion'

import { IconButton } from '@/components/ui/icon-button'
import { ChevronDown, RefreshCw } from '@/components/ui/icons'
import { useLocale, useTranslations } from 'next-intl'
import { refreshGamification, refreshHabitMonth, refreshReadBlock } from '@/app/actions/chat'
import { getHeldAccountId } from '@/stores/auth-store'
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import { useProfile } from '@/hooks/use-profile'
import { createUseReadBlockSession, type ReadBlockState, type ReadBlockBoundaryProps } from '@orbit/shared/chat/read-block-session-core'
import { formatReadWindow, readBlockPresentation, readBlockFrameProps } from '@orbit/shared/chat/read-block-core'
import { getAccountGeneration, subscribeToAccountGeneration } from '@/lib/session-epoch'
import { BlockFrame as Frame } from '@/components/ui/block-frame'

const useReadBlockSession = createUseReadBlockSession({
  useState, useRef, useEffect, getAccountGeneration, platform: 'web',
  refresh: async (token, clientContext, page, _isCurrent, kind) => {
    const result = kind === 'gamification'
      ? await refreshGamification(token, clientContext, getHeldAccountId())
      : kind === 'habitMonth'
      ? await refreshHabitMonth(token, clientContext, getHeldAccountId())
      : await refreshReadBlock(token, clientContext, page, getHeldAccountId())
    if (!result.ok) throw new Error(result.code)
    return result.data
  },
})

const ReadContext = createContext<ReadBlockState | null>(null)

export function ReadBlockBoundary({ snapshot, children }: ReadBlockBoundaryProps<ReactNode>) {
  const generation = useSyncExternalStore(subscribeToAccountGeneration, getAccountGeneration, getAccountGeneration)
  return <ReadBlockSession key={`${generation}:${snapshot.read.queryId}:${snapshot.read.revision}`} snapshot={snapshot}>{children}</ReadBlockSession>
}

function ReadBlockSession({ snapshot: initial, children }: ReadBlockBoundaryProps<ReactNode>) {
  const locale = useLocale()
  const { profile } = useProfile()
  const actionScope = { ready: profile != null, timeZone: profile?.timeZone ?? null }
  const context = useReadBlockSession(initial, locale, actionScope)
  return <ReadContext.Provider value={context}><ConversationCrossfade changeKey={String(context.snapshot.read.revision)}>{children(context.snapshot)}</ConversationCrossfade></ReadContext.Provider>
}

export function BlockFrame(props: Readonly<BlockFrameProps>) {
  const t = useTranslations()
  const context = useContext(ReadContext)
  return context ? <QueryBlockFrame props={props} context={context} /> : <Frame {...(props.state === 'stale' ? { ...props, staleMessage: t('chat.liveBlock.unavailable') } : props)} onRefresh={undefined} />
}

function QueryBlockFrame({ props, context }: Readonly<{ props: BlockFrameProps; context: ReadBlockState }>) {
  const t = useTranslations()
  const locale = useLocale()
  const { snapshot, pending, failure, stale, run } = context
  const { state, message, window, canPage } = readBlockPresentation(snapshot, props.state, pending, failure, stale)
  const actions = <>
    {snapshot.kind === 'gamification' ? <IconButton label={t('blockFrame.refresh')} disabled={pending} onClick={() => { void run(false) }}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton> : null}
    {canPage && snapshot.kind !== 'gamification' ? <IconButton label={t('chat.recordList.more')} disabled={pending} onClick={() => { void run(true) }}><ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton> : null}
    {props.actions}
  </>
  const body = <>{window ? <p className="text-sm text-[var(--fg-3)]">{formatReadWindow(window, locale)}</p> : null}{message && state !== 'stale' ? <p role="status" className="text-sm text-[var(--fg-2)]">{t(message)}</p> : null}{props.body}</>
  const frameProps = readBlockFrameProps(props, state, message, () => { void run(false) }, t, actions)
  return <Frame {...frameProps} body={body} />
}

export function useReadActionScope() {
  return useContext(ReadContext)?.actionScope
}
