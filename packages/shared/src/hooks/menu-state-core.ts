import type { StateHook } from './state-adapter'

interface ActiveMenu {
  identity: symbol
  dismiss: () => void
}

let activeMenu: ActiveMenu | undefined

export interface MenuOwnership {
  claim: (dismiss: () => void) => () => void
  canRestoreFocus: () => boolean
  reopen: () => number
  isCurrentRevision: (revision: number) => boolean
}

export function createMenuOwnership(): MenuOwnership {
  const identity = Symbol()
  let revision = 0
  return {
    claim(dismiss) {
      activeMenu?.dismiss()
      activeMenu = { identity, dismiss }
      return () => { if (activeMenu?.identity === identity) activeMenu = undefined }
    },
    canRestoreFocus: () => activeMenu === undefined || activeMenu.identity === identity,
    reopen: () => ++revision,
    isCurrentRevision: (candidate) => candidate === revision,
  }
}

interface MenuStateAdapters {
  useState: StateHook
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => void
  useEffectEvent: (callback: () => void) => () => void
  useCallback: <Callback extends (...args: never[]) => unknown>(callback: Callback, dependencies: readonly unknown[]) => Callback
  useMemo: <Value>(factory: () => Value, dependencies: readonly unknown[]) => Value
}

export interface MenuState {
  open: boolean
  changeOpen: (open: boolean) => void
  close: () => void
  canRestoreFocus: () => boolean
}

export type MenuStateHook = (open?: boolean, onOpenChange?: (open: boolean) => void) => MenuState

export function createUseMenuState({ useState, useEffect, useEffectEvent, useCallback, useMemo }: MenuStateAdapters): MenuStateHook {
  return function useMenuState(openProp?: boolean, onOpenChange?: (open: boolean) => void) {
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
    return useMemo(() => ({ open, changeOpen, close, canRestoreFocus: owner.canRestoreFocus }), [open, changeOpen, close, owner])
  }
}
