'use client'

import { useLocale, useTranslations } from 'next-intl'
import { refreshReadBlock } from '@/app/actions/chat'
import { getHeldAccountId } from '@/stores/auth-store'
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
  const locale = useLocale()
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
      const clientContext = buildChatClientContext({ platform: 'web', locale })
      const result = await refreshReadBlock(token, clientContext, page, getHeldAccountId())
      if (!result.ok) throw new Error(result.code)
      const response = result.data
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
  const t = useTranslations()
  const locale = useLocale()
  const { snapshot, pending, failure, run } = context
  const read = snapshot.read
  const { state, message, window } = readBlockPresentation(snapshot, props.state, pending, failure)
  const stale = state === 'stale'
  const actions = <>
    {read.nextCursor && !stale ? <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(true)}>{t('chat.recordList.more')}</Button> : null}
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(false)}>{t('blockFrame.refresh')}</Button>
    {props.actions}
  </>
  const body = <>{window ? <p className="text-sm text-[var(--fg-3)]">{formatReadWindow(window, locale)}</p> : null}{message && !stale ? <p role="status" className="text-sm text-[var(--fg-2)]">{t(message)}</p> : null}{props.body}</>
  if (state === 'stale') return <Frame {...props} body={body} state="stale" staleMessage={t(message ?? 'chat.readBlock.stale')} onRefresh={() => run(false)} />
  return <Frame {...props} state={state} staleMessage={undefined} onRefresh={undefined} refreshLabel={undefined} body={body} actions={actions} />
}

export function useReadActionScope() {
  return useContext(ReadContext)?.actionScope
}
