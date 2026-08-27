import type { SheetProps } from './Sheet'

export function sheetTypeTests(): void {
  const bare: SheetProps = {}
  const open: SheetProps = { open: true }
  // @ts-expect-error false means the sheet should be unmounted
  const closed: SheetProps = { open: false }
  const dynamicOpen = Boolean(Date.now())
  // @ts-expect-error a dynamic boolean permits a kept and toggled sheet
  const toggled: SheetProps = { open: dynamicOpen }
  void [bare, open, closed, toggled]
}
