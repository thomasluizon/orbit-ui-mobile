'use client'

import { useSyncExternalStore } from 'react'
import type { MotionNavigationIntent, MotionScenario } from '@orbit/shared/theme'
import { readAppNavigationHistory } from '@/lib/app-navigation-history'

interface RouteIntentSnapshot {
  intent: MotionNavigationIntent
  version: number
}

let snapshot: RouteIntentSnapshot = {
  intent: 'neutral',
  version: 0,
}

let claimedVersion: number | null = null
let writeTask: ReturnType<typeof setTimeout> | null = null

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

function closeWriteTask() {
  writeTask = null
  if (snapshot.version !== claimedVersion) {
    resetRouteTransitionIntent()
  }
}

export function setRouteTransitionIntent(intent: MotionNavigationIntent) {
  snapshot = {
    intent,
    version: snapshot.version + 1,
  }
  writeTask ??= setTimeout(closeWriteTask, 0)
  emit()
}

function readPathnameOnScreen(navigationType: string) {
  if (navigationType !== 'traverse') {
    return location.pathname
  }

  const { entries, index } = readAppNavigationHistory()
  return entries[index]?.split('?')[0]
}

/**
 * Receives each navigation start from Next (`onRouterTransitionStart` in `instrumentation-client.ts`).
 * An intent stays only for a navigation that starts in the task that wrote it and that goes to another pathname.
 * No pathname commit follows any other intent, so the end of its task clears it. A traversal to another pathname is a back navigation.
 * A traversal moves `location` before Next reports it, so the navigation history gives the pathname on screen.
 */
export function claimRouteTransitionIntent(href: string, navigationType: string) {
  const leavesPathname = new URL(href, location.href).pathname !== readPathnameOnScreen(navigationType)

  if (writeTask === null) {
    if (navigationType !== 'traverse' || !leavesPathname) {
      resetRouteTransitionIntent()
      return
    }

    setRouteTransitionIntent('back')
  }

  if (leavesPathname) {
    claimedVersion = snapshot.version
  }
}

export function resetRouteTransitionIntent() {
  if (snapshot.intent === 'neutral') {
    return
  }

  snapshot = {
    intent: 'neutral',
    version: snapshot.version + 1,
  }
  emit()
}

export function resetRouteTransitionIntentIfCurrent(version: number) {
  if (snapshot.version === version) {
    resetRouteTransitionIntent()
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return snapshot
}

export function getCurrentRouteTransitionIntent() {
  return snapshot.intent
}

export function useRouteTransitionIntent() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function getRouteScenarioForIntent(intent: MotionNavigationIntent): MotionScenario {
  switch (intent) {
    case 'replace':
    case 'modal-close':
      return 'route-replace'
    default:
      return 'route-push'
  }
}

export function getRouteDirectionForIntent(intent: MotionNavigationIntent): -1 | 0 | 1 {
  switch (intent) {
    case 'back':
      return -1
    case 'replace':
    case 'modal-close':
    case 'instant':
      return 0
    case 'neutral':
      return 1
    default:
      return 1
  }
}
