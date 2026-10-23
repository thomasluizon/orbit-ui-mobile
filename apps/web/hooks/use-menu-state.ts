import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import { createMenuOwnership } from '@orbit/shared/hooks'

export function useMenuState(openProp?: boolean, onOpenChange?: (open: boolean) => void) {
  const [owner] = useState(createMenuOwnership)
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const requestedOpen = openProp ?? uncontrolledOpen
  const [ownership, setOwnership] = useState({ open: requestedOpen, suppressed: false })
  if (ownership.open !== requestedOpen) setOwnership({ open: requestedOpen, suppressed: false })
  const open = requestedOpen && !ownership.suppressed
  const [revision, setRevision] = useState(0)
  const changeOpen = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setRevision(owner.reopen())
      setOwnership((current) => ({ ...current, suppressed: false }))
    }
    setUncontrolledOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }, [onOpenChange, owner])
  const dismiss = useEffectEvent(() => {
    setOwnership({ open: requestedOpen, suppressed: true })
    changeOpen(false)
  })
  useEffect(() => {
    if (open) return owner.claim(() => dismiss())
  }, [open, owner])
  const close = useCallback(() => {
    if (owner.isCurrentRevision(revision)) changeOpen(false)
  }, [changeOpen, owner, revision])
  return { open, changeOpen, close, canRestoreFocus: owner.canRestoreFocus }
}
