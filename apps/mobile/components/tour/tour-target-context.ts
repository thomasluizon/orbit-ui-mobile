import { createContext, type RefObject } from 'react'
import type { View } from 'react-native'

export interface TourTargetRegistry {
  register: (targetId: string, ref: RefObject<View | null>) => void
  unregister: (targetId: string) => void
  getRef: (targetId: string) => RefObject<View | null> | undefined
}

export const TourTargetContext = createContext<TourTargetRegistry>({
  register: () => {},
  unregister: () => {},
  getRef: () => undefined,
})
