import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile, createMockRecap } from '@orbit/shared/__tests__/factories'
import { buildWrappedSlides } from '@orbit/shared/utils'
import { QueryClient } from '@tanstack/react-query'
import { referralKeys } from '@orbit/shared/query'
import type { ReferralDashboard } from '@orbit/shared/types/referral'

const boundary = vi.hoisted(() => ({ capture: vi.fn(), generate: vi.fn(), report: vi.fn() }))
vi.mock('html-to-image', () => ({ toBlob: boundary.capture }))
vi.mock('qrcode', () => ({ default: { toDataURL: boundary.generate } }))
vi.mock('next-intl', () => ({ useTranslations: () => translate, useLocale: () => 'en' }))
const translate = (key: string) => key
vi.mock('@/hooks/use-gamification', () => ({ useReportEvent: () => ({ mutate: boundary.report }) }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => queryClient,
}))
const queryClient = new QueryClient()
vi.mock('@/hooks/use-wrapped', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-wrapped')>()),
  useWrapped: () => ({ recap: createMockRecap(), isLoading: false, isError: false }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile() }) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

let qrImage: string
let nextQrImage: string
let click: ReturnType<typeof vi.spyOn>
let MilestoneSharePrompt: typeof import('@/components/milestone-share/milestone-share-prompt').MilestoneSharePrompt
let ShareCardSheet: typeof import('@/components/share/share-card-sheet').ShareCardSheet
let WrappedPlayer: typeof import('@/app/(app)/wrapped/_components/wrapped-player').WrappedPlayer
let CelebrationPanel: typeof import('@/components/gamification/celebration-panel').CelebrationPanel
let useEngagementPromptStore: typeof import('@/stores/referral-prompt-store').useEngagementPromptStore
let useUIStore: typeof import('@/stores/ui-store').useUIStore
let holdAccount: typeof import('@/__tests__/support/account-change').holdAccount
let replaceAccountWith: typeof import('@/__tests__/support/account-change').replaceAccountWith
let sheetTestControls: typeof import('@/__tests__/support/sheet-double').sheetTestControls

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}

async function flush() {
  await act(async () => { await vi.dynamicImportSettled() })
}

async function advance(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
}

async function openMilestone() {
  const owner = render(<MilestoneSharePrompt />)
  await act(async () => { useEngagementPromptStore.getState().armMilestoneSharePrompt('share-streak-7') })
  await advance(500)
  await flush()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  return owner
}

function ProgressOwner({ wrapped = false }: Readonly<{ wrapped?: boolean }>) {
  const [open, setOpen] = useState(true)
  if (wrapped) {
    const recap = createMockRecap()
    return open ? <WrappedPlayer recap={recap} slides={buildWrappedSlides(recap)} period="week" onClose={() => setOpen(false)} /> : null
  }
  return open ? <ShareCardSheet onClose={() => setOpen(false)} /> : null
}

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('qrcode')>('qrcode')
  const options = { margin: 0, width: 224, color: { dark: '#020618', light: '#ffffff' } }
  qrImage = await actual.toDataURL('https://app.useorbit.org/r/ABC123', options)
  nextQrImage = await actual.toDataURL('https://app.useorbit.org/r/XYZ123', options)
})

