import { beforeEach, expect, it, vi } from 'vitest'
import { CHAT_IMAGE_OUTPUT } from '@orbit/shared/chat'
import { resizeChatImage } from '@/lib/chat-image'

const mocks = vi.hoisted(() => ({
  saveJpeg: vi.fn(),
  render: vi.fn(),
  releaseImage: vi.fn(),
  releaseContext: vi.fn(),
  fileSize: 1234,
}))

vi.mock('expo', () => ({
  requireNativeModule: (name: string) => {
    if (name !== 'OrbitChatImage') throw new Error(`Unexpected native module: ${name}`)
    return { saveJpeg: mocks.saveJpeg }
  },
}))
vi.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: () => ({ renderAsync: mocks.render, release: mocks.releaseContext }) },
}))
vi.mock('expo-file-system', () => ({ File: class { get size() { return mocks.fileSize } } }))

const asset = { uri: 'file:///transparent.png', width: 64, height: 64, fileName: 'transparent.png', mimeType: 'image/png' }
const decodedImage = { release: mocks.releaseImage }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.render.mockResolvedValue(decodedImage)
  mocks.saveJpeg.mockResolvedValue({ uri: 'file:///opaque.jpg', width: 64, height: 64 })
})

it('passes the decoded image and shared matte to the native encoder and returns its upload', async () => {
  const output = await resizeChatImage(asset)
  expect(mocks.saveJpeg).toHaveBeenCalledWith(decodedImage, CHAT_IMAGE_OUTPUT.backgroundColor, CHAT_IMAGE_OUTPUT.quality)
  expect(output).toEqual({ uri: 'file:///opaque.jpg', width: 64, height: 64, fileName: 'transparent.jpg', mimeType: 'image/jpeg', fileSize: 1234 })
  expect(mocks.releaseImage).toHaveBeenCalledOnce()
  expect(mocks.releaseContext).toHaveBeenCalledOnce()
})

it('propagates native compositing failures and releases both image resources', async () => {
  const failure = new Error('JPEG encoding failed')
  mocks.saveJpeg.mockRejectedValue(failure)
  await expect(resizeChatImage(asset)).rejects.toBe(failure)
  expect(mocks.releaseImage).toHaveBeenCalledOnce()
  expect(mocks.releaseContext).toHaveBeenCalledOnce()
})

it('releases the decoder when rendering fails', async () => {
  const failure = new Error('Image decoding failed')
  mocks.render.mockRejectedValue(failure)
  await expect(resizeChatImage(asset)).rejects.toBe(failure)
  expect(mocks.saveJpeg).not.toHaveBeenCalled()
  expect(mocks.releaseImage).not.toHaveBeenCalled()
  expect(mocks.releaseContext).toHaveBeenCalledOnce()
})
