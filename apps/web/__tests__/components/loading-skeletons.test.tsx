import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import { PushDevicesRow } from '@/components/profile/push-devices-row'
import { NotionCallbackContent } from '@/app/(auth)/auth-callback/notion/notion-callback-content'
import { MoveParentOverlay } from '@/components/habits/habit-list/move-parent-overlay'
import { ProactiveAction } from '@/components/chat/proactive-action'

const mocks = vi.hoisted(() => ({ reason: null as string | null, waiting: true, act: vi.fn() }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams('code=c&state=s') }))
vi.mock('@/lib/actions/profile', () => ({ completeNotion: () => new Promise(() => {}) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/hooks/use-proactive-action', () => ({ useProactiveAction: () => ({ reason: mocks.reason, waiting: mocks.waiting, allowance: 10, act: mocks.act, aiMessagesPeriod: 'day' }) }))

afterEach(() => { mocks.reason = null; mocks.waiting = true; mocks.act.mockClear() })

function expectNoLoadingText(container: HTMLElement, text: string) {
  expect(screen.queryByText(text)).toBeNull()
  expect(container.querySelector('.animate-spin, .search-dot, svg[role="progressbar"]')).toBeNull()
}

describe('a wait shows a skeleton shaped like its final layout, never Loading text', () => {
  it('holds the device line under the alerts switch with a named skeleton line', () => {
    const { container } = render(<PushDevicesRow count={undefined} max={undefined} currentDeviceRegistered={false} supported loading error={false} permission="granted" status="registered" onToggle={vi.fn()} onRetry={vi.fn()} />)
    const line = screen.getByRole('progressbar', { name: 'profile.loading' })
    expect(line).toHaveAttribute('aria-busy', 'true')
    expect(line.closest('[data-push-devices-skeleton]')).toHaveClass('px-4', 'pb-3')
    expect(line.querySelector('.skeleton-pulse')).toHaveClass('bg-[var(--bg-well)]')
    expectNoLoadingText(container, 'profile.loading')
  })

  it('holds the Notion return with the settings rows it lands on', () => {
    const { container } = render(<NotionCallbackContent />)
    const skeleton = screen.getByRole('progressbar', { name: 'common.loading' })
    expect(skeleton).toHaveAttribute('aria-busy', 'true')
    expect(skeleton.querySelectorAll('[data-settings-skeleton-row]')).toHaveLength(2)
    expectNoLoadingText(container, 'common.loading')
  })

  it('holds the parent picker with settings rows while its inventory loads', () => {
    const { container } = render(<MoveParentOverlay selectionOnly t={(key) => key} open isMoving={false} movingHabitTitle="Exercise" movingHabitParentId={null}
      options={[]} inventoryState="loading" onRetryInventory={vi.fn()} selectedMoveParentId={null} canSubmit={false} onClose={vi.fn()} onConfirm={vi.fn()} onSelectOption={vi.fn()} />)
    const skeleton = screen.getByRole('progressbar', { name: 'common.loading' })
    expect(skeleton.querySelectorAll('[data-settings-skeleton-row]')).toHaveLength(3)
    expectNoLoadingText(container, 'common.loading')
  })

  it('keeps the proactive action label on its skeleton face while its status loads, with no Loading line', () => {
    const { container } = render(<ProactiveAction item={createMockProactiveItem()} acted={false} isOnline onSend={vi.fn()} />)
    const action = screen.getByRole('button')
    expect(action).toBeDisabled()
    expect(action).toHaveAttribute('aria-busy', 'true')
    expect(action).not.toHaveAttribute('aria-describedby')
    expect(action).toHaveClass('relative', 'isolate', 'bg-transparent')
    expect(action).not.toHaveClass('disabled:opacity-50')
    expect(action.querySelector('[data-slot="skeleton-face"]')).not.toBeNull()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expectNoLoadingText(container, 'common.loading')
  })

  it('dims an unavailable proactive action and explains it without a skeleton face', () => {
    mocks.reason = 'shell.composer.offline.reason'
    mocks.waiting = false
    render(<ProactiveAction item={createMockProactiveItem()} acted={false} isOnline={false} onSend={vi.fn()} />)
    const action = screen.getByRole('button')
    expect(action).not.toHaveAttribute('aria-busy')
    expect(action).toHaveClass('bg-[var(--bg-well)]', 'disabled:opacity-50')
    expect(action.querySelector('[data-slot="skeleton-face"]')).toBeNull()
    expect(screen.getByRole('status')).not.toBeEmptyDOMElement()
  })
})