beforeEach(async () => {
  vi.resetModules()
  vi.doMock('html-to-image', () => ({ toBlob: boundary.capture }))
  vi.doMock('qrcode', () => ({ default: { toDataURL: boundary.generate } }))
  vi.doMock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
  const modules = await Promise.all([
    import('@/components/milestone-share/milestone-share-prompt'), import('@/components/share/share-card-sheet'),
    import('@/app/(app)/wrapped/_components/wrapped-player'), import('@/components/gamification/celebration-panel'),
    import('@/stores/referral-prompt-store'), import('@/stores/ui-store'),
    import('@/__tests__/support/account-change'), import('@/__tests__/support/sheet-double'),
  ])
  MilestoneSharePrompt = modules[0].MilestoneSharePrompt
  ShareCardSheet = modules[1].ShareCardSheet
  WrappedPlayer = modules[2].WrappedPlayer
  CelebrationPanel = modules[3].CelebrationPanel
  useEngagementPromptStore = modules[4].useEngagementPromptStore
  useUIStore = modules[5].useUIStore
  ;({ holdAccount, replaceAccountWith } = modules[6])
  sheetTestControls = modules[7].sheetTestControls
  vi.useFakeTimers()
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.useorbit.org')
  vi.stubGlobal('fetch', vi.fn())
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  holdAccount('capture-account')
  queryClient.clear()
  queryClient.setQueryData<ReferralDashboard>(referralKeys.all, {
    code: 'ABC123', link: 'https://app.useorbit.org/r/ABC123',
    stats: { referralCode: 'ABC123', referralLink: 'https://app.useorbit.org/r/ABC123', successfulReferrals: 0,
      pendingReferrals: 0, maxReferrals: 5, rewardType: 'discount', discountPercent: 10 },
  })
  useEngagementPromptStore.setState({ armedPrompt: null, promptedMilestoneKeys: [], lastPromptedAtIso: null })
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [], openOverlayIds: [] })
  boundary.capture.mockReset().mockResolvedValue(new Blob(['capture'], { type: 'image/png' }))
  boundary.generate.mockReset().mockImplementation((value: string) => {
    if (value === 'https://app.useorbit.org/r/ABC123') return Promise.resolve(qrImage)
    if (value === 'https://app.useorbit.org/r/XYZ123') return Promise.resolve(nextQrImage)
    throw new Error('QR fixture must be generated for its actual value')
  })
  boundary.report.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:capture')
  URL.revokeObjectURL = vi.fn()
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  sheetTestControls.defer(false)
})

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  click.mockRestore()
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'canShare')
})

describe.each(['milestone', 'progress', 'wrapped'] as const)('%s capture owner', (kind) => {
  const downloadLabel = kind === 'milestone' ? 'milestoneShare.download' : 'shareCard.download'
  const errorLabel = kind === 'milestone' ? 'milestoneShare.shareError' : 'shareCard.shareError'

  async function open() {
    if (kind === 'milestone') return openMilestone()
    const owner = render(<ProgressOwner wrapped={kind === 'wrapped'} />)
    if (kind === 'wrapped') {
      for (let index = 1; index < buildWrappedSlides(createMockRecap()).length; index += 1) {
        fireEvent.click(screen.getByTestId('wrapped-next-zone'))
      }
      expect(screen.getByTestId('wrapped-slide-share')).toBeInTheDocument()
    }
    await flush()
    return owner
  }

  it('keeps first image chunk failure inline and permits same-account manual retry', async () => {
    vi.doMock('html-to-image', () => { throw new Error('image chunk unavailable') })
    await open()
    const receipt = useEngagementPromptStore.getState().promptedMilestoneKeys
    fireEvent.click(screen.getByRole('button', { name: downloadLabel }))
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent(errorLabel)
    expect(screen.getByRole('button', { name: downloadLabel })).toBeEnabled()
    expect(click).not.toHaveBeenCalled()
    expect(boundary.report).not.toHaveBeenCalled()
    expect(useEngagementPromptStore.getState().promptedMilestoneKeys).toEqual(receipt)
    await advance(6000)
    expect(screen.getByRole('alert')).toHaveTextContent(errorLabel)
    vi.doMock('html-to-image', () => ({ toBlob: boundary.capture }))
    fireEvent.click(screen.getByRole('button', { name: downloadLabel }))
    await flush()
    expect(click).toHaveBeenCalledOnce()
    expect(boundary.report).toHaveBeenCalledExactlyOnceWith('card_shared')
    expect(screen.getByRole('button', { name: downloadLabel })).toBeEnabled()
  })

  it('bounds pending capture and permits a fresh manual action', async () => {
    const pending = deferred<Blob>()
    boundary.capture.mockReturnValueOnce(pending.promise)
    await open()
    fireEvent.click(screen.getByRole('button', { name: downloadLabel }))
    await flush()
    await advance(5000)
    expect(screen.getByRole('alert')).toHaveTextContent(errorLabel)
    expect(screen.getByRole('button', { name: downloadLabel })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: downloadLabel }))
    await flush()
    expect(click).toHaveBeenCalledOnce()
    await act(async () => { pending.resolve(new Blob(['late'])); await Promise.resolve() })
    expect(click).toHaveBeenCalledOnce()
    expect(boundary.report).toHaveBeenCalledOnce()
  })

  it.each(['close', 'unmount', 'account round trip'] as const)('ignores a completed image after %s', async (reason) => {
    const pending = deferred<Blob>()
    boundary.capture.mockReturnValueOnce(pending.promise)
    const owner = await open()
    fireEvent.click(screen.getByRole('button', { name: downloadLabel }))
    await flush()
    expect(boundary.capture).toHaveBeenCalledOnce()
    if (reason === 'close') fireEvent.click(screen.getByRole('button', { name: kind === 'wrapped' ? 'wrapped.close' : 'close-overlay' }))
    if (reason === 'unmount') owner.unmount()
    if (reason === 'account round trip') {
      await replaceAccountWith('other-account')
      await replaceAccountWith('capture-account')
    }
    await act(async () => { pending.resolve(new Blob(['late'])); await Promise.resolve() })
    expect(click).not.toHaveBeenCalled()
    expect(boundary.report).not.toHaveBeenCalled()
  })

  it('handles aborted native sharing without reporting success and permits retry', async () => {
    const systemShare = vi.fn().mockRejectedValueOnce(new DOMException('cancelled', 'AbortError')).mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'share', { configurable: true, value: systemShare })
    await open()
    const shareLabel = kind === 'milestone' ? 'milestoneShare.share' : 'shareCard.share'
    fireEvent.click(screen.getByRole('button', { name: shareLabel }))
    await flush()
    expect(boundary.report).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')?.textContent ?? '').not.toContain(errorLabel)
    expect(screen.getByRole('button', { name: shareLabel })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: shareLabel }))
    await flush()
    expect(systemShare).toHaveBeenCalledTimes(2)
    expect(boundary.report).toHaveBeenCalledOnce()
  })
})

