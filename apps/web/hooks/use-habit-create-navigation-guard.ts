'use client'

import { startTransition, useEffect, useEffectEvent, useState } from 'react'

let activeNavigationGuard: ((action: () => void) => void) | null = null
let finishNavigation: ((action: () => void) => void) | null = null

function isCreationGuardEntry(entry: unknown, guardId: string) {
  return typeof entry === 'object' && entry !== null && 'orbitHabitCreateGuard' in entry && entry.orbitHabitCreateGuard === guardId
}

function isCreationBaseEntry(entry: unknown, guardId: string) {
  return isCreationGuardEntry(entry, guardId) && typeof entry === 'object' && entry !== null &&
    'orbitHabitCreateSentinel' in entry && entry.orbitHabitCreateSentinel === false
}

function markCreationEntry(guardId: string, sentinel: boolean, routerEntry: unknown) {
  const entry: unknown = history.state
  return Object.assign({}, routerEntry, entry, { orbitHabitCreateGuard: guardId, orbitHabitCreateSentinel: sentinel })
}

function useNextHistoryReady(active: boolean) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!active) return
    let frame = 0
    function checkHistory() {
      const entry: unknown = history.state
      if (typeof entry === 'object' && entry !== null && '__NA' in entry && entry.__NA === true &&
        '__PRIVATE_NEXTJS_INTERNALS_TREE' in entry && entry.__PRIVATE_NEXTJS_INTERNALS_TREE) {
        setReady(true)
      } else frame = requestAnimationFrame(checkHistory)
    }
    checkHistory()
    return () => cancelAnimationFrame(frame)
  }, [active])
  return ready
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
  const historyReady = useNextHistoryReady(active)
  const [rebuildAction, setRebuildAction] = useState<(() => void) | null>(null)
  useEffect(() => {
    if (!active || !historyReady) return
    const creationPath = location.pathname
    const creationSearch = location.search
    const guardId = `${creationPath}${creationSearch}`
    const routerEntry: unknown = history.state
    if (!isCreationGuardEntry(history.state, guardId) || isCreationBaseEntry(history.state, guardId)) {
      history.replaceState(markCreationEntry(guardId, false, routerEntry), '', location.href)
      history.pushState(markCreationEntry(guardId, true, routerEntry), '', location.href)
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
            history.pushState(markCreationEntry(guardId, true, routerEntry), '', location.href)
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
        history.replaceState(markCreationEntry(guardId, true, routerEntry), '', location.href)
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
      if (completingNavigation && (location.pathname !== creationPath || location.search !== creationSearch)) {
        history.pushState(history.state, '', location.href)
        history.back()
      }
    }
  }, [active, historyReady])
  useEffect(() => { rebuildAction?.() }, [rebuildAction])
}
