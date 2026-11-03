'use client'

import { useChatImageAttachment } from '@/hooks/use-chat-image-attachment'
import { useChatTextFileAttachment } from '@/hooks/use-chat-text-file-attachment'
import type { ChatComposerState } from './use-chat-composer-state'

type ChatComposerAttachmentsInputs = Pick<ChatComposerState, 'setSendError'>

export function useChatComposerAttachments(setSendError: ChatComposerAttachmentsInputs['setSendError']) {
  const {
    fileInputRef,
    selectedImage,
    imagePreview,
    openFilePicker,
    handleFileSelect,
    handlePaste,
    removeImage,
    clearImage,
    restoreImage,
  } = useChatImageAttachment(setSendError)

  const {
    textFileInputRef,
    selectedTextFile,
    openTextFilePicker,
    handleTextFileSelect,
    removeTextFile,
    restoreTextFile,
  } = useChatTextFileAttachment(setSendError)
  return { selectedTextFile, selectedImage, restoreImage, restoreTextFile, clearImage, removeTextFile, imagePreview, handlePaste, openTextFilePicker, openFilePicker, removeImage, fileInputRef, textFileInputRef, handleFileSelect, handleTextFileSelect }
}
