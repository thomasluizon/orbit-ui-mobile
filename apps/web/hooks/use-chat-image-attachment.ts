'use client'

import { useRef, useState, type ChangeEvent, type ClipboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { getChatImageValidationError } from '@orbit/shared/chat'

/**
 * Manages the chat composer's image attachment: file picker, paste capture,
 * validation, and the object-URL preview lifecycle. Drives the composer's send
 * error via `setSendError` (cleared on a valid pick, set on a validation fail).
 */
export function useChatImageAttachment(setSendError: (message: string | null) => void) {
  const t = useTranslations()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  function validateImageFile(file: File): string | null {
    const validationError = getChatImageValidationError({
      mimeType: file.type,
      fileSize: file.size,
      name: file.name,
    })
    if (validationError === 'type') return t('chat.imageError')
    if (validationError === 'size') return t('chat.imageSizeError')
    return null
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const validationErr = validateImageFile(file)
    if (validationErr) {
      setSendError(validationErr)
      event.target.value = ''
      return
    }
    setSendError(null)
    setSelectedImage(file)
    setImagePreview(URL.createObjectURL(file))
    event.target.value = ''
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const items = event.clipboardData.items

    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) continue
      const file = item.getAsFile()
      if (!file) continue

      event.preventDefault()

      const validationErr = validateImageFile(file)
      if (validationErr) {
        setSendError(validationErr)
        return
      }

      setSendError(null)
      setSelectedImage(file)
      setImagePreview(URL.createObjectURL(file))
      return
    }
  }

  function removeImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setSelectedImage(null)
    setImagePreview(null)
  }

  function clearImage() {
    setSelectedImage(null)
    setImagePreview(null)
  }

  return {
    fileInputRef,
    selectedImage,
    imagePreview,
    openFilePicker,
    handleFileSelect,
    handlePaste,
    removeImage,
    clearImage,
  }
}
