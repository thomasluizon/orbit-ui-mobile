'use client'

import { useEffect, useEffectEvent, useId, useRef } from 'react'

let activeNavigationGuard: ((action: () => void) => void) | null = null
let finishNavigation: ((action: () => void) => void) | null = null

function isCreationBaseEntry(entry: unknown, guardId: string) {
  return typeof entry === 'object' && entry !== null && 'orbitHabitCreateGuard' in entry && entry.orbitHabitCreateGuard === guardId
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
  const guardId = useId()
  const sentinelAdded = useRef(false)
  const requestNavigation = useEffectEvent(onNavigate)
  const returnToOrigin = useEffectEvent(onReturn)
  const isLeaving = useEffectEvent(() => leaving)
  const isDirty = useEffectEvent(() => dirty)
  useEffect(() => {
    if (!active) return
    const creationPath = location.pathname
    const creationSearch = location.search
    if (!sentinelAdded.current) {
      const entry: unknown = history.state
      history.replaceState(Object.assign({}, entry, { orbitHabitCreateGuard: guardId }), '', location.href)
      history.pushState(entry, '', location.href)
      sentinelAdded.current = true
    }
    activeNavigationGuard = (action) => {
      if (isLeaving()) action()
      else requestNavigation(action)
    }
    let approvedNavigation: (() => void) | null = null
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
        const action = approvedNavigation
        approvedNavigation = null
        action()
        return
      }
      if (isLeaving()) return
      if (restoring) {
        restoring = false
        requestNavigation(() => returnToOrigin())
        return
      }
      if (!atBaseEntry && location.pathname === creationPath && location.search === creationSearch) return
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
  }, [active, guardId])
}
