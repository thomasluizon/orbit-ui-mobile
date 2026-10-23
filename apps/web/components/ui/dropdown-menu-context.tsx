'use client'

import { createContext, useContext } from 'react'
import type { useMenuState } from '@/hooks/use-menu-state'

export const MenuContext = createContext<(ReturnType<typeof useMenuState> & { triggerRef: React.RefObject<HTMLButtonElement | null> }) | null>(null)
export const MenuItemsContext = createContext<((id: string) => void) | null>(null)

export function useMenu() {
  const context = useContext(MenuContext)
  if (!context) throw new Error('Menu parts require a Root')
  return context
}
