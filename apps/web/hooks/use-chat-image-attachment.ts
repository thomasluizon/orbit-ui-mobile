'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { CHAT_IMAGE_OUTPUT, getChatImageValidationError } from '@orbit/shared/chat'
import { useResetOnAccountChange } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'

async function resizeChatImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = Math.min(bitmap.width, CHAT_IMAGE_OUTPUT.maxWidth)
    canvas.height = Math.max(1, Math.round(bitmap.height * canvas.width / bitmap.width))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image canvas unavailable')
    context.fillStyle = CHAT_IMAGE_OUTPUT.backgroundColor
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((output) => output ? resolve(output) : reject(new Error('Image encoding failed')), 'image/jpeg', CHAT_IMAGE_OUTPUT.quality)
    })
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: blob.type })
  } finally { bitmap.close() }
}

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
  const selectionVersion = useRef(0)

  useEffect(() => () => { selectionVersion.current += 1 }, [])

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

  async function selectImage(file: File) {
    const version = ++selectionVersion.current
    const account = getAccountGeneration()
    const validationErr = validateImageFile(file)
    if (validationErr) {
      setSendError(validationErr)
      return
    }
    try {
      const resized = await resizeChatImage(file)
      if (version !== selectionVersion.current || account !== getAccountGeneration()) return
      const outputError = validateImageFile(resized)
      if (outputError) { setSendError(outputError); return }
      if (imagePreview) URL.revokeObjectURL(imagePreview)
      setSendError(null)
      setSelectedImage(resized)
      setImagePreview(URL.createObjectURL(resized))
    } catch {
      if (version === selectionVersion.current && account === getAccountGeneration()) setSendError(t('chat.imageError'))
    }
  }

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await selectImage(file)
  }

  async function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const items = event.clipboardData.items

    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) continue
      const file = item.getAsFile()
      if (!file) continue

      event.preventDefault()

      await selectImage(file)
      return
    }
  }

  function removeImage() {
    selectionVersion.current += 1
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setSelectedImage(null)
    setImagePreview(null)
  }

  useResetOnAccountChange(removeImage)

  function clearImage() {
    selectionVersion.current += 1
    setSelectedImage(null)
    setImagePreview(null)
  }

  const restoreImage = useCallback((image: File | null, preview: string | null) => {
    selectionVersion.current += 1
    setSelectedImage(image)
    setImagePreview(preview)
  }, [])

  return {
    fileInputRef,
    selectedImage,
    imagePreview,
    openFilePicker,
    handleFileSelect,
    handlePaste,
    removeImage,
    clearImage,
    restoreImage,
  }
}
