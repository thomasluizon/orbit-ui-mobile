import { File } from 'expo-file-system'
import { ImageManipulator } from 'expo-image-manipulator'
import type { ImagePickerAsset } from 'expo-image-picker'
import { CHAT_IMAGE_OUTPUT } from '@orbit/shared/chat'
import { saveChatJpeg } from '@/modules/orbit-chat-image'

export async function resizeChatImage(asset: ImagePickerAsset): Promise<ImagePickerAsset> {
  const context = ImageManipulator.manipulate(asset.uri, { maxWidth: CHAT_IMAGE_OUTPUT.maxWidth })
  try {
    const image = await context.renderAsync()
    try {
      const output = await saveChatJpeg(image, { quality: CHAT_IMAGE_OUTPUT.quality, backgroundColor: CHAT_IMAGE_OUTPUT.backgroundColor })
      return {
        uri: output.uri,
        width: output.width,
        height: output.height,
        mimeType: 'image/jpeg',
        fileName: (asset.fileName ?? 'image').replace(/\.[^.]+$/, '') + '.jpg',
        fileSize: new File(output.uri).size,
      }
    } finally { image.release() }
  } finally { context.release() }
}
