import { useRef, useEffect, useState } from 'react'

/**
 * Creates a dedicated DOM container for a portal, avoiding React key warnings
 * when multiple portals render to document.body simultaneously.
 */
export function usePortalContainer(id: string) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const elRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let el = document.getElementById(`portal-${id}`)
    if (!el) {
      el = document.createElement('div')
      el.id = `portal-${id}`
      document.body.appendChild(el)
    }
    elRef.current = el
    setContainer(el)
  }, [id])

  return container
}
