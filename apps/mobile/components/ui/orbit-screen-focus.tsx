import { createContext, useContext, type ReactNode } from 'react'

const OrbitScreenFocusContext = createContext(true)

/** Whether the caller's screen is focused. It is true outside a navigator, such as on the root error screen. */
export function useOrbitScreenFocused(): boolean {
  return useContext(OrbitScreenFocusContext)
}

/** Gives the screen under it its focus; `orbitScreenLayout` feeds it from the navigator. */
export function OrbitScreenFocus({ focused, children }: Readonly<{ focused: boolean; children: ReactNode }>) {
  return <OrbitScreenFocusContext.Provider value={focused}>{children}</OrbitScreenFocusContext.Provider>
}
