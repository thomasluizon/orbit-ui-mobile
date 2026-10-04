'use client'

import { startTransition, useEffect, useEffectEvent, useState } from 'react'
import { resolveHabitCreateReturnPath } from '@orbit/shared/utils'

let activeNavigationGuard: ((action: () => void) => void) | null = null
let finishNavigation: ((action: () => void) => void) | null = null

function isCreationGuardEntry(entry: unknown, guardId: string) {
  return typeof entry === 'object' && entry !== null && 'orbitHabitCreateGuard' in entry && entry.orbitHabitCreateGuard === guardId
}

function isCreationBaseEntry(entry: unknown, guardId: string) {
  return isCreationGuardEntry(entry, guardId) && typeof entry === 'object' && entry !== null &&
    'orbitHabitCreateSentinel' in entry && entry.orbitHabitCreateSentinel === false
}

function markCreationEntry(guardId: string, sentinel: boolean) {
  const entry: unknown = history.state
  return Object.assign({}, entry, { orbitHabitCreateGuard: guardId, orbitHabitCreateSentinel: sentinel })
}

export function completeHabitCreateNavigation(action: () => void) {
  if (finishNavigation) finishNavigation(action)
  else action()
}

export function requestHabitCreateNavigation(action: () => void) {
  if (activeNavigationGuard) activeNavigationGuard(action)
  else action()
}

export function useHabitCreateNavigationGuard({ active, dirty, leaving, onNavigate, onReturn }: Readonly<{
  active: boolean
  dirty: boolean
  leaving: boolean
  onNavigate: (action: () => void) => void
  onReturn: () => void
}>) {
  const requestNavigation = useEffectEvent(onNavigate)
  const returnToOrigin = useEffectEvent(onReturn)
  const isLeaving = useEffectEvent(() => leaving)
  const isDirty = useEffectEvent(() => dirty)
  const [rebuildAction, setRebuildAction] = useState<(() => void) | null>(null)
  useEffect(() => {
    if (!active) return
    const creationPath = location.pathname
    const creationSearch = location.search
    const guardId = `${creationPath}${creationSearch}`
    const returnPath = resolveHabitCreateReturnPath(new URLSearchParams(creationSearch).get('from') ?? undefined)
    if (!isCreationGuardEntry(history.state, guardId) || isCreationBaseEntry(history.state, guardId)) {
      history.replaceState(markCreationEntry(guardId, false), '', location.href)
      history.pushState(markCreationEntry(guardId, true), '', location.href)
    }
    activeNavigationGuard = (action) => {
      if (isLeaving()) action()
      else requestNavigation(action)
    }
    let completingNavigation = false
    let approvedNavigation: (() => void) | null = null
    let rebuiltSentinel = false
    finishNavigation = (action) => {
      approvedNavigation = action
      history.back()
    }
    let restoring = false
    function handlePopState() {
      const atBaseEntry = isCreationBaseEntry(history.state, guardId)
      if (approvedNavigation) {
        if (!atBaseEntry) {
          history.back()
          return
        }
        if (!rebuiltSentinel) {
          rebuiltSentinel = true
          startTransition(() => setRebuildAction(() => () => {
            history.pushState({ __NA: true }, '', returnPath)
            history.back()
          }))
          return
        }
        const action = approvedNavigation
        approvedNavigation = null
        completingNavigation = true
        action()
        return
      }
      if (completingNavigation || isLeaving()) return
      if (restoring) {
        restoring = false
        requestNavigation(() => returnToOrigin())
        return
      }
      if (!atBaseEntry && location.pathname === creationPath && location.search === creationSearch) {
        history.replaceState(markCreationEntry(guardId, true), '', location.href)
        return
      }
      restoring = true
      history.forward()
    }
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (isLeaving() || !isDirty()) return
      event.preventDefault()
    }
    let approvedClick = false
    function handleClick(event: MouseEvent) {
      if (isLeaving() || approvedClick || !(event.target instanceof Element)) return
      const target = event.target.closest<HTMLAnchorElement>('a[href]')
      if (!target || target.target === '_blank' || target.hasAttribute('download') || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const destination = new URL(target.href, location.href)
      if (destination.pathname === location.pathname && destination.search === location.search) return
      event.preventDefault()
      event.stopPropagation()
      requestNavigation(() => {
        approvedClick = true
        target.click()
        approvedClick = false
      })
    }
    window.addEventListener('popstate', handlePopState)
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('click', handleClick, true)
    return () => {
      activeNavigationGuard = null
      finishNavigation = null
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleClick, true)
    }
  }, [active])
  useEffect(() => { rebuildAction?.() }, [rebuildAction])
}
