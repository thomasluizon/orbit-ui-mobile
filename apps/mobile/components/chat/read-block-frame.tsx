import { AstraOffer } from './astra-offer'
import type { AstraOfferProps } from '@orbit/shared/chat'
import { ConversationCrossfade } from './conversation-motion'
import { IconButton } from '@/components/ui/icon-button'
import { ChevronDown, RefreshCw } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { Text } from 'react-native'
import { API } from '@orbit/shared/api'
import { gamificationReadBlockResponseSchema, habitMonthReadBlockResponseSchema, readBlockResponseSchema } from '@orbit/shared/types/chat'
import { apiClient } from '@/lib/api-client'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import { useProfile } from '@/hooks/use-profile'
import { createUseReadBlockSession, type ReadBlockState, type ReadBlockBoundaryProps } from '@orbit/shared/chat/read-block-session-core'
import { formatReadWindow, readBlockPresentation, readBlockFrameProps } from '@orbit/shared/chat/read-block-core'
import { getAccountGeneration, subscribeToAccountGeneration } from '@/lib/session-epoch'
import { BlockFrame as Frame } from '@/components/ui/block-frame'

const useReadBlockSession = createUseReadBlockSession({
  useState, useRef, useEffect, getAccountGeneration, platform: 'mobile',
  refresh: async (token, clientContext, page, isCurrent, kind) => {
    try {
      if (kind === 'gamification') return await apiClient(API.chat.refreshGamification, { method: 'POST', body: JSON.stringify({ token, clientContext }), isCurrent, silent: true }, gamificationReadBlockResponseSchema)
      if (kind === 'habitMonth') return await apiClient(API.chat.refreshHabitMonth, { method: 'POST', body: JSON.stringify({ token, clientContext }), isCurrent, silent: true }, habitMonthReadBlockResponseSchema)
      return await apiClient(API.chat.refreshRead, { method: 'POST', body: JSON.stringify({ token, clientContext, page }), isCurrent, silent: true }, readBlockResponseSchema)
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') throw new Error(error.code)
      throw error
    }
  },
})

const OfferContext = createContext<Omit<AstraOfferProps, 'action'>>({})

const ReadContext = createContext<ReadBlockState | null>(null)

export function ReadBlockBoundary({ snapshot, children, ...offer }: ReadBlockBoundaryProps<ReactNode> & Omit<AstraOfferProps, 'action'>) {
  const generation = useSyncExternalStore(subscribeToAccountGeneration, getAccountGeneration, getAccountGeneration)
  return <OfferContext.Provider value={offer}><ReadBlockSession key={`${generation}:${snapshot.read.queryId}:${snapshot.read.revision}`} snapshot={snapshot}>{children}</ReadBlockSession></OfferContext.Provider>
}

function ReadBlockSession({ snapshot: initial, children }: ReadBlockBoundaryProps<ReactNode>) {
  const { i18n } = useTranslation()
  const locale = i18n.language
  const { profile } = useProfile()
  const actionScope = { ready: profile != null, timeZone: profile?.timeZone ?? null }
  const context = useReadBlockSession(initial, locale, actionScope)
  return <ReadContext.Provider value={context}><ConversationCrossfade changeKey={String(context.snapshot.read.revision)}>{children(context.snapshot)}</ConversationCrossfade></ReadContext.Provider>
}

export function BlockFrame(props: Readonly<BlockFrameProps>) {
  const { t } = useTranslation()
  const context = useContext(ReadContext)
  return context ? <QueryBlockFrame props={props} context={context} /> : <Frame {...(props.state === 'stale' ? { ...props, staleMessage: t('chat.liveBlock.unavailable') } : props)} onRefresh={undefined} />
}

function QueryBlockFrame({ props, context }: Readonly<{ props: BlockFrameProps; context: ReadBlockState }>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const offer = useContext(OfferContext)
  const { snapshot, pending, failure, stale, run } = context
  const { state, message, window, canPage } = readBlockPresentation(snapshot, props.state, pending, failure, stale)
  const actions = <>
    {snapshot.kind === 'gamification' ? <IconButton label={t('blockFrame.refresh')} disabled={pending} onClick={() => { void run(false) }}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton> : null}
    {canPage && snapshot.kind !== 'gamification' ? <IconButton label={t('chat.recordList.more')} disabled={pending} onClick={() => { void run(true) }}><ChevronDown size={20} strokeWidth={1.5} accessible={false} /></IconButton> : null}
    {props.actions}
  </>
  const body = <>{window ? <Text style={{ color: tokens.fg3, fontSize: 14 }}>{formatReadWindow(window, locale)}</Text> : null}{message && state !== 'stale' ? <Text accessibilityLiveRegion="polite" style={{ color: tokens.fg2, fontSize: 14 }}>{t(message)}</Text> : null}{props.body}<AstraOffer {...offer} action={snapshot.read.nextAction} unavailable={pending || stale} /></>
  const frameProps = readBlockFrameProps(props, state, message, () => { void run(false) }, t, actions)
  return <Frame {...frameProps} body={body} />
}

export function useReadActionScope() {
  return useContext(ReadContext)?.actionScope
}
