import type { ReactElement, ReactNode } from 'react'
import { useIsFocused } from 'expo-router'
import { OrbitScreenFocus } from '@/components/ui/orbit-screen-focus'

function NavigatorScreenFocus({ children }: Readonly<{ children: ReactNode }>) {
  return <OrbitScreenFocus focused={useIsFocused()}>{children}</OrbitScreenFocus>
}

/**
 * The `screenLayout` of every navigator. The navigator renders it inside each screen's route, where `useIsFocused`
 * also reads the focus of the parent screens, so an Orbit on a screen that is not focused gives up its live slot.
 * It lives apart from the mascot, so the mascot never imports `expo-router`.
 */
export function orbitScreenLayout({ children }: Readonly<{ children: ReactNode }>): ReactElement {
  return <NavigatorScreenFocus>{children}</NavigatorScreenFocus>
}
