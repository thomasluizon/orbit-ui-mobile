import { useEffect, useState } from 'react'
import { useSheetHost } from '@/components/ui/sheet'

/**
 * Keeps a sheet mounted from the render that opens it until its native dismissal finishes.
 * When `open` turns false while the sheet shows, the hook closes it through `closeSheet` and
 * unmounts it after the dismissal. Render the `Sheet` while `mounted` is true, with
 * `key={sheetKey}` and `ref={sheetRef}`, so a later open mounts a fresh native sheet.
 */
export function useSheetPresence(open: boolean) {
  const { sheetRef, closeSheet } = useSheetHost()
  const [presence, setPresence] = useState({ mounted: open, generation: 0 })
  if (open && !presence.mounted) setPresence({ mounted: true, generation: presence.generation })

  useEffect(() => {
    if (open || !presence.mounted) return
    const unmount = () => setPresence((current) => ({ mounted: false, generation: current.generation + 1 }))
    if (sheetRef.current?.isDismissed()) {
      unmount()
      return
    }
    // WHY: Unmounting a presented TrueSheet on iOS recycles its view without dismissing the presented controller, which then takes every touch. https://github.com/lodev09/react-native-true-sheet/blob/v4.0.1/ios/TrueSheetView.mm#L441-L472
    closeSheet(unmount, unmount)
  }, [open, presence.mounted, closeSheet, sheetRef])

  return { mounted: open || presence.mounted, sheetKey: presence.generation, sheetRef, closeSheet }
}
