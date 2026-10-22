import { useTranslation } from 'react-i18next'
import { Text } from 'react-native'
import { API } from '@orbit/shared/api'
import { readBlockResponseSchema } from '@orbit/shared/types/chat'
import { apiClient } from '@/lib/api-client'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import type { ReadBlockResponse } from '@orbit/shared/types/chat'
import { useProfile } from '@/hooks/use-profile'
import { buildChatClientContext } from '@orbit/shared/chat/client-context'
import { acceptReadBlockResponse, formatReadWindow, readBlockPresentation, readBlockFailureKey } from '@orbit/shared/chat/read-block-core'
import { getAccountGeneration, subscribeToAccountGeneration } from '@/lib/session-epoch'
import { BlockFrame as Frame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'

type ReadBlockState = {
  snapshot: ReadBlockResponse
  actionScope: { ready: boolean; timeZone: string | null }
  pending: boolean
  failure: string | null
  run: (page: boolean) => void
}

const ReadContext = createContext<ReadBlockState | null>(null)

export function ReadBlockBoundary({ snapshot, children }: Readonly<{ snapshot: ReadBlockResponse; children: (current: ReadBlockResponse) => ReactNode }>) {
  const generation = useSyncExternalStore(subscribeToAccountGeneration, getAccountGeneration, getAccountGeneration)
  return <ReadBlockSession key={`${generation}:${snapshot.read.queryId}:${snapshot.read.revision}`} snapshot={snapshot}>{children}</ReadBlockSession>
}

function ReadBlockSession({ snapshot: initial, children }: Readonly<{ snapshot: ReadBlockResponse; children: (current: ReadBlockResponse) => ReactNode }>) {
  const { i18n } = useTranslation()
  const locale = i18n.language
  const { profile } = useProfile()
  const actionScope = { ready: profile != null, timeZone: profile?.timeZone ?? null }
  const [snapshot, setSnapshot] = useState(initial)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const active = useRef(true)
  const inFlight = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function run(page: boolean) {
    const token = page ? snapshot.read.nextCursor : snapshot.read.refreshToken
    if (!token || inFlight.current) return
    const generation = getAccountGeneration()
    const isCurrent = () => active.current && generation === getAccountGeneration()
    inFlight.current = true
    setPending(true)
    setFailure(null)
    try {
      const clientContext = buildChatClientContext({ platform: 'mobile', locale })
      let response: ReadBlockResponse
      try {
        response = await apiClient(API.chat.refreshRead, { method: 'POST', body: JSON.stringify({ token, clientContext, page }), isCurrent, silent: true }, readBlockResponseSchema)
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') throw new Error(error.code)
        throw error
      }
      if (isCurrent()) setSnapshot(acceptReadBlockResponse(snapshot, response, page))
    } catch (error) {
      if (isCurrent()) setFailure(readBlockFailureKey(error))
    } finally {
      if (isCurrent()) { setPending(false); inFlight.current = false }
    }
  }
  return <ReadContext.Provider value={{ snapshot, actionScope: { ...actionScope, ready: actionScope.ready && !pending }, pending, failure, run: (page) => { void run(page) } }}>{children(snapshot)}</ReadContext.Provider>
}

export function BlockFrame(props: Readonly<BlockFrameProps>) {
  const context = useContext(ReadContext)
  return context ? <QueryBlockFrame props={props} context={context} /> : <Frame {...props} />
}

function QueryBlockFrame({ props, context }: Readonly<{ props: BlockFrameProps; context: ReadBlockState }>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { snapshot, pending, failure, run } = context
  const read = snapshot.read
  const { state, message, window } = readBlockPresentation(snapshot, props.state, pending, failure)
  const stale = state === 'stale'
  const actions = <>
    {read.nextCursor && !stale ? <Button variant="ghost" size="sm" disabled={pending} accessibleName={t('chat.recordList.more')} onClick={() => run(true)}>{t('chat.recordList.more')}</Button> : null}
    <Button variant="ghost" size="sm" disabled={pending} accessibleName={t('blockFrame.refresh')} onClick={() => run(false)}>{t('blockFrame.refresh')}</Button>
    {props.actions}
  </>
  const body = <>{window ? <Text style={{ color: tokens.fg3, fontSize: 14 }}>{formatReadWindow(window, locale)}</Text> : null}{message && !stale ? <Text accessibilityLiveRegion="polite" style={{ color: tokens.fg2, fontSize: 14 }}>{t(message)}</Text> : null}{props.body}</>
  if (state === 'stale') return <Frame {...props} body={body} state="stale" staleMessage={t(message ?? 'chat.readBlock.stale')} onRefresh={() => run(false)} />
  return <Frame {...props} state={state} staleMessage={undefined} onRefresh={undefined} refreshLabel={undefined} body={body} actions={actions} />
}

export function useReadActionScope() {
  return useContext(ReadContext)?.actionScope
}
