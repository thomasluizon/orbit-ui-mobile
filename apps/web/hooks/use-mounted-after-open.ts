import { useState } from 'react'

export function useMountedAfterOpen(open: boolean): boolean {
  const [hasOpened, setHasOpened] = useState(open)
  if (open && !hasOpened) setHasOpened(true)
  return hasOpened
}
