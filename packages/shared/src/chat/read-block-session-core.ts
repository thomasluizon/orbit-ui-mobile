import type { ChatClientContext, ReadBlockSnapshot } from '../types/chat'
import { buildChatClientContext } from './client-context'
import { acceptReadBlockResponse, readBlockFailureKey } from './read-block-core'

export interface ReadActionScope {
  ready: boolean
  timeZone: string | null
}

export type ReadBlockBoundaryProps<Content> = Readonly<{
  snapshot: ReadBlockSnapshot
  children: (current: ReadBlockSnapshot) => Content
}>

export interface ReadBlockState {
  snapshot: ReadBlockSnapshot
  actionScope: ReadActionScope
  pending: boolean
  failure: string | null
  stale: boolean
  run: (page: boolean) => Promise<void>
}

export interface ReadBlockSessionAdapters {
  useState: <T>(initial: T) => [T, (value: T) => void]
  useRef: <T>(initial: T) => { current: T }
  useEffect: (effect: () => () => void, dependencies: readonly unknown[]) => void
  getAccountGeneration: () => number
  platform: ChatClientContext['platform']
  refresh: (token: string, clientContext: ChatClientContext, page: boolean, isCurrent: () => boolean, kind: ReadBlockSnapshot['kind']) => Promise<ReadBlockSnapshot>
}

export function createUseReadBlockSession(adapters: ReadBlockSessionAdapters): (
  initial: ReadBlockSnapshot, locale: string, actionScope: ReadActionScope,
) => ReadBlockState {
  const { useState, useRef, useEffect, getAccountGeneration } = adapters
  return function useReadBlockSession(initial, locale, actionScope) {
    const [snapshot, setSnapshot] = useState(initial)
    const [pending, setPending] = useState(false)
    const [failure, setFailure] = useState<string | null>(null)
    const [stale, setStale] = useState(initial.read.completeness === 'stale')
    const active = useRef(true)
    const inFlight = useRef(false)
    useEffect(() => { active.current = true; return () => { active.current = false } }, [])
    async function run(page: boolean) {
      const token = page ? snapshot.read.nextCursor : snapshot.read.refreshToken
      if (!token || inFlight.current || (page && stale)) return
      const generation = getAccountGeneration()
      const isCurrent = () => active.current && generation === getAccountGeneration()
      inFlight.current = true
      setPending(true)
      setFailure(null)
      try {
        const clientContext = buildChatClientContext({ platform: adapters.platform, locale })
        const response = await adapters.refresh(token, clientContext, page, isCurrent, snapshot.kind)
        if (isCurrent()) {
          const accepted = acceptReadBlockResponse(snapshot, response, page)
          setSnapshot(accepted)
          setStale(accepted.read.completeness === 'stale')
        }
      } catch (error) {
        if (isCurrent()) {
          const failureKey = readBlockFailureKey(error)
          setFailure(failureKey)
          if (failureKey === 'chat.readBlock.stale') setStale(true)
        }
      } finally {
        if (isCurrent()) { setPending(false); inFlight.current = false }
      }
    }
    return { snapshot, actionScope: { ...actionScope, ready: actionScope.ready && !pending }, pending, failure, stale, run }
  }
}
