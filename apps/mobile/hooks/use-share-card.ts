import { useRef, useState } from 'react'
import type { View } from 'react-native'
import Share from 'react-native-share'
import { captureRef } from 'react-native-view-shot'
import { Directory, File, Paths } from 'expo-file-system'
import { ACHIEVEMENT_EVENT_KEYS } from '@orbit/shared/types/gamification'
import { SHARE_CARD_FILE_NAME } from '@orbit/shared/utils'
import { useReportEvent } from '@/hooks/use-gamification'

const PICKER_CANCELLED_CODE = 'ERR_PICKER_CANCELLED'

interface ShareCardPayload {
  shareTitle: string
  shareText: string
  url: string
}

function isPickerCancellation(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === PICKER_CANCELLED_CODE
}

/** Captures a ShareCard View to a temp PNG and opens the native share sheet. */
export function useShareCard() {
  const shareRef = useRef<View>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [hasError, setHasError] = useState(false)
  const canShareFiles = typeof Share.open === 'function'
  const { mutate: reportEvent } = useReportEvent()

  function captureCard() {
    return captureRef(shareRef, { format: 'png', quality: 1, result: 'tmpfile' })
  }

  async function share(payload: ShareCardPayload) {
    if (isSharing) {
      return
    }
    setIsSharing(true)
    setHasError(false)
    try {
      const uri = await captureCard()
      await Share.open({
        title: payload.shareTitle,
        message: `${payload.shareText} ${payload.url}`,
        url: uri,
        type: 'image/png',
        failOnCancel: false,
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
      const capture = new File(uri)
      const namedSource = new File(Paths.cache, SHARE_CARD_FILE_NAME)
      await capture.copy(namedSource, { overwrite: true })
      await namedSource.copy(directory, { overwrite: true })
      reportEvent(ACHIEVEMENT_EVENT_KEYS.cardShared)
    } catch {
      setHasError(true)
    } finally {
      setIsSharing(false)
    }
  }

  return { shareRef, isSharing, hasError, canShareFiles, share, download }
}
