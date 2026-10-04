'use client'

import { useEffect, useEffectEvent } from 'react'

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

function replaceApprovedNavigation(guardId: string) {
  const pushState = history.pushState.bind(history)
  const replaceState = history.replaceState.bind(history)
  const creationPath = location.pathname + location.search
  function restoreHistory() {
    history.pushState = pushState
    history.replaceState = replaceState
  }
  function approvedWrite(method: History['pushState'], entry: unknown, title: string, href?: string | URL | null) {
    const destination = href == null ? null : new URL(href, location.href)
    if (!destination || destination.pathname + destination.search === creationPath) {
      method.call(history, entry, title, href)
      return
    }
    restoreHistory()
    function finishReplacement(event: PopStateEvent) {
      if (!isCreationBaseEntry(history.state, guardId)) return
      event.stopImmediatePropagation()
      window.removeEventListener('popstate', finishReplacement, true)
      replaceState.call(history, entry, title, href)
    }
    window.addEventListener('popstate', finishReplacement, true)
    pushState.call(history, entry, title, href)
    history.back()
  }
  history.pushState = (entry: unknown, title, href) => approvedWrite(pushState, entry, title, href)
  history.replaceState = (entry: unknown, title, href) => approvedWrite(replaceState, entry, title, href)
  return restoreHistory
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
  useEffect(() => {
    if (!active) return
    const creationPath = location.pathname
    const creationSearch = location.search
    const guardId = `${creationPath}${creationSearch}`
    if (!isCreationGuardEntry(history.state, guardId) || isCreationBaseEntry(history.state, guardId)) {
      history.replaceState(markCreationEntry(guardId, false), '', location.href)
      history.pushState(markCreationEntry(guardId, true), '', location.href)
    }
    activeNavigationGuard = (action) => {
      if (isLeaving()) action()
      else requestNavigation(action)
    }
    let restoreApprovedHistory: (() => void) | null = null
    let approvedNavigation: (() => void) | null = null
    finishNavigation = (action) => {
      approvedNavigation = action
      history.back()
    }
    let restoring = false
    function handlePopState(event: PopStateEvent) {
      const atBaseEntry = isCreationBaseEntry(history.state, guardId)
      if (approvedNavigation) {
        event.stopImmediatePropagation()
        if (!atBaseEntry) {
          history.back()
          return
        }
        const action = approvedNavigation
        approvedNavigation = null
        restoreApprovedHistory = replaceApprovedNavigation(guardId)
        action()
        return
      }
      if (restoreApprovedHistory || isLeaving()) return
      if (restoring) {
        event.stopImmediatePropagation()
        restoring = false
        requestNavigation(() => returnToOrigin())
        return
      }
      if (!atBaseEntry && location.pathname === creationPath && location.search === creationSearch) {
        history.replaceState(markCreationEntry(guardId, true), '', location.href)
        return
      }
      event.stopImmediatePropagation()
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
    window.addEventListener('popstate', handlePopState, true)
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('click', handleClick, true)
    return () => {
      restoreApprovedHistory?.()
      activeNavigationGuard = null
      finishNavigation = null
      window.removeEventListener('popstate', handlePopState, true)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleClick, true)
    }
  }, [active])
}
