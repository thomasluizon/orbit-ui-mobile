import type { RefObject } from 'react'
import type { View } from 'react-native'

/**
 * Global registry for tour target refs.
 */
const refsMap = new Map<string, RefObject<View | null>>()

export const tourTargetRegistry = {
  register: (targetId: string, ref: RefObject<View | null>) => {
    refsMap.set(targetId, ref)
  },
  unregister: (targetId: string) => {
    refsMap.delete(targetId)
  },
  getRef: (targetId: string) => refsMap.get(targetId),
}

/**
 * Global registry for scroll containers.
 * Stores a scroll callback and current scroll offset.
 * Components register a function to scroll, not a ref - this avoids
 * issues with DraggableFlatList refs not forwarding properly.
 */
interface ScrollEntry {
  scrollTo: (y: number) => void
  scrollY: number
}

const scrollMap = new Map<string, ScrollEntry>()

export const tourScrollRegistry = {
  register: (route: string, scrollFn: (y: number) => void) => {
    scrollMap.set(route, { scrollTo: scrollFn, scrollY: 0 })
  },
  unregister: (route: string) => {
    scrollMap.delete(route)
  },
  updateScrollY: (route: string, y: number) => {
    const entry = scrollMap.get(route)
    if (entry) entry.scrollY = y
  },
  get: (route: string) => scrollMap.get(route),
}
