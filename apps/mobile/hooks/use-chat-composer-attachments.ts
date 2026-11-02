import { resizeChatImage } from '@/lib/chat-image'
import { useCallback, useEffect, useRef, useState } from "react"
import * as DocumentPicker from "expo-document-picker"
import * as ImagePicker from "expo-image-picker"
import { File } from "expo-file-system"
import { CHAT_TEXT_FILE_PICKER_MIME_TYPES, getChatImageValidationError, getChatTextFileValidationError, resolveChatImageMimeType } from "@orbit/shared/chat"
import { getAccountGeneration } from "@/lib/session-epoch"
import type { SelectedChatTextFile } from './use-chat-composer-types'
import type { useChatComposerState } from './use-chat-composer-state'

export function buildImageFileName(asset: ImagePicker.ImagePickerAsset): string {
  const mimeType =
    resolveChatImageMimeType({
      mimeType: asset.mimeType,
      name: asset.fileName,
      uri: asset.uri,
    }) ?? "image/jpeg"

  const extension = mimeType.split("/")[1] ?? "jpg"

  return asset.fileName ?? `orbit-chat-image.${extension}`
}

export function useChatComposerAttachmentState() {
  const [selectedImage, setSelectedImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [selectedTextFile, setSelectedTextFile] =
    useState<SelectedChatTextFile | null>(null)
  const imageSelectionVersionRef = useRef(0)
  useEffect(() => () => { imageSelectionVersionRef.current += 1 }, [])
  return { imageSelectionVersionRef, setSelectedImage, setImagePreview, setSelectedTextFile, selectedImage, selectedTextFile, imagePreview }
}

type ChatComposerImageInputs = Pick<ReturnType<typeof useChatComposerState>, 't' | 'setSendError'> & Pick<ReturnType<typeof useChatComposerAttachmentState>, 'setSelectedImage' | 'setImagePreview' | 'imageSelectionVersionRef'>

export function useChatComposerImage({ t, setSendError, setSelectedImage, setImagePreview, imageSelectionVersionRef }: ChatComposerImageInputs) {
  const validateImageAsset = useCallback(
    (asset: ImagePicker.ImagePickerAsset): string | null => {
      const validationError = getChatImageValidationError({
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
        name: asset.fileName,
        uri: asset.uri,
      })

      if (validationError === "type") return t("chat.imageError")
      if (validationError === "size") return t("chat.imageSizeError")
      return null
    },
    [t],
  )

  const openFilePicker = useCallback(async () => {
    const selectionVersion = ++imageSelectionVersionRef.current
    const startingAccountGeneration = getAccountGeneration()
    const isCurrentSelection = () => selectionVersion === imageSelectionVersionRef.current
      && getAccountGeneration() === startingAccountGeneration
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!isCurrentSelection()) return
    if (!permission.granted) {
      setSendError(t("chat.imagePermissionError"))
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"] as ImagePicker.MediaType[],
      allowsMultipleSelection: false,
      quality: 1,
    })
    if (!isCurrentSelection()) return

    if (result.canceled) return

    const asset = result.assets[0]
    if (!asset) return

    const validationError = validateImageAsset(asset)
    if (validationError) {
      setSendError(validationError)
      return
    }

    try {
      const resized = await resizeChatImage(asset)
      if (!isCurrentSelection()) return
      const outputError = validateImageAsset(resized)
      if (outputError) { setSendError(outputError); return }
      setSendError(null)
      setSelectedImage(resized)
      setImagePreview(resized.uri)
    } catch {
      if (isCurrentSelection()) setSendError(t("chat.imageError"))
    }
  }, [t, validateImageAsset, setSendError, setSelectedImage, setImagePreview, imageSelectionVersionRef])

  const removeImage = useCallback(() => {
    imageSelectionVersionRef.current += 1
    setSelectedImage(null)
    setImagePreview(null)
  }, [setImagePreview, setSelectedImage, imageSelectionVersionRef])
  return { openFilePicker, removeImage }
}

type ChatComposerTextFileInputs = Pick<ReturnType<typeof useChatComposerState>, 'setSendError' | 't'> & Pick<ReturnType<typeof useChatComposerAttachmentState>, 'setSelectedTextFile'>

export function useChatComposerTextFile({ setSendError, t, setSelectedTextFile }: ChatComposerTextFileInputs) {
  const openTextFilePicker = useCallback(async () => {
    const startingAccountGeneration = getAccountGeneration()
    const result = await DocumentPicker.getDocumentAsync({
      type: [...CHAT_TEXT_FILE_PICKER_MIME_TYPES],
      copyToCacheDirectory: true,
      multiple: false,
    })
    if (getAccountGeneration() !== startingAccountGeneration) return
    if (result.canceled) return

    const asset = result.assets[0]
    if (!asset) return

    const file = new File(asset.uri)
    const validationError = getChatTextFileValidationError({
      name: asset.name,
      uri: asset.uri,
      fileSize: asset.size ?? file.size,
    })
    if (validationError === "type") {
      setSendError(t("chat.fileError"))
      return
    }
    if (validationError === "size") {
      setSendError(t("chat.fileSizeError"))
      return
    }

    try {
      const content = await file.text()
      if (getAccountGeneration() !== startingAccountGeneration) return
      setSendError(null)
      setSelectedTextFile({ name: asset.name, content })
    } catch {
      if (getAccountGeneration() !== startingAccountGeneration) return
      setSendError(t("chat.fileReadError"))
    }
  }, [t, setSendError, setSelectedTextFile])

  const removeTextFile = useCallback(() => {
    setSelectedTextFile(null)
  }, [setSelectedTextFile])
  return { openTextFilePicker, removeTextFile }
}

export function useChatComposerAttachments(inputs: Pick<ReturnType<typeof useChatComposerState>, 't' | 'setSendError'>) {
  const attachmentState = useChatComposerAttachmentState()
  const image = useChatComposerImage({ ...inputs, ...attachmentState })
  const textFile = useChatComposerTextFile({ ...inputs, ...attachmentState })
  return { ...attachmentState, ...image, ...textFile }
}
