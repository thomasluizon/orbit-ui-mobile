import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'

interface RootScrollContextValue {
  register: (id: string, scrollToTop: () => void) => () => void
  scrollToTop: (id: string) => void
}

const RootScrollContext = createContext<RootScrollContextValue | null>(null)

export function RootScrollProvider({ children }: Readonly<{ children: ReactNode }>) {
  const handles = useRef(new Map<string, () => void>())
  const register = useCallback((id: string, scrollToTop: () => void) => {
    handles.current.set(id, scrollToTop)
    return () => {
      if (handles.current.get(id) === scrollToTop) handles.current.delete(id)
    }
  }, [])
  const scrollToTop = useCallback((id: string) => handles.current.get(id)?.(), [])
  const value = useMemo(() => ({ register, scrollToTop }), [register, scrollToTop])
  return <RootScrollContext.Provider value={value}>{children}</RootScrollContext.Provider>
}

export function useRootScrollToTop(id: string, scrollToTop: () => void) {
  const host = useContext(RootScrollContext)
  useEffect(() => host?.register(id, scrollToTop), [host, id, scrollToTop])
}

export function useRootScrollReselect() {
  return useContext(RootScrollContext)?.scrollToTop
}
