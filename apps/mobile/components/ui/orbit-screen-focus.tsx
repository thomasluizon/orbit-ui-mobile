import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import { useIsFocused } from 'expo-router'

const OrbitScreenFocusContext = createContext(true)

/** Whether the caller's screen is focused. It is true outside a navigator, such as on the root error screen. */
export function useOrbitScreenFocused(): boolean {
  return useContext(OrbitScreenFocusContext)
}

function OrbitScreenFocus({ children }: Readonly<{ children: ReactNode }>) {
  return <OrbitScreenFocusContext.Provider value={useIsFocused()}>{children}</OrbitScreenFocusContext.Provider>
}

/**
 * The `screenLayout` of every navigator. The navigator renders it inside each screen's route, where `useIsFocused`
 * also reads the focus of the parent screens, so an Orbit on a screen that is not focused gives up its live slot.
 */
export function orbitScreenLayout({ children }: Readonly<{ children: ReactNode }>): ReactElement {
  return <OrbitScreenFocus>{children}</OrbitScreenFocus>
}
