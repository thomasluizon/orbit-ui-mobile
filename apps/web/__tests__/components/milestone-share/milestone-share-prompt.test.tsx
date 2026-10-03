import type { Ref } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const translations = vi.hoisted(() => ({ locale: 'keys' }))

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const en = (await import('@orbit/shared/i18n/en.json')).default
  const ptBR = (await import('@orbit/shared/i18n/pt-BR.json')).default
  return { ...actual, useTranslations: () => translations.locale === 'keys'
    ? (key: string) => key
    : actual.createTranslator({ locale: translations.locale, messages: translations.locale === 'en' ? en : ptBR }) }
})

/**
 * One client for every render, the way the real `useQueryClient` reads one off a context. A fresh
 * object per render changes the identity of an effect dependency, which re-arms a settle timer
 * this test exists to prove stays cleared.
 */
const queryClientDouble = { getQueryData: () => undefined }
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => queryClientDouble,
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@/components/milestone-share/milestone-share-card', () => ({
  MilestoneShareCard: ({ ref }: { ref?: Ref<HTMLDivElement> }) => {
    return <div ref={ref} data-testid="milestone-share-card" />
  },
}))

const shareCard = vi.hoisted(() => ({ hasError: false, canShareFiles: false }))

vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({
    captureRef: { current: null },
    isSharing: false,
    hasError: shareCard.hasError,
    canShareFiles: shareCard.canShareFiles,
    share: vi.fn(),
    download: vi.fn(),
  }),
}))

import { MilestoneSharePrompt } from '@/components/milestone-share/milestone-share-prompt'
import { useUIStore } from '@/stores/ui-store'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'
import { expectSmallSheetActions, sheetActionsUseActionPair, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

function resetStores() {
  useEngagementPromptStore.setState({
    promptedMilestoneKeys: [],
    lastPromptedAtIso: null,
    homeEntryDismissed: false,
    armedPrompt: null,
  })
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [], openOverlayIds: [] })
}

async function armMilestoneShare(milestoneKey: string) {
  await act(async () => {
    useEngagementPromptStore.getState().armMilestoneSharePrompt(milestoneKey)
    await Promise.resolve()
  })
}

async function armReferral(milestoneKey: string) {
  await act(async () => {
    useEngagementPromptStore.getState().armReferralPrompt(milestoneKey)
    await Promise.resolve()
  })
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
}

