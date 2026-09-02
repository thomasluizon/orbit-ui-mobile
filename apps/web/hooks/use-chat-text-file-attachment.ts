'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { useTranslations } from 'next-intl'
import { getChatTextFileValidationError } from '@orbit/shared/chat'

export interface SelectedChatTextFile {
  name: string
  content: string
}

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
