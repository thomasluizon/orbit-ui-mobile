import { requireNativeModule } from 'expo'
import type { ImageRef } from 'expo-image-manipulator'

interface ChatJpeg {
  uri: string
  width: number
  height: number
}

interface ChatImageModule {
  saveJpeg(image: ImageRef, backgroundColor: string, quality: number): Promise<ChatJpeg>
}

const nativeModule = requireNativeModule<ChatImageModule>('OrbitChatImage')

export function saveChatJpeg(image: ImageRef, options: { backgroundColor: string; quality: number }): Promise<ChatJpeg> {
  return nativeModule.saveJpeg(image, options.backgroundColor, options.quality)
}
