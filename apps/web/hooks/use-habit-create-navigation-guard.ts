'use client'

import { useEffect, useEffectEvent, useRef } from 'react'

let activeNavigationGuard: ((action: () => void) => void) | null = null
let finishNavigation: ((action: () => void) => void) | null = null

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
  const sentinelAdded = useRef(false)
  const requestNavigation = useEffectEvent(onNavigate)
  const returnToOrigin = useEffectEvent(onReturn)
  const isLeaving = useEffectEvent(() => leaving)
  const isDirty = useEffectEvent(() => dirty)
  useEffect(() => {
    if (!active) return
    if (!sentinelAdded.current) {
      history.pushState(history.state, '', location.href)
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
      if (approvedNavigation) {
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
}