describe('MilestoneSharePrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    translations.locale = 'keys'
    shareCard.hasError = false
    shareCard.canShareFiles = false
    vi.stubGlobal('fetch', vi.fn())
    holdAccount('user-1')
    resetStores()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('renders nothing when no milestone is armed', () => {
    render(<MilestoneSharePrompt />)
    expect(screen.queryByTestId('sheet')).toBeNull()
  })

  it('renders nothing when a referral prompt is armed (kind isolation)', async () => {
    render(<MilestoneSharePrompt />)
    await armReferral('level-3')

    await settle()

    expect(screen.queryByTestId('sheet')).toBeNull()
  })

  it('shows the card after the settle delay and marks it prompted', async () => {
    render(<MilestoneSharePrompt />)
    await armMilestoneShare('share-streak-7')
    expect(screen.queryByTestId('sheet')).toBeNull()

    await settle()

    expect(screen.getByTestId('sheet')).toBeInTheDocument()
    expect(screen.getByTestId('milestone-share-card')).toBeInTheDocument()
    expect(useEngagementPromptStore.getState().promptedMilestoneKeys).toContain(
      'share-streak-7',
    )
  })

  it('pins Download and Later in the sheet footer, never in the scrolling body', async () => {
    render(<MilestoneSharePrompt />)
    await armMilestoneShare('share-streak-7')
    await settle()

    expect(sheetSlotButtons('sheet-actions')).toEqual(['milestoneShare.later', 'milestoneShare.download'])
    expectSmallSheetActions()
    expect(sheetActionsUseActionPair()).toBe(true)
    expect(sheetSlotButtons('sheet-body')).toEqual([])
  })

  describe('native-file sharing footer geometry', () => {
    let browserLaunch: BrowserLaunch | undefined
    let browser: Browser
    let stylesheet: string

    registerChromeLaunchHook(beforeAll, async (launch) => {
      browserLaunch = launch
      browser = await launch
    })
    beforeAll(async () => {
      const source = resolve(process.cwd(), 'app/globals.css')
      stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    })
    afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

    it.each(['en', 'pt-BR'])('keeps all three %s actions visible and trailing at 320px', async (locale) => {
      translations.locale = locale
      shareCard.canShareFiles = true
      render(<MilestoneSharePrompt />)
      await armMilestoneShare('share-streak-7')
      await settle()
      const footer = document.querySelector<HTMLElement>('[data-slot="sheet-actions"]')!
      expectSmallSheetActions()
      vi.useRealTimers()

      const page = await browser.newPage()
      try {
        await page.setContent(`<style>${stylesheet}</style><footer class="orbit-sheet-actions" style="width:320px">${footer.innerHTML}</footer>`)
        await loadAppFonts(page)
        const measured = await page.evaluate(() => {
          const footer = document.querySelector('footer')!
          const bounds = footer.getBoundingClientRect()
          const style = getComputedStyle(footer)
          const left = bounds.left + Number.parseFloat(style.paddingLeft)
          const right = bounds.right - Number.parseFloat(style.paddingRight)
          const buttons = [...footer.querySelectorAll('button')].map((button) => {
            const bounds = button.getBoundingClientRect()
            const target = button.parentElement!.getBoundingClientRect()
            const label = button.querySelector('span')!.getBoundingClientRect()
            return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height, targetRight: target.right, targetHeight: target.height, labelLeft: label.left, labelRight: label.right }
          })
          return { left, right, buttons }
        })
        expect(measured.buttons).toHaveLength(3)
        for (const button of measured.buttons) {
          expect(button.left).toBeGreaterThanOrEqual(measured.left)
          expect(button.right).toBeLessThanOrEqual(measured.right)
          expect(button.width).toBeLessThan(measured.right - measured.left)
          expect(button.height).toBe(44)
          expect(button.targetHeight).toBeGreaterThanOrEqual(48)
          expect(button.labelLeft).toBeGreaterThan(button.left)
          expect(button.labelRight).toBeLessThan(button.right)
        }
        expect(measured.buttons.at(-1)!.targetRight).toBeCloseTo(measured.right, 1)
        expect(measured.buttons.at(-1)!.right).toBeCloseTo(measured.right - 2, 1)
      } finally {
        await page.close()
        vi.useFakeTimers()
      }
    })
  })

  it('shows a failed share in the pinned footer, beside Share', async () => {
    shareCard.hasError = true
    render(<MilestoneSharePrompt />)
    await armMilestoneShare('share-streak-7')
    await settle()

    expect(screen.getByRole('alert').closest('[data-slot="sheet-actions"]')).not.toBeNull()
  })

  it('gives Later the shared compact press styling and spaces the pills 12 apart', async () => {
    render(<MilestoneSharePrompt />)
    await armMilestoneShare('share-streak-7')
    await settle()

    const later = screen.getByRole('button', { name: 'milestoneShare.later' })
    expect(later).toHaveAttribute('data-variant', 'ghost')
    expect(later).toHaveAttribute('data-size', 'sm')
    expect(screen.getByRole('button', { name: 'milestoneShare.download' }).closest('[data-slot="action-row"]')!.getAttribute('style')).toContain('gap: 12px')
  })

  it('stays hidden while a celebration is in flight', async () => {
    useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
    render(<MilestoneSharePrompt />)
    await armMilestoneShare('share-streak-7')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(screen.queryByTestId('sheet')).toBeNull()
  })

  it('waits for another sheet to close before offering a milestone', async () => {
    useUIStore.getState().registerOpenOverlay('already-open')
    render(<MilestoneSharePrompt />)
    await armMilestoneShare('share-streak-7')
    await settle()
    expect(screen.queryByTestId('sheet')).toBeNull()

    await act(async () => useUIStore.getState().unregisterOpenOverlay('already-open'))
    await settle()
    expect(screen.getByTestId('sheet')).toBeInTheDocument()
  })

  it('stays hidden and clears the arm when the milestone was already prompted', async () => {
    useEngagementPromptStore.setState({ promptedMilestoneKeys: ['share-streak-7'] })
    render(<MilestoneSharePrompt />)
    await armMilestoneShare('share-streak-7')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(screen.queryByTestId('sheet')).toBeNull()
    expect(useEngagementPromptStore.getState().armedPrompt).toBeNull()
  })

  it('takes the card off the screen when another account replaces the tab', async () => {
    render(<MilestoneSharePrompt />)
    await armMilestoneShare('share-streak-7')
    await settle()
    expect(screen.getByTestId('sheet')).toBeInTheDocument()

    await replaceAccountWith('user-2')

    expect(screen.queryByTestId('sheet')).toBeNull()
  })

  it('does not open under the next account from a timer the previous one armed', async () => {
    render(<MilestoneSharePrompt />)
    await armMilestoneShare('share-streak-7')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    await replaceAccountWith('user-2')
    await settle()

    expect(screen.queryByTestId('sheet')).toBeNull()
  })
})
