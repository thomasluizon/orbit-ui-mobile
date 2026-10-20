import { createRef } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { ShareCardQr, type ShareCardQrHandle } from '@/components/share/share-card-qr'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'

const generate = vi.hoisted(() => vi.fn())
vi.mock('qrcode', () => ({ default: { toDataURL: generate } }))
const firstValue = 'https://app.useorbit.org/r/ABC123'
const nextValue = 'https://app.useorbit.org/r/XYZ123'
let firstImage: string
let nextImage: string
let resizedImage: string
let nextSmallImage: string

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('qrcode')>('qrcode')
  const options = { margin: 0, color: { dark: '#020618', light: '#ffffff' } }
  firstImage = await actual.toDataURL(firstValue, { ...options, width: 224 })
  nextImage = await actual.toDataURL(nextValue, { ...options, width: 256 })
  resizedImage = await actual.toDataURL(firstValue, { ...options, width: 256 })
  nextSmallImage = await actual.toDataURL(nextValue, { ...options, width: 224 })
})

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  holdAccount('qr-account')
  generate.mockReset().mockResolvedValue(firstImage)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it.each(['value', 'size', 'unmount', 'account round trip'] as const)('rejects stale QR completion after %s', async (reason) => {
  let finish!: (url: string) => void
  generate.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve }))
  const ref = createRef<ShareCardQrHandle>()
  const onError = vi.fn()
  const owner = render(<ShareCardQr ref={ref} value={firstValue} size={56} onError={onError} />)
  await act(async () => { await vi.dynamicImportSettled() })
  const pending = ref.current!.prepareCapture(new AbortController().signal).catch((error: unknown) => error)
  const currentImage = reason === 'value' ? nextSmallImage : reason === 'size' ? resizedImage : firstImage
  generate.mockResolvedValue(currentImage)
  if (reason === 'value') owner.rerender(<ShareCardQr ref={ref} value={nextValue} size={56} onError={onError} />)
  if (reason === 'size') owner.rerender(<ShareCardQr ref={ref} value={firstValue} size={64} onError={onError} />)
  if (reason === 'unmount') owner.unmount()
  if (reason === 'account round trip') {
    await replaceAccountWith('other-account')
    await replaceAccountWith('qr-account')
  }
  await act(async () => { await vi.dynamicImportSettled() })
  await act(async () => { finish(firstImage); await pending })
  expect(await pending).toMatchObject({ name: 'AbortError' })
  expect(onError).not.toHaveBeenCalled()
  if (reason !== 'unmount') expect(screen.getByTestId('share-card-qr').style.backgroundImage).toContain(currentImage)
})

it('invalidates a ready capture when its value changes and preserves the latest valid QR', async () => {
  const ref = createRef<ShareCardQrHandle>()
  const owner = render(<ShareCardQr ref={ref} value={firstValue} size={56} />)
  await act(async () => { await vi.dynamicImportSettled() })
  const valid = await ref.current!.prepareCapture(new AbortController().signal)
  expect(valid()).toBe(true)
  generate.mockResolvedValue(nextImage)
  owner.rerender(<ShareCardQr ref={ref} value={nextValue} size={64} />)
  await act(async () => { await vi.dynamicImportSettled() })
  expect(valid()).toBe(false)
  const nextValid = await ref.current!.prepareCapture(new AbortController().signal)
  expect(nextValid()).toBe(true)
  expect(screen.getByTestId('share-card-qr').style.backgroundImage).toContain(nextImage)
})

it('ignores an aborted generation and retries the same value through the capture handle', async () => {
  let finish!: (url: string) => void
  generate.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve }))
  const ref = createRef<ShareCardQrHandle>()
  const onError = vi.fn()
  render(<ShareCardQr ref={ref} value={firstValue} size={56} onError={onError} />)
  await act(async () => { await vi.dynamicImportSettled() })
  const controller = new AbortController()
  const pending = ref.current!.prepareCapture(controller.signal).catch((error: unknown) => error)
  controller.abort()
  const valid = await ref.current!.prepareCapture(new AbortController().signal)
  await act(async () => { finish(firstImage); await pending })
  expect(await pending).toMatchObject({ name: 'AbortError' })
  expect(valid()).toBe(true)
  expect(screen.getByTestId('share-card-qr').style.backgroundImage).toContain(firstImage)
  expect(onError).not.toHaveBeenCalled()
})
