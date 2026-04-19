'use client'

import { useSyncExternalStore } from 'react'
import type { MotionNavigationIntent, MotionScenario } from '@orbit/shared/theme'

interface RouteIntentSnapshot {
  intent: MotionNavigationIntent
  version: number
}

let snapshot: RouteIntentSnapshot = {
  intent: 'neutral',
  version: 0,
}

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

export function setRouteTransitionIntent(intent: MotionNavigationIntent) {
  snapshot = {
    intent,
    version: snapshot.version + 1,
  }
  emit()
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
    case 'tab':
      return 'tab-switch'
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
    case 'tab':
    case 'replace':
    case 'modal-close':
    case 'neutral':
      return 0
    default:
      return 1
  }
}
