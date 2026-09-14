import { useEffect, useRef, useState } from 'react'
import type { View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import { Directory, File } from 'expo-file-system'
import { ACHIEVEMENT_EVENT_KEYS } from '@orbit/shared/types/gamification'
import { SHARE_CARD_FILE_NAME } from '@orbit/shared/utils'
import { useReportEvent } from '@/hooks/use-gamification'

const PICKER_CANCELLED_CODE = 'ERR_PICKER_CANCELLED'

function isPickerCancellation(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === PICKER_CANCELLED_CODE
}

/** Captures a ShareCard View to a temp PNG and opens the native share sheet via expo-sharing. */
export function useShareCard() {
  const shareRef = useRef<View>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [canShareFiles, setCanShareFiles] = useState(true)
  const { mutate: reportEvent } = useReportEvent()

  useEffect(() => {
    let active = true
    void Sharing.isAvailableAsync()
      .then((available) => {
        if (active) setCanShareFiles(available)
      })
      .catch(() => {
        if (active) setCanShareFiles(false)
      })
    return () => {
      active = false
    }
  }, [])

  function captureCard() {
    return captureRef(shareRef, { format: 'png', quality: 1, result: 'tmpfile' })
  }

  async function share(dialogTitle: string) {
    if (isSharing) {
      return
    }
    setIsSharing(true)
    setHasError(false)
    try {
      const available = await Sharing.isAvailableAsync()
      if (!available) {
        setCanShareFiles(false)
        return
      }
      const uri = await captureCard()
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle,
        UTI: 'public.png',
      })
      reportEvent(ACHIEVEMENT_EVENT_KEYS.cardShared)
    } catch {
      setHasError(true)
    } finally {
      setIsSharing(false)
    }
  }

  async function download() {
    if (isSharing) {
      return
    }
    setIsSharing(true)
    setHasError(false)
    try {
      const uri = await captureCard()
      let directory: Directory
      try {
        directory = await Directory.pickDirectoryAsync()
      } catch (error) {
        if (isPickerCancellation(error)) return
        throw error
      }
      const source = new File(uri)
      const destination = new File(directory, SHARE_CARD_FILE_NAME)
      await source.copy(destination, { overwrite: true })
      reportEvent(ACHIEVEMENT_EVENT_KEYS.cardShared)
    } catch {
      setHasError(true)
    } finally {
      setIsSharing(false)
    }
  }

  return { shareRef, isSharing, hasError, canShareFiles, share, download }
}