it.each(['download', 'share'] as const)('waits for real QR readiness before %s can succeed', async (action) => {
  const pending = deferred<string>()
  const systemShare = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
  Object.defineProperty(navigator, 'share', { configurable: true, value: systemShare })
  boundary.generate.mockReturnValueOnce(pending.promise)
  await openMilestone()
  fireEvent.click(screen.getByRole('button', { name: `milestoneShare.${action}` }))
  await flush()
  expect(boundary.capture).not.toHaveBeenCalled()
  expect(click).not.toHaveBeenCalled()
  expect(systemShare).not.toHaveBeenCalled()
  expect(boundary.report).not.toHaveBeenCalled()
  await act(async () => { pending.resolve(qrImage); await Promise.resolve() })
  await flush()
  expect(screen.getByTestId('share-card-qr').style.backgroundImage).toContain(qrImage)
  expect(boundary.capture).toHaveBeenCalledOnce()
  expect(action === 'download' ? click : systemShare).toHaveBeenCalledOnce()
  expect(boundary.report).toHaveBeenCalledOnce()
})

it.each(['chunk', 'generation'] as const)('exposes first QR %s failure and retries the same value manually', async (failure) => {
  if (failure === 'chunk') vi.doMock('qrcode', () => { throw new Error('QR chunk unavailable') })
  else boundary.generate.mockRejectedValueOnce(new Error('QR generation failed'))
  await openMilestone()
  expect(screen.getByRole('alert')).toHaveTextContent('milestoneShare.shareError')
  expect(click).not.toHaveBeenCalled()
  expect(boundary.report).not.toHaveBeenCalled()
  vi.doMock('qrcode', () => ({ default: { toDataURL: boundary.generate } }))
  fireEvent.click(screen.getByRole('button', { name: 'milestoneShare.download' }))
  await flush()
  expect(screen.getByTestId('share-card-qr').style.backgroundImage).toContain(qrImage)
  expect(click).toHaveBeenCalledOnce()
})

it('times out missing QR readiness, ignores its late result and retries without changing the value', async () => {
  const pending = deferred<string>()
  boundary.generate.mockReturnValueOnce(pending.promise)
  await openMilestone()
  fireEvent.click(screen.getByRole('button', { name: 'milestoneShare.download' }))
  await flush()
  await advance(5000)
  expect(screen.getByRole('alert')).toHaveTextContent('milestoneShare.shareError')
  expect(boundary.capture).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'milestoneShare.download' }))
  await flush()
  expect(click).toHaveBeenCalledOnce()
  await act(async () => { pending.resolve(qrImage); await Promise.resolve() })
  expect(screen.getByTestId('share-card-qr').style.backgroundImage).toContain(qrImage)
  expect(click).toHaveBeenCalledOnce()
})

