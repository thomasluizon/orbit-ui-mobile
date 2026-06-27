'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { useTranslations } from 'next-intl'
import { getChatTextFileValidationError } from '@orbit/shared/chat'

interface SelectedChatTextFile {
  name: string
  content: string
}

/**
 * Manages the chat composer's text-file attachment: hidden file input, picker,
 * validation, and reading the file's contents client-side via `File.text()`.
 * The contents ride into the outgoing message as plain chat text (no upload, no
 * backend change), mirroring the image-attachment hook. Drives the composer's
 * send error via `setSendError` (cleared on a valid pick, set on a failure).
 */
export function useChatTextFileAttachment(setSendError: (message: string | null) => void) {
  const t = useTranslations()
  const textFileInputRef = useRef<HTMLInputElement>(null)
  const [selectedTextFile, setSelectedTextFile] = useState<SelectedChatTextFile | null>(null)

  function openTextFilePicker() {
    textFileInputRef.current?.click()
  }

  async function handleTextFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const validationError = getChatTextFileValidationError({
      name: file.name,
      fileSize: file.size,
    })
    if (validationError === 'type') {
      setSendError(t('chat.fileError'))
      return
    }
    if (validationError === 'size') {
      setSendError(t('chat.fileSizeError'))
      return
    }

    try {
      const content = await file.text()
      setSendError(null)
      setSelectedTextFile({ name: file.name, content })
    } catch {
      setSendError(t('chat.fileReadError'))
    }
  }

  function removeTextFile() {
    setSelectedTextFile(null)
  }

  return {
    textFileInputRef,
    selectedTextFile,
    openTextFilePicker,
    handleTextFileSelect,
    removeTextFile,
  }
}
