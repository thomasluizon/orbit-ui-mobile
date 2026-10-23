import type { ChatClientContext, ReadBlockResponse } from '../types/chat'
import { buildChatClientContext } from './client-context'
import { acceptReadBlockResponse, readBlockFailureKey } from './read-block-core'

export interface ReadActionScope {
  ready: boolean
  timeZone: string | null
}

export type ReadBlockBoundaryProps<Content> = Readonly<{
  snapshot: ReadBlockResponse
  children: (current: ReadBlockResponse) => Content
}>

export interface ReadBlockState {
  snapshot: ReadBlockResponse
  actionScope: ReadActionScope
  pending: boolean
  failure: string | null
  run: (page: boolean) => Promise<void>
}

export interface ReadBlockSessionAdapters {
  useState: <T>(initial: T) => [T, (value: T) => void]
  useRef: <T>(initial: T) => { current: T }
  useEffect: (effect: () => () => void, dependencies: readonly unknown[]) => void
  getAccountGeneration: () => number
  platform: ChatClientContext['platform']
  refresh: (token: string, clientContext: ChatClientContext, page: boolean, isCurrent: () => boolean) => Promise<ReadBlockResponse>
}

export function createUseReadBlockSession(adapters: ReadBlockSessionAdapters): (
  initial: ReadBlockResponse, locale: string, actionScope: ReadActionScope,
) => ReadBlockState {
  const { useState, useRef, useEffect, getAccountGeneration } = adapters
  return function useReadBlockSession(initial, locale, actionScope) {
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
        const clientContext = buildChatClientContext({ platform: adapters.platform, locale })
        const response = await adapters.refresh(token, clientContext, page, isCurrent)
        if (isCurrent()) setSnapshot(acceptReadBlockResponse(snapshot, response, page))
      } catch (error) {
        if (isCurrent()) setFailure(readBlockFailureKey(error))
      } finally {
        if (isCurrent()) { setPending(false); inFlight.current = false }
      }
    }
    return { snapshot, actionScope: { ...actionScope, ready: actionScope.ready && !pending }, pending, failure, run }
  }
}