it('keeps daily deadlines live while QR generation is pending', async () => {
  const pending = deferred<{ default: { toDataURL: typeof boundary.generate } }>()
  vi.doMock('qrcode', () => pending.promise)
  render(<MilestoneSharePrompt />)
  await act(async () => { useEngagementPromptStore.getState().armMilestoneSharePrompt('share-streak-7') })
  await advance(500)
  useUIStore.getState().enqueueCelebration('daily-streak', { streak: 5 })
  const daily = render(<CelebrationPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'milestoneShare.download' }))
  await advance(2280)
  expect(daily.container.querySelector('[data-daily-streak-moment]')).toHaveAttribute('data-phase', 'automatic-exit')
  await advance(220)
  expect(daily.container.querySelector('[data-daily-streak-moment]')).toBeNull()
  expect(useUIStore.getState().activeCelebration).toBeNull()
  expect(boundary.capture).not.toHaveBeenCalled()
  await act(async () => { pending.resolve({ default: { toDataURL: boundary.generate } }); await Promise.resolve() })
  await flush()
  expect(click).toHaveBeenCalledOnce()
})

it('cancels QR waiting when dismissal begins, before the sheet exit finishes', async () => {
  const pending = deferred<string>()
  boundary.generate.mockReturnValueOnce(pending.promise)
  await openMilestone()
  sheetTestControls.defer(true)
  fireEvent.click(screen.getByRole('button', { name: 'milestoneShare.download' }))
  await flush()
  fireEvent.click(screen.getByRole('button', { name: 'close-overlay' }))
  expect(sheetTestControls.isDismissPending).toBe(true)
  await act(async () => { pending.resolve(qrImage); await Promise.resolve() })
  await flush()
  expect(boundary.capture).not.toHaveBeenCalled()
  expect(click).not.toHaveBeenCalled()
  expect(boundary.report).not.toHaveBeenCalled()
  act(() => sheetTestControls.completeDismissal())
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('rejects a captured image after its live QR value changes and exports the latest card on retry', async () => {
  const pending = deferred<Blob>()
  boundary.capture.mockReturnValueOnce(pending.promise)
  const owner = await openMilestone()
  fireEvent.click(screen.getByRole('button', { name: 'milestoneShare.download' }))
  await flush()
  queryClient.setQueryData<ReferralDashboard>(referralKeys.all, (current) => current ? { ...current, code: 'XYZ123' } : undefined)
  owner.rerender(<MilestoneSharePrompt />)
  await flush()
  await act(async () => { pending.resolve(new Blob(['previous-card'])); await Promise.resolve() })
  expect(click).not.toHaveBeenCalled()
  expect(boundary.report).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'milestoneShare.download' }))
  await flush()
  expect(boundary.generate).toHaveBeenLastCalledWith(expect.stringContaining('XYZ123'), expect.objectContaining({ width: 224 }))
  expect(screen.getByTestId('share-card-qr').style.backgroundImage).toContain(nextQrImage)
  expect(click).toHaveBeenCalledOnce()
  expect(boundary.report).toHaveBeenCalledOnce()
})

it('discards a plain capture when its required referral QR becomes available', async () => {
  const referral = queryClient.getQueryData<ReferralDashboard>(referralKeys.all)!
  queryClient.clear()
  const pending = deferred<Blob>()
  boundary.capture.mockReturnValueOnce(pending.promise)
  const owner = await openMilestone()
  expect(screen.queryByTestId('share-card-qr')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'milestoneShare.download' }))
  await flush()
  queryClient.setQueryData(referralKeys.all, referral)
  owner.rerender(<MilestoneSharePrompt />)
  await flush()
  await act(async () => { pending.resolve(new Blob(['plain-card'])); await Promise.resolve() })
  expect(click).not.toHaveBeenCalled()
  expect(boundary.report).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'milestoneShare.download' }))
  await flush()
  expect(screen.getByTestId('share-card-qr').style.backgroundImage).toContain(qrImage)
  expect(click).toHaveBeenCalledOnce()
  expect(boundary.report).toHaveBeenCalledOnce()
})
