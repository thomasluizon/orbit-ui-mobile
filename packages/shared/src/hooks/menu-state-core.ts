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
