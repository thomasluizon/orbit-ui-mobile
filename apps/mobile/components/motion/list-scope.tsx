import { createContext, useContext, type ReactNode } from 'react'

const ListScopeContext = createContext('')

export function ListScope({ scope, children }: Readonly<{ scope: string; children: ReactNode }>) {
  return <ListScopeContext.Provider value={scope}>{children}</ListScopeContext.Provider>
}

export function useListScope(): string {
  return useContext(ListScopeContext)
}
